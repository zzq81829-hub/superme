import fs from "fs";
import path from "path";
import { runProcess } from "../adapters/processRunner.js";

export async function verifyTask({ projectPath, result, config }) {
  if (!result?.ok) {
    return { ok: false, reason: "worker result not ok", checks: [] };
  }
  if (!(result.message || result.preview || "").trim()) {
    return { ok: false, reason: "worker produced no message", checks: [] };
  }

  const checks = [{ name: "non-empty-result", ok: true }];
  const pkg = path.join(projectPath, "package.json");
  if (!fs.existsSync(pkg)) return { ok: true, reason: "no package.json; message present", checks };

  if (config.dryRun) {
    checks.push({ name: "npm-test", ok: true, skipped: "dryRun" });
    return { ok: true, reason: "dry-run skipped npm test", checks };
  }

  const npmTest = await runProcess({
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    args: ["test"],
    cwd: projectPath,
    dryRun: false,
    timeoutMs: 120000
  });
  checks.push({ name: "npm-test", ok: npmTest.ok, error: npmTest.error || null });
  if (!npmTest.ok) return { ok: false, reason: "npm test failed", checks };
  return { ok: true, reason: "checks passed", checks };
}
