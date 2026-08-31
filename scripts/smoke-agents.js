import { loadConfig } from "../src/config.js";
import { runCodex } from "../src/adapters/codex.js";
import { runAntigravity } from "../src/adapters/antigravity.js";

const agentName = process.argv[2];
if (!["codex", "antigravity"].includes(agentName)) {
  console.error("Usage: node scripts/smoke-agents.js <codex|antigravity>");
  process.exit(2);
}

const baseConfig = loadConfig();
const config = {
  ...baseConfig,
  dryRun: false,
  agents: {
    codex: { ...baseConfig.agents.codex, sandbox: "read-only" },
    antigravity: { ...baseConfig.agents.antigravity, mode: "plan", sandbox: true }
  }
};
const task = { id: `smoke-${agentName}` };
const prompt = agentName === "codex"
  ? "Reply with exactly CODEX_ADAPTER_OK and do not use tools."
  : "Reply with exactly ANTIGRAVITY_ADAPTER_OK and do not use tools.";

const result = agentName === "codex"
  ? await runCodex({ task, prompt, projectPath: process.cwd(), config })
  : await runAntigravity({ task, prompt, projectPath: process.cwd(), config });

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
