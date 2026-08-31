import fs from "fs";
import path from "path";
import { runProcess } from "./processRunner.js";
import { executionLogPaths } from "./logPaths.js";
import { resolveAgentCommand } from "./resolveCommand.js";

export const ANTIGRAVITY_FALLBACK_MODELS = ["claude-sonnet-4-6", "gpt-oss-120b-medium"];
export const ANTIGRAVITY_PERMISSION_MODES = ["configured", "dangerous-bypass"];

export function isLocationBlocked(text = "") {
  return /User location is not supported for the API use/i.test(String(text));
}

export function isHeadlessPermissionDenied(text = "") {
  return /headless mode cannot prompt|soft-denying tool confirmation|no output produced|denied a required tool/i.test(String(text));
}

export function isTransientProviderError(text = "") {
  return /high traffic|try again in a minute|RESOURCE_EXHAUSTED|rate.?limit|UNAVAILABLE/i.test(String(text));
}

export function nextFallbackModel(tried = []) {
  return ANTIGRAVITY_FALLBACK_MODELS.find((model) => !tried.includes(model)) || null;
}

function parseOutput(stdout) {
  try {
    return JSON.parse(stdout.trim());
  } catch {
    return null;
  }
}

function readCliLog(cliLogPath) {
  try {
    return fs.readFileSync(cliLogPath, "utf8");
  } catch {
    return "";
  }
}

function payloadFailed(payload) {
  return !!payload && (payload.status?.toUpperCase() === "ERROR" || !!payload.error);
}

function argsAlreadyHave(args = [], flag) {
  return args.some((arg) => arg === flag || String(arg).startsWith(`${flag}=`));
}

function buildArgs({ agent, logs, prompt, model, timeoutMs, cwd, skipPermissions }) {
  const printTimeoutSeconds = Math.max(5, Math.floor((timeoutMs - 5000) / 1000));
  const promptArg = `--print=${prompt}`;
  const extra = agent.args || [];
  const workspace = path.resolve(cwd);
  const args = [
    "--mode",
    agent.mode || "accept-edits",
    "--output-format",
    "json",
    "--print-timeout",
    `${printTimeoutSeconds}s`,
    `--log-file=${logs.cliLogPath}`,
    ...(argsAlreadyHave(extra, "--add-dir") ? [] : ["--add-dir", workspace]),
    ...(agent.sandbox === true ? ["--sandbox"] : []),
    ...(skipPermissions && !argsAlreadyHave(extra, "--dangerously-skip-permissions")
      ? ["--dangerously-skip-permissions"]
      : []),
    ...(model && !argsAlreadyHave(extra, "--model") ? ["--model", model] : []),
    ...extra,
    promptArg
  ];
  return {
    args,
    displayArgs: args.map((arg) => arg === promptArg ? "--print=<task prompt>" : arg)
  };
}

function summarize(processResult, logs, payload, error, extras = {}) {
  return {
    agent: "antigravity",
    dryRun: !!processResult.dryRun,
    command: processResult.command,
    args: processResult.args,
    exitCode: processResult.exitCode,
    timedOut: !!processResult.timedOut,
    durationMs: processResult.durationMs,
    logPath: logs.relative(logs.wrapperLogPath),
    cliLogPath: logs.relative(logs.cliLogPath),
    logError: processResult.logError || null,
    ok: extras.ok,
    conversationId: payload?.conversation_id || null,
    message: extras.message ?? payload?.response ?? "",
    usage: payload?.usage || null,
    status: payload?.status || null,
    error: error || null,
    stderr: processResult.stderr?.trim() || null,
    ...extras.fields
  };
}

function classifyFailure({ processResult, payload, cliLog }) {
  if (processResult.timedOut) return processResult.error;
  if (!payload) return processResult.error || "Antigravity returned invalid JSON";
  if (payloadFailed(payload)) {
    return payload.error || processResult.error || "Antigravity returned an error status";
  }

  const blob = `${processResult.stderr || ""}\n${cliLog}`;
  if (isHeadlessPermissionDenied(blob)) {
    return (processResult.stderr || "Headless Antigravity denied a required tool").trim().split(/\r?\n/)[0];
  }

  if (!(payload.response || "").trim()) {
    return "Antigravity completed without a response";
  }
  return null;
}

async function invokeOnce({
  agent,
  command,
  cwd,
  prompt,
  config,
  timeoutMs,
  logs,
  model,
  skipPermissions,
  taskId
}) {
  const { args, displayArgs } = buildArgs({
    agent,
    logs,
    prompt,
    model,
    timeoutMs,
    cwd,
    skipPermissions
  });
  const processResult = await runProcess({
    command,
    args,
    displayArgs,
    cwd: path.resolve(cwd),
    input: config.dryRun ? prompt : "",
    dryRun: config.dryRun,
    timeoutMs,
    maxOutputBytes: config.execution?.maxOutputBytes,
    logPath: logs.wrapperLogPath,
    taskId
  });

  if (processResult.dryRun) {
    return summarize(processResult, logs, null, null, {
      ok: true,
      message: "Antigravity dry-run completed; no CLI process was started.",
      fields: { preview: processResult.preview, model: model || null, skipPermissions: !!skipPermissions }
    });
  }

  const payload = parseOutput(processResult.stdout || "");
  const cliLog = readCliLog(logs.cliLogPath);
  const error = classifyFailure({ processResult, payload, cliLog });
  return summarize(processResult, logs, payload, error, {
    ok: !error && processResult.ok && !!payload,
    fields: { model: model || null, skipPermissions: !!skipPermissions }
  });
}

export async function runAntigravity({ task, prompt, projectPath, config }) {
  const agent = config.agents.antigravity;
  if (!agent?.enabled) return { ok: false, error: "Antigravity agent is disabled" };

  const command = resolveAgentCommand("antigravity", agent.command);
  const cwd = agent.workingDirectory || projectPath || process.cwd();
  const timeoutMs = agent.timeoutMs || config.execution?.timeoutMs || 10 * 60 * 1000;
  const logs = executionLogPaths(task?.id, "antigravity");
  const configuredModel = agent.model || null;
  const permissionMode = agent.permissionMode || "configured";
  const tried = [];
  const attempts = [];
  let model = configuredModel;
  let skipPermissions = permissionMode === "dangerous-bypass";
  let transientTries = 0;
  let result;

  while (true) {
    if (model) tried.push(model);
    result = await invokeOnce({
      agent,
      command,
      cwd,
      prompt,
      config,
      timeoutMs,
      logs,
      model,
      skipPermissions,
      taskId: task?.id
    });
    attempts.push({
      model: model || "(default)",
      skipPermissions,
      ok: result.ok,
      error: result.error
    });
    if (result.ok || result.dryRun || result.timedOut) break;

    const blob = `${result.error || ""}\n${result.stderr || ""}`;
    if (isLocationBlocked(blob) || isLocationBlocked(result.error || "") || isTransientProviderError(blob)) {
      const fallback = nextFallbackModel(tried);
      if (fallback) {
        model = fallback;
        continue;
      }
    }

    if (isTransientProviderError(blob) && transientTries < 2) {
      transientTries += 1;
      await new Promise((resolve) => setTimeout(resolve, 20000));
      continue;
    }

    break;
  }

  result.permissionMode = permissionMode;
  if (attempts.length > 1) result.attempts = attempts;
  return result;
}
