import { existsSync } from "fs";
import { resolveAgentCommand } from "../adapters/resolveCommand.js";
import { workerPolicy } from "../billing/policy.js";
import { WORKERS } from "./ids.js";

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
    claude: binaryStatus("claude", "claude"),
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
