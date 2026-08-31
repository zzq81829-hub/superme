import path from "path";
import { runProcess } from "./processRunner.js";
import { executionLogPaths } from "./logPaths.js";
import { resolveAgentCommand } from "./resolveCommand.js";

function parseJsonLines(stdout) {
  const parsed = {
    threadId: null,
    message: "",
    usage: null,
    error: null,
    eventCount: 0
  };

  for (const line of stdout.split(/\r?\n/).filter(Boolean)) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    parsed.eventCount += 1;
    if (event.type === "thread.started") parsed.threadId = event.thread_id || null;
    if (event.type === "turn.completed") parsed.usage = event.usage || null;
    if (event.type === "turn.failed" || event.type === "error") {
      parsed.error = event.error?.message || event.error || event.message || "Codex run failed";
    }
    if (event.type === "item.completed" && event.item?.type === "agent_message") {
      parsed.message = event.item.text || "";
    }
  }

  return parsed;
}

export async function runCodex({ task, prompt, projectPath, config }) {
  const agent = config.agents.codex;
  if (!agent?.enabled) return { ok: false, error: "Codex agent is disabled" };

  const command = resolveAgentCommand("codex", agent.command);
  const cwd = agent.workingDirectory || projectPath || process.cwd();
  const timeoutMs = agent.timeoutMs || config.execution?.timeoutMs;
  const logs = executionLogPaths(task?.id, "codex");
  const args = [
    "exec",
    "--ephemeral",
    "--json",
    "--color",
    "never",
    "--sandbox",
    agent.sandbox || "workspace-write",
    "--skip-git-repo-check",
    ...(agent.args || []),
    "-"
  ];

  const processResult = await runProcess({
    command,
    args,
    cwd: path.resolve(cwd),
    input: prompt,
    dryRun: config.dryRun,
    timeoutMs,
    maxOutputBytes: config.execution?.maxOutputBytes,
    logPath: logs.wrapperLogPath
  });

  const common = {
    agent: "codex",
    dryRun: !!processResult.dryRun,
    command: processResult.command,
    args: processResult.args,
    exitCode: processResult.exitCode,
    timedOut: !!processResult.timedOut,
    durationMs: processResult.durationMs,
    logPath: logs.relative(logs.wrapperLogPath),
    logError: processResult.logError || null
  };

  if (processResult.dryRun) {
    return {
      ...common,
      ok: true,
      preview: processResult.preview,
      message: "Codex dry-run completed; no CLI process was started."
    };
  }

  const parsed = parseJsonLines(processResult.stdout || "");
  if (processResult.ok && parsed.eventCount === 0) {
    parsed.error = "Codex returned no valid JSONL events";
  } else if (processResult.ok && !parsed.message) {
    parsed.error = "Codex completed without a final agent message";
  }
  const error = processResult.error || parsed.error;
  return {
    ...common,
    ok: processResult.ok && !parsed.error,
    threadId: parsed.threadId,
    message: parsed.message,
    usage: parsed.usage,
    eventCount: parsed.eventCount,
    error: error || null,
    stderr: processResult.stderr?.trim() || null
  };
}
