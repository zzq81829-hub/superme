import { getTask, updateTask } from "./store.js";
import { runAgent } from "./adapters/runAgent.js";
import { applyCostGuard } from "./workers/costGuard.js";
import { verifyTask } from "./verify/verifyTask.js";
import { describeAcceptanceCriteria } from "./verify/criteria.js";
import { buildMemoryContext } from "./memory/inject.js";
import { getBrief } from "./briefs/store.js";
import { listReviews } from "./reviews/store.js";
import { computePayloadHash } from "./tasks/risk.js";
import { reserveBudget, releaseBudgetReserve, recordUsage } from "./billing/deepseekBudget.js";
import { markQuotaExhausted, markQuotaNormal, isQuotaExhaustion } from "./workers/quota.js";
import { buildDeliverables } from "./tasks/deliverables.js";

export function chooseAgent(task) {
  if (task.agent && task.agent !== "auto") return task.agent;

  const text = `${task.title}\n${task.description}`.toLowerCase();
  if (["hermes", "编排", "拆任务", "多agent", "orchestrat"].some((s) => text.includes(s))) return "hermes";
  if (["摘要", "总结", "改写", "分类", "便宜", "summar", "rewrite"].some((s) => text.includes(s))) return "deepseek";
  if (["研究", "search", "调研"].some((s) => text.includes(s))) return "grok";
  if (["review", "审查", "代码审查"].some((s) => text.includes(s))) return "claude";
  if (["架构", "方案", "分析", "检查代码"].some((s) => text.includes(s))) return "codex";
  return "antigravity";
}

export function isWorkerUnavailable(result = {}) {
  return /usage limit|quota|QUOTA_LIMITED|AUTH_REQUIRED|not logged in|PROXY_DOWN|ECONNREFUSED|unrecognized_model|timed out|headless mode cannot prompt|denied a required tool/i
    .test(`${result.error || ""}\n${result.message || ""}\n${result.stderr || ""}`);
}

export async function dispatchTask(taskId, config) {
  const task = getTask(taskId);
  if (!task) throw new Error("Task not found");
  if (["paused", "cancelled", "cancelling", "draft"].includes(task.status)) return task;

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

  const requested = chooseAgent(task);
  const projectPath = task.projectPath || config.workspaceRoot || process.cwd();
  const guard = applyCostGuard(requested);
  if (!guard.ok) {
    return updateTask(taskId, {
      status: "blocked",
      agentResolved: requested,
      selectionReason: guard.reason,
      error: guard.reason,
      finishedAt: new Date().toISOString()
    });
  }

  const latestTask = getTask(taskId);
  if (!latestTask || ["paused", "cancelled", "cancelling"].includes(latestTask.status)) {
    return latestTask;
  }

  let agent = guard.worker;
  updateTask(taskId, {
    status: "running",
    agentResolved: agent,
    selectionReason: guard.reason,
    attemptCount: (task.attemptCount || 0) + 1,
    startedAt: new Date().toISOString()
  });

  let result;
  const skip = [];
  const executionHistory = [...(task.executionHistory || [])];
  const verificationHistory = [...(task.verificationHistory || [])];
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

    try {
      result = await runAgent(agent, currentTask, projectPath, config);
    } catch (error) {
      result = { ok: false, agent, error: error?.stack || String(error) };
    } finally {
      if (isDeepSeekWorker) {
        releaseBudgetReserve(taskId);
      }
    }

    // Persist subscription-quota state from this run's outcome so future
    // dispatches stop re-sending work to an exhausted worker (and clear the
    // flag once a worker proves it can complete a run again).
    try {
      if (result && !result.ok && isQuotaExhaustion(result)) {
        markQuotaExhausted(agent, (result.error || result.message || result.stderr || "subscription quota exhausted"));
      } else if (result && result.ok && agent !== "deepseek" && agent !== "hermes") {
        markQuotaNormal(agent);
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
      agent,
      ok: !!result.ok,
      error: result.error || null,
      startedAt: attemptStartedAt,
      finishedAt: new Date().toISOString()
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
    skip.push(agent);
    const fallback = applyCostGuard("auto", undefined, { skip });
    if (!fallback.ok || skip.includes(fallback.worker)) break;
    agent = fallback.worker;
    updateTask(taskId, {
      status: "running",
      agentResolved: agent,
      selectionReason: `${skip.join(",")} unavailable; fallback ${agent}`,
      attemptCount: (getTask(taskId).attemptCount || 1) + skip.length
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
    updateTask(taskId, { status: "repairing" });
    const repairTask = {
      ...task,
      description: `${task.description}\n\nVERIFIER FAILED: ${verification.reason}. Evidence: ${JSON.stringify(verification.checks)}. Fix the smallest issue and retest.`
    };
    const attemptStartedAt = new Date().toISOString();
    try {
      result = await runAgent(agent, repairTask, projectPath, config);
    } catch (error) {
      result = { ok: false, agent, error: error?.stack || String(error) };
    }
    executionHistory.push({
      agent,
      ok: !!result.ok,
      error: result.error || null,
      repair: true,
      startedAt: attemptStartedAt,
      finishedAt: new Date().toISOString()
    });
    verification = await verifyTask({ projectPath, result, config, task });
    verificationHistory.push({ ...verification, at: new Date().toISOString(), repair: true });
  }

  const finalCheckStatus = getTask(taskId)?.status;
  if (finalCheckStatus === "cancelled" || finalCheckStatus === "cancelling") {
    return updateTask(taskId, {
      status: "cancelled",
      result: { ...result, verification },
      verification,
      executionHistory,
      verificationHistory,
      error: "Task stopped by user",
      finishedAt: new Date().toISOString()
    });
  }

  const passed = result.ok && verification.ok;
  const deliverables = passed ? buildDeliverables(task, projectPath, result) : null;
  return updateTask(taskId, {
    status: passed ? "completed" : result.ok ? "failed" : "failed",
    result: { ...result, verification },
    verification,
    executionHistory,
    verificationHistory,
    deliverables,
    error: passed ? null : (verification.ok ? result.error : verification.reason),
    finishedAt: new Date().toISOString()
  });
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
      briefBlock = ["", "FOUNDER BRIEF (需求简报 · 每次派工自动注入，请据此适配产物):", briefText];
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
    ...reviewBlock,
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
