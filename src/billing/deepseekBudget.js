import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { getDeepSeekMonthlyLimit, getDeepSeekDefaultCallCost } from "./policy.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultBillingDir = path.resolve(__dirname, "../../data/billing");

export function getCurrentPeriod(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function getBillingDir(options = {}) {
  const dir = options.baseDir || defaultBillingDir;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getLedgerFilePath(period = getCurrentPeriod(), options = {}) {
  const dir = getBillingDir(options);
  return path.join(dir, `deepseek-${period}.json`);
}

export function loadLedger(period = getCurrentPeriod(), options = {}) {
  const filePath = getLedgerFilePath(period, options);
  const defaultLimit = options.limitCny !== undefined ? Number(options.limitCny) : getDeepSeekMonthlyLimit();

  if (!fs.existsSync(filePath)) {
    const initial = {
      period,
      currency: "CNY",
      limitCny: defaultLimit,
      founderTopupCny: 0,
      spentCny: 0,
      reservedCny: 0,
      hardStop: true,
      entries: [],
      alerts: []
    };
    fs.writeFileSync(filePath, JSON.stringify(initial, null, 2), "utf8");
    return initial;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return {
      period: raw.period || period,
      currency: raw.currency || "CNY",
      limitCny: raw.limitCny !== undefined ? Number(raw.limitCny) : defaultLimit,
      founderTopupCny: Number(raw.founderTopupCny || 0),
      spentCny: Number(raw.spentCny || 0),
      reservedCny: Number(raw.reservedCny || 0),
      hardStop: raw.hardStop !== false,
      entries: Array.isArray(raw.entries) ? raw.entries : [],
      alerts: Array.isArray(raw.alerts) ? raw.alerts : []
    };
  } catch {
    const fallback = {
      period,
      currency: "CNY",
      limitCny: defaultLimit,
      founderTopupCny: 0,
      spentCny: 0,
      reservedCny: 0,
      hardStop: true,
      entries: [],
      alerts: []
    };
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), "utf8");
    return fallback;
  }
}

export function saveLedger(ledger, options = {}) {
  const filePath = getLedgerFilePath(ledger.period || getCurrentPeriod(), options);
  fs.writeFileSync(filePath, JSON.stringify(ledger, null, 2), "utf8");
  return ledger;
}

export function getRemainingBudget(options = {}) {
  const period = options.period || getCurrentPeriod();
  const ledger = loadLedger(period, options);
  const totalLimit = ledger.limitCny + ledger.founderTopupCny;
  const remaining = totalLimit - ledger.spentCny - ledger.reservedCny;
  return Math.round(remaining * 10000) / 10000;
}

export function getBudgetSummary(options = {}) {
  const period = options.period || getCurrentPeriod();
  const ledger = loadLedger(period, options);
  const totalLimit = ledger.limitCny + ledger.founderTopupCny;
  const remainingCny = Math.max(0, Math.round((totalLimit - ledger.spentCny - ledger.reservedCny) * 10000) / 10000);

  return {
    period: ledger.period,
    currency: ledger.currency,
    limitCny: ledger.limitCny,
    founderTopupCny: ledger.founderTopupCny,
    totalLimitCny: totalLimit,
    spentCny: Math.round(ledger.spentCny * 10000) / 10000,
    reservedCny: Math.round(ledger.reservedCny * 10000) / 10000,
    remainingCny,
    hardStop: ledger.hardStop,
    entriesCount: ledger.entries.length,
    alerts: ledger.alerts.filter((a) => !a.acknowledged)
  };
}

export function reserveBudget(taskId, estimatedCost = getDeepSeekDefaultCallCost(), options = {}) {
  const period = options.period || getCurrentPeriod();
  const ledger = loadLedger(period, options);
  const totalLimit = ledger.limitCny + ledger.founderTopupCny;
  const remaining = totalLimit - ledger.spentCny - ledger.reservedCny;

  if (remaining < estimatedCost) {
    return {
      ok: false,
      reason: `DeepSeek monthly budget exhausted (${ledger.spentCny.toFixed(2)}/${totalLimit.toFixed(2)} CNY)`,
      remaining: Math.max(0, remaining),
      totalLimit,
      spent: ledger.spentCny
    };
  }

  ledger.reservedCny = Math.round((ledger.reservedCny + estimatedCost) * 10000) / 10000;
  saveLedger(ledger, options);
  return {
    ok: true,
    reserved: estimatedCost,
    remaining: Math.round((totalLimit - ledger.spentCny - ledger.reservedCny) * 10000) / 10000
  };
}

export function releaseBudgetReserve(taskId, estimatedCost = getDeepSeekDefaultCallCost(), options = {}) {
  const period = options.period || getCurrentPeriod();
  const ledger = loadLedger(period, options);
  ledger.reservedCny = Math.max(0, Math.round((ledger.reservedCny - estimatedCost) * 10000) / 10000);
  saveLedger(ledger, options);
  return { ok: true, reservedCny: ledger.reservedCny };
}

export function recordUsage({ taskId, worker = "deepseek", tokensIn = 0, tokensOut = 0, costCny, source = "direct" }, options = {}) {
  const period = options.period || getCurrentPeriod();
  const ledger = loadLedger(period, options);

  // Prevent duplicate billing for the same task
  if (taskId) {
    const existing = ledger.entries.find((e) => e.taskId === taskId);
    if (existing) {
      return {
        entry: existing,
        duplicate: true,
        remainingCny: getRemainingBudget(options),
        spentCny: ledger.spentCny
      };
    }
  }

  let finalCost = costCny;
  if (typeof finalCost !== "number" || isNaN(finalCost) || finalCost < 0) {
    if (tokensIn > 0 || tokensOut > 0) {
      // Conservative token-based estimation (approx 0.001元/1k input, 0.002元/1k output)
      finalCost = Math.round(((tokensIn * 0.001 + tokensOut * 0.002) / 1000) * 10000) / 10000;
    } else {
      finalCost = getDeepSeekDefaultCallCost();
    }
  }

  const now = new Date().toISOString();
  const entry = {
    id: `entry-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    taskId: taskId || null,
    worker,
    tokensIn: Number(tokensIn) || 0,
    tokensOut: Number(tokensOut) || 0,
    costCny: Math.round(finalCost * 10000) / 10000,
    source,
    at: now
  };

  ledger.entries.push(entry);
  ledger.spentCny = Math.round((ledger.spentCny + entry.costCny) * 10000) / 10000;

  const totalLimit = ledger.limitCny + ledger.founderTopupCny;
  const remaining = totalLimit - ledger.spentCny - ledger.reservedCny;

  // If budget limit reached or exceeded, generate alert
  if (remaining <= 0) {
    const hasActiveAlert = ledger.alerts.some((a) => a.type === "QUOTA_EXCEEDED" && !a.acknowledged);
    if (!hasActiveAlert) {
      ledger.alerts.push({
        id: `alert-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`,
        type: "QUOTA_EXCEEDED",
        message: `DeepSeek 本月已达 ${totalLimit.toFixed(2)} 元上限，已停用。是否登记充值由你决定。`,
        createdAt: now,
        acknowledged: false,
        acknowledgedAt: null
      });
    }
  }

  saveLedger(ledger, options);
  return {
    entry,
    remainingCny: Math.max(0, Math.round(remaining * 10000) / 10000),
    spentCny: ledger.spentCny,
    totalLimitCny: totalLimit
  };
}

export function addFounderTopup({ amountCny, note = "Founder manual topup declaration" }, options = {}) {
  const amt = Number(amountCny);
  if (isNaN(amt) || amt <= 0) {
    throw new Error("Top-up amount must be a positive number");
  }
  if (amt > 30) {
    throw new Error("Single top-up declaration cannot exceed ¥30 CNY");
  }

  const period = options.period || getCurrentPeriod();
  const ledger = loadLedger(period, options);

  if (ledger.founderTopupCny + amt > 90) {
    throw new Error("Cumulative monthly top-up declarations cannot exceed ¥90 CNY");
  }

  ledger.founderTopupCny = Math.round((ledger.founderTopupCny + amt) * 10000) / 10000;
  
  // Note in entries
  ledger.entries.push({
    id: `topup-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    taskId: null,
    worker: "founder_topup",
    tokensIn: 0,
    tokensOut: 0,
    costCny: -amt, // negative represents balance addition
    source: `topup_declaration: ${note}`,
    at: new Date().toISOString()
  });

  saveLedger(ledger, options);
  return getBudgetSummary(options);
}

export function listAlerts(options = {}) {
  const period = options.period || getCurrentPeriod();
  const ledger = loadLedger(period, options);
  return ledger.alerts.filter((a) => !a.acknowledged);
}

export function acknowledgeAlert(alertId, options = {}) {
  const period = options.period || getCurrentPeriod();
  const ledger = loadLedger(period, options);
  const alert = ledger.alerts.find((a) => a.id === alertId);
  if (!alert) {
    throw new Error(`Alert ${alertId} not found`);
  }
  alert.acknowledged = true;
  alert.acknowledgedAt = new Date().toISOString();
  saveLedger(ledger, options);
  return alert;
}
