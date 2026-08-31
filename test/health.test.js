import test from "node:test";
import assert from "node:assert/strict";
import { workerHealthMap } from "../src/workers/health.js";

test("grok-bot is experimental and never required", () => {
  const bot = workerHealthMap()["grok-bot"];
  assert.equal(bot.experimental, true);
  assert.equal(bot.required, false);
  assert.equal(bot.available, false);
  assert.equal(bot.status, "UNKNOWN_CONTROL_INTERFACE");
});
