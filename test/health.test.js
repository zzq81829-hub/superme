import test from "node:test";
import assert from "node:assert/strict";
import {
  workerHealthMap,
  probeClaudeSubscription,
  classifyCodexProbe,
  classifyGrokProbe,
  classifyHermesProbe
} from "../src/workers/health.js";

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

test("binary presence is reported as installed, not authenticated readiness", () => {
  const codex = workerHealthMap().codex;
  if (codex.available) {
    assert.equal(codex.status, "INSTALLED");
    assert.equal(codex.readinessVerified, false);
  }
});

test("configured Antigravity is not advertised as dispatchable for headless tool work", () => {
  const antigravity = workerHealthMap({
    config: { agents: { antigravity: { permissionMode: "configured" } } }
  }).antigravity;
  assert.equal(antigravity.available, false);
  assert.equal(antigravity.status, "HEADLESS_PERMISSION_BLOCKED");
  assert.equal(antigravity.permissionMode, "configured");
});

test("explicit Antigravity dangerous mode remains dispatchable", () => {
  const antigravity = workerHealthMap({
    config: { agents: { antigravity: { permissionMode: "dangerous-bypass" } } }
  }).antigravity;
  assert.equal(antigravity.available, true);
});

test("read-only status output is classified without claiming more than it proves", () => {
  assert.equal(classifyCodexProbe("Logged in using ChatGPT", 0).status, "READY");
  assert.equal(classifyCodexProbe("Not logged in", 1).status, "AUTH_REQUIRED");
  assert.equal(classifyGrokProbe("You are logged in with grok.com.\nDefault model: grok-4.6", 0).status, "READY");
  assert.equal(classifyHermesProbe("Provider: DeepSeek\nDeepSeek      ✓ configured", 0).status, "READY");
  assert.equal(classifyHermesProbe("Provider: custom:gemini-proxy\nDefault model: gemini-flash-3.7", 0).detail, "Hermes Gemini Flash 3.7 High provider verified");
  assert.equal(classifyHermesProbe("Provider: Other", 0).available, false);
});
