import fs from "fs";
import os from "os";
import path from "path";
import { runProcess } from "../../adapters/processRunner.js";
import { resolveAgentCommand } from "../../adapters/resolveCommand.js";
import { executionLogPaths } from "../../adapters/logPaths.js";
import { subscriptionEnv } from "../../billing/policy.js";

function hermesBin(config) {
  return resolveAgentCommand("hermes", config?.agents?.hermes?.command || "hermes");
}

export async function healthCheck(config = {}) {
  const command = hermesBin(config);
  const result = await runProcess({
    command,
    args: ["--version"],
    cwd: process.cwd(),
    dryRun: !!config.dryRun,
    timeoutMs: 15000,
    input: config.dryRun ? "hermes --version" : ""
  });
  return {
    worker: "hermes",
    ok: config.dryRun ? true : result.ok,
    command,
    message: (result.stdout || result.preview || "").trim(),
    error: result.error || null
  };
}

export async function sendTask({ instruction, projectPath, config = {}, taskId = "hermes" }) {
  const command = hermesBin(config);
  const cwd = projectPath || config.workspaceRoot || process.cwd();
  const logs = executionLogPaths(taskId, "hermes");
  const queryFile = path.join(os.tmpdir(), `founder-os-hermes-${taskId}.txt`);
  fs.writeFileSync(queryFile, instruction, "utf8");
  const args = [
    "chat",
    "--query-file",
    queryFile,
    "--in",
    path.resolve(cwd),
    "-Q",
    "--source",
    "tool",
    "--provider",
    "deepseek",
    "--max-turns",
    "40",
    "--run-budget",
    "180"
  ];

  const processResult = await runProcess({
    command,
    args,
    cwd: path.resolve(cwd),
    dryRun: !!config.dryRun,
    timeoutMs: config.execution?.timeoutMs || 600000,
    maxOutputBytes: config.execution?.maxOutputBytes,
    logPath: logs.wrapperLogPath,
    env: { ...subscriptionEnv(), DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY },
    input: config.dryRun ? instruction : ""
  });

  return {
    agent: "hermes",
    ok: processResult.ok || !!processResult.dryRun,
    dryRun: !!processResult.dryRun,
    command,
    args,
    message: processResult.dryRun ? "Hermes dry-run; CLI not started." : (processResult.stdout || "").trim(),
    error: processResult.ok || processResult.dryRun ? null : processResult.error,
    logPath: logs.relative(logs.wrapperLogPath),
    stderr: processResult.stderr || null,
    exitCode: processResult.exitCode,
    durationMs: processResult.durationMs
  };
}

export async function getSessions(config = {}) {
  const command = hermesBin(config);
  const result = await runProcess({
    command,
    args: ["sessions", "list"],
    cwd: process.cwd(),
    dryRun: !!config.dryRun,
    timeoutMs: 20000,
    input: config.dryRun ? "hermes sessions list" : ""
  });
  return result.dryRun ? { ok: true, preview: result.preview } : { ok: result.ok, text: result.stdout, error: result.error };
}

export async function getLogs(config = {}) {
  const command = hermesBin(config);
  const result = await runProcess({
    command,
    args: ["logs", "-n", "40"],
    cwd: process.cwd(),
    dryRun: !!config.dryRun,
    timeoutMs: 20000,
    input: config.dryRun ? "hermes logs" : ""
  });
  return result.dryRun ? { ok: true, preview: result.preview } : { ok: result.ok, text: result.stdout, error: result.error };
}

export async function getStatus(config = {}) {
  return healthCheck(config);
}

export async function getWorkers(config = {}) {
  return healthCheck(config);
}

export async function cancelTask() {
  return { ok: false, error: "Hermes cancel is process-local; kill the child spawn if still running." };
}

export async function streamEvents() {
  return { ok: false, error: "Use sendTask; Hermes chat -q is one-shot, not a stream API." };
}
