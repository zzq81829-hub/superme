import { getTask, updateTask } from "./store.js";
import { runAgent } from "./adapters/runAgent.js";

export function chooseAgent(task) {
  if (task.agent && task.agent !== "auto") return task.agent;

  const text = `${task.title}\n${task.description}`.toLowerCase();

  // V1 deliberately uses a cheap deterministic router.
  // Later this can be replaced by a smarter policy without burning model tokens.
  const reviewSignals = ["review", "审查", "架构", "方案", "分析", "检查代码"];
  if (reviewSignals.some((s) => text.includes(s))) return "codex";

  return "antigravity";
}

export async function dispatchTask(taskId, config) {
  const task = getTask(taskId);
  if (!task) throw new Error("Task not found");

  const agent = chooseAgent(task);
  const projectPath = task.projectPath || config.workspaceRoot || process.cwd();

  updateTask(taskId, {
    status: "running",
    agentResolved: agent,
    startedAt: new Date().toISOString()
  });

  let result;

  try {
    result = await runAgent(agent, task, projectPath, config);
  } catch (error) {
    result = {
      ok: false,
      agent,
      error: error?.stack || String(error)
    };
  }

  return updateTask(taskId, {
    status: result.ok ? "completed" : "failed",
    result,
    error: result.ok ? null : result.error,
    finishedAt: new Date().toISOString()
  });
}

export function buildPrompt(task, projectPath) {
  return [
    "You are an execution agent inside AI Founder OS.",
    "",
    `PROJECT PATH: ${projectPath}`,
    `TASK: ${task.title}`,
    "",
    "USER INTENT:",
    task.description,
    "",
    "MANDATORY WORKFLOW:",
    "1. Read AGENTS.md and founder_os/ before making changes if those files exist.",
    "2. Inspect the current project state and git status.",
    "3. Do not redesign unrelated parts of the project.",
    "4. Make the smallest complete change that satisfies the task.",
    "5. Run relevant tests/checks after changes.",
    "6. Fix failures you caused before reporting back.",
    "7. Do not publish, purchase, delete external data, or perform irreversible external actions.",
    "8. Return a concise report: changed files, tests, remaining risks, and recommended next step.",
    "",
    "The user's time is more expensive than tokens. Solve routine problems yourself instead of sending them back to the user."
  ].join("\n");
}
