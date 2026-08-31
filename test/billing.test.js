import test from "node:test";
import assert from "node:assert/strict";
import { isForbiddenApiEnabled, workerPolicy, subscriptionEnv, claudeRuntimeEnv } from "../src/billing/policy.js";

test("billing policy forbids extra model APIs", () => {
  assert.deepEqual(isForbiddenApiEnabled(), []);
  assert.equal(workerPolicy("codex").api_allowed, false);
  assert.equal(workerPolicy("deepseek").api_allowed, true);
  assert.equal(workerPolicy("grok-bot").required, false);
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
