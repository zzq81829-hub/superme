import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultQuotaDir = path.resolve(__dirname, "../../data/quota");

// Per-worker subscription quota state. Subscription workers (Codex, Claude,
// Antigravity, Grok) expose no programmatic "remaining quota" — we can only
// learn quota is exhausted when a run fails with a usage-limit error, or when
// the founder declares it from the dashboard. This store persists that signal
// so the router stops re-dispatching work to a worker that is out of quota.
//
// DeepSeek/Hermes quota is NOT stored here — it lives in the monthly ¥30
// ledger under data/billing (see billing/deepseekBudget.js). The board UI
// merges both sources.

export const QUOTA_STATUSES = ["unknown", "normal", "exhausted"];

export function getQuotaDir(options = {}) {
  const dir = options.baseDir || process.env.QUOTA_BASE_DIR || defaultQuotaDir;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getQuotaFilePath(options = {}) {
  return path.join(getQuotaDir(options), "worker-quota.json");
}

export function getQuotaState(options = {}) {
  const file = getQuotaFilePath(options);
  if (!fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveQuotaState(state, options = {}) {
  fs.writeFileSync(getQuotaFilePath(options), JSON.stringify(state, null, 2), "utf8");
  return state;
}

function normalizeStatus(status) {
  return QUOTA_STATUSES.includes(status) ? status : "unknown";
}

export function getWorkerQuota(workerId, options = {}) {
  const state = getQuotaState(options);
  return state[workerId] || null;
}

export function markQuotaExhausted(workerId, reason = "", options = {}) {
  const state = getQuotaState(options);
  const now = new Date().toISOString();
  state[workerId] = {
    status: "exhausted",
    reason: String(reason || "").slice(0, 500),
    source: "runtime",
    updatedAt: now,
    exhaustedAt: now
  };
  saveQuotaState(state, options);
  return state[workerId];
}

export function markQuotaNormal(workerId, options = {}) {
  const state = getQuotaState(options);
  const prev = state[workerId] || {};
  const now = new Date().toISOString();
  state[workerId] = {
    status: "normal",
    reason: prev.reason || "",
    source: prev.source || "runtime",
    updatedAt: now,
    exhaustedAt: null
  };
  saveQuotaState(state, options);
  return state[workerId];
}

export function setQuotaOverride(workerId, status, reason = "", options = {}) {
  const normalized = normalizeStatus(status);
  if (normalized === "unknown") {
    // Founder clears the record entirely — back to "we don't know".
    const state = getQuotaState(options);
    delete state[workerId];
    saveQuotaState(state, options);
    return null;
  }
  const now = new Date().toISOString();
  const state = getQuotaState(options);
  state[workerId] = {
    status: normalized,
    reason: String(reason || "").slice(0, 500),
    source: "founder",
    updatedAt: now,
    exhaustedAt: normalized === "exhausted" ? now : null
  };
  saveQuotaState(state, options);
  return state[workerId];
}

// Classification: does a failed run's output indicate a subscription quota /
// usage-limit exhaustion (as opposed to auth failure, proxy down, etc.)?
export function isQuotaExhaustion(result = {}) {
  const text = `${result.error || ""}\n${result.message || ""}\n${result.stderr || ""}`;
  return /usage limit|quota|QUOTA_LIMITED|rate.?limit|too many requests|exceeded your .*quota|monthly .*limit|usage cap/i.test(text);
}
