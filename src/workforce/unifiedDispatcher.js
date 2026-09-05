import { getTask, updateTask } from "../store.js";
import { getPolicy } from "../policy/policyManager.js";
import { applyCostGuard } from "../workers/costGuard.js";
import { workerHealthMap } from "../workers/health.js";
import { evaluateModelNeed } from "./modelNeed.js";
import { dispatchTask } from "../router.js";
import { publishEvent } from "../events/bus.js";
import { loadConfig } from "../config.js";

export function detectTaskDomain(task = {}) {
  const text = `${task.title || ""} ${task.body || ""} ${task.description || ""}`.toLowerCase();
  if (/ui|css|html|前端|组件|页面|样式|tailwind|vue|react|layout|卡片/i.test(text)) {
    return "frontend";
  }
  if (/api|路由|router|数据库|sqlite|db|后端|server|endpoint|controller|orm/i.test(text)) {
    return "backend";
  }
  if (/调研|research|搜索|search|分析|市场|竞品|趋势|论文/i.test(text)) {
    return "research";
  }
  if (/hermes|规划|编排|协同|coordination|multi-agent|调度/i.test(text)) {
    return "coordination";
  }
  return "general";
}

export function evaluateReasoningMode(task = {}, boostPolicy = {}) {
  const text = `${task.title || ""} ${task.body || ""} ${task.description || ""}`;
  const rules = boostPolicy.rules || { boost_threshold: 0.68, high_risk_threshold: 0.80 };
  const retryCount = Number(task.retryCount || task.attemptCount || 0);

  // If already failed once, automatically escalate to boost
  if (retryCount >= 1) {
    return { mode: "boost", reason: `Escalated to boost due to previous retry (attempt: ${retryCount + 1})` };
  }

  // Check multi-file or complex refactor indicators
  const isMultiFile = /3\+|多个文件|跨文件|多模块|重构|refactor|restructure/i.test(text);
  if (rules.auto_boost_on_refactor && isMultiFile) {
    return { mode: "boost", reason: "Refactor / multi-file complexity triggers boost" };
  }

  // Calculate task complexity score
  let score = 0.3;
  if (/架构|API|数据库|状态管理|安全|权限/i.test(text)) score += 0.35;
  if (/性能|并发|算法|优化/i.test(text)) score += 0.15;
  if (/简单|文案|修正错别字|打标签/i.test(text)) score -= 0.2;

  score = Math.max(0.1, Math.min(1.0, score));

  if (score >= (rules.boost_threshold || 0.68)) {
    return { mode: "boost", reason: `Task complexity (${score.toFixed(2)}) meets boost threshold (${rules.boost_threshold})` };
  }

  return { mode: "normal", reason: `Task complexity (${score.toFixed(2)}) within normal execution parameters` };
}

export async function dispatchTaskUnified(taskId, options = {}) {
  const task = getTask(taskId, options);
  if (!task) throw new Error(`Task ${taskId} not found`);

  const config = options.config || loadConfig();
  const routerPolicy = getPolicy("agent_router", options);
  const boostPolicy = getPolicy("boost_policy", options);

  const requestedAgent = options.agent || task.agent || "auto";
  const requestedMode = options.reasoning_mode || options.reasoningMode || "auto";
  const domain = detectTaskDomain(task);

  // 1. Select reasoning mode
  let reasoningDecision;
  if (requestedMode !== "auto") {
    reasoningDecision = { mode: requestedMode, reason: `Explicit mode requested: ${requestedMode}` };
  } else {
    reasoningDecision = evaluateReasoningMode(task, boostPolicy);
  }

  // 2. Select worker
  let selectedWorker = "antigravity";
  let selectionReason = "";

  if (requestedAgent !== "auto") {
    selectedWorker = requestedAgent;
    selectionReason = `Explicit worker requested: ${requestedAgent}`;
  } else {
    // Model need evaluation
    const modelNeed = evaluateModelNeed(task);
    const healthMap = options.healthMap || workerHealthMap({ probeReadiness: true, config });

    // Consult policy weights
    const domainRules = routerPolicy.rules?.[domain] || {};
    let preferred = "antigravity";
    if (domain === "backend" && (domainRules.codex_weight || 0) > 0.5) {
      preferred = "codex";
    } else if (domain === "research" && (domainRules.grok_weight || 0) > 0.5) {
      preferred = "grok-build";
    } else if (domain === "coordination" && (domainRules.hermes_weight || 0) > 0.5) {
      preferred = "hermes";
    }

    const guard = applyCostGuard(preferred, healthMap, {
      ...options,
      task: {
        ...task,
        modelNeed,
        allowPaidFallback: options.allowPaidFallback || task.allowPaidFallback || false
      }
    });

    if (guard.ok && guard.worker) {
      selectedWorker = guard.worker;
      selectionReason = guard.reason || `Domain ${domain} routed to ${guard.worker}`;
    } else {
      selectedWorker = "antigravity";
      selectionReason = guard.reason ? `Fallback to antigravity: ${guard.reason}` : "Default cost-first fallback";
    }
  }

  // 3. Update task
  const updated = updateTask(taskId, {
    status: "queued",
    agent: selectedWorker,
    agentResolved: selectedWorker,
    reasoningMode: reasoningDecision.mode,
    boostEnabled: reasoningDecision.mode === "boost",
    selectionReason: `${selectionReason} [${reasoningDecision.reason}]`,
    updatedAt: new Date().toISOString()
  }, options);

  // 4. Publish dispatch event
  publishEvent({
    type: "task_dispatched",
    project_id: task.project || "general",
    task_id: taskId,
    source: "unified_dispatcher",
    outcome: "success",
    payload: {
      agent: selectedWorker,
      reasoning_mode: reasoningDecision.mode,
      domain,
      selection_reason: selectionReason
    }
  }, options);

  // 5. Trigger dispatch execution
  if (options.autoRun !== false && !options.dryRun) {
    const dispatchFn = options.dispatchTask || dispatchTask;
    dispatchFn(taskId, config).catch((err) => {
      updateTask(taskId, {
        status: "failed",
        error: err?.stack || String(err),
        finishedAt: new Date().toISOString()
      }, options);
      publishEvent({
        type: "task_failed",
        project_id: task.project || "general",
        task_id: taskId,
        source: selectedWorker,
        outcome: "failure",
        payload: { error: err?.message }
      }, options);
    });
  }

  return {
    ok: true,
    task_id: taskId,
    agent: selectedWorker,
    reasoning_mode: reasoningDecision.mode,
    domain,
    selection_reason: selectionReason,
    task: updated
  };
}
