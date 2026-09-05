import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { loadConfig } from "../config.js";
import { pathWithCommandDir } from "./resolveCommand.js";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

const activeProcesses = new Map(); // taskId -> { child, finish, startedAt }

export function isTaskProcessRunning(taskId) {
  return !!taskId && activeProcesses.has(String(taskId));
}

export function abortTaskProcess(taskId, reason = "Task stopped by user") {
  if (!taskId) return false;
  const key = String(taskId);
  const record = activeProcesses.get(key);
  if (!record) return false;

  const { child, finish } = record;
  activeProcesses.delete(key);

  if (child && !child.killed && child.pid) {
    if (process.platform === "win32") {
      try {
        spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
      } catch {}
    }
    try {
      child.kill("SIGTERM");
    } catch {}
    try {
      child.kill("SIGKILL");
    } catch {}
  }

  finish({ signal: "SIGTERM", cancelled: true, spawnError: new Error(reason) });
  return true;
}

function collectOutput(maxBytes) {
  const chunks = [];
  let bytes = 0;
  let truncated = false;

  return {
    add(chunk) {
      const buffer = Buffer.from(chunk);
      const remaining = Math.max(0, maxBytes - bytes);
      if (remaining > 0) chunks.push(buffer.subarray(0, remaining));
      bytes += Math.min(buffer.length, remaining);
      if (buffer.length > remaining) truncated = true;
    },
    value() {
      const text = Buffer.concat(chunks).toString("utf8");
      return truncated ? `${text}\n[output truncated at ${maxBytes} bytes]` : text;
    },
    get truncated() {
      return truncated;
    }
  };
}

function saveLog(logPath, record) {
  if (!logPath) return null;
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    return null;
  } catch (error) {
    return `Failed to write execution log: ${error.message}`;
  }
}

function isDirectory(directory) {
  try {
    return !!directory && fs.statSync(directory).isDirectory();
  } catch {
    return false;
  }
}

function baseRecord({ command, displayArgs, cwd, dryRun, timeoutMs, startedAt }) {
  return {
    startedAt,
    command,
    args: displayArgs,
    cwd,
    dryRun,
    timeoutMs
  };
}

let _proxyUrl = null;
function resolvedProxyUrl() {
  if (_proxyUrl === null) {
    try {
      const cfg = loadConfig();
      const p = cfg.proxy || {};
      _proxyUrl = p.enabled === false ? "" : String(p.url || "http://127.0.0.1:7890").trim();
    } catch {
      _proxyUrl = "";
    }
  }
  return _proxyUrl;
}

// CLI workers (agy/grok/codex) read HTTP_PROXY/HTTPS_PROXY env vars, not the
// Windows system proxy. Inject the configured proxy so they can reach their
// cloud backends from network environments where direct access is blocked.
function withProxyEnv(baseEnv) {
  if (baseEnv.HTTP_PROXY || baseEnv.HTTPS_PROXY) return baseEnv;
  const url = resolvedProxyUrl();
  if (!url) return baseEnv;
  return { ...baseEnv, HTTP_PROXY: url, HTTPS_PROXY: url, http_proxy: url, https_proxy: url };
}

export function runProcess({
  command,
  args = [],
  displayArgs = args,
  cwd,
  input = "",
  dryRun = true,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
  logPath = "",
  env,
  taskId
}) {
  const startedAt = new Date().toISOString();
  const normalizedTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? Math.floor(timeoutMs)
    : DEFAULT_TIMEOUT_MS;
  const normalizedMaxOutput = Number.isFinite(maxOutputBytes) && maxOutputBytes > 0
    ? Math.floor(maxOutputBytes)
    : DEFAULT_MAX_OUTPUT_BYTES;
  const base = baseRecord({
    command,
    displayArgs,
    cwd,
    dryRun,
    timeoutMs: normalizedTimeout,
    startedAt
  });

  if (!command || typeof command !== "string") {
    const result = { ok: false, error: "CLI command is not configured", stdout: "", stderr: "" };
    const logError = saveLog(logPath, { ...base, ...result, finishedAt: new Date().toISOString() });
    return Promise.resolve({ ...result, logPath: logPath || null, logError });
  }

  if (!isDirectory(cwd)) {
    const result = { ok: false, error: `Working directory does not exist: ${cwd}`, stdout: "", stderr: "" };
    const logError = saveLog(logPath, { ...base, ...result, finishedAt: new Date().toISOString() });
    return Promise.resolve({ ...result, logPath: logPath || null, logError });
  }

  if (dryRun) {
    const result = {
      ok: true,
      dryRun: true,
      command,
      args: displayArgs,
      cwd,
      preview: input.slice(0, 4000),
      stdout: "",
      stderr: "",
      exitCode: null,
      timedOut: false,
      durationMs: 0,
      logPath: logPath || null
    };
    const logError = saveLog(logPath, { ...base, ...result, finishedAt: new Date().toISOString() });
    return Promise.resolve({ ...result, logError });
  }

  return new Promise((resolve) => {
    const started = Date.now();
    const stdoutCollector = collectOutput(normalizedMaxOutput);
    const stderrCollector = collectOutput(normalizedMaxOutput);
    let child;
    let settled = false;
    let timedOut = false;
    let timer;
    let killFallback;

    const finish = ({ exitCode = null, signal = null, spawnError = null, cancelled = false } = {}) => {
      if (settled) return;
      settled = true;
      if (taskId) activeProcesses.delete(String(taskId));
      if (timer) clearTimeout(timer);
      if (killFallback) clearTimeout(killFallback);

      const stdout = stdoutCollector.value();
      const stderr = stderrCollector.value();
      const durationMs = Date.now() - started;
      const error = cancelled
        ? (spawnError?.message || "Task stopped by user")
        : spawnError
          ? spawnError.message
          : timedOut
            ? `Process timed out after ${normalizedTimeout}ms`
            : exitCode === 0
              ? null
              : `Process exited with code ${exitCode}${signal ? ` (${signal})` : ""}`;
      const result = {
        ok: !error && !cancelled,
        command,
        args: displayArgs,
        cwd,
        exitCode,
        signal,
        timedOut,
        cancelled: !!cancelled,
        durationMs,
        stdout,
        stderr,
        stdoutTruncated: stdoutCollector.truncated,
        stderrTruncated: stderrCollector.truncated,
        error,
        logPath: logPath || null
      };

      const logError = saveLog(logPath, {
        ...base,
        ...result,
        finishedAt: new Date().toISOString()
      });
      resolve({ ...result, logError });
    };

    try {
      const useShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(command);
      child = spawn(command, args, {
        cwd,
        env: pathWithCommandDir(command, withProxyEnv(env || process.env)),
        shell: useShell,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"]
      });

      if (taskId) {
        activeProcesses.set(String(taskId), { child, finish, startedAt: started });
      }
    } catch (error) {
      finish({ spawnError: error });
      return;
    }

    child.stdout.on("data", (chunk) => stdoutCollector.add(chunk));
    child.stderr.on("data", (chunk) => stderrCollector.add(chunk));
    child.stdin.on("error", () => {});
    child.on("error", (error) => finish({ spawnError: error }));
    child.on("close", (code, signal) => finish({ exitCode: code, signal }));

    timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      killFallback = setTimeout(() => {
        child.kill("SIGKILL");
        finish({ signal: "timeout" });
      }, 5000);
      killFallback.unref?.();
    }, normalizedTimeout);
    timer.unref?.();

    if (input) child.stdin.write(input);
    child.stdin.end();
  });
}
