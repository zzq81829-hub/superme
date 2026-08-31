import { isForbiddenApiEnabled, workerPolicy } from "../billing/policy.js";
import { workerHealthMap } from "./health.js";
import { FALLBACK_CHAIN } from "./ids.js";

export function applyCostGuard(requested, healthMap = workerHealthMap({ probeReadiness: true }), options = {}) {
  const forbidden = isForbiddenApiEnabled();
  if (forbidden.length) {
    return {
      ok: false,
      worker: null,
      reason: `Forbidden API enabled in billing policy: ${forbidden.join(", ")}`,
      action: "HUMAN_ACTION_REQUIRED"
    };
  }

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
    const health = healthMap[id];
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
        : `${requested} unavailable (${healthMap[requested]?.status || "OFFLINE"}), fallback ${id}`,
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
