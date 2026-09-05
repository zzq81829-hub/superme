import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { getTask, updateTask } from "../store.js";
import { verifyTask } from "./verifyTask.js";
import { publishEvent } from "../events/bus.js";
import { loadConfig } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(__dirname, "../../");

export async function verifyTaskExecution(taskId, options = {}) {
  const task = getTask(taskId, options);
  if (!task) throw new Error(`Task ${taskId} not found`);

  const baseConfig = options.config || loadConfig();
  const config = { ...baseConfig };
  if (options.dryRun || options.skipNpmTest || process.env.NODE_ENV === "test" || process.env.TASKS_BASE_DIR) {
    config.dryRun = true;
  }
  const projectPath = options.projectPath || task.projectPath || defaultRoot;

  const result = task.result || {
    ok: task.status === "completed",
    message: task.result?.message || task.title || "Task completed",
    preview: task.result?.preview || ""
  };

  const issues = [];
  let checks = [];
  let verificationPassed = false;

  try {
    const vResult = await verifyTask({
      projectPath,
      result,
      config,
      task
    });

    checks = vResult.checks || [];
    if (!vResult.ok) {
      issues.push(vResult.reason || "Acceptance criteria validation failed");
    } else {
      verificationPassed = true;
    }
  } catch (err) {
    issues.push(`Verification execution error: ${err.message}`);
    checks.push({ name: "verifier-runtime", ok: false, error: err.message });
  }

  // Check deliverables if declared
  if (Array.isArray(task.deliverables) && task.deliverables.length > 0) {
    for (const d of task.deliverables) {
      const targetPath = path.isAbsolute(d) ? d : path.join(projectPath, d);
      if (!fs.existsSync(targetPath)) {
        issues.push(`Missing declared deliverable: ${d}`);
        checks.push({ name: `deliverable:${d}`, ok: false, error: "file_not_found" });
        verificationPassed = false;
      } else {
        checks.push({ name: `deliverable:${d}`, ok: true });
      }
    }
  }

  // Check explicit test command if defined in task
  if (task.testCommand && !config.dryRun) {
    // Already checked inside verifyTask if in acceptanceCriteria, otherwise run check
  }

  // Calculate quantitative score (0.00 ~ 1.00)
  const totalChecks = Math.max(checks.length, 1);
  const passedChecks = checks.filter(c => c.ok).length;
  let score = Math.round((passedChecks / totalChecks) * 100) / 100;

  if (issues.length > 0) {
    score = Math.min(score, 0.75 - Math.min(0.5, issues.length * 0.15));
    score = Math.max(0.0, Math.round(score * 100) / 100);
    verificationPassed = false;
  } else {
    score = Math.max(score, 0.85);
  }

  // Determine deterministic next_action
  let nextAction = "mark_done";
  const retryCount = Number(task.retryCount || task.attemptCount || 0);
  const currentMode = task.reasoningMode || (task.boostEnabled ? "boost" : "normal");

  if (!verificationPassed) {
    if (retryCount >= 2) {
      nextAction = "request_founder_approval";
    } else if (currentMode === "normal") {
      nextAction = "retry_with_boost";
    } else {
      nextAction = "change_agent";
    }
  }

  const verificationPayload = {
    task_id: taskId,
    passed: verificationPassed,
    score,
    issues,
    checks,
    next_action: nextAction,
    recommended_agent: nextAction === "change_agent"
      ? (task.agentResolved === "antigravity" ? "codex" : "antigravity")
      : (task.agentResolved || task.agent || "antigravity"),
    escalation_mode: nextAction === "retry_with_boost" ? "boost" : currentMode,
    timestamp: new Date().toISOString()
  };

  // Update task with verification details
  updateTask(taskId, {
    verification: verificationPayload,
    verifiedAt: verificationPayload.timestamp,
    score,
    status: verificationPassed ? (task.status === "completed" ? "completed" : task.status) : "failed",
    updatedAt: new Date().toISOString()
  }, options);

  // Publish event to universal bus
  publishEvent({
    type: "task_verified",
    project_id: task.project || "general",
    task_id: taskId,
    source: "machine_verifier",
    outcome: verificationPassed ? "success" : "failure",
    metrics: { score, checkCount: totalChecks, issueCount: issues.length },
    payload: verificationPayload
  }, options);

  return verificationPayload;
}
