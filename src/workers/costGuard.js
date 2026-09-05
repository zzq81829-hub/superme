import { isForbiddenApiEnabled, workerPolicy } from "../billing/policy.js";
import { getRemainingBudget, getBudgetSummary } from "../billing/deepseekBudget.js";
import { workerHealthMap } from "./health.js";
import { FALLBACK_CHAIN, WORKERS } from "./ids.js";
import { getWorkerQuota } from "./quota.js";
import { getWorker } from "../workforce/registry.js";
import { hasAvailableAccount, getEffectiveWorkerAccount } from "../workforce/accountPool.js";

export function applyCostGuard(requested, healthMap, options = {}) {
  // A rehearsal must not depend on local CLI installations or login state.
  // Keep quota, approval and spending guards below active in both modes.
  const resolvedHealthMap = healthMap || (options.config?.dryRun === true
    ? Object.fromEntries(WORKERS.map((id) => {
      const key = id === "grok-build" ? "grokBuild" : id === "grok-bot" ? "grokBot" : id;
      return [id, { id, status: "DRY_RUN", available: id !== "grok-bot" && options.config.agents?.[key]?.enabled !== false, billingMode: workerPolicy(id).billing }];
    }))
    : workerHealthMap({ probeReadiness: true, config: options.config || null }));
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
  const usesPaidBudget = (id) => id === "deepseek" || id === "hermes";

  const tryOrder = requested === "auto"
    ? [...FALLBACK_CHAIN]
    : requested === "grok-bot"
      ? ["grok-bot", ...FALLBACK_CHAIN]
      : requested === "codex"
        ? ["codex", "claude", ...FALLBACK_CHAIN.filter((id) => id !== "codex" && id !== "claude")]
        : requested === "deepseek"
          ? ["deepseek", "codex", ...FALLBACK_CHAIN.filter((id) => id !== "deepseek" && id !== "codex")]
          : [requested, ...FALLBACK_CHAIN.filter((id) => id !== requested)];

  const skip = new Set(options.skip || []);
  const attempts = [];
  for (const id of tryOrder) {
    if (skip.has(id)) {
      attempts.push({ id, skip: "runtime skip" });
      continue;
    }

    // Check the DeepSeek monthly hard cap only for workers that actually use DeepSeek.
    if (usesPaidBudget(id) && remainingBudget <= 0) {
      attempts.push({ id, skip: "QUOTA_LIMITED (DeepSeek monthly budget exhausted)" });
      continue;
    }

    // Check persisted subscription-quota state: an exhausted worker is skipped
    // proactively so a fresh task does not re-dispatch to it and waste a run.
    const quotaState = getWorkerQuota(id, options);
    if (quotaState && quotaState.status === "exhausted" && (quotaState.source === "founder" || !hasAvailableAccount(id, options))) {
      attempts.push({ id, skip: `QUOTA_EXHAUSTED (${quotaState.reason || "subscription quota exhausted"})` });
      continue;
    }

    const accountState = getEffectiveWorkerAccount(id, options);
    if (accountState.pool && accountState.account?.status !== "AVAILABLE") {
      attempts.push({ id, skip: "ACCOUNT_NOT_READY (账号尚未登录或容量待检查)" });
      continue;
    }

    // Check workforce status machine
    try {
      const wfWorker = getWorker(id, options);
      if (wfWorker && ["EXHAUSTED", "COOLDOWN", "THROTTLED"].includes(wfWorker.status)) {
        if (!hasAvailableAccount(id, options)) {
          attempts.push({ id, skip: `${wfWorker.status} (${wfWorker.failureReason || "workforce cooldown"})` });
          continue;
        }
      }
    } catch {
      // ignore
    }

    // Senior Reasoning Model Protection:
    // Low-complexity tasks (tier === "LOW") MUST NOT fall back to workers reserved
    // for high-value reasoning (Codex, Grok Build, Claude).
    const taskTier = options.task?.modelNeed?.tier || options.task?.tier || options.modelNeed?.tier || options.tier;
    if (taskTier === "LOW" && id !== requested) {
      try {
        const wfWorker = getWorker(id, options);
        if (wfWorker?.reserveForHighValue) {
          attempts.push({ id, skip: "SENIOR_MODEL_RESERVED (low-complexity tasks cannot burn senior reasoning workers)" });
          continue;
        }
      } catch {
        // ignore
      }
    }

    // Hermes & Paid API protection: Never auto-fallback to metered API unless
    // explicitly requested or task specifies allowPaidFallback = true.
    const isPaidWorker = id === "hermes" || id === "deepseek";
    const explicitlyRequested = requested === id;
    const allowPaidFallback = options.allowPaidFallback === true || options.task?.allowPaidFallback === true;
    if (isPaidWorker && !explicitlyRequested && !allowPaidFallback) {
      attempts.push({ id, skip: "PAID_MODEL_BLOCKED (requires explicit selection or allowPaidFallback=true)" });
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

  if (usesPaidBudget(requested) && remainingBudget <= 0) {
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
