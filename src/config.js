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
    execution: { ...defaults.execution, ...saved.execution },
    agents: {
      codex: { ...defaults.agents.codex, ...saved.agents?.codex },
      antigravity: { ...defaults.agents.antigravity, ...saved.agents?.antigravity },
      grok: { enabled: false, command: "grok", ...(saved.agents?.grok || {}) }
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

  return config;
}
