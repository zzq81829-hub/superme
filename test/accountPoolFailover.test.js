import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";

import {
  getAccountPoolFile,
  getWorkerAccountPool,
  configureWorkerAccounts,
  getEffectiveWorkerAccount,
  recordAccountQuotaHit,
  hasAvailableAccount,
  restoreCooledDownAccounts,
  manualResetAccount
} from "../src/workforce/accountPool.js";
import { applyCostGuard } from "../src/workers/costGuard.js";

function setupIsolatedPoolEnv() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "account-pool-test-"));
  const poolFile = path.join(tmpDir, "account_pools.json");
  return {
    tmpDir,
    options: { poolFile },
    cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true })
  };
}

test("An unconfigured account pool cannot override an exhausted worker", () => {
  const { options, cleanup } = setupIsolatedPoolEnv();
  try {
    assert.equal(hasAvailableAccount("codex", options), false);
  } finally {
    cleanup();
  }
});

test("Account Pool Pillar 1: Default Primary Account A Selection", () => {
  const { options, cleanup } = setupIsolatedPoolEnv();

  // Configure dual accounts: Account A (Primary), Account B (Standby)
  const pool = configureWorkerAccounts("codex", {
    primaryAccountId: "account_a",
    activeAccountId: "account_a",
    accounts: {
      account_a: { id: "account_a", name: "Codex 账号 A (主力)", status: "AVAILABLE", env: { CODEX_TOKEN: "token_a" } },
      account_b: { id: "account_b", name: "Codex 账号 B (备用)", status: "AVAILABLE", env: { CODEX_TOKEN: "token_b" } }
    }
  }, options);

  assert.equal(pool.primaryAccountId, "account_a");
  assert.equal(pool.activeAccountId, "account_a");

  const effective = getEffectiveWorkerAccount("codex", options);
  assert.equal(effective.account.id, "account_a");
  assert.equal(effective.isStandby, false);
  assert.equal(effective.account.env.CODEX_TOKEN, "token_a");

  cleanup();
});

test("Account Pool Pillar 2: 429 / Quota Hit Triggers Automatic Failover to Account B", () => {
  const { options, cleanup } = setupIsolatedPoolEnv();

  configureWorkerAccounts("antigravity", {
    primaryAccountId: "account_a",
    activeAccountId: "account_a",
    accounts: {
      account_a: { id: "account_a", name: "Agy 主力 A", status: "AVAILABLE", env: { AGY_PROFILE: "prof_a" } },
      account_b: { id: "account_b", name: "Agy 备用 B", status: "AVAILABLE", env: { AGY_PROFILE: "prof_b" } }
    }
  }, options);

  // Simulate 429 Quota Exhaustion on Account A
  const hitResult = recordAccountQuotaHit("antigravity", "account_a", {
    message: "429 Too Many Requests: Quota Exceeded"
  }, { ...options, cooldownMs: 30000 });

  assert.equal(hitResult.rotated, true);
  assert.equal(hitResult.previousAccountId, "account_a");
  assert.equal(hitResult.currentAccountId, "account_b");
  assert.ok(hitResult.cooldownUntil);

  // Query effective account -> Must be Account B!
  const effective = getEffectiveWorkerAccount("antigravity", options);
  assert.equal(effective.account.id, "account_b");
  assert.equal(effective.isStandby, true);
  assert.equal(effective.account.env.AGY_PROFILE, "prof_b");

  // Account A must be in COOLDOWN
  const pool = getWorkerAccountPool("antigravity", options);
  assert.equal(pool.accounts.account_a.status, "COOLDOWN");
  assert.equal(pool.accounts.account_a.stats.quotaHits, 1);
  assert.equal(pool.accounts.account_b.status, "AVAILABLE");

  cleanup();
});

test("Account Pool Pillar 3: Cooldown Expiration Automatically Restores Account A as Primary", () => {
  const { options, cleanup } = setupIsolatedPoolEnv();

  // Configure Account A with an expired cooldown time in the past
  const pastTime = new Date(Date.now() - 5000).toISOString();
  configureWorkerAccounts("codex", {
    primaryAccountId: "account_a",
    activeAccountId: "account_b", // currently on standby
    accounts: {
      account_a: { id: "account_a", name: "Codex A", status: "COOLDOWN", cooldownUntil: pastTime },
      account_b: { id: "account_b", name: "Codex B", status: "AVAILABLE" }
    }
  }, options);

  // When querying effective account, Account A must automatically recover and resume active status!
  const effective = getEffectiveWorkerAccount("codex", options);
  assert.equal(effective.account.id, "account_a");
  assert.equal(effective.account.status, "AVAILABLE");
  assert.equal(effective.isStandby, false);

  const pool = getWorkerAccountPool("codex", options);
  assert.equal(pool.activeAccountId, "account_a");
  assert.equal(pool.accounts.account_a.status, "AVAILABLE");
  assert.equal(pool.accounts.account_a.cooldownUntil, null);

  cleanup();
});

test("Account Pool Pillar 4: CostGuard Recognizes Available Standby Account during Cooldown", () => {
  const { options, cleanup } = setupIsolatedPoolEnv();

  // When Account A is in COOLDOWN, but Account B is AVAILABLE:
  configureWorkerAccounts("antigravity", {
    primaryAccountId: "account_a",
    activeAccountId: "account_b",
    accounts: {
      account_a: { id: "account_a", name: "Antigravity A", status: "COOLDOWN", cooldownUntil: new Date(Date.now() + 60000).toISOString() },
      account_b: { id: "account_b", name: "Antigravity B", status: "AVAILABLE" }
    }
  }, options);

  assert.equal(hasAvailableAccount("antigravity", options), true);

  // CostGuard test with a worker in cooldown state in registry:
  const config = { dryRun: true, agents: { antigravity: { enabled: true } } };
  const task = { modelNeed: { tier: "LOW" }, title: "日常任务" };

  const guard = applyCostGuard("antigravity", undefined, { config, task, poolFile: options.poolFile });
  assert.equal(guard.ok, true);
  assert.equal(guard.worker, "antigravity");

  cleanup();
});

test("Account Pool Pillar 5: Manual Account Reset", () => {
  const { options, cleanup } = setupIsolatedPoolEnv();

  configureWorkerAccounts("grok-build", {
    primaryAccountId: "account_a",
    activeAccountId: "account_b",
    accounts: {
      account_a: { id: "account_a", name: "Grok A", status: "COOLDOWN", cooldownUntil: new Date(Date.now() + 100000).toISOString() },
      account_b: { id: "account_b", name: "Grok B", status: "AVAILABLE" }
    }
  }, options);

  const updated = manualResetAccount("grok-build", "account_a", options);
  assert.equal(updated.accounts.account_a.status, "AVAILABLE");
  assert.equal(updated.activeAccountId, "account_a");

  cleanup();
});
