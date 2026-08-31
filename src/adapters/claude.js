import path from "path";
import { runProcess } from "./processRunner.js";
import { executionLogPaths } from "./logPaths.js";
import { resolveAgentCommand } from "./resolveCommand.js";
import { claudeRuntimeEnv, localAnthropicProxy } from "../billing/policy.js";
import net from "net";

export async function runClaude({ task, prompt, projectPath, config }) {
  const agent = config.agents?.claude || { enabled: true, command: "claude" };
  if (agent.enabled === false) return { ok: false, error: "Claude agent is disabled" };

  const proxy = localAnthropicProxy();
  if (proxy && !config.dryRun) {
    const up = await new Promise((resolve) => {
      const socket = net.connect(proxy.port, proxy.host, () => { socket.end(); resolve(true); });
      socket.on("error", () => resolve(false));
      socket.setTimeout(800, () => { socket.destroy(); resolve(false); });
    });
    if (!up) {
      return { ok: false, agent: "claude", error: "PROXY_DOWN", message: `Antigravity reverse proxy not listening on ${proxy.url}` };
    }
  }

  const command = resolveAgentCommand("claude", agent.command || "claude");
  const cwd = agent.workingDirectory || projectPath || process.cwd();
  const logs = executionLogPaths(task?.id, "claude");
  const model = agent.model || (proxy ? null : "sonnet");
  const args = ["-p", prompt, "--output-format", "text", ...(model ? ["--model", model] : [])];

  const processResult = await runProcess({
    command,
    args: config.dryRun ? ["-p", "--output-format", "text", ...(model ? ["--model", model] : [])] : args,
    displayArgs: ["-p", "<task prompt>", "--output-format", "text", ...(model ? ["--model", model] : [])],
    cwd: path.resolve(cwd),
    dryRun: config.dryRun,
    timeoutMs: agent.timeoutMs || 45000,
    maxOutputBytes: config.execution?.maxOutputBytes,
    logPath: logs.wrapperLogPath,
    env: claudeRuntimeEnv(),
    input: config.dryRun ? prompt : "",
    taskId: task?.id
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
