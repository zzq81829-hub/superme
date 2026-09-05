import fs from "fs";
import path from "path";
import { getWorkforceDir } from "./registry.js";

const MAX_LOGS = 200;

export function getRoutingLogsPath(options = {}) {
  return path.join(getWorkforceDir(options), "routing_logs.json");
}

export function listRoutingLogs(options = {}) {
  const file = getRoutingLogsPath(options);
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function logRoutingDecision({
  taskId,
  selectedWorker,
  reason,
  modelNeed = null,
  workerStatus = "AVAILABLE",
  isFallback = false,
  costClass = "INCLUDED",
  options = {}
}) {
  const logEntry = {
    id: `route-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    taskId,
    selectedWorker,
    reason: String(reason || "").slice(0, 300),
    modelNeed: modelNeed ? {
      score: modelNeed.modelNeedScore,
      tier: modelNeed.tier,
      preferredWorker: modelNeed.preferredWorker
    } : null,
    workerStatus,
    isFallback: !!isFallback,
    costClass,
    timestamp: new Date().toISOString()
  };

  const logs = listRoutingLogs(options);
  logs.unshift(logEntry);
  if (logs.length > MAX_LOGS) {
    logs.length = MAX_LOGS;
  }

  try {
    fs.writeFileSync(getRoutingLogsPath(options), JSON.stringify(logs, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to write routing log:", err);
  }

  return logEntry;
}
