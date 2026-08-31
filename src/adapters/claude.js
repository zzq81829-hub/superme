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
  const args = ["-p", prompt, "--output-format", "text", "--model", agent.model || "sonnet"];

  const processResult = await runProcess({
    command,
    args: config.dryRun ? ["-p", "--output-format", "text", "--model", agent.model || "sonnet"] : args,
    displayArgs: ["-p", "<task prompt>", "--output-format", "text", "--model", agent.model || "sonnet"],
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

  const message = (processResult.stdout || "").trim();
  const blob = `${message}\n${processResult.stderr || ""}\n${processResult.error || ""}`;
  const authRequired = /not logged in|please run \/login/i.test(blob);
  const error = authRequired
    ? "AUTH_REQUIRED"
    : processResult.ok
      ? (message ? null : "Claude completed without a response")
      : processResult.error;
  return {
    agent: "claude",
    ok: processResult.ok && !!message && !authRequired,
    dryRun: false,
    command,
    args: processResult.args,
    message,
    error,
    stderr: processResult.stderr || null,
    exitCode: processResult.exitCode,
    durationMs: processResult.durationMs,
    logPath: logs.relative(logs.wrapperLogPath)
  };
}
