import { existsSync } from "fs";
import { spawnSync } from "child_process";
import { resolveAgentCommand } from "../adapters/resolveCommand.js";
import { workerPolicy, localAnthropicProxy } from "../billing/policy.js";
import { WORKERS } from "./ids.js";

const readinessCache = new Map();
const READINESS_TTL_MS = 60_000;

function isPortOpen(port, host = "127.0.0.1") {
  const script = `const n=require("net");const s=n.connect(${Number(port)},${JSON.stringify(host)},()=>{s.end();process.exit(0)});s.on("error",()=>process.exit(1));setTimeout(()=>process.exit(1),800);`;
  const r = spawnSync(process.execPath, ["-e", script], { windowsHide: true, timeout: 3000 });
  return r.status === 0;
}

export function probeClaudeSubscription() {
  const proxy = localAnthropicProxy();
  if (proxy) {
    const up = isPortOpen(proxy.port, proxy.host);
    return {
      status: up ? "READY" : "ON_DEMAND",
      available: up,
      experimental: true,
      onDemand: true,
      detail: up ? `founder-approved Antigravity reverse proxy ${proxy.url}` : `PROXY_DOWN ${proxy.url}; start Claude terminal when needed`
    };
  }
  const command = resolveAgentCommand("claude", "claude");
  if (!existsSync(command)) {
    return { status: "OFFLINE", available: false, detail: "claude CLI missing" };
  }
  const r = spawnSync(command, ["auth", "status"], {
    encoding: "utf8",
    timeout: 15000,
    shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(command),
    windowsHide: true
  });
  try {
    const text = `${r.stdout || ""}${r.stderr || ""}`;
    const start = text.indexOf("{");
    const json = JSON.parse(start >= 0 ? text.slice(start) : "{}");
    if (json.authMethod === "api_key" || json.apiKeySource === "ANTHROPIC_API_KEY") {
      return {
        status: "SUBSCRIPTION_UNAVAILABLE",
        available: false,
        detail: "claude auth is API key; subscription login required"
      };
    }
    if (json.loggedIn) return { status: "READY", available: true, detail: json.authMethod || "logged-in" };
  } catch {
    // fall through
  }
  return { status: "AUTH_REQUIRED", available: false, detail: (r.stderr || r.stdout || "not logged in").slice(0, 200) };
}

function binaryStatus(id, commandName) {
  const resolved = resolveAgentCommand(id, commandName);
  const onDisk = existsSync(resolved);
  const policy = workerPolicy(id);
  return {
    id,
    status: onDisk ? "INSTALLED" : "OFFLINE",
    experimental: false,
    required: false,
    billingMode: policy.billing || "subscription",
    apiAllowed: !!policy.api_allowed,
    resolvedCommand: resolved,
    available: onDisk,
    readinessVerified: false,
    detail: onDisk ? "executable found; auth, quota and provider readiness not probed" : "executable missing"
  };
}

function cachedCommandProbe(id, command, args, classify) {
  const cached = readinessCache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const r = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 15000,
    shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(command),
    windowsHide: true,
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" }
  });
  const value = classify(`${r.stdout || ""}\n${r.stderr || ""}`, r.status, r.error);
  readinessCache.set(id, { expiresAt: Date.now() + READINESS_TTL_MS, value });
  return value;
}

export function classifyCodexProbe(text, exitCode = 0, error = null) {
  if (!error && exitCode === 0 && /Logged in using ChatGPT/i.test(text)) {
    return { status: "READY", available: true, readinessVerified: true, detail: "ChatGPT session verified" };
  }
  return { status: "AUTH_REQUIRED", available: false, readinessVerified: true, detail: "Codex ChatGPT login not verified" };
}

export function classifyGrokProbe(text, exitCode = 0, error = null) {
  if (!error && exitCode === 0 && /logged in with grok\.com/i.test(text)) {
    const model = text.match(/Default model:\s*([^\r\n]+)/i)?.[1]?.trim();
    return { status: "READY", available: true, readinessVerified: true, detail: `grok.com session verified${model ? `; ${model}` : ""}` };
  }
  return { status: "AUTH_REQUIRED", available: false, readinessVerified: true, detail: "grok.com session not verified" };
}

export function classifyHermesProbe(text, exitCode = 0, error = null) {
  const provider = /Provider:\s*DeepSeek/i.test(text);
  const configured = /DeepSeek\s+(?:✓|configured)/i.test(text);
  if (!error && exitCode === 0 && provider && configured) {
    return { status: "READY", available: true, readinessVerified: true, detail: "Hermes DeepSeek provider verified" };
  }
  return { status: "PROVIDER_UNVERIFIED", available: false, readinessVerified: true, detail: "Hermes DeepSeek provider not verified" };
}

function applyReadinessProbes(map) {
  if (map.codex.available) {
    Object.assign(map.codex, cachedCommandProbe("codex", map.codex.resolvedCommand, ["login", "status"], classifyCodexProbe));
  }
  if (map.grok.available) {
    const readiness = cachedCommandProbe("grok", map.grok.resolvedCommand, ["models"], classifyGrokProbe);
    Object.assign(map.grok, readiness);
    Object.assign(map["grok-build"], readiness, { detail: `${readiness.detail}; build mode shares grok.exe` });
  }
  if (map.hermes.available) {
    const readiness = cachedCommandProbe("hermes", map.hermes.resolvedCommand, ["status"], classifyHermesProbe);
    Object.assign(map.hermes, readiness);
    Object.assign(map.deepseek, readiness);
  }
  return map;
}

export function workerHealthMap({ probeReadiness = false, config = null } = {}) {
  const hermes = binaryStatus("hermes", "hermes");
  const map = {
    hermes,
    codex: binaryStatus("codex", "codex"),
    claude: { ...binaryStatus("claude", "claude"), ...probeClaudeSubscription(), billingMode: workerPolicy("claude").billing || "subscription", apiAllowed: false },
    antigravity: binaryStatus("antigravity", "agy"),
    "grok-build": binaryStatus("grok-build", "grok"),
    grok: binaryStatus("grok", "grok"),
    "grok-bot": {
      id: "grok-bot",
      status: "UNKNOWN_CONTROL_INTERFACE",
      experimental: true,
      required: false,
      billingMode: "subscription_or_quota",
      apiAllowed: false,
      resolvedCommand: null,
      available: false
    },
    deepseek: {
      id: "deepseek",
      status: hermes.available ? "INSTALLED" : "OFFLINE",
      experimental: false,
      required: false,
      billingMode: "api",
      apiAllowed: true,
      resolvedCommand: hermes.resolvedCommand,
      available: hermes.available,
      readinessVerified: false,
      detail: hermes.available ? "Hermes executable found; DeepSeek provider readiness not probed" : "Hermes executable missing"
    }
  };
  const permissionMode = config?.agents?.antigravity?.permissionMode || "configured";
  if (config && permissionMode !== "dangerous-bypass") {
    map.antigravity = {
      ...map.antigravity,
      status: "HEADLESS_PERMISSION_BLOCKED",
      available: false,
      readinessVerified: true,
      permissionMode,
      detail: "headless tasks that need tools are blocked; explicit dangerous-bypass or Antigravity allow-rules required"
    };
  }
  return probeReadiness ? applyReadinessProbes(map) : map;
}

export function listWorkerHealth(config = null) {
  const map = workerHealthMap({ probeReadiness: true, config });
  return WORKERS.map((id) => {
    const worker = map[id];
    if (id !== "antigravity" || !config) return worker;
    const permissionMode = config.agents?.antigravity?.permissionMode || "configured";
    return {
      ...worker,
      permissionMode,
      securityRisk: permissionMode === "dangerous-bypass" ? "ALL_TOOLS_AUTO_APPROVED" : null
    };
  });
}
