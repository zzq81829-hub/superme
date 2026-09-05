import { getWorker, updateWorker, listWorkers } from "./registry.js";
import { recordWorkerSuccess } from "./statusMachine.js";
import { getQuotaState, markQuotaNormal } from "../workers/quota.js";
import { classifyCodexProbe, classifyGrokProbe } from "../workers/health.js";
import { resolveAgentCommand } from "../adapters/resolveCommand.js";
import { listTasks, updateTask } from "../store.js";
import { spawnSync } from "child_process";
import { restoreCooledDownAccounts } from "./accountPool.js";

/**
 * Rebound Engine (Automatic Worker Recovery & Priority Restoration)
 * Probes cooling-down workers using low-cost / zero-token CLI status checks.
 * When a worker proves recovered, restores its status to AVAILABLE and
 * wakes up tasks in WAITING_FOR_CAPACITY status.
 */

export function probeWorkerLowCost(workerId) {
  if (workerId === "codex") {
    const cmd = resolveAgentCommand("codex", "codex");
    const r = spawnSync(cmd, ["login", "status"], {
      encoding: "utf8",
      timeout: 10000,
      windowsHide: true
    });
    const probe = classifyCodexProbe(`${r.stdout || ""}\n${r.stderr || ""}`, r.status, r.error);
    return probe.available === true;
  }

  if (workerId === "grok" || workerId === "grok-build") {
    const cmd = resolveAgentCommand("grok", "grok");
    const r = spawnSync(cmd, ["models"], {
      encoding: "utf8",
      timeout: 10000,
      windowsHide: true
    });
    const probe = classifyGrokProbe(`${r.stdout || ""}\n${r.stderr || ""}`, r.status, r.error);
    return probe.available === true;
  }

  if (workerId === "antigravity") {
    return true; // Antigravity is included and local
  }

  return false;
}

export function checkAndReboundWorker(workerId, { forceProbe = false, probeImpl = probeWorkerLowCost, options = {} } = {}) {
  const worker = getWorker(workerId, options);
  if (!worker) return { rebounded: false, reason: "worker_not_found" };

  const isEligible = forceProbe || ["COOLDOWN", "EXHAUSTED", "THROTTLED", "ERROR"].includes(worker.status);
  if (!isEligible) {
    return { rebounded: false, status: worker.status, reason: "not_in_cooldown" };
  }

  // Check if probe time reached (or forced)
  const now = Date.now();
  const nextProbe = worker.nextProbeAt ? new Date(worker.nextProbeAt).getTime() : 0;
  if (!forceProbe && nextProbe && now < nextProbe) {
    return { rebounded: false, status: worker.status, nextProbeAt: worker.nextProbeAt, reason: "cooldown_active" };
  }

  // Execute low-cost probe
  updateWorker(workerId, { status: "PROBING" }, options);
  const isHealthy = probeImpl(workerId);

  if (isHealthy) {
    // Worker has recovered!
    recordWorkerSuccess(workerId, options);
    try {
      markQuotaNormal(workerId, options);
    } catch {
      // ignore
    }

    // Wake up any tasks waiting for this worker
    const awakenedCount = wakeWaitingTasks(workerId, options);

    return {
      rebounded: true,
      workerId,
      status: "AVAILABLE",
      awakenedTasks: awakenedCount,
      dispatches: options.dispatches || []
    };
  }

  // Still not healthy, stay in cooldown
  updateWorker(workerId, { status: "COOLDOWN" }, options);
  return {
    rebounded: false,
    workerId,
    status: "COOLDOWN",
    reason: "probe_unsuccessful"
  };
}

export function wakeWaitingTasks(workerId, options = {}) {
  const tasks = listTasks(options) || [];
  let count = 0;
  const awakenedTaskIds = [];

  for (const t of tasks) {
    if (t.status === "waiting_for_capacity") {
      const isTarget = t.targetSeniorWorker === workerId ||
        t.modelNeed?.preferredWorker === workerId ||
        t.agent === workerId;

      if (isTarget) {
        updateTask(t.id, {
          status: "queued",
          agentResolved: workerId,
          selectionReason: `${workerId} 额度与就绪态已恢复回弹 (REBOUND)；自动唤醒并重新派发`,
          updatedAt: new Date().toISOString()
        }, options);
        count += 1;
        awakenedTaskIds.push(t.id);
      }
    }
  }

  // Actively trigger dispatchTask on awakened tasks so they resume execution
  if (options.autoDispatch !== false && awakenedTaskIds.length > 0) {
    const dispatchFn = typeof options.dispatchTask === "function"
      ? options.dispatchTask
      : (id, cfg) => import("../router.js").then((mod) => mod.dispatchTask(id, cfg));

    const dispatches = awakenedTaskIds.map((taskId) => {
      try {
        return Promise.resolve(dispatchFn(taskId, options.config || {})).catch((err) => {
          return { ok: false, taskId, error: err?.message };
        });
      } catch (err) {
        return Promise.resolve({ ok: false, taskId, error: err?.message });
      }
    });

    if (options && typeof options === "object") {
      options.dispatches = dispatches;
    }
    wakeWaitingTasks.lastDispatches = dispatches;
  }

  return count;
}

export function scanAllRebounds(options = {}) {
  restoreCooledDownAccounts(options);
  const workers = listWorkers(options);
  const results = [];
  for (const w of workers) {
    if (["COOLDOWN", "EXHAUSTED", "THROTTLED"].includes(w.status)) {
      results.push(checkAndReboundWorker(w.id, { options }));
    }
  }
  return results;
}
