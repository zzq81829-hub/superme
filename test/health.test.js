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

test("Claude API-key auth is not treated as subscription", () => {
  const claude = probeClaudeSubscription();
  if (claude.detail && /API key/i.test(claude.detail)) {
    assert.equal(claude.available, false);
    assert.equal(claude.status, "SUBSCRIPTION_UNAVAILABLE");
  }
});
