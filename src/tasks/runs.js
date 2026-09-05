import { getTask, updateTask, listTasks } from "../store.js";
import { abortTaskProcess } from "../adapters/processRunner.js";
import { computePayloadHash } from "./risk.js";
import { dispatchTask } from "../router.js";

export function determineRunStep(task) {
  if (!task) return "Idle";
  if (task.status === "queued") return "Queued (Waiting to dispatch)";
  if (task.status === "paused") return "Paused in queue";
  if (task.status === "running") return `Executing with ${task.agentResolved || task.agent || "worker"}`;
  if (task.status === "verifying") return "Running machine acceptance tests";
  if (task.status === "repairing") return `Auto-repairing (Attempt ${task.attemptCount || 1})`;
  if (task.status === "cancelling") return "Stopping process...";
  if (task.status === "cancelled") return "Cancelled";
  if (task.status === "awaiting_approval") return `Awaiting approval: ${(task.riskReasons || []).join(", ") || "High Risk"}`;
  if (task.status === "completed") return "Completed and verified";
  if (task.status === "failed") return task.error ? `Failed: ${task.error}` : "Failed";
  if (task.status === "blocked") return `Blocked: ${task.error || "cost guard"}`;
  if (task.status === "waiting_for_capacity") return `Waiting for capacity: ${task.targetSeniorWorker || "worker"}`;
  return "Draft";
}

export function formatRun(task) {
  if (!task) return null;
  const durationMs = task.result?.durationMs || (task.startedAt && task.finishedAt
    ? new Date(task.finishedAt).getTime() - new Date(task.startedAt).getTime()
    : (task.startedAt ? Date.now() - new Date(task.startedAt).getTime() : null));

  return {
    id: task.id,
    runId: task.id,
    taskId: task.id,
    title: task.title,
    agent: task.agentResolved || task.agent || "auto",
    reasoningMode: task.reasoningMode || (task.boostEnabled ? "boost" : "normal"),
    status: task.status,
    step: determineRunStep(task),
    startedAt: task.startedAt || null,
    updatedAt: task.updatedAt || task.createdAt || null,
    finishedAt: task.finishedAt || null,
    durationMs: durationMs ? Math.max(0, Math.round(durationMs)) : null,
    latestMessage: task.result?.message || task.error || null,
    selectionReason: task.selectionReason || null,
    costEstimate: task.result?.costEstimate ?? task.costEstimate ?? 0
  };
}

export function getRunStatus(runId, options = {}) {
  const task = getTask(runId, options);
  if (!task) return null;
  return formatRun(task);
}

export function pauseRun(runId, options = {}) {
  const task = getTask(runId, options);
  if (!task) throw new Error(`Run ${runId} not found`);

  if (task.status !== "queued") {
    if (task.status === "running") {
      throw new Error("Running executions cannot be paused directly; use cancel/stop instead");
    }
    throw new Error(`Cannot pause run in '${task.status}' state`);
  }

  const updated = updateTask(task.id, {
    status: "paused",
    updatedAt: new Date().toISOString()
  }, options);

  return {
    ok: true,
    run: formatRun(updated),
    message: `Run ${runId} paused successfully`
  };
}

export function resumeRun(runId, options = {}) {
  const task = getTask(runId, options);
  if (!task) throw new Error(`Run ${runId} not found`);

  if (!["paused", "draft", "awaiting_approval"].includes(task.status)) {
    throw new Error(`Cannot resume run in '${task.status}' state`);
  }

  const currentHash = computePayloadHash(task);
  if (task.riskLevel === "high" && (task.approvalStatus !== "approved" || task.approvedHash !== currentHash)) {
    throw new Error("Cannot resume unapproved high-risk task; approve it first");
  }

  const updated = updateTask(task.id, {
    status: "queued",
    updatedAt: new Date().toISOString()
  }, options);

  if (options.autoDispatch !== false) {
    const dispatchFn = options.dispatchTask || dispatchTask;
    dispatchFn(task.id, options.config || {}).catch((error) => {
      updateTask(task.id, {
        status: "failed",
        error: error?.stack || String(error),
        finishedAt: new Date().toISOString()
      }, options);
    });
  }

  return {
    ok: true,
    run: formatRun(updated),
    message: `Run ${runId} resumed and queued for dispatch`
  };
}

export function cancelRun(runId, reason = "Cancelled by user/operator", options = {}) {
  const task = getTask(runId, options);
  if (!task) throw new Error(`Run ${runId} not found`);

  if (!["queued", "running", "verifying", "repairing", "waiting_for_capacity"].includes(task.status)) {
    throw new Error(`Run is not active (current status: ${task.status})`);
  }

  updateTask(task.id, { status: "cancelling" }, options);
  abortTaskProcess(task.id, reason);

  const updated = updateTask(task.id, {
    status: "cancelled",
    finishedAt: new Date().toISOString(),
    error: reason,
    updatedAt: new Date().toISOString()
  }, options);

  return {
    ok: true,
    run: formatRun(updated),
    message: `Run ${runId} cancelled successfully: ${reason}`
  };
}
