import { existsSync } from "fs";
import { spawnSync } from "child_process";
import { resolveAgentCommand } from "../adapters/resolveCommand.js";
import { workerPolicy, localAnthropicProxy } from "../billing/policy.js";
import { WORKERS } from "./ids.js";

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

export function workerHealthMap() {
  const hermes = binaryStatus("hermes", "hermes");
  return {
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
}

export function listWorkerHealth(config = null) {
  const map = workerHealthMap();
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
