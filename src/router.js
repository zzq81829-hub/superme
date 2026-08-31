import { getTask, updateTask } from "./store.js";
import { runAgent } from "./adapters/runAgent.js";
import { applyCostGuard } from "./workers/costGuard.js";
import { verifyTask } from "./verify/verifyTask.js";
import { describeAcceptanceCriteria } from "./verify/criteria.js";

export function chooseAgent(task) {
  if (task.agent && task.agent !== "auto") return task.agent;

  const text = `${task.title}\n${task.description}`.toLowerCase();
  if (["hermes", "编排", "拆任务", "多agent", "orchestrat"].some((s) => text.includes(s))) return "hermes";
  if (["摘要", "总结", "改写", "分类", "便宜", "summar", "rewrite"].some((s) => text.includes(s))) return "deepseek";
  if (["研究", "search", "调研"].some((s) => text.includes(s))) return "grok";
  if (["review", "审查", "代码审查"].some((s) => text.includes(s))) return "claude";
  if (["架构", "方案", "分析", "检查代码"].some((s) => text.includes(s))) return "codex";
  return "antigravity";
}

export function isWorkerUnavailable(result = {}) {
  return /usage limit|quota|QUOTA_LIMITED|AUTH_REQUIRED|not logged in|PROXY_DOWN|ECONNREFUSED|unrecognized_model|timed out|headless mode cannot prompt|denied a required tool/i
    .test(`${result.error || ""}\n${result.message || ""}\n${result.stderr || ""}`);
}

export async function dispatchTask(taskId, config) {
  const task = getTask(taskId);
  if (!task) throw new Error("Task not found");

  const requested = chooseAgent(task);
  const projectPath = task.projectPath || config.workspaceRoot || process.cwd();
  const guard = applyCostGuard(requested);
  if (!guard.ok) {
    return updateTask(taskId, {
      status: "blocked",
      agentResolved: requested,
      selectionReason: guard.reason,
      error: guard.reason,
      finishedAt: new Date().toISOString()
    });
  }

  let agent = guard.worker;
  updateTask(taskId, {
    status: "running",
    agentResolved: agent,
    selectionReason: guard.reason,
    attemptCount: (task.attemptCount || 0) + 1,
    startedAt: new Date().toISOString()
  });

  let result;
  const skip = [];
  const executionHistory = [...(task.executionHistory || [])];
  const verificationHistory = [...(task.verificationHistory || [])];
  for (;;) {
    const attemptStartedAt = new Date().toISOString();
    try {
      result = await runAgent(agent, task, projectPath, config);
    } catch (error) {
      result = { ok: false, agent, error: error?.stack || String(error) };
    }
    executionHistory.push({
      agent,
      ok: !!result.ok,
      error: result.error || null,
      startedAt: attemptStartedAt,
      finishedAt: new Date().toISOString()
    });
    const unavailable = isWorkerUnavailable(result);
    if (result.ok || !unavailable) break;
    skip.push(agent);
    const fallback = applyCostGuard("auto", undefined, { skip });
    if (!fallback.ok || skip.includes(fallback.worker)) break;
    agent = fallback.worker;
    updateTask(taskId, {
      status: "running",
      agentResolved: agent,
      selectionReason: `${skip.join(",")} unavailable; fallback ${agent}`,
      attemptCount: (getTask(taskId).attemptCount || 1) + skip.length
    });
  }

  updateTask(taskId, { status: "verifying", result, executionHistory });
  let verification = await verifyTask({ projectPath, result, config, task });
  verificationHistory.push({ ...verification, at: new Date().toISOString(), repair: false });

  const maxRepairAttempts = Math.max(0, Math.min(config.execution?.maxRepairAttempts ?? 1, 3));
  let repairAttempt = 0;
  while (!verification.ok && result.ok && repairAttempt < maxRepairAttempts) {
    repairAttempt += 1;
    updateTask(taskId, { status: "repairing" });
    const repairTask = {
      ...task,
      description: `${task.description}\n\nVERIFIER FAILED: ${verification.reason}. Evidence: ${JSON.stringify(verification.checks)}. Fix the smallest issue and retest.`
    };
    const attemptStartedAt = new Date().toISOString();
    try {
      result = await runAgent(agent, repairTask, projectPath, config);
    } catch (error) {
      result = { ok: false, agent, error: error?.stack || String(error) };
    }
    executionHistory.push({
      agent,
      ok: !!result.ok,
      error: result.error || null,
      repair: true,
      startedAt: attemptStartedAt,
      finishedAt: new Date().toISOString()
    });
    verification = await verifyTask({ projectPath, result, config, task });
    verificationHistory.push({ ...verification, at: new Date().toISOString(), repair: true });
  }

  const passed = result.ok && verification.ok;
  return updateTask(taskId, {
    status: passed ? "completed" : result.ok ? "failed" : "failed",
    result: { ...result, verification },
    verification,
    executionHistory,
    verificationHistory,
    error: passed ? null : (verification.ok ? result.error : verification.reason),
    finishedAt: new Date().toISOString()
  });
}

export function buildPrompt(task, projectPath) {
  const acceptance = describeAcceptanceCriteria(task.acceptanceCriteria || []);
  return [
    "You are an execution agent inside AI Founder OS.",
    "",
    `PROJECT PATH: ${projectPath}`,
    `TASK: ${task.title}`,
    "",
    "USER INTENT:",
    task.description,
    ...(acceptance.length ? ["", "MACHINE-VERIFIED ACCEPTANCE CRITERIA:", ...acceptance.map((item, index) => `${index + 1}. ${item}`)] : []),
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
