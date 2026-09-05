import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

export function loadConfig() {
  const configPath = path.join(root, "config.json");
  const examplePath = path.join(root, "config.example.json");

  if (!fs.existsSync(configPath)) {
    fs.copyFileSync(examplePath, configPath);
  }

  const defaults = JSON.parse(fs.readFileSync(examplePath, "utf8"));
  const saved = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const config = {
    ...defaults,
    ...saved,
    port: process.env.AI_FOUNDER_OS_PORT ? Number(process.env.AI_FOUNDER_OS_PORT) : saved.port || defaults.port,
    dryRun: process.env.AI_FOUNDER_OS_DRY_RUN === "true" ? true : saved.dryRun ?? defaults.dryRun,
    host: process.env.AI_FOUNDER_OS_HOST?.trim() || saved.host || defaults.host,
    execution: { ...defaults.execution, ...saved.execution },
    computerAccess: { ...defaults.computerAccess, ...saved.computerAccess },
    proxy: { enabled: true, url: "http://127.0.0.1:7890", ...(defaults.proxy || {}), ...(saved.proxy || {}) },
    agents: {
      hermes: {
        enabled: true,
        command: "hermes",
        provider: "deepseek",
        model: "deepseek-v4-pro",
        modelReasoningEffort: "high",
        ...(saved.agents?.hermes || {})
      },
      codex: { ...defaults.agents.codex, ...saved.agents?.codex },
      claude: { enabled: true, command: "claude", ...(saved.agents?.claude || {}) },
      antigravity: {
        boost: true,
        effort: "high",
        ...defaults.agents.antigravity,
        ...saved.agents?.antigravity
      },
      grokBuild: { enabled: true, command: "grok", ...(saved.agents?.grokBuild || {}) },
      grok: { enabled: true, command: "grok", ...(saved.agents?.grok || {}) },
      grokBot: { enabled: true, command: "grok", timeoutMs: 180000, ...(saved.agents?.grokBot || {}) },
      deepseek: { enabled: true, command: "hermes", ...(saved.agents?.deepseek || {}) }
    },
    bridge: {
      enabled: true,
      token: "change-me",
      allowedOrigins: ["https://chatgpt.com", "https://chat.openai.com"],
      ...(saved.bridge || {})
    }
  };

  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error(`Invalid config port: ${config.port}`);
  }
  if (typeof config.host !== "string" || !config.host.trim()) {
    throw new Error("config.host must be a non-empty string");
  }
  if (typeof config.dryRun !== "boolean") {
    throw new Error("config.dryRun must be true or false");
  }
  if (!["configured", "dangerous-bypass"].includes(config.agents.antigravity.permissionMode || "configured")) {
    throw new Error("agents.antigravity.permissionMode must be configured or dangerous-bypass");
  }

  return config;
}
