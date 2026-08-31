import path from "path";
import { runProcess } from "./processRunner.js";
import { executionLogPaths } from "./logPaths.js";
import { resolveAgentCommand } from "./resolveCommand.js";
import { subscriptionEnv } from "../billing/policy.js";

export async function runClaude({ task, prompt, projectPath, config }) {
  const agent = config.agents?.claude || { enabled: true, command: "claude" };
  if (agent.enabled === false) return { ok: false, error: "Claude agent is disabled" };

  const command = resolveAgentCommand("claude", agent.command || "claude");
  const cwd = agent.workingDirectory || projectPath || process.cwd();
  const logs = executionLogPaths(task?.id, "claude");
  const args = ["-p", prompt, "--output-format", "text"];

  const processResult = await runProcess({
    command,
    args: config.dryRun ? ["-p", "--output-format", "text"] : args,
    displayArgs: ["-p", "<task prompt>", "--output-format", "text"],
    cwd: path.resolve(cwd),
    dryRun: config.dryRun,
    timeoutMs: agent.timeoutMs || config.execution?.timeoutMs,
    maxOutputBytes: config.execution?.maxOutputBytes,
    logPath: logs.wrapperLogPath,
    env: subscriptionEnv(),
    input: config.dryRun ? prompt : ""
  });

  if (processResult.dryRun) {
    return {
      agent: "claude",
      ok: true,
      dryRun: true,
      command,
      args: processResult.args,
      preview: processResult.preview,
      message: "Claude dry-run completed; no CLI process was started.",
      logPath: logs.relative(logs.wrapperLogPath)
    };
  }

  return {
    agent: "claude",
    ok: processResult.ok && !!(processResult.stdout || "").trim(),
    dryRun: false,
    command,
    args: processResult.args,
    message: (processResult.stdout || "").trim(),
    error: processResult.ok ? ((processResult.stdout || "").trim() ? null : "Claude completed without a response") : processResult.error,
    stderr: processResult.stderr || null,
    exitCode: processResult.exitCode,
    durationMs: processResult.durationMs,
    logPath: logs.relative(logs.wrapperLogPath)
  };
}
