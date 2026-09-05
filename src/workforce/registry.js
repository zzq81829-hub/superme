import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultWorkforceDir = path.resolve(__dirname, "../../data/workforce");

export const DEFAULT_WORKERS = Object.freeze({
  codex: {
    id: "codex",
    name: "Codex",
    role: "SENIOR_ENGINEER",
    enabled: true,
    status: "AVAILABLE",
    capabilities: ["coding_high", "architecture", "debug_high", "review"],
    capabilityLevel: 95,
    quotaClass: "SCARCE",
    billingType: "SUBSCRIPTION",
    fallbackPriority: 20,
    reserveForHighValue: true,
    autoFallback: true,
    cooldownCount: 0,
    lastFailureAt: null,
    lastSuccessAt: null,
    failureReason: null,
    lastQuotaError: null,
    possibleResetAt: null,
    nextProbeAt: null
  },
  antigravity: {
    id: "antigravity",
    name: "Antigravity",
    role: "DEFAULT_EXECUTION",
    enabled: true,
    status: "AVAILABLE",
    capabilities: ["coding_medium", "execution", "terminal", "testing", "file_ops", "prework"],
    capabilityLevel: 65,
    quotaClass: "HEALTHY",
    billingType: "INCLUDED",
    fallbackPriority: 100,
    reserveForHighValue: false,
    autoFallback: true,
    cooldownCount: 0,
    lastFailureAt: null,
    lastSuccessAt: null,
    failureReason: null,
    lastQuotaError: null,
    possibleResetAt: null,
    nextProbeAt: null
  },
  "grok-build": {
    id: "grok-build",
    name: "Grok Build",
    role: "SENIOR_RESEARCHER",
    enabled: true,
    status: "AVAILABLE",
    capabilities: ["research_high", "analysis_high"],
    capabilityLevel: 85,
    quotaClass: "LIMITED",
    billingType: "SUBSCRIPTION",
    fallbackPriority: 30,
    reserveForHighValue: true,
    autoFallback: true,
    cooldownCount: 0,
    lastFailureAt: null,
    lastSuccessAt: null,
    failureReason: null,
    lastQuotaError: null,
    possibleResetAt: null,
    nextProbeAt: null
  },
  "grok-bot": {
    id: "grok-bot",
    name: "Grok Bot",
    role: "SECRETARY",
    enabled: true,
    status: "AVAILABLE",
    capabilities: ["chat", "secretary", "command_interface"],
    capabilityLevel: 50,
    quotaClass: "HEALTHY",
    billingType: "SUBSCRIPTION",
    fallbackPriority: 0,
    reserveForHighValue: false,
    autoFallback: false,
    cooldownCount: 0,
    lastFailureAt: null,
    lastSuccessAt: null,
    failureReason: null,
    lastQuotaError: null,
    possibleResetAt: null,
    nextProbeAt: null
  },
  hermes: {
    id: "hermes",
    name: "Hermes",
    role: "PAID_CONTRACTOR",
    enabled: true,
    status: "AVAILABLE",
    capabilities: ["orchestration", "multi_agent"],
    capabilityLevel: 80,
    quotaClass: "METERED",
    billingType: "METERED_API",
    costSensitive: true,
    fallbackPriority: 0,
    reserveForHighValue: false,
    autoFallback: false,
    cooldownCount: 0,
    lastFailureAt: null,
    lastSuccessAt: null,
    failureReason: null,
    lastQuotaError: null,
    possibleResetAt: null,
    nextProbeAt: null
  },
  claude: {
    id: "claude",
    name: "Claude",
    role: "CODE_REVIEWER",
    enabled: true,
    status: "AVAILABLE",
    capabilities: ["review", "coding_high"],
    capabilityLevel: 90,
    quotaClass: "LIMITED",
    billingType: "SUBSCRIPTION",
    fallbackPriority: 40,
    reserveForHighValue: true,
    autoFallback: true,
    cooldownCount: 0,
    lastFailureAt: null,
    lastSuccessAt: null,
    failureReason: null,
    lastQuotaError: null,
    possibleResetAt: null,
    nextProbeAt: null
  }
});

export function getWorkforceDir(options = {}) {
  const dir = options.baseDir || process.env.WORKFORCE_BASE_DIR || defaultWorkforceDir;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getWorkersFilePath(options = {}) {
  return path.join(getWorkforceDir(options), "workers.json");
}

export function getWorkersRegistry(options = {}) {
  const file = getWorkersFilePath(options);
  if (!fs.existsSync(file)) {
    saveWorkersRegistry(DEFAULT_WORKERS, options);
    return JSON.parse(JSON.stringify(DEFAULT_WORKERS));
  }
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    return { ...JSON.parse(JSON.stringify(DEFAULT_WORKERS)), ...parsed };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_WORKERS));
  }
}

export function saveWorkersRegistry(workers, options = {}) {
  const file = getWorkersFilePath(options);
  fs.writeFileSync(file, JSON.stringify(workers, null, 2), "utf8");
  return workers;
}

export function getWorker(workerId, options = {}) {
  const registry = getWorkersRegistry(options);
  return registry[workerId] || null;
}

export function updateWorker(workerId, updates = {}, options = {}) {
  const registry = getWorkersRegistry(options);
  const current = registry[workerId] || { id: workerId, name: workerId };
  registry[workerId] = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString()
  };
  saveWorkersRegistry(registry, options);
  return registry[workerId];
}

export function listWorkers(options = {}) {
  const registry = getWorkersRegistry(options);
  return Object.values(registry);
}
