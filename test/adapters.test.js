import fs from "fs";
import path from "path";
import test from "node:test";
import assert from "node:assert/strict";
import { runCodex } from "../src/adapters/codex.js";
import { runAntigravity, isLocationBlocked, isHeadlessPermissionDenied, nextFallbackModel } from "../src/adapters/antigravity.js";
import { runClaude } from "../src/adapters/claude.js";
import { runGrokBuild } from "../src/adapters/grokBuild.js";

const config = {
  dryRun: true,
  execution: { timeoutMs: 60000, maxOutputBytes: 1024 * 1024 },
  agents: {
    codex: { enabled: true, command: "codex", args: [], sandbox: "workspace-write" },
    antigravity: { enabled: true, command: "agy", args: [], mode: "accept-edits", model: "claude-sonnet-4-6", sandbox: false }
  }
};

function removeLog(relativePath) {
  if (relativePath) fs.rmSync(path.resolve(relativePath), { force: true });
}

test("Codex adapter builds the verified non-interactive command", async (t) => {
  const result = await runCodex({
    task: { id: "test-codex-adapter" },
    prompt: "CODEX TEST PROMPT",
    projectPath: process.cwd(),
    config
  });
  t.after(() => removeLog(result.logPath));

  assert.equal(result.ok, true);
  assert.match(String(result.command), /codex(\.exe)?$/i);
  assert.deepEqual(result.args.slice(0, 3), ["exec", "--ephemeral", "--json"]);
  assert.equal(result.args.at(-1), "-");
  assert.equal(result.preview, "CODEX TEST PROMPT");
});

test("Antigravity adapter uses agy print mode without exposing the prompt in logs", async (t) => {
  const result = await runAntigravity({
    task: { id: "test-antigravity-adapter" },
    prompt: "ANTIGRAVITY SECRET PROMPT",
    projectPath: process.cwd(),
    config
  });
  t.after(() => removeLog(result.logPath));

  assert.equal(result.ok, true);
  assert.match(String(result.command), /agy(\.exe)?$/i);
  assert.equal(result.args.includes("--print=<task prompt>"), true);
  assert.equal(result.args.includes("--add-dir"), true);
  assert.equal(result.args.includes("claude-sonnet-4-6"), true);
  assert.equal(result.args.includes("--sandbox"), false);
  assert.equal(result.args.includes("--dangerously-skip-permissions"), false);
  assert.equal(result.permissionMode, "configured");
  assert.equal(result.args.some((arg) => arg.includes("SECRET")), false);
  assert.equal(result.preview, "ANTIGRAVITY SECRET PROMPT");
});

test("Antigravity dangerous permission bypass is explicit and visible in dry-run", async (t) => {
  const dangerousConfig = {
    ...config,
    agents: {
      ...config.agents,
      antigravity: { ...config.agents.antigravity, permissionMode: "dangerous-bypass" }
    }
  };
  const result = await runAntigravity({
    task: { id: "test-antigravity-dangerous-mode" },
    prompt: "PERMISSION TEST",
    projectPath: process.cwd(),
    config: dangerousConfig
  });
  t.after(() => removeLog(result.logPath));

  assert.equal(result.ok, true);
  assert.equal(result.args.includes("--dangerously-skip-permissions"), true);
  assert.equal(result.permissionMode, "dangerous-bypass");
});

test("Antigravity Boost injects /boost and --effort high when boost is enabled", async (t) => {
  const boostConfig = {
    ...config,
    agents: {
      ...config.agents,
      antigravity: { ...config.agents.antigravity, boost: true, effort: "high" }
    }
  };
  const result = await runAntigravity({
    task: { id: "test-antigravity-boost" },
    prompt: "ANALYZE CODEBASE",
    projectPath: process.cwd(),
    config: boostConfig
  });
  t.after(() => removeLog(result.logPath));

  assert.equal(result.ok, true);
  assert.equal(result.boost, true);
  assert.equal(result.effort, "high");
  assert.equal(result.args.includes("--effort"), true);
  assert.equal(result.args.includes("high"), true);
  assert.equal(result.preview, "/boost\nANALYZE CODEBASE");
});

test("Antigravity Boost avoids double prefix when prompt already starts with /boost", async (t) => {
  const boostConfig = {
    ...config,
    agents: {
      ...config.agents,
      antigravity: { ...config.agents.antigravity, boost: true }
    }
  };
  const result = await runAntigravity({
    task: { id: "test-antigravity-boost-idempotent" },
    prompt: "/boost ALREADY PREFIXED",
    projectPath: process.cwd(),
    config: boostConfig
  });
  t.after(() => removeLog(result.logPath));

  assert.equal(result.ok, true);
  assert.equal(result.boost, true);
  assert.equal(result.preview, "/boost ALREADY PREFIXED");
});

test("Antigravity Boost can be explicitly enabled per task", async (t) => {
  const result = await runAntigravity({
    task: { id: "test-antigravity-task-boost", boost: true, effort: "high" },
    prompt: "TASK LEVEL BOOST",
    projectPath: process.cwd(),
    config
  });
  t.after(() => removeLog(result.logPath));

  assert.equal(result.ok, true);
  assert.equal(result.boost, true);
  assert.equal(result.effort, "high");
  assert.equal(result.preview, "/boost\nTASK LEVEL BOOST");
});

test("location errors fall back to Claude then GPT-OSS", () => {
  assert.equal(isLocationBlocked("FAILED_PRECONDITION: User location is not supported for the API use."), true);
  assert.equal(nextFallbackModel([]), "claude-sonnet-4-6");
  assert.equal(nextFallbackModel(["claude-sonnet-4-6"]), "gpt-oss-120b-medium");
  assert.equal(nextFallbackModel(["claude-sonnet-4-6", "gpt-oss-120b-medium"]), null);
});

test("headless permission denials are detected from CLI and adapter wording", () => {
  assert.equal(isHeadlessPermissionDenied("Print mode: soft-denying tool confirmation \"RunCommand\""), true);
  assert.equal(isHeadlessPermissionDenied("Headless Antigravity denied a required tool"), true);
});

test("Claude adapter dry-run uses -p and strips prompt from display args", async (t) => {
  const result = await runClaude({
    task: { id: "test-claude-adapter" },
    prompt: "CLAUDE SECRET",
    projectPath: process.cwd(),
    config
  });
  t.after(() => removeLog(result.logPath));
  assert.equal(result.ok, true);
  assert.equal(result.args.includes("-p"), true);
  assert.equal(result.args.some((arg) => String(arg).includes("SECRET")), false);
});

test("Grok Build adapter dry-run uses -p", async (t) => {
  const result = await runGrokBuild({
    task: { id: "test-grok-build-adapter" },
    prompt: "GROK SECRET",
    projectPath: process.cwd(),
    config
  });
  t.after(() => removeLog(result.logPath));
  assert.equal(result.ok, true);
  assert.equal(result.agent, "grok-build");
  assert.equal(result.args.includes("-p"), true);
});
