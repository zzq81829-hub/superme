import test from "node:test";
import assert from "node:assert/strict";
import { workerHealthMap, probeClaudeSubscription } from "../src/workers/health.js";

test("grok-bot is experimental and never required", () => {
  const bot = workerHealthMap()["grok-bot"];
  assert.equal(bot.experimental, true);
  assert.equal(bot.required, false);
  assert.equal(bot.available, false);
  assert.equal(bot.status, "UNKNOWN_CONTROL_INTERFACE");
});

test("Claude reverse-proxy down is skippable, not a login wait", () => {
  const claude = probeClaudeSubscription();
  if (claude.detail && /PROXY_DOWN|reverse proxy/i.test(claude.detail || "")) {
    assert.equal(claude.required, undefined);
    assert.notEqual(claude.status, "AUTH_REQUIRED");
  }
});
