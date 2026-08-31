import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import {
  getQuotaState,
  getWorkerQuota,
  markQuotaExhausted,
  markQuotaNormal,
  setQuotaOverride,
  isQuotaExhaustion
} from "../src/workers/quota.js";
import { applyCostGuard } from "../src/workers/costGuard.js";

function isolatedDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "quota-test-"));
}

test("quota exhaustion is detected from run output", () => {
  assert.equal(isQuotaExhaustion({ error: "usage limit reached for today" }), true);
  assert.equal(isQuotaExhaustion({ stderr: "QUOTA_LIMITED: exceeded monthly quota" }), true);
  assert.equal(isQuotaExhaustion({ message: "you have exceeded your quota" }), true);
  assert.equal(isQuotaExhaustion({ error: "not logged in" }), false);
  assert.equal(isQuotaExhaustion({ error: "proxy down ECONNREFUSED" }), false);
  assert.equal(isQuotaExhaustion({}), false);
});

test("quota state persists markExhausted / markNormal / override round-trip", () => {
  const baseDir = isolatedDir();
  const options = { baseDir };

  // Empty initially
  assert.equal(getWorkerQuota("codex", options), null);

  // Runtime marks exhausted
  const exhausted = markQuotaExhausted("codex", "usage limit reached", options);
  assert.equal(exhausted.status, "exhausted");
  assert.equal(exhausted.source, "runtime");
  assert.equal(getWorkerQuota("codex", options).status, "exhausted");

  // Runtime marks normal (recovered)
  const normal = markQuotaNormal("codex", options);
  assert.equal(normal.status, "normal");
  assert.equal(getWorkerQuota("codex", options).exhaustedAt, null);

  // Founder override exhausted
  const founderExhausted = setQuotaOverride("codex", "exhausted", "founder says out", options);
  assert.equal(founderExhausted.status, "exhausted");
  assert.equal(founderExhausted.source, "founder");

  // Founder clears (unknown) removes record entirely
  assert.equal(setQuotaOverride("codex", "unknown", "", options), null);
  assert.equal(getWorkerQuota("codex", options), null);
});

test("costGuard skips a quota-exhausted subscription worker and falls back", () => {
  const baseDir = isolatedDir();
  markQuotaExhausted("codex", "usage limit reached", { baseDir });

  const health = {
    codex: { id: "codex", status: "ONLINE", available: true, billingMode: "subscription", apiAllowed: false },
    claude: { id: "claude", status: "ONLINE", available: true, billingMode: "subscription", apiAllowed: false },
    antigravity: { id: "antigravity", status: "ONLINE", available: true, billingMode: "subscription", apiAllowed: false },
    "grok-build": { id: "grok-build", status: "ONLINE", available: true, billingMode: "subscription", apiAllowed: false }
  };

  // Even though codex is healthily "ONLINE", it is skipped for quota and falls to claude
  const r = applyCostGuard("codex", health, { baseDir });
  assert.equal(r.ok, true);
  assert.equal(r.worker, "claude");
  assert.ok(r.attempts.some((a) => a.id === "codex" && a.skip.includes("QUOTA_EXHAUSTED")));
});

test("a normal-quota worker is not skipped by costGuard", () => {
  const baseDir = isolatedDir();
  markQuotaNormal("codex", { baseDir });

  const health = {
    codex: { id: "codex", status: "ONLINE", available: true, billingMode: "subscription", apiAllowed: false },
    claude: { id: "claude", status: "ONLINE", available: true, billingMode: "subscription", apiAllowed: false },
    antigravity: { id: "antigravity", status: "ONLINE", available: true, billingMode: "subscription", apiAllowed: false },
    "grok-build": { id: "grok-build", status: "ONLINE", available: true, billingMode: "subscription", apiAllowed: false }
  };

  const r = applyCostGuard("codex", health, { baseDir });
  assert.equal(r.ok, true);
  assert.equal(r.worker, "codex");
});

test("invalid quota status is coerced to unknown (record removed)", () => {
  const baseDir = isolatedDir();
  markQuotaExhausted("codex", "usage limit", { baseDir });
  // "banana" is not a valid status, so it normalizes to "unknown" → record removed
  const record = setQuotaOverride("codex", "banana", "", { baseDir });
  assert.equal(record, null);
  assert.equal(getWorkerQuota("codex", { baseDir }), null);
});
