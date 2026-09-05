import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import {
  isForbiddenApiEnabled,
  workerPolicy,
  subscriptionEnv,
  claudeRuntimeEnv,
  getDeepSeekMonthlyLimit,
  getDeepSeekDefaultCallCost
} from "../src/billing/policy.js";
import {
  loadLedger,
  getRemainingBudget,
  getBudgetSummary,
  reserveBudget,
  releaseBudgetReserve,
  recordUsage,
  addFounderTopup,
  listAlerts,
  acknowledgeAlert
} from "../src/billing/deepseekBudget.js";
import { applyCostGuard } from "../src/workers/costGuard.js";

function createIsolatedTestDir() {
  const tmp = path.join(os.tmpdir(), `test-billing-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(tmp, { recursive: true });
  return tmp;
}

test("billing policy forbids extra model APIs", () => {
  assert.deepEqual(isForbiddenApiEnabled(), []);
  assert.equal(workerPolicy("codex").api_allowed, false);
  assert.equal(workerPolicy("deepseek").api_allowed, true);
  assert.equal(workerPolicy("grok-bot").required, false);
  assert.equal(getDeepSeekMonthlyLimit(), 30);
  assert.equal(getDeepSeekDefaultCallCost(), 0.20);
});

test("Hermes is blocked by the paid monthly gate even if a gemini proxy is configured", () => {
  const baseDir = createIsolatedTestDir();
  const options = {
    baseDir,
    period: "2026-08",
    config: { agents: { hermes: { provider: "custom:gemini-proxy" } } }
  };
  recordUsage({ taskId: "task-gemini", worker: "deepseek", costCny: 30.00, source: "test" }, options);
  const health = {
    hermes: { id: "hermes", status: "READY", available: true, billingMode: "subscription_or_cheap_api" },
    codex: { id: "codex", status: "OFFLINE", available: false },
    claude: { id: "claude", status: "OFFLINE", available: false },
    antigravity: { id: "antigravity", status: "OFFLINE", available: false },
    "grok-build": { id: "grok-build", status: "OFFLINE", available: false }
  };
  const result = applyCostGuard("hermes", health, options);
  assert.notEqual(result.worker, "hermes");
  assert.ok(result.attempts?.some((a) => a.id === "hermes" && /QUOTA_LIMITED/i.test(a.skip || "")));
});

test("subscription env strips paid API keys", () => {
  const env = subscriptionEnv({
    OPENAI_API_KEY: "x",
    ANTHROPIC_API_KEY: "y",
    XAI_API_KEY: "z",
    DEEPSEEK_API_KEY: "keep"
  });
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.ANTHROPIC_API_KEY, undefined);
  assert.equal(env.XAI_API_KEY, undefined);
  assert.equal(env.DEEPSEEK_API_KEY, "keep");
});

test("local Antigravity reverse proxy keeps Claude env", () => {
  const env = claudeRuntimeEnv({
    ANTHROPIC_BASE_URL: "http://127.0.0.1:8045",
    ANTHROPIC_API_KEY: "local-proxy",
    OPENAI_API_KEY: "nope"
  });
  assert.equal(env.ANTHROPIC_BASE_URL, "http://127.0.0.1:8045");
  assert.equal(env.ANTHROPIC_API_KEY, "local-proxy");
  assert.equal(env.OPENAI_API_KEY, undefined);
});

test("DeepSeek Monthly Budget: 1. Remaining budget and conservative usage recording without double billing", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir, period: "2026-08" };

  // Initial state
  const summary = getBudgetSummary(options);
  assert.equal(summary.limitCny, 30);
  assert.equal(summary.spentCny, 0);
  assert.equal(summary.remainingCny, 30);

  // Record first usage with explicit cost
  const r1 = recordUsage({ taskId: "task-001", worker: "deepseek", costCny: 0.50, source: "test" }, options);
  assert.equal(r1.spentCny, 0.50);
  assert.equal(r1.remainingCny, 29.50);

  // Record duplicate usage for the same taskId -> must not bill twice
  const rDuplicate = recordUsage({ taskId: "task-001", worker: "deepseek", costCny: 0.50, source: "test" }, options);
  assert.equal(rDuplicate.duplicate, true);
  assert.equal(rDuplicate.spentCny, 0.50);
  assert.equal(getRemainingBudget(options), 29.50);

  // Record second usage using fallback conservative cost (0.20 CNY)
  const r2 = recordUsage({ taskId: "task-002", worker: "hermes", source: "test" }, options);
  assert.equal(r2.entry.costCny, 0.20);
  assert.equal(r2.spentCny, 0.70);
  assert.equal(getRemainingBudget(options), 29.30);
});

test("DeepSeek Monthly Budget: 2. Reserve and release budget prevents double spending", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir, period: "2026-08", limitCny: 1.00 };

  const res1 = reserveBudget("task-r1", 0.60, options);
  assert.equal(res1.ok, true);
  assert.equal(res1.remaining, 0.40);

  // Second reserve exceeding remaining
  const res2 = reserveBudget("task-r2", 0.60, options);
  assert.equal(res2.ok, false);

  // Release first reserve
  releaseBudgetReserve("task-r1", 0.60, options);
  assert.equal(getRemainingBudget(options), 1.00);

  // Now second reserve succeeds
  const res3 = reserveBudget("task-r2", 0.60, options);
  assert.equal(res3.ok, true);
});

test("DeepSeek Monthly Budget: 3. Spent reaches limit -> costGuard skips deepseek and Hermes", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir, period: "2026-08" };

  // Fill up 30 CNY budget
  recordUsage({ taskId: "task-bulk", worker: "deepseek", costCny: 30.00, source: "test" }, options);
  assert.equal(getRemainingBudget(options), 0);

  const healthMap = {
    codex: { id: "codex", status: "ONLINE", available: true, billingMode: "subscription" },
    claude: { id: "claude", status: "ONLINE", available: true, billingMode: "subscription" },
    antigravity: { id: "antigravity", status: "ONLINE", available: true, billingMode: "subscription" },
    "grok-build": { id: "grok-build", status: "ONLINE", available: true, billingMode: "subscription" },
    deepseek: { id: "deepseek", status: "READY", available: true, billingMode: "api" },
    hermes: { id: "hermes", status: "READY", available: true, billingMode: "subscription_or_cheap_api" }
  };

  // When explicitly requesting deepseek, it skips deepseek with QUOTA_LIMITED and falls back to codex
  const rDeepSeek = applyCostGuard("deepseek", healthMap, options);
  assert.equal(rDeepSeek.ok, true);
  assert.equal(rDeepSeek.worker, "codex");
  assert.ok(rDeepSeek.attempts.some(a => a.id === "deepseek" && a.skip.includes("QUOTA_LIMITED")));

  // When explicitly requesting deepseek and no fallback available:
  const onlyDeepSeekHealth = {
    codex: { available: false, status: "OFFLINE" },
    claude: { available: false, status: "OFFLINE" },
    antigravity: { available: false, status: "OFFLINE" },
    "grok-build": { available: false, status: "OFFLINE" },
    deepseek: { id: "deepseek", status: "READY", available: true, billingMode: "api" }
  };

  const rDirect = applyCostGuard("deepseek", onlyDeepSeekHealth, options);
  assert.equal(rDirect.ok, false);
  assert.equal(rDirect.action, "HUMAN_ACTION_REQUIRED");
  assert.ok(rDirect.reason.includes("budget limit reached") || rDirect.reason.includes("30.00/30.00 CNY"));
});

test("DeepSeek Monthly Budget: 4. Alerts generation and acknowledgment", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir, period: "2026-08" };

  // Exceed limit to generate alert
  recordUsage({ taskId: "task-over", worker: "deepseek", costCny: 30.00, source: "test" }, options);

  const alerts = listAlerts(options);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].type, "QUOTA_EXCEEDED");
  assert.equal(alerts[0].acknowledged, false);

  // Acknowledge alert
  const acked = acknowledgeAlert(alerts[0].id, options);
  assert.equal(acked.acknowledged, true);
  assert.equal(listAlerts(options).length, 0);
});

test("DeepSeek Monthly Budget: 5. Founder top-up increases limit and restores deepseek availability", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir, period: "2026-08" };

  // Spent 30 CNY
  recordUsage({ taskId: "task-limit", worker: "deepseek", costCny: 30.00, source: "test" }, options);
  assert.equal(getRemainingBudget(options), 0);

  // Top-up validation
  assert.throws(() => addFounderTopup({ amountCny: -5 }, options));
  assert.throws(() => addFounderTopup({ amountCny: 50 }, options)); // exceeds single limit ¥30

  // Valid top-up ¥30
  const summary = addFounderTopup({ amountCny: 30, note: "Founder test topup" }, options);
  assert.equal(summary.founderTopupCny, 30);
  assert.equal(summary.totalLimitCny, 60);
  assert.equal(summary.spentCny, 30);
  assert.equal(summary.remainingCny, 30);

  // Now costGuard allows deepseek again
  const healthMap = {
    deepseek: { id: "deepseek", status: "READY", available: true, billingMode: "api" }
  };
  const r = applyCostGuard("deepseek", healthMap, options);
  assert.equal(r.ok, true);
  assert.equal(r.worker, "deepseek");
});
