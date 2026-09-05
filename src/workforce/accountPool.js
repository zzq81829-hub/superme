import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { publishEvent } from "../events/bus.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultPoolFile = path.resolve(__dirname, "../../data/workforce/account_pools.json");

export function getAccountPoolFile(options = {}) {
  if (options.poolFile) return options.poolFile;
  if (options.accountPoolsFile) return options.accountPoolsFile;
  if (options.workforceDir) return path.join(options.workforceDir, "account_pools.json");
  if (options.baseDir) return path.join(options.baseDir, "account_pools.json");
  if (process.env.ACCOUNT_POOLS_FILE) return process.env.ACCOUNT_POOLS_FILE;
  if (process.env.WORKFORCE_BASE_DIR) return path.join(process.env.WORKFORCE_BASE_DIR, "account_pools.json");
  return defaultPoolFile;
}

export const DEFAULT_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes default cooldown

export function loadAllAccountPools(options = {}) {
  const file = getAccountPoolFile(options);
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

export function saveAllAccountPools(pools, options = {}) {
  const file = getAccountPoolFile(options);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(pools, null, 2), "utf8");
}

export function getWorkerAccountPool(workerId, options = {}) {
  const pools = loadAllAccountPools(options);
  if (pools[workerId]) return pools[workerId];

  // Default fallback pool: single primary account
  return {
    workerId,
    activeAccountId: "account_a",
    primaryAccountId: "account_a",
    accounts: {
      account_a: {
        id: "account_a",
        name: `${workerId} 主力账号 A`,
        status: "AVAILABLE",
        cooldownUntil: null,
        env: {},
        stats: { successCount: 0, quotaHits: 0 }
      }
    },
    updatedAt: new Date().toISOString()
  };
}

export function configureWorkerAccounts(workerId, config = {}, options = {}) {
  const pools = loadAllAccountPools(options);
  const existing = pools[workerId] || getWorkerAccountPool(workerId, options);

  const updatedAccounts = {
    ...existing.accounts,
    ...(config.accounts || {})
  };

  if (["codex", "antigravity"].includes(workerId) && Object.keys(updatedAccounts).length > 2) {
    throw new Error("每个工具最多配置两个账号");
  }

  const primaryAccountId = config.primaryAccountId || existing.primaryAccountId || "account_a";
  const activeAccountId = config.activeAccountId || existing.activeAccountId || primaryAccountId;

  pools[workerId] = {
    workerId,
    activeAccountId,
    primaryAccountId,
    accounts: updatedAccounts,
    updatedAt: new Date().toISOString()
  };

  saveAllAccountPools(pools, options);
  return pools[workerId];
}

/**
 * Gets the current effective worker account.
 * Automatically checks and restores cooled-down accounts.
 * If Primary Account A has cooled down, automatically switches back to Account A (cold standby).
 * If active account is currently in COOLDOWN, fails over to an available standby account.
 */
export function getEffectiveWorkerAccount(workerId, options = {}) {
  const pools = loadAllAccountPools(options);
  let pool = pools[workerId];
  const now = Date.now();

  if (!pool) {
    return {
      account: { id: "default", name: `${workerId} Default`, status: "AVAILABLE", env: {} },
      isStandby: false,
      pool: null
    };
  }

  let modified = false;

  // 1. Check if any cooled-down accounts can be restored
  for (const acc of Object.values(pool.accounts)) {
    if (acc.status === "COOLDOWN" && acc.cooldownUntil) {
      const cooldownTime = new Date(acc.cooldownUntil).getTime();
      if (now >= cooldownTime) {
        acc.status = acc.managed ? "NEEDS_CHECK" : "AVAILABLE";
        acc.cooldownUntil = null;
        modified = true;
      }
    }
  }

  // 2. Rebound to Primary Account:
  // If primary account (e.g. Account A) is AVAILABLE, it MUST be the active account!
  const primaryAcc = pool.accounts[pool.primaryAccountId];
  if (primaryAcc && primaryAcc.status === "AVAILABLE" && pool.activeAccountId !== pool.primaryAccountId) {
    pool.activeAccountId = pool.primaryAccountId;
    modified = true;
  }

  // 3. Failover check:
  // If current active account is in COOLDOWN or EXHAUSTED, find the first available standby
  let activeAcc = pool.accounts[pool.activeAccountId];
  if (!activeAcc || activeAcc.status !== "AVAILABLE") {
    const candidate = Object.values(pool.accounts).find((a) => a.status === "AVAILABLE");
    if (candidate) {
      pool.activeAccountId = candidate.id;
      activeAcc = candidate;
      modified = true;
    }
  }

  if (modified) {
    pool.updatedAt = new Date().toISOString();
    pools[workerId] = pool;
    saveAllAccountPools(pools, options);
  }

  const isStandby = pool.activeAccountId !== pool.primaryAccountId;
  return {
    account: activeAcc || primaryAcc || { id: "default", name: "Default", status: "AVAILABLE", env: {} },
    isStandby,
    pool
  };
}

/**
 * Records a Quota/Rate Limit hit on an account:
 * 1. Puts current account into COOLDOWN (cooldownUntil).
 * 2. Automatically rotates activeAccountId to the next available standby account (e.g. Account B).
 * 3. Emits ACCOUNT_ROTATED event.
 */
export function recordAccountQuotaHit(workerId, accountId, errorDetails = {}, options = {}) {
  const pools = loadAllAccountPools(options);
  const pool = pools[workerId] || getWorkerAccountPool(workerId, options);
  const targetAcc = pool.accounts[accountId];

  if (!targetAcc) {
    return { rotated: false, reason: "account_not_found" };
  }

  const cooldownMs = options.cooldownMs || DEFAULT_COOLDOWN_MS;
  const cooldownUntil = new Date(Date.now() + cooldownMs).toISOString();

  targetAcc.status = "COOLDOWN";
  targetAcc.cooldownUntil = cooldownUntil;
  targetAcc.stats = targetAcc.stats || { successCount: 0, quotaHits: 0 };
  targetAcc.stats.quotaHits = (targetAcc.stats.quotaHits || 0) + 1;
  targetAcc.lastError = errorDetails?.message || String(errorDetails || "Quota exhausted / Rate limited");

  // Find standby account
  const standbyAcc = Object.values(pool.accounts).find((a) => a.id !== accountId && a.status === "AVAILABLE");

  let rotated = false;
  let newActiveId = accountId;

  if (standbyAcc) {
    pool.activeAccountId = standbyAcc.id;
    newActiveId = standbyAcc.id;
    rotated = true;
  }

  pool.updatedAt = new Date().toISOString();
  pools[workerId] = pool;
  saveAllAccountPools(pools, options);

  try {
    publishEvent("WORKER_ACCOUNT_ROTATED", {
      workerId,
      exhaustedAccount: accountId,
      newActiveAccount: newActiveId,
      cooldownUntil,
      rotated,
      reason: targetAcc.lastError
    }, options);
  } catch {}

  return {
    rotated,
    previousAccountId: accountId,
    currentAccountId: newActiveId,
    cooldownUntil,
    standbyAvailable: !!standbyAcc
  };
}

/**
 * Checks if the worker has ANY available account in its pool.
 * Returns true ONLY if the worker has a configured multi-account pool
 * and at least one standby account is AVAILABLE.
 */
export function hasAvailableAccount(workerId, options = {}) {
  const pools = loadAllAccountPools(options);
  const pool = pools[workerId];
  if (!pool || !pool.accounts) {
    return false;
  }

  const accounts = Object.values(pool.accounts);
  if (accounts.length <= 1) {
    return false;
  }

  const now = Date.now();
  return accounts.some((acc) => {
    if (acc.status === "AVAILABLE") {
      if (!acc.cooldownUntil || new Date(acc.cooldownUntil).getTime() <= now) {
        return true;
      }
    }
    return false;
  });
}

/**
 * Restores cooled-down accounts across all pools.
 */
export function restoreCooledDownAccounts(options = {}) {
  const pools = loadAllAccountPools(options);
  let restoredCount = 0;

  for (const workerId of Object.keys(pools)) {
    const before = pools[workerId].activeAccountId;
    const { pool } = getEffectiveWorkerAccount(workerId, options);
    if (pool && pool.activeAccountId !== before) {
      restoredCount += 1;
    }
  }

  return restoredCount;
}

/**
 * Manually resets an account from COOLDOWN back to AVAILABLE.
 */
export function manualResetAccount(workerId, accountId, options = {}) {
  const pools = loadAllAccountPools(options);
  const pool = pools[workerId];
  if (!pool || !pool.accounts[accountId]) return null;

  pool.accounts[accountId].status = pool.accounts[accountId].managed ? "NEEDS_CHECK" : "AVAILABLE";
  pool.accounts[accountId].cooldownUntil = null;
  if (accountId === pool.primaryAccountId) {
    pool.activeAccountId = pool.primaryAccountId;
  }
  pool.updatedAt = new Date().toISOString();
  pools[workerId] = pool;
  saveAllAccountPools(pools, options);
  return pool;
}
