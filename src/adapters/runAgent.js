import { runCodex } from "./codex.js";
import { runAntigravity } from "./antigravity.js";
import { runClaude } from "./claude.js";
import { runGrokBuild } from "./grokBuild.js";
import { sendTask as runHermes } from "../integrations/hermes/bridge.js";

function projectPathOf(task, project, config) {
  return project || task?.projectPath || config?.workspaceRoot || process.cwd();
}

export async function runAgent(agent, task, project, config) {
  const projectPath = projectPathOf(task, project, config);
  const { buildPrompt } = await import("../router.js");
  const prompt = buildPrompt(task, projectPath);

  if (agent === "codex") return runCodex({ task, prompt, projectPath, config });
  if (agent === "antigravity") return runAntigravity({ task, prompt, projectPath, config });
  if (agent === "claude") return runClaude({ task, prompt, projectPath, config });
  if (agent === "grok-build") return runGrokBuild({ task, prompt, projectPath, config, researchOnly: false });
  if (agent === "grok") return runGrokBuild({ task, prompt, projectPath, config, researchOnly: true });
  if (agent === "hermes" || agent === "deepseek") {
    return runHermes({ instruction: prompt, projectPath, config, taskId: task?.id || "hermes", agent });
  }
  if (agent === "grok-bot") {
    return {
      ok: false,
      agent: "grok-bot",
      error: "EXPERIMENTAL / UNKNOWN_CONTROL_INTERFACE"
    };
  }
  return {
    ok: false,
    agent,
    error: `Unknown agent: ${agent}`
  };
}
