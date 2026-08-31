import fs from "fs";
import os from "os";
import path from "path";
import test from "node:test";
import assert from "node:assert/strict";
import { parseAcceptanceText, normalizeAcceptanceCriteria } from "../src/verify/criteria.js";
import { verifyTask } from "../src/verify/verifyTask.js";

function testConfig() {
  return { dryRun: false, execution: { verificationTimeoutMs: 10000, maxOutputBytes: 1024 * 1024 } };
}

test("friendly acceptance text becomes structured checks", () => {
  assert.deepEqual(parseAcceptanceText("存在: output.txt\n内容: output.txt =>OK\n运行: node --version"), [
    { type: "file-exists", path: "output.txt" },
    { type: "file-equals", path: "output.txt", value: "OK" },
    { type: "command", command: "node", args: ["--version"] }
  ]);
});

test("acceptance commands are allowlisted", () => {
  assert.throws(() => normalizeAcceptanceCriteria([{ type: "command", command: "powershell", args: [] }]), /not allowed/);
  assert.throws(
    () => normalizeAcceptanceCriteria([{ type: "command", command: "npm", args: ["test", "&", "whoami"] }]),
    /shell metacharacters/
  );
});

test("verifier rejects a non-empty worker response when exact artifact is wrong", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "founder-os-verifier-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, "proof.txt"), "WRONG");
  const result = await verifyTask({
    projectPath: dir,
    result: { ok: true, message: "done" },
    config: testConfig(),
    task: { acceptanceCriteria: [{ type: "file-equals", path: "proof.txt", value: "RIGHT" }] }
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /acceptance check failed/);
});

test("verifier accepts exact artifacts and commands", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "founder-os-verifier-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, "proof.txt"), "RIGHT");
  const result = await verifyTask({
    projectPath: dir,
    result: { ok: true, message: "done" },
    config: testConfig(),
    task: { acceptanceCriteria: [
      { type: "file-equals", path: "proof.txt", value: "RIGHT" },
      { type: "command", command: "node", args: ["--version"] }
    ] }
  });
  assert.equal(result.ok, true);
  assert.equal(result.checks.every((check) => check.ok), true);
});

test("verifier blocks artifact paths outside the project", async () => {
  const result = await verifyTask({
    projectPath: process.cwd(),
    result: { ok: true, message: "done" },
    config: testConfig(),
    task: { acceptanceCriteria: [{ type: "file-exists", path: "../outside.txt" }] }
  });
  assert.equal(result.ok, false);
  assert.match(result.checks.at(-1).error, /escapes project/);
});
