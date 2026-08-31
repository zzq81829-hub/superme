import { existsSync } from "fs";
import { spawnSync } from "child_process";
import { resolveAgentCommand } from "../adapters/resolveCommand.js";
import { workerPolicy } from "../billing/policy.js";
import { WORKERS } from "./ids.js";

export function probeClaudeSubscription() {
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
    if (json.loggedIn) return { status: "ONLINE", available: true, detail: json.authMethod || "logged-in" };
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
    status: onDisk ? "ONLINE" : "OFFLINE",
    experimental: false,
    required: false,
    billingMode: policy.billing || "subscription",
    apiAllowed: !!policy.api_allowed,
    resolvedCommand: resolved,
    available: onDisk
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
      status: hermes.available ? "ONLINE" : "OFFLINE",
      experimental: false,
      required: false,
      billingMode: "api",
      apiAllowed: true,
      resolvedCommand: hermes.resolvedCommand,
      available: hermes.available
    }
  };
}

export function listWorkerHealth() {
  const map = workerHealthMap();
  return WORKERS.map((id) => map[id]);
}
