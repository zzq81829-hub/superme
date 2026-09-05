import { getWorker, updateWorker, getWorkersRegistry } from "./registry.js";

export const WORKER_STATUSES = Object.freeze([
  "AVAILABLE",
  "BUSY",
  "LOW",
  "THROTTLED",
  "EXHAUSTED",
  "COOLDOWN",
  "PROBING",
  "OFFLINE",
  "ERROR"
]);

export const DEFAULT_PROBE_INTERVALS_MS = Object.freeze([
  30 * 60 * 1000,   // 1st cooldown: 30 minutes
  60 * 60 * 1000,   // 2nd cooldown: 60 minutes
  120 * 60 * 1000   // 3rd+ cooldown: 120 minutes (2 hours)
]);

export function isValidStatus(status) {
  return WORKER_STATUSES.includes(status);
}

export function computeNextProbeDelayMs(cooldownCount = 0) {
  const index = Math.max(0, Math.min(cooldownCount, DEFAULT_PROBE_INTERVALS_MS.length - 1));
  return DEFAULT_PROBE_INTERVALS_MS[index];
}

export function getWorkerStatus(workerId, options = {}) {
  const worker = getWorker(workerId, options);
  return worker ? worker.status : "UNKNOWN";
}

export function transitionWorkerStatus(workerId, newStatus, metadata = {}, options = {}) {
  if (!isValidStatus(newStatus)) {
    throw new Error(`Invalid worker status: ${newStatus}. Must be one of ${WORKER_STATUSES.join(", ")}`);
  }
  const current = getWorker(workerId, options);
  if (!current) {
    throw new Error(`Worker not found: ${workerId}`);
  }

  const updates = {
    status: newStatus,
    ...metadata,
    statusChangedAt: new Date().toISOString()
  };

  return updateWorker(workerId, updates, options);
}

export function recordWorkerFailure(workerId, errorCategory, errorDetail = "", options = {}) {
  const current = getWorker(workerId, options) || {};
  const now = new Date();
  const cooldownCount = (current.cooldownCount || 0) + 1;
  const probeDelayMs = computeNextProbeDelayMs(cooldownCount - 1);
  const nextProbeAt = new Date(now.getTime() + probeDelayMs).toISOString();

  let nextStatus = "ERROR";
  let lastQuotaError = current.lastQuotaError || null;

  if (errorCategory === "QUOTA_EXHAUSTED") {
    nextStatus = "COOLDOWN";
    lastQuotaError = String(errorDetail || "Subscription quota exhausted").slice(0, 500);
  } else if (errorCategory === "RATE_LIMITED") {
    nextStatus = "THROTTLED";
  } else if (errorCategory === "WORKER_OFFLINE") {
    nextStatus = "OFFLINE";
  }

  const updates = {
    status: nextStatus,
    cooldownCount,
    lastFailureAt: now.toISOString(),
    failureReason: String(errorDetail || errorCategory).slice(0, 500),
    lastQuotaError,
    nextProbeAt,
    statusChangedAt: now.toISOString()
  };

  return updateWorker(workerId, updates, options);
}

export function recordWorkerSuccess(workerId, options = {}) {
  const now = new Date().toISOString();
  const updates = {
    status: "AVAILABLE",
    cooldownCount: 0,
    failureReason: null,
    lastQuotaError: null,
    nextProbeAt: null,
    lastSuccessAt: now,
    statusChangedAt: now
  };
  return updateWorker(workerId, updates, options);
}
