export const ERROR_CATEGORIES = Object.freeze([
  "QUOTA_EXHAUSTED",
  "RATE_LIMITED",
  "AUTH_ERROR",
  "NETWORK_ERROR",
  "WORKER_OFFLINE",
  "EXECUTION_ERROR",
  "UNKNOWN"
]);

const QUOTA_EXHAUSTED_PATTERNS = [
  /usage limit/i,
  /exceeded your .*quota/i,
  /quota exceeded/i,
  /monthly .*limit/i,
  /usage cap/i,
  /out of quota/i,
  /plan limit/i,
  /no remaining requests/i,
  /insufficient quota/i,
  /QUOTA_LIMITED/i
];

const RATE_LIMITED_PATTERNS = [
  /rate.?limit/i,
  /too many requests/i,
  /429/i,
  /slow down/i,
  /concurrency limit/i,
  /temporarily throttled/i,
  /try again in \d+/i
];

const AUTH_ERROR_PATTERNS = [
  /not logged in/i,
  /AUTH_REQUIRED/i,
  /please run \/login/i,
  /login required/i,
  /invalid session/i,
  /session expired/i,
  /unauthorized/i,
  /401/i,
  /authentication failed/i,
  /token is invalid/i
];

const NETWORK_ERROR_PATTERNS = [
  /PROXY_DOWN/i,
  /proxy unavailable/i,
  /ECONNREFUSED/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /socket hang up/i,
  /failed to connect/i,
  /connection attempt failed/i,
  /network timeout/i,
  /dns lookup failed/i
];

const WORKER_OFFLINE_PATTERNS = [
  /executable missing/i,
  /command not found/i,
  /is not recognized as an internal or external command/i,
  /cannot find the path specified/i,
  /binary missing/i,
  /OFFLINE/i,
  /HEADLESS_PERMISSION_BLOCKED/i
];

export function classifyWorkerError(errorSource = {}) {
  const text = typeof errorSource === "string"
    ? errorSource
    : `${errorSource.error || ""}\n${errorSource.message || ""}\n${errorSource.stderr || ""}\n${errorSource.details || ""}`;

  if (!text.trim()) {
    if (errorSource.exitCode && errorSource.exitCode !== 0) {
      return "EXECUTION_ERROR";
    }
    return "UNKNOWN";
  }

  // 1. Quota exhausted has highest precedence for subscription models
  for (const pattern of QUOTA_EXHAUSTED_PATTERNS) {
    if (pattern.test(text)) return "QUOTA_EXHAUSTED";
  }

  // 2. Rate limiting (temporary)
  for (const pattern of RATE_LIMITED_PATTERNS) {
    if (pattern.test(text)) return "RATE_LIMITED";
  }

  // 3. Auth failure
  for (const pattern of AUTH_ERROR_PATTERNS) {
    if (pattern.test(text)) return "AUTH_ERROR";
  }

  // 4. Network / Proxy errors
  for (const pattern of NETWORK_ERROR_PATTERNS) {
    if (pattern.test(text)) return "NETWORK_ERROR";
  }

  // 5. Worker offline / executable missing
  for (const pattern of WORKER_OFFLINE_PATTERNS) {
    if (pattern.test(text)) return "WORKER_OFFLINE";
  }

  // 6. Generic execution error
  if (errorSource.exitCode !== undefined && errorSource.exitCode !== 0) {
    return "EXECUTION_ERROR";
  }

  return "UNKNOWN";
}
