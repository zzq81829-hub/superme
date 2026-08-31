import fs from "fs";
import os from "os";
import path from "path";
import test from "node:test";
import assert from "node:assert/strict";
import { runProcess } from "../src/adapters/processRunner.js";

test("runProcess returns a safe preview in dry-run mode", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "founder-os-dry-"));
  const logPath = path.join(tempDir, "run.json");

  const result = await runProcess({
    command: "example-agent",
    args: ["--real-secret-argument"],
    displayArgs: ["<redacted>"],
    cwd: tempDir,
    input: "test prompt",
    dryRun: true,
    logPath
  });

  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.deepEqual(result.args, ["<redacted>"]);
  assert.equal(result.preview, "test prompt");
  assert.equal(fs.existsSync(logPath), true);
});

test("runProcess captures stdout from a real child process", async () => {
  const result = await runProcess({
    command: process.execPath,
    args: ["-e", "process.stdout.write('PROCESS_OK')"],
    cwd: process.cwd(),
    dryRun: false,
    timeoutMs: 5000
  });

  assert.equal(result.ok, true);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "PROCESS_OK");
});

test("runProcess terminates a child that exceeds its timeout", async () => {
  const result = await runProcess({
    command: process.execPath,
    args: ["-e", "setInterval(() => {}, 1000)"],
    cwd: process.cwd(),
    dryRun: false,
    timeoutMs: 100
  });

  assert.equal(result.ok, false);
  assert.equal(result.timedOut, true);
  assert.match(result.error, /timed out/i);
});
