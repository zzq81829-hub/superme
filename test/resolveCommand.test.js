import test from "node:test";
import assert from "node:assert/strict";
import { resolveAgentCommand } from "../src/adapters/resolveCommand.js";

test("resolves Codex to a local executable when PATH does not have it", () => {
  const resolved = resolveAgentCommand("codex", "codex");
  assert.match(resolved, /codex(\.exe)?$/i);
});

test("resolves Antigravity to agy.exe", () => {
  const resolved = resolveAgentCommand("antigravity", "agy");
  assert.match(resolved, /agy(\.exe)?$/i);
});

test("resolves Claude to the native executable instead of a shell shim", () => {
  const resolved = resolveAgentCommand("claude", "claude");
  assert.match(resolved, /claude\.exe$/i);
});
