import { isForbiddenApiEnabled, workerPolicy } from "../billing/policy.js";
import { getRemainingBudget, getBudgetSummary } from "../billing/deepseekBudget.js";
import { workerHealthMap } from "./health.js";
import { FALLBACK_CHAIN } from "./ids.js";
import { getWorkerQuota } from "./quota.js";

export function applyCostGuard(requested, healthMap, options = {}) {
  const resolvedHealthMap = healthMap || workerHealthMap({ probeReadiness: true, config: options.config || null });
  const forbidden = isForbiddenApiEnabled();
  if (forbidden.length) {
    return {
      ok: false,
      worker: null,
      reason: `Forbidden API enabled in billing policy: ${forbidden.join(", ")}`,
      action: "HUMAN_ACTION_REQUIRED"
    };
  }

  const remainingBudget = getRemainingBudget(options);
  const usesDeepSeekBudget = (id) => {
    if (id === "deepseek") return true;
    if (id !== "hermes") return false;
    return String(options.config?.agents?.hermes?.provider || "custom:gemini-proxy").toLowerCase() === "deepseek";
  };

  const tryOrder = requested === "auto"
    ? [...FALLBACK_CHAIN]
    : requested === "grok-bot"
      ? ["grok-bot", ...FALLBACK_CHAIN]
      : [requested, ...FALLBACK_CHAIN.filter((id) => id !== requested)];

  const skip = new Set(options.skip || []);
  const attempts = [];
  for (const id of tryOrder) {
    if (skip.has(id)) {
      attempts.push({ id, skip: "runtime skip" });
      continue;
    }

    // Check the DeepSeek monthly hard cap only for workers that actually use DeepSeek.
    if (usesDeepSeekBudget(id) && remainingBudget <= 0) {
      attempts.push({ id, skip: "QUOTA_LIMITED (DeepSeek monthly budget exhausted)" });
      continue;
    }

    // Check persisted subscription-quota state: an exhausted worker is skipped
    // proactively so a fresh task does not re-dispatch to it and waste a run.
    const quotaState = getWorkerQuota(id, options);
    if (quotaState && quotaState.status === "exhausted") {
      attempts.push({ id, skip: `QUOTA_EXHAUSTED (${quotaState.reason || "subscription quota exhausted"})` });
      continue;
    }

    const health = resolvedHealthMap[id];
    const policy = workerPolicy(id);
    if (!health) {
      attempts.push({ id, skip: "unknown worker" });
      continue;
    }
    if (policy.api_allowed === false && health.billingMode === "api") {
      attempts.push({ id, skip: "subscription worker must not use API billing" });
      continue;
    }
    if (id === "grok-bot" && !health.available) {
      attempts.push({ id, skip: health.status });
      continue;
    }
    if (!health.available) {
      attempts.push({ id, skip: health.status });
      continue;
    }
    if (policy.api_allowed === false && ["OPENAI_API", "ANTHROPIC_API", "XAI_API"].includes(health.billingMode)) {
      attempts.push({ id, skip: "api fallback forbidden" });
      continue;
    }
    return {
      ok: true,
      worker: id,
      reason: id === requested || requested === "auto"
        ? `selected ${id}`
        : `${requested} unavailable (${resolvedHealthMap[requested]?.status || "OFFLINE"}), fallback ${id}`,
      attempts
    };
  }

  if (usesDeepSeekBudget(requested) && remainingBudget <= 0) {
    const summary = getBudgetSummary(options);
    return {
      ok: false,
      worker: null,
      reason: `DeepSeek monthly budget limit reached (${summary.spentCny.toFixed(2)}/${summary.totalLimitCny.toFixed(2)} CNY)`,
      action: "HUMAN_ACTION_REQUIRED",
      attempts
    };
  }

  return {
    ok: false,
    worker: null,
    reason: "No subscription worker available",
    action: "HUMAN_ACTION_REQUIRED",
    attempts
  };
}
