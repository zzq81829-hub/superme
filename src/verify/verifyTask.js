import fs from "fs";
import path from "path";
import { runProcess } from "../adapters/processRunner.js";
import { normalizeAcceptanceCriteria } from "./criteria.js";

function resolveInsideProject(projectPath, relativePath) {
  const root = path.resolve(projectPath);
  const target = path.resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`acceptance path escapes project: ${relativePath}`);
  }
  return target;
}

async function runAcceptanceCheck(criterion, projectPath, config) {
  if (criterion.type === "command") {
    if (config.dryRun) return { name: `command:${criterion.command}`, ok: true, skipped: "dryRun" };
    let command = criterion.command;
    let args = criterion.args;
    if (process.platform === "win32" && criterion.command === "npm") {
      const npmCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
      if (!fs.existsSync(npmCli)) {
        return { name: `command:npm ${criterion.args.join(" ")}`.trim(), ok: false, error: "safe npm-cli.js entry point not found" };
      }
      command = process.execPath;
      args = [npmCli, ...criterion.args];
    } else if (process.platform === "win32" && criterion.command === "pnpm") {
      command = "pnpm.cmd";
    }
    const result = await runProcess({
      command,
      args,
      cwd: projectPath,
      dryRun: false,
      timeoutMs: Math.min(config.execution?.verificationTimeoutMs || 120000, 300000),
      maxOutputBytes: config.execution?.maxOutputBytes
    });
    return {
      name: `command:${criterion.command} ${criterion.args.join(" ")}`.trim(),
      ok: result.ok,
      exitCode: result.exitCode,
      error: result.error || null
    };
  }

  let target;
  try {
    target = resolveInsideProject(projectPath, criterion.path);
  } catch (error) {
    return { name: `${criterion.type}:${criterion.path}`, ok: false, error: error.message };
  }
  const exists = fs.existsSync(target);
  if (criterion.type === "file-exists") {
    return { name: `file-exists:${criterion.path}`, ok: exists, error: exists ? null : "file missing" };
  }
  if (!exists || !fs.statSync(target).isFile()) {
    return { name: `${criterion.type}:${criterion.path}`, ok: false, error: "file missing or not a regular file" };
  }
  const actualRaw = fs.readFileSync(target, "utf8");
  const actual = criterion.trim ? actualRaw.trim() : actualRaw;
  const expected = criterion.trim ? criterion.value.trim() : criterion.value;
  const ok = criterion.type === "file-equals" ? actual === expected : actual.includes(expected);
  return {
    name: `${criterion.type}:${criterion.path}`,
    ok,
    error: ok ? null : criterion.type === "file-equals" ? "file content differs" : "expected text not found"
  };
}

export async function verifyTask({ projectPath, result, config, task = {} }) {
  if (!result?.ok) {
    return { ok: false, reason: "worker result not ok", checks: [] };
  }
  if (!(result.message || result.preview || "").trim()) {
    return { ok: false, reason: "worker produced no message", checks: [] };
  }

  const checks = [{ name: "non-empty-result", ok: true }];
  const criteria = normalizeAcceptanceCriteria(task.acceptanceCriteria);
  for (const criterion of criteria) {
    const check = await runAcceptanceCheck(criterion, projectPath, config);
    checks.push(check);
    if (!check.ok) return { ok: false, reason: `acceptance check failed: ${check.name}`, checks };
  }
  const pkg = path.join(projectPath, "package.json");
  if (!fs.existsSync(pkg)) return { ok: true, reason: "no package.json; message present", checks };

  const explicitNpmTest = criteria.some((criterion) =>
    criterion.type === "command" && criterion.command.replace(/\.cmd$/i, "") === "npm" && criterion.args[0] === "test"
  );
  if (explicitNpmTest) return { ok: true, reason: "checks passed", checks };

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
