import { runCodex } from "./codex.js";
import { runAntigravity } from "./antigravity.js";

function projectPathOf(task, project, config) {
  return project || task?.projectPath || config?.workspaceRoot || process.cwd();
}

export async function runAgent(agent, task, project, config) {
  const projectPath = projectPathOf(task, project, config);
  const { buildPrompt } = await import("../router.js");
  const prompt = buildPrompt(task, projectPath);

  if (agent === "codex") {
    return runCodex({ task, prompt, projectPath, config });
  }
  if (agent === "antigravity") {
    return runAntigravity({ task, prompt, projectPath, config });
  }
  if (agent === "grok") {
    return {
      ok: false,
      agent: "grok",
      error: "Grok adapter is not enabled in V1"
    };
  }
  return {
    ok: false,
    agent,
    error: `Unknown agent: ${agent}`
  };
}
