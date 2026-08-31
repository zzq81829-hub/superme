import fs from "fs";
import path from "path";
import test from "node:test";
import assert from "node:assert/strict";
import { runCodex } from "../src/adapters/codex.js";
import { runAntigravity, isLocationBlocked, isHeadlessPermissionDenied, nextFallbackModel } from "../src/adapters/antigravity.js";

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
  assert.equal(result.args.some((arg) => arg.includes("SECRET")), false);
  assert.equal(result.preview, "ANTIGRAVITY SECRET PROMPT");
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
