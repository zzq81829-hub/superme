import { getTask, updateTask } from "./store.js";
import { runAgent } from "./adapters/runAgent.js";
import { applyCostGuard } from "./workers/costGuard.js";
import { verifyTask } from "./verify/verifyTask.js";
import { describeAcceptanceCriteria } from "./verify/criteria.js";
import { buildMemoryContext } from "./memory/inject.js";
import { getBrief } from "./briefs/store.js";
import { listReviews } from "./reviews/store.js";
import { getReadScope } from "./policy/readScope.js";
import { readCardLayoutStandardDirective } from "./skills/cardLayoutStandard.js";
import { readAgentReachDirective } from "./skills/agentReach.js";
import { computePayloadHash } from "./tasks/risk.js";
import { reserveBudget, releaseBudgetReserve, recordUsage } from "./billing/deepseekBudget.js";
import { markQuotaExhausted, markQuotaNormal, isQuotaExhaustion } from "./workers/quota.js";
import { buildDeliverables } from "./tasks/deliverables.js";
import { evaluateModelNeed } from "./workforce/modelNeed.js";
import { isPreworkApplicable, createPreworkTask } from "./workforce/prework.js";
import { classifyWorkerError } from "./workforce/errorClassifier.js";
import { recordWorkerFailure, recordWorkerSuccess } from "./workforce/statusMachine.js";
import { scanAllRebounds } from "./workforce/rebound.js";
import { logRoutingDecision } from "./workforce/routingLogger.js";
import { emitLearningEvent } from "./learning/router.js";
import { syncFromDeliverables } from "./files/registry.js";
import { enqueueDelivery } from "./delivery/outbox.js";
import {
  assessTaskRisk,
  evaluateReasoningMode,
  runBoostVerification,
  createFailureAuditReport
} from "./policy/reasoningEscalation.js";
import { parseDispatchPlan, dispatchSubtasks } from "./workforce/hermesDispatcher.js";

export function chooseAgent(task) {
  if (task.agent && task.agent !== "auto") return task.agent;

  const text = `${task.title || ""}\n${task.description || ""}`.toLowerCase();
  if (task.delegateToHermes || ["hermes", "编排", "拆任务", "多agent", "orchestrat", "调度", "秘书委托", "分发", "拆解", "统筹", "规划", "组织", "需求分解", "coo"].some((s) => text.includes(s))) return "hermes";
  if (["摘要", "总结", "改写", "分类", "便宜", "summar", "rewrite"].some((s) => text.includes(s))) return "deepseek";
  if (["review", "审查", "代码审查"].some((s) => text.includes(s))) return "claude";
  if (["研究", "search", "调研"].some((s) => text.includes(s))) return "grok";

  // Workforce Router V1: Use modelNeed evaluation
  const need = task.modelNeed || evaluateModelNeed(task);
  return need.preferredWorker || "antigravity";
}

export function isWorkerUnavailable(result = {}) {
  return /usage limit|quota|QUOTA_LIMITED|AUTH_REQUIRED|not logged in|PROXY_DOWN|ECONNREFUSED|unrecognized_model|invalid model selection|eligibility check failed|connection attempt failed|failed to connect|timed out|headless mode cannot prompt|denied a required tool/i
    .test(`${result.error || ""}\n${result.message || ""}\n${result.stderr || ""}`);
}

function compact(value, limit = 1200) {
  const text = String(value || "").trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function executionRecord({ agent, result, selectedBecause, startedAt, phase = "execution" }) {
  return {
    agent,
    phase,
    selectedBecause,
    did: compact(result.message || result.preview) || "未返回可用成果",
    ok: !!result.ok,
    error: result.ok ? null : compact(result.error || result.stderr || "Worker returned not ok"),
    exitCode: result.exitCode ?? null,
    durationMs: result.durationMs ?? null,
    logPath: result.logPath || null,
    startedAt,
    finishedAt: new Date().toISOString()
  };
}

export async function dispatchTask(taskId, config) {
  const task = getTask(taskId);
  if (!task) throw new Error("Task not found");
  if (["paused", "cancelled", "cancelling", "draft"].includes(task.status)) return task;

  // Probe any eligible cooling-down workers and wake tasks
  try {
    if (!config.dryRun) scanAllRebounds({ config });
  } catch {
    // Probing should never break dispatch
  }

  // High-Risk Approval Intercept
  const currentHash = computePayloadHash(task);
  if (task.riskLevel === "high" || task.status === "awaiting_approval") {
    if (task.approvalStatus !== "approved" || task.approvedHash !== currentHash) {
      return updateTask(taskId, {
        status: "awaiting_approval",
        approvalStatus: "pending",
        error: `High-risk task requires founder approval before dispatch: ${(task.riskReasons || []).join("; ")}`
      });
    }
  }

  // Reasoning Escalation Assessment (Rule 6: 派工前先进行 risk assessment，决定是否附加 /boost)
  const reasoningPolicy = evaluateReasoningMode(task);
  task.reasoning_mode = task.reasoning_mode || reasoningPolicy.reasoning_mode;
  task.boost_reason = task.boost_reason !== undefined ? task.boost_reason : reasoningPolicy.boost_reason;
  task.risk_level = task.risk_level || reasoningPolicy.risk_level;
  task.retry_count = task.retry_count || 0;

  const modelNeed = task.modelNeed || evaluateModelNeed(task);
  const requested = chooseAgent(task);
  const projectPath = task.projectPath || config.workspaceRoot || process.cwd();
  const guard = applyCostGuard(requested, undefined, { config, task, allowPaidFallback: task.allowPaidFallback });
  const routingAt = new Date().toISOString();
  const executionHistory = [
    ...(task.executionHistory || []),
    ...(guard.attempts || []).map((attempt) => ({
      agent: attempt.id,
      phase: "routing",
      selectedBecause: "Control Center 派工前健康检查",
      did: "未执行；路由器在派工前跳过",
      ok: false,
      error: attempt.skip,
      startedAt: routingAt,
      finishedAt: routingAt
    }))
  ];
  if (!guard.ok) {
    const isCapacityWait = guard.reason.includes("No subscription worker available") ||
      guard.reason.includes("EXHAUSTED") ||
      guard.reason.includes("COOLDOWN") ||
      guard.action === "WAITING_FOR_CAPACITY";
    const newStatus = isCapacityWait ? "waiting_for_capacity" : "blocked";
    logRoutingDecision({
      taskId,
      selectedWorker: requested,
      reason: guard.reason,
      modelNeed,
      workerStatus: "EXHAUSTED",
      isFallback: false
    });
    return updateTask(taskId, {
      status: newStatus,
      agentResolved: requested,
      selectionReason: guard.reason,
      error: guard.reason,
      executionHistory,
      finishedAt: isCapacityWait ? null : new Date().toISOString()
    });
  }

  // Check Safe Prework when a senior coding task's senior worker is unavailable:
  const isSeniorTask = (modelNeed.requiresSeniorWorker || modelNeed.modelNeedScore >= 71) && requested === "codex";
  if (isSeniorTask && guard.worker !== requested && !task.prework?.completed) {
    // Senior worker is exhausted/cooldown. Antigravity only executes SAFE PREWORK!
    const preworkTask = createPreworkTask(task, requested);
    updateTask(taskId, {
      status: "running",
      agentResolved: "antigravity",
      selectionReason: `高级工程师 (${requested}) 额度冷却中；由 Antigravity 先行执行安全前置分析 (SAFE PREWORK)`,
      isPrework: true
    });
    logRoutingDecision({
      taskId,
      selectedWorker: "antigravity",
      reason: `高级工程师 (${requested}) 额度耗尽，委派 Antigravity 执行 Safe Prework`,
      modelNeed,
      isFallback: true,
      costClass: "INCLUDED"
    });
    let preworkResult;
    try {
      preworkResult = await runAgent("antigravity", preworkTask, projectPath, config);
    } catch (err) {
      preworkResult = { ok: false, agent: "antigravity", error: err.message };
    }
    return updateTask(taskId, {
      status: "waiting_for_capacity",
      agentResolved: requested,
      selectionReason: `安全前置 (SAFE PREWORK) 已完成；任务挂起等待高级工程师 (${requested}) 额度恢复回弹`,
      targetSeniorWorker: requested,
      prework: {
        completed: true,
        finishedAt: new Date().toISOString(),
        summary: preworkResult?.message || preworkResult?.stdout || "Prework analysis completed",
        artifacts: preworkResult?.deliverables || []
      },
      result: preworkResult,
      error: null
    });
  }

  const latestTask = getTask(taskId);
  if (!latestTask || ["paused", "cancelled", "cancelling"].includes(latestTask.status)) {
    return latestTask;
  }

  let agent = guard.worker;
  logRoutingDecision({
    taskId,
    selectedWorker: agent,
    reason: guard.reason,
    modelNeed,
    isFallback: agent !== requested,
    costClass: (agent === "hermes" || agent === "deepseek") ? "METERED_API" : "SUBSCRIPTION"
  });

  updateTask(taskId, {
    status: "running",
    agentResolved: agent,
    selectionReason: guard.reason,
    attemptCount: (task.attemptCount || 0) + 1,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    result: null,
    verification: null,
    deliverables: null,
    error: null,
    executionHistory
  });

  let result;
  const skip = [];
  const verificationHistory = [...(task.verificationHistory || [])];
  let selectedBecause = guard.reason;
  for (;;) {
    const attemptStartedAt = new Date().toISOString();
    const currentTask = getTask(taskId);
    if (!currentTask || ["paused", "cancelled", "cancelling"].includes(currentTask.status)) {
      return updateTask(taskId, {
        status: "cancelled",
        error: "Task stopped by user",
        finishedAt: new Date().toISOString()
      });
    }

    const isDeepSeekWorker = agent === "deepseek" || agent === "hermes";
    if (isDeepSeekWorker) {
      reserveBudget(taskId);
    }

    const activeReasoning = evaluateReasoningMode(currentTask, { retry_count: currentTask.retry_count || 0 });
    const isBoostActive = activeReasoning.reasoning_mode === "boost";
    const taskForRun = {
      ...currentTask,
      reasoning_mode: activeReasoning.reasoning_mode,
      boost_reason: activeReasoning.boost_reason,
      risk_level: activeReasoning.risk_level,
      boost: isBoostActive
    };

    try {
      result = await runAgent(agent, taskForRun, projectPath, config);
    } catch (error) {
      result = { ok: false, agent, error: error?.stack || String(error) };
    } finally {
      if (isDeepSeekWorker) {
        releaseBudgetReserve(taskId);
      }
    }

    // Persist workforce status machine and subscription-quota state from this run's outcome
    try {
      const errorCat = classifyWorkerError(result);
      if (errorCat === "QUOTA_EXHAUSTED" || isQuotaExhaustion(result)) {
        markQuotaExhausted(agent, (result.error || result.message || result.stderr || "subscription quota exhausted"));
        recordWorkerFailure(agent, "QUOTA_EXHAUSTED", result.error || result.message);
      } else if (errorCat === "RATE_LIMITED") {
        recordWorkerFailure(agent, "RATE_LIMITED", result.error || result.message);
      } else if (errorCat === "WORKER_OFFLINE") {
        recordWorkerFailure(agent, "WORKER_OFFLINE", result.error || result.message);
      } else if (result && result.ok && agent !== "deepseek" && agent !== "hermes") {
        markQuotaNormal(agent);
        recordWorkerSuccess(agent);
      }
    } catch {
      // Quota bookkeeping must never break a task run.
    }

    if (isDeepSeekWorker && (result.ok || result.exitCode === 0)) {
      recordUsage({
        taskId,
        worker: agent,
        tokensIn: result.tokensIn || 0,
        tokensOut: result.tokensOut || 0,
        costCny: result.costCny,
        source: agent
      });
    }
    executionHistory.push({
      attempt: executionHistory.length + 1,
      ...executionRecord({ agent, result, selectedBecause, startedAt: attemptStartedAt })
    });
    updateTask(taskId, {
      result,
      executionHistory,
      error: result.ok ? null : (result.error || result.stderr || "Worker returned not ok")
    });

    const statusAfterRun = getTask(taskId)?.status;
    if (result.cancelled || statusAfterRun === "cancelled" || statusAfterRun === "cancelling") {
      return updateTask(taskId, {
        status: "cancelled",
        result: { ...result, ok: false },
        executionHistory,
        error: "Task stopped by user",
        finishedAt: new Date().toISOString()
      });
    }

    const unavailable = isWorkerUnavailable(result);
    if (result.ok || !unavailable) break;

    // If a senior task was running on Codex and Codex became unavailable mid-run,
    // do NOT dump the dangerous full refactoring on Antigravity; trigger Prework instead.
    if (isSeniorTask && agent === "codex" && !task.prework?.completed) {
      const preworkTask = createPreworkTask(task, requested);
      let preworkResult;
      try {
        preworkResult = await runAgent("antigravity", preworkTask, projectPath, config);
      } catch (err) {
        preworkResult = { ok: false, agent: "antigravity", error: err.message };
      }
      return updateTask(taskId, {
        status: "waiting_for_capacity",
        agentResolved: requested,
        selectionReason: `${requested} 运行时额度用尽；由 Antigravity 完成前置调研并挂起等待容量回弹`,
        targetSeniorWorker: requested,
        prework: {
          completed: true,
          finishedAt: new Date().toISOString(),
          summary: preworkResult?.message || "Prework completed upon mid-run exhaustion",
          artifacts: preworkResult?.deliverables || []
        },
        error: null
      });
    }

    skip.push(agent);
    const fallback = applyCostGuard("auto", undefined, { config, skip, task, allowPaidFallback: task.allowPaidFallback });
    if (!fallback.ok || skip.includes(fallback.worker)) break;
    const previousAgent = agent;
    const handoffReason = `${previousAgent} 不可用：${compact(result.error || result.stderr || result.message || "未知错误")}`;
    executionHistory.at(-1).fallbackReason = handoffReason;
    executionHistory.at(-1).nextAgent = fallback.worker;
    agent = fallback.worker;
    selectedBecause = `${handoffReason}；由 ${agent} 接手`;
    logRoutingDecision({
      taskId,
      selectedWorker: agent,
      reason: selectedBecause,
      modelNeed,
      isFallback: true,
      costClass: (agent === "hermes" || agent === "deepseek") ? "METERED_API" : "SUBSCRIPTION"
    });
    updateTask(taskId, {
      status: "running",
      agentResolved: agent,
      selectionReason: selectedBecause,
      attemptCount: (getTask(taskId).attemptCount || 1) + skip.length,
      executionHistory
    });
  }

  const statusBeforeVerify = getTask(taskId)?.status;
  if (statusBeforeVerify === "cancelled" || statusBeforeVerify === "cancelling") {
    return updateTask(taskId, {
      status: "cancelled",
      result,
      executionHistory,
      error: "Task stopped by user",
      finishedAt: new Date().toISOString()
    });
  }

  updateTask(taskId, { status: "verifying", result, executionHistory });
  let verification = await verifyTask({ projectPath, result, config, task });
  verificationHistory.push({ ...verification, at: new Date().toISOString(), repair: false });

  const maxRepairAttempts = Math.max(0, Math.min(config.execution?.maxRepairAttempts ?? 1, 3));
  let repairAttempt = 0;
  let retryCount = task.retry_count || 0;
  while (!verification.ok && result.ok && repairAttempt < maxRepairAttempts) {
    const statusBeforeRepair = getTask(taskId)?.status;
    if (statusBeforeRepair === "cancelled" || statusBeforeRepair === "cancelling") {
      return updateTask(taskId, {
        status: "cancelled",
        result,
        executionHistory,
        verificationHistory,
        error: "Task stopped by user",
        finishedAt: new Date().toISOString()
      });
    }

    repairAttempt += 1;
    retryCount += 1;

    // Rule 3: 连续失败升级 (Consecutive Failure Escalation)
    const escalation = evaluateReasoningMode(task, { retry_count: retryCount });
    if (escalation.stop_for_review) {
      const failureReport = createFailureAuditReport(task, result, verification);
      return updateTask(taskId, {
        status: "failed",
        retry_count: retryCount,
        reasoning_mode: escalation.reasoning_mode,
        boost_reason: escalation.boost_reason,
        result: { ...result, verification, failureReport },
        verification,
        verification_result: verification,
        executionHistory,
        verificationHistory,
        error: "连续 3 次失败触发推理升级熔断保护：停止自动修改，已生成失败报告并请求审核"
      });
    }

    const isBoostRepair = escalation.reasoning_mode === "boost";
    updateTask(taskId, {
      status: "repairing",
      retry_count: retryCount,
      reasoning_mode: escalation.reasoning_mode,
      boost_reason: escalation.boost_reason
    });

    const repairTask = {
      ...task,
      retry_count: retryCount,
      reasoning_mode: escalation.reasoning_mode,
      boost_reason: escalation.boost_reason,
      boost: isBoostRepair,
      description: `${task.description}\n\nVERIFIER FAILED (第 ${retryCount} 次重试): ${verification.reason}. Evidence: ${JSON.stringify(verification.checks)}. ${isBoostRepair ? '【BOOST 模式已激活】：请深度分析根因与潜在回归，制定严密方案后重试。' : 'Fix the smallest issue and retest.'}`
    };
    const attemptStartedAt = new Date().toISOString();
    try {
      result = await runAgent(agent, repairTask, projectPath, config);
    } catch (error) {
      result = { ok: false, agent, error: error?.stack || String(error) };
    }
    executionHistory.push({
      attempt: executionHistory.length + 1,
      ...executionRecord({
        agent,
        result,
        selectedBecause: `机器验收失败：${verification.reason}；自动返工 (第 ${retryCount} 次重试 · ${escalation.reasoning_mode})`,
        startedAt: attemptStartedAt,
        phase: "repair"
      }),
      repair: true,
      reasoning_mode: escalation.reasoning_mode
    });
    updateTask(taskId, {
      result,
      executionHistory,
      retry_count: retryCount,
      reasoning_mode: escalation.reasoning_mode,
      boost_reason: escalation.boost_reason,
      error: result.ok ? null : (result.error || result.stderr || "Worker returned not ok")
    });
    verification = await verifyTask({ projectPath, result, config, task });
    verificationHistory.push({ ...verification, at: new Date().toISOString(), repair: true });
  }

  // Task Escalation: If Antigravity failed repair on a Medium/High task, escalate to senior worker
  if (!verification.ok && agent === "antigravity" && (modelNeed.tier === "MEDIUM" || modelNeed.tier === "HIGH")) {
    const seniorWorker = modelNeed.domain === "research" ? "grok-build" : "codex";
    const seniorGuard = applyCostGuard(seniorWorker, undefined, { config, task, allowPaidFallback: task.allowPaidFallback });
    if (seniorGuard.ok && seniorGuard.worker === seniorWorker) {
      const escalateStartedAt = new Date().toISOString();
      updateTask(taskId, {
        status: "running",
        agentResolved: seniorWorker,
        selectionReason: `Antigravity 执行返工后仍未通过机器验收；自动升级 (ESCALATE) 给高级工程师 ${seniorWorker}`,
        attemptCount: (getTask(taskId).attemptCount || 1) + 1
      });
      logRoutingDecision({
        taskId,
        selectedWorker: seniorWorker,
        reason: `Antigravity 验收失败返工穷尽；任务升级给 ${seniorWorker}`,
        modelNeed,
        isFallback: false
      });
      try {
        emitLearningEvent({
          type: "AGENT_ESCALATED",
          domain: "routing",
          actor: "system",
          subject: { kind: "task", id: taskId },
          payload: {
            from: "antigravity",
            to: seniorWorker,
            reason: verification.reason,
            modelNeed
          }
        });
      } catch {}
      const escalateTask = {
        ...task,
        description: `${task.description}\n\n【ESCALATION FROM JUNIOR WORKER (Antigravity 验收失败自动升级)】\n失败原因：${verification.reason}\n验收检查项：${JSON.stringify(verification.checks)}\n请以高级工程师标准直接解决并修复。`
      };
      try {
        result = await runAgent(seniorWorker, escalateTask, projectPath, config);
        verification = await verifyTask({ projectPath, result, config, task });
        executionHistory.push({
          attempt: executionHistory.length + 1,
          ...executionRecord({
            agent: seniorWorker,
            result,
            selectedBecause: `Antigravity 验收失败返工穷尽；升级由 ${seniorWorker} 重新接手`,
            startedAt: escalateStartedAt,
            phase: "escalation"
          })
        });
        updateTask(taskId, { result, executionHistory });
      } catch (err) {
        result = { ok: false, agent: seniorWorker, error: err.message };
      }
    }
  }

  // Rule 4: Boost 6 维验收质检（中高风险或 Boost 任务）
  if (result.ok && verification.ok) {
    const currentTask = getTask(taskId) || task;
    const isMediumOrHigh = currentTask.risk_level === "high" ||
      currentTask.risk_level === "medium" ||
      currentTask.reasoning_mode === "boost" ||
      currentTask.riskLevel === "high";

    if (isMediumOrHigh) {
      const boostVerification = await runBoostVerification({
        projectPath,
        result,
        config,
        task: currentTask,
        standardVerification: verification
      });
      verification = boostVerification;
      verificationHistory.push({ ...boostVerification, at: new Date().toISOString(), boostVerification: true });
    }
  }

  const finalCheckStatus = getTask(taskId)?.status;
  if (finalCheckStatus === "cancelled" || finalCheckStatus === "cancelling") {
    return updateTask(taskId, {
      status: "cancelled",
      result: { ...result, verification },
      verification,
      verification_result: verification,
      executionHistory,
      verificationHistory,
      error: "Task stopped by user",
      finishedAt: new Date().toISOString()
    });
  }

  const passed = result.ok && verification.ok;
  const deliverables = passed ? buildDeliverables(task, projectPath, result) : null;
  const finalTask = getTask(taskId) || task;
  const completedTask = updateTask(taskId, {
    status: passed ? "completed" : "failed",
    result: { ...result, verification },
    verification,
    verification_result: verification,
    reasoning_mode: finalTask.reasoning_mode || "normal",
    boost_reason: finalTask.boost_reason || null,
    retry_count: finalTask.retry_count || retryCount || 0,
    risk_level: finalTask.risk_level || finalTask.riskLevel || "low",
    executionHistory,
    verificationHistory,
    deliverables,
    error: passed ? null : (verification.ok ? result.error : verification.reason),
    finishedAt: new Date().toISOString()
  });
  if (passed && deliverables) {
    try {
      const registered = syncFromDeliverables(completedTask, projectPath);
      for (const file of registered) {
        enqueueDelivery({ fileId: file.fileId, packageId: null, channel: "local" });
      }
    } catch {
      // Deliverables sync to file registry must not break task completion
    }
  }
  try {
    emitLearningEvent({
      type: passed ? "TASK_SUCCEEDED" : "TASK_FAILED",
      domain: "engineering",
      actor: "system",
      subject: { kind: "task", id: taskId },
      payload: { agent: completedTask.agentResolved || null }
    });
  } catch {
    // Learning must not break dispatch
  }

  // Hermes COO Automatic Subtask Dispatching
  if (passed && (completedTask.agentResolved === "hermes" || completedTask.delegateToHermes)) {
    try {
      const outputText = result?.message || result?.preview || result?.stdout || "";
      const planSubtasks = parseDispatchPlan(outputText);
      if (planSubtasks.length > 0) {
        dispatchSubtasks(taskId, planSubtasks, { config, projectPath, autoRun: true });
      }
    } catch (dispatchErr) {
      console.error("Hermes subtask auto-dispatch error:", dispatchErr);
    }
  }

  return getTask(taskId) || completedTask;
}

export function buildPrompt(task, projectPath) {
  const acceptance = describeAcceptanceCriteria(task.acceptanceCriteria || []);
  let memoryBlock = [];
  try {
    const memContext = buildMemoryContext({ project: task.projectPath || projectPath || "" });
    if (memContext && memContext.trim()) {
      memoryBlock = ["", memContext];
    }
  } catch (err) {
    console.error("Memory injection skipped due to error:", err);
  }

  let briefBlock = [];
  try {
    const briefText = (getBrief().content || "").trim();
    if (briefText) {
      briefBlock = ["", "FOUNDER BRIEF / HERMES CONSENSUS (Hermes 需求收敛备份 · 创始人确认后生效 · 每次派工自动注入):", briefText];
    }
  } catch (err) {
    console.error("Brief injection skipped due to error:", err);
  }

  let reviewBlock = [];
  try {
    const reviews = listReviews(task.id);
    if (reviews.length) {
      const lines = ["FOUNDER REVIEW FEEDBACK (累计反馈 · 请据此完善产物):"];
      reviews.forEach((r, idx) => {
        const kindLabel = r.kind === "praise" ? "做得好" : r.kind === "issue" ? "做得不好" : "备注";
        const authorLabel = r.author === "founder" ? "创始人" : "系统";
        lines.push(`${idx + 1}. [${authorLabel} · ${kindLabel}] ${r.text}`);
      });
      reviewBlock = ["", lines.join("\n")];
    }
  } catch (err) {
    console.error("Review injection skipped due to error:", err);
  }

  let readScopeBlock = [];
  try {
    const scopeText = (getReadScope().content || "").trim();
    if (scopeText) {
      readScopeBlock = ["", scopeText];
    }
  } catch (err) {
    console.error("Read-scope injection skipped due to error:", err);
  }

  let agentReachBlock = [];
  try {
    const agentReachText = readAgentReachDirective(task).trim();
    if (agentReachText) agentReachBlock = ["", agentReachText];
  } catch (err) {
    console.error("Agent Reach skill injection skipped due to error:", err);
  }

  let cardLayoutBlock = [];
  try {
    const cardLayoutText = readCardLayoutStandardDirective().trim();
    if (cardLayoutText) {
      cardLayoutBlock = ["", cardLayoutText];
    }
  } catch (err) {
    console.error("Card layout skill injection skipped due to error:", err);
  }

  let preworkBlock = [];
  if (task.prework?.completed && task.prework.summary) {
    preworkBlock = [
      "",
      "=== JUNIOR WORKER PREWORK CHECKPOINT (Antigravity 前置梳理结果 · 请直接利用以下分析接续执行) ===",
      task.prework.summary,
      "=== END PREWORK CHECKPOINT ==="
    ];
  }

  let hermesCooBlock = [];
  const isHermes = task.agent === "hermes" || task.agentResolved === "hermes" || task.delegateToHermes;
  if (isHermes) {
    hermesCooBlock = [
      "",
      "=== HERMES COO ORCHESTRATION DIRECTIVE (首席运营官调度职责) ===",
      "1. You are Hermes, the COO of AI Founder OS.",
      "2. The Local Control Center (:3210) is the AI CEO holding ultimate authority, task ledger, budget guard, and risk approvals.",
      "3. Your core responsibility is to decompose complex goals, plan the execution steps, orchestrate the workflow, and drive concrete deliverables.",
      "4. You do not hold final approval for high-risk actions (publishing to Xiaohongshu, spending budget, irreversible deletions) — those must be vetted by the CEO/Founder.",
      "5. Provide clear breakdown and summarize progress with concrete CAN_USE and ARTIFACT deliverables.",
      "6. When decomposing requirements or distributing tasks across workers, you must output a machine-parsable JSON block enclosed in ```json:dispatch_plan specifying subtasks with assigned workers (codex, antigravity, grok, claude, deepseek) and acceptance criteria so the AI CEO registers and executes them.",
      "=== END HERMES COO DIRECTIVE ==="
    ];
  }

  return [
    "You are an execution agent inside AI Founder OS.",
    "",
    `PROJECT PATH: ${projectPath}`,
    `TASK: ${task.title}`,
    "",
    "USER INTENT:",
    task.description,
    ...briefBlock,
    ...memoryBlock,
    ...preworkBlock,
    ...reviewBlock,
    ...readScopeBlock,
    ...agentReachBlock,
    ...cardLayoutBlock,
    ...hermesCooBlock,
    ...(acceptance.length ? ["", "MACHINE-VERIFIED ACCEPTANCE CRITERIA:", ...acceptance.map((item, index) => `${index + 1}. ${item}`)] : []),
    "",
    "MANDATORY WORKFLOW:",
    "1. Read AGENTS.md and founder_os/ before making changes if those files exist.",
    "2. Inspect the current project state and git status.",
    "3. Do not redesign unrelated parts of the project.",
    "4. Make the smallest complete change that satisfies the task.",
    "5. Run relevant tests/checks after changes.",
    "6. Fix failures you caused before reporting back.",
    "7. Do not publish, purchase, delete external data, or perform irreversible external actions.",
    "8. Understand the founder's desired human outcome before choosing implementation details. If the founder invokes 拷打我/grilling, load .agents/skills/grilling/SKILL.md and interview in rounds before acting.",
    "9. End with a founder-facing result using these exact markers. Describe usable outcomes, not code:",
    "   CAN_USE: <one concrete thing the founder can now do>",
    "   ARTIFACT: <project-relative path to each finished file or folder>",
    "   Repeat either marker when there are multiple results. Do not list source-code files as artifacts unless the task explicitly asked for code.",
    "",
    "The user's time is more expensive than tokens. Solve routine problems yourself instead of sending them back to the user."
  ].join("\n");
}
