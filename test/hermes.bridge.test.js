import test from "node:test";
import assert from "node:assert/strict";
import { sendTask } from "../src/integrations/hermes/bridge.js";

test("Hermes bridge dry-run uses Gemini Flash 3.7 High", async () => {
  const result = await sendTask({
    instruction: "Reply with HERMES_OK",
    projectPath: process.cwd(),
    config: { dryRun: true, execution: { timeoutMs: 5000 } },
    taskId: "test-hermes-bridge"
  });
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.args.includes("chat"), true);
  assert.equal(result.args.includes("--query-file"), true);
  assert.equal(result.args.includes("custom:gemini-proxy"), true);
  assert.equal(result.args.includes("gemini-flash-3.7"), true);
  assert.equal(result.args.includes("--reasoning"), true);
  assert.equal(result.args.includes("--source"), true);
});

test("DeepSeek fallback keeps its explicit provider", async () => {
  const result = await sendTask({
    instruction: "Reply with DEEPSEEK_OK",
    projectPath: process.cwd(),
    config: { dryRun: true, execution: { timeoutMs: 5000 } },
    taskId: "test-deepseek-bridge",
    agent: "deepseek"
  });
  assert.equal(result.ok, true);
  assert.equal(result.args.includes("deepseek"), true);
  assert.equal(result.args.includes("gemini-flash-3.7"), false);
});
