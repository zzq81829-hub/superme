import test from "node:test";
import assert from "node:assert/strict";
import { applyCostGuard } from "../src/workers/costGuard.js";

const online = (id) => ({
  id, status: "ONLINE", available: true, billingMode: "subscription", apiAllowed: false
});

test("grok-bot unavailable does not block the company", () => {
  const health = {
    "grok-bot": { id: "grok-bot", status: "UNKNOWN_CONTROL_INTERFACE", available: false, billingMode: "subscription_or_quota" },
    codex: online("codex"),
    claude: online("claude"),
    antigravity: online("antigravity"),
    "grok-build": online("grok-build")
  };
  const r = applyCostGuard("grok-bot", health);
  assert.equal(r.ok, true);
  assert.equal(r.worker, "codex");
});

test("codex down falls back to claude not OpenAI API", () => {
  const health = {
    "grok-bot": { available: false, status: "UNAVAILABLE" },
    codex: { id: "codex", status: "OFFLINE", available: false, billingMode: "subscription" },
    claude: online("claude"),
    antigravity: online("antigravity"),
    "grok-build": online("grok-build")
  };
  const r = applyCostGuard("codex", health);
  assert.equal(r.ok, true);
  assert.equal(r.worker, "claude");
  assert.equal(r.reason.includes("OpenAI"), false);
});

test("quota skip does not use paid APIs", () => {
  const online = (id) => ({ id, status: "ONLINE", available: true, billingMode: "subscription", apiAllowed: false });
  const r = applyCostGuard("codex", {
    codex: online("codex"),
    claude: online("claude"),
    antigravity: online("antigravity"),
    "grok-build": online("grok-build")
  }, { skip: ["codex"] });
  assert.equal(r.ok, true);
  assert.equal(r.worker, "claude");
});

test("all coding workers down requires a human", () => {
  const down = { status: "OFFLINE", available: false, billingMode: "subscription" };
  const r = applyCostGuard("auto", {
    codex: down, claude: down, antigravity: down, "grok-build": down, "grok-bot": down
  });
  assert.equal(r.ok, false);
  assert.equal(r.action, "HUMAN_ACTION_REQUIRED");
});
