import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import { probeGrokBot } from "../src/secretary/probeGrokBot.js";
import { receiveMessage, acceptMessage, rejectMessage, getMessage, listInbox } from "../src/secretary/inbox.js";
import { getTask } from "../src/store.js";
import { getMemory } from "../src/memory/store.js";
import { applyCostGuard } from "../src/workers/costGuard.js";

function setupIsolatedSecretaryDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "founder-secretary-test-"));
  process.env.SECRETARY_BASE_DIR = tmpDir;
  return tmpDir;
}

test("Secretary Protocol: 1. Inbox converts task intent to draft task without calling execute/dispatch", () => {
  const tmpDir = setupIsolatedSecretaryDir();

  const msg = receiveMessage({
    text: "分析并重构前端按钮的响应动效，不要引入重型依赖。",
    source: "dashboard"
  });

  assert.equal(msg.status, "converted");
  assert.equal(msg.intentGuess, "task");
  assert.ok(msg.convertedTo);
  assert.equal(msg.convertedTo.type, "task");

  const createdTask = getTask(msg.convertedTo.id);
  assert.ok(createdTask);
  assert.ok(createdTask.title.includes("重构前端按钮"));
  // Must NOT be in running/verifying/completed status (no automatic dispatch)
  assert.ok(["queued", "draft"].includes(createdTask.status));
  assert.equal(createdTask.result, null);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("Secretary Protocol: 2. Text containing high-risk actions enters pending approval, never auto-approved", () => {
  const tmpDir = setupIsolatedSecretaryDir();

  const msg = receiveMessage({
    text: "发布书斋小红书新图文，并向全平台广播。",
    source: "dashboard"
  });

  assert.equal(msg.status, "converted");
  assert.equal(msg.intentGuess, "task");

  const task = getTask(msg.convertedTo.id);
  assert.ok(task);
  assert.equal(task.riskLevel, "high");
  assert.equal(task.approvalStatus, "pending");
  assert.equal(task.approvedAt, null);
  assert.equal(task.approvedHash, null);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("Secretary Protocol: 3. Preference/decision text creates memory candidate, never auto-confirmed", () => {
  const tmpDir = setupIsolatedSecretaryDir();

  const msg = receiveMessage({
    text: "审美标准：书斋的封面图片统一采用黑白红时装秀质感，细边框，严禁粗糙渐变。",
    source: "dashboard"
  });

  assert.equal(msg.status, "converted");
  assert.equal(msg.intentGuess, "memory_candidate");

  const candidate = getMemory(msg.convertedTo.id);
  assert.ok(candidate);
  assert.equal(candidate.status, "candidate");
  assert.equal(candidate.confirmedAt, null);
  assert.equal(candidate.license, "understand_only");

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("Secretary Protocol: 4. probeGrokBot returns UNKNOWN_CONTROL_INTERFACE and canDispatch is always false", () => {
  const probe = probeGrokBot();

  assert.equal(probe.canDispatch, false);
  assert.equal(probe.canSubmit, false);
  assert.ok(["UNKNOWN_CONTROL_INTERFACE", "OFFLINE"].includes(probe.status));
  assert.ok(probe.distinctFrom.includes("grok-build"));
  assert.ok(probe.distinctFrom.includes("grok"));
});

test("Secretary Protocol: 5. CostGuard does not treat grok-bot as a required worker", () => {
  // When explicitly requesting grok-bot
  const r = applyCostGuard("grok-bot");
  // grok-bot is unavailable/unverified, costGuard safely falls back to standard workers without failing company execution
  assert.equal(r.ok, true);
  assert.notEqual(r.worker, "grok-bot");
});
