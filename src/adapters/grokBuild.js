import path from "path";
import { runProcess } from "./processRunner.js";
import { executionLogPaths } from "./logPaths.js";
import { resolveAgentCommand } from "./resolveCommand.js";
import { subscriptionEnv } from "../billing/policy.js";

export async function runGrokBuild({ task, prompt, projectPath, config, researchOnly = false }) {
  const agentName = researchOnly ? "grok" : "grok-build";
  const agent = config.agents?.[researchOnly ? "grok" : "grokBuild"] || { enabled: true, command: "grok" };
  if (agent.enabled === false) return { ok: false, agent: agentName, error: `${agentName} is disabled` };

  const command = resolveAgentCommand("grok-build", agent.command || "grok");
  const cwd = agent.workingDirectory || projectPath || process.cwd();
  const logs = executionLogPaths(task?.id, agentName);
  const args = researchOnly
    ? ["-p", prompt, "--output-format", "plain"]
    : ["-p", prompt, "--always-approve", "--output-format", "plain"];

  const processResult = await runProcess({
    command,
    args: config.dryRun ? ["-p", "--output-format", "plain"] : args,
    displayArgs: researchOnly
      ? ["-p", "<task prompt>", "--output-format", "plain"]
      : ["-p", "<task prompt>", "--always-approve", "--output-format", "plain"],
    cwd: path.resolve(cwd),
    dryRun: config.dryRun,
    timeoutMs: agent.timeoutMs || config.execution?.timeoutMs,
    maxOutputBytes: config.execution?.maxOutputBytes,
    logPath: logs.wrapperLogPath,
    env: subscriptionEnv(),
    input: config.dryRun ? prompt : "",
    taskId: task?.id
  });

  if (processResult.dryRun) {
    return {
      agent: agentName,
      ok: true,
      dryRun: true,
      command,
      args: processResult.args,
      preview: processResult.preview,
      message: `${agentName} dry-run completed; no CLI process was started.`,
      logPath: logs.relative(logs.wrapperLogPath)
    };
  }

  return {
    agent: agentName,
    ok: processResult.ok && !!(processResult.stdout || "").trim(),
    dryRun: false,
    command,
    args: processResult.args,
    message: (processResult.stdout || "").trim(),
    error: processResult.ok ? ((processResult.stdout || "").trim() ? null : `${agentName} completed without a response`) : processResult.error,
    stderr: processResult.stderr || null,
    exitCode: processResult.exitCode,
    durationMs: processResult.durationMs,
    logPath: logs.relative(logs.wrapperLogPath)
  };
}
