import express from "express";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { loadConfig } from "./src/config.js";
import {
  createTask,
  listTasks,
  getTask,
  updateTask,
  moveTaskToTrash,
  listTrashTasks,
  getTrashTask,
  restoreTaskFromTrash,
  deleteTaskPermanently,
  clearTrash,
  applyTaskRetention
} from "./src/store.js";
import {
  createCandidate,
  listCandidates,
  getMemory,
  confirmCandidate,
  rejectCandidate,
  listActive,
  proposeUpdate
} from "./src/memory/store.js";
import { dispatchTask } from "./src/router.js";
import { resolveAgentCommand } from "./src/adapters/resolveCommand.js";
import { listWorkerHealth } from "./src/workers/health.js";
import { getQuotaState, setQuotaOverride } from "./src/workers/quota.js";
import { normalizeAcceptanceCriteria } from "./src/verify/criteria.js";
import { abortTaskProcess } from "./src/adapters/processRunner.js";
import { computePayloadHash } from "./src/tasks/risk.js";
import {
  getBudgetSummary,
  listAlerts,
  acknowledgeAlert,
  addFounderTopup
} from "./src/billing/deepseekBudget.js";
import {
  createPackage,
  getPackage,
  listPackages,
  updatePackage,
  freezePackage,
  approvePackage,
  rejectPackage,
  markReadyManual,
  generatePackagePreview
} from "./src/content/store.js";
import { listXiaohongshuLayoutTemplates } from "./src/content/xiaohongshuLayout.js";
import { extractFromTranscript } from "./src/memory/extractFromTranscript.js";
import { probeGrokBot } from "./src/secretary/probeGrokBot.js";
import { receiveMessage, listInbox, acceptMessage, rejectMessage } from "./src/secretary/inbox.js";
import { openHermesUI } from "./src/integrations/hermes/launcher.js";
import { getBrief, updateBrief, updateHermesBrief } from "./src/briefs/store.js";
import { extractBriefHighlights } from "./src/briefs/extract.js";
import { listReviews, addReview } from "./src/reviews/store.js";
import { defaultComputerRoots, listSafeComputerFiles, readSafeComputerText } from "./src/access/computerRead.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = loadConfig();
const app = express();
const version = "1.0.0";
const phoneAccessToken = process.env.AI_FOUNDER_OS_PHONE_TOKEN?.trim() || "";

app.use(express.json({ limit: "1mb" }));
if (phoneAccessToken) {
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api/")) return next();
    if (req.get("X-OS-Phone-Token") !== phoneAccessToken) {
      return res.status(401).json({ error: "手机访问口令无效或已过期" });
    }
    return next();
  });
}
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", async (_req, res) => {
  const workers = listWorkerHealth(config);
  const hermesWorker = workers.find((w) => w.id === "hermes") || {};
  const secretaryProbe = probeGrokBot();
  res.json({
    ok: true,
    version,
    dryRun: config.dryRun,
    controlPlane: "local",
    secretary: { id: "grok-bot", role: "Personal Secretary / Persona Interface", ...secretaryProbe },
    coo: { id: "hermes", status: hermesWorker.status || "READY", role: "COO / Orchestrator", ...hermesWorker },
    ceo: { name: "Local Control Center", role: "AI CEO / Control Plane", status: "READY", cooStatus: hermesWorker.status || "READY" },
    workers,
    computerReadAccess: { enabled: config.computerAccess?.enabled !== false, roots: Object.keys(defaultComputerRoots()), privacyAndMoneyFiltered: true },
    agents: Object.fromEntries(
      Object.entries(config.agents).map(([k, v]) => [k, {
        enabled: !!v.enabled,
        command: v.command,
        resolvedCommand: resolveAgentCommand(k === "grokBuild" ? "grok-build" : k, v.command),
        model: v.model || null
      }])
    )
  });
});

app.get("/api/computer/files", (req, res) => {
  try {
    if (config.computerAccess?.enabled === false) return res.status(403).json({ error: "Computer reading is disabled" });
    res.json({ files: listSafeComputerFiles({ rootName: req.query.root, query: req.query.query }) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/computer/read", (req, res) => {
  try {
    if (config.computerAccess?.enabled === false) return res.status(403).json({ error: "Computer reading is disabled" });
    res.json({ content: readSafeComputerText({ rootName: req.query.root, relativePath: req.query.path }) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/workers", (_req, res) => res.json(listWorkerHealth(config)));

app.get("/api/workers/board", (_req, res) => {
  const workers = listWorkerHealth(config);
  const quotaState = getQuotaState();
  const tasks = listTasks();

  const board = workers.map((worker) => {
    const quota = quotaState[worker.id] || null;
    const active = tasks.find((t) => t.agentResolved === worker.id && ["queued", "running", "verifying", "repairing", "cancelling"].includes(t.status));
    const lastDone = tasks.find((t) => t.agentResolved === worker.id && ["completed", "failed"].includes(t.status));
    return {
      id: worker.id,
      status: worker.status,
      available: worker.available,
      billingMode: worker.billingMode,
      quota,
      working: active ? { id: active.id, title: active.title, status: active.status, startedAt: active.startedAt } : null,
      lastFinished: lastDone ? { id: lastDone.id, title: lastDone.title, status: lastDone.status, finishedAt: lastDone.finishedAt } : null
    };
  });

  res.json({ ok: true, workers: board });
});

app.post("/api/workers/:id/quota", (req, res) => {
  const { status, reason } = req.body || {};
  const allowed = ["unknown", "normal", "exhausted"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: "status must be one of: unknown, normal, exhausted" });
  }
  try {
    const record = setQuotaOverride(req.params.id, status, reason);
    res.json({ ok: true, worker: req.params.id, quota: record });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/tools", async (_req, res) => {
  const { listLocalTools } = await import("./src/tools/localTools.js");
  res.json(listLocalTools());
});

app.get("/api/hermes/status", (_req, res) => {
  res.json(listWorkerHealth(config).find((w) => w.id === "hermes") || { status: "OFFLINE" });
});

app.post("/api/hermes/open", (_req, res) => {
  try {
    const launched = openHermesUI(config);
    res.status(202).json({
      ...launched,
      message: "Hermes Desktop client opened on this computer."
    });
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

app.get("/api/runs/status", (_req, res) => {
  const tasks = listTasks();
  const activeTask = tasks.find((t) => ["queued", "running", "verifying", "repairing", "cancelling"].includes(t.status));
  const latestFinished = tasks.find((t) => ["completed", "failed", "cancelled", "blocked"].includes(t.status));

  let hermesStatus = "IDLE";
  if (activeTask) {
    hermesStatus = "RUNNING";
  } else if (latestFinished) {
    hermesStatus = latestFinished.status === "completed" ? "COMPLETED" : "FAILED";
  }

  function determineStep(t) {
    if (!t) return "Idle";
    if (t.status === "queued") return "Queued (Waiting to dispatch)";
    if (t.status === "paused") return "Paused in queue";
    if (t.status === "running") return `Executing with ${t.agentResolved || t.agent}`;
    if (t.status === "verifying") return "Running machine acceptance tests";
    if (t.status === "repairing") return `Auto-repairing (Attempt ${t.attemptCount || 1})`;
    if (t.status === "cancelling") return "Stopping process...";
    if (t.status === "cancelled") return "Cancelled by user";
    if (t.status === "awaiting_approval") return `Awaiting approval: ${(t.riskReasons || []).join(", ") || "High Risk"}`;
    if (t.status === "completed") return "Completed and verified";
    if (t.status === "failed") return t.error ? `Failed: ${t.error}` : "Failed";
    if (t.status === "blocked") return `Blocked: ${t.error || "cost guard"}`;
    return "Draft";
  }

  function formatRun(t) {
    if (!t) return null;
    const durationMs = t.result?.durationMs || (t.startedAt && t.finishedAt ? new Date(t.finishedAt).getTime() - new Date(t.startedAt).getTime() : null);
    return {
      id: t.id,
      title: t.title,
      agent: t.agentResolved || t.agent || "auto",
      status: t.status,
      step: determineStep(t),
      startedAt: t.startedAt,
      updatedAt: t.updatedAt || t.createdAt,
      finishedAt: t.finishedAt,
      durationMs,
      latestMessage: t.result?.message || t.error || null,
      selectionReason: t.selectionReason || null
    };
  }

  res.json({
    hermesStatus,
    currentRun: formatRun(activeTask),
    latestRun: formatRun(latestFinished),
    runs: tasks.slice(0, 10).map(formatRun)
  });
});

app.get("/api/tasks", (_req, res) => res.json(listTasks()));

app.get("/api/approvals", (_req, res) => {
  const pendingTasks = listTasks().filter(
    (t) => t.approvalStatus === "pending" || t.status === "awaiting_approval"
  );
  const pendingPackages = listPackages()
    .filter((p) => p.approvalStatus === "pending" || p.status === "awaiting_approval")
    .map((p) => ({
      id: p.id,
      title: `[发布包] ${p.title || p.id} (${p.platform})`,
      description: p.body,
      approvalType: "publish_package",
      riskLevel: "high",
      riskReasons: [`待审批对外发布包 · 平台: ${p.platform}`],
      agent: "founder",
      selectionPreview: {
        resolved: "manual_founder",
        quotaType: "none",
        reason: "冻结发布包待创始人审批",
        workflow: ["1. 事实与表达归集", "2. 观点许可校验", "3. 冻结哈希锁定", "4. 创始人审批"]
      },
      status: p.status,
      approvalStatus: p.approvalStatus,
      createdAt: p.createdAt
    }));
  res.json([...pendingTasks, ...pendingPackages]);
});

app.get("/api/tasks/:id", (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json(task);
});

function openLocalPath(targetPath) {
  if (process.platform !== "win32") throw new Error("Local artifact opening is currently available on Windows only");
  if (!targetPath || !fs.existsSync(targetPath)) throw new Error("Artifact no longer exists");
  const child = spawn("explorer.exe", [targetPath], { detached: true, stdio: "ignore", windowsHide: false, shell: false });
  child.unref();
}

app.post("/api/tasks/:id/artifacts/:index/open", (req, res) => {
  try {
    const task = getTask(req.params.id) || getTrashTask(req.params.id);
    const artifact = task?.deliverables?.artifacts?.[Number(req.params.index)];
    if (!artifact?.path) return res.status(404).json({ error: "Artifact not found" });
    openLocalPath(path.resolve(artifact.path));
    res.json({ ok: true, path: path.resolve(artifact.path) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/tasks", async (req, res) => {
  try {
    const { title, description, agent = "auto", projectPath = "", acceptanceCriteria, execute = true, riskLevel } = req.body ?? {};
    if (!title?.trim() || !description?.trim()) {
      return res.status(400).json({ error: "title and description are required" });
    }
    if (!["auto", "hermes", "codex", "claude", "antigravity", "grok-build", "grok", "grok-bot", "deepseek"].includes(agent)) {
      return res.status(400).json({ error: "unsupported agent" });
    }
    if (typeof projectPath !== "string") {
      return res.status(400).json({ error: "projectPath must be a string" });
    }
    let normalizedCriteria;
    try {
      normalizedCriteria = normalizeAcceptanceCriteria(acceptanceCriteria);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const task = createTask({
      title: title.trim(),
      description: description.trim(),
      agent,
      projectPath,
      acceptanceCriteria: normalizedCriteria,
      riskLevel
    });

    if (execute !== false) {
      // High-risk tasks are automatically held in the approval queue without dispatch
      if (task.riskLevel === "high" && task.approvalStatus !== "approved") {
        return res.status(201).json(getTask(task.id));
      }

      updateTask(task.id, { status: "queued" });
      dispatchTask(task.id, config).catch((error) => {
        updateTask(task.id, {
          status: "failed",
          error: error?.stack || String(error),
          finishedAt: new Date().toISOString()
        });
      });
      return res.status(201).json(getTask(task.id));
    }

    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/tasks/:id/approve", async (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (task.approvalStatus !== "pending" && task.status !== "awaiting_approval") {
    return res.status(400).json({ error: `Task is not pending approval (current status: ${task.status})` });
  }

  const now = new Date().toISOString();
  const currentHash = computePayloadHash(task);
  const updated = updateTask(task.id, {
    approvedAt: now,
    approvedHash: currentHash,
    approvalStatus: "approved",
    status: "queued",
    error: null
  });

  dispatchTask(task.id, config).catch((error) => {
    updateTask(task.id, {
      status: "failed",
      error: error?.stack || String(error),
      finishedAt: new Date().toISOString()
    });
  });

  res.json({ ok: true, task: updated });
});

app.post("/api/tasks/:id/reject-approval", (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  const reason = req.body?.reason || "Approval rejected by founder";
  const updated = updateTask(task.id, {
    approvalStatus: "revoked",
    status: "cancelled",
    error: reason,
    finishedAt: new Date().toISOString()
  });
  res.json({ ok: true, task: updated });
});

app.post("/api/tasks/:id/reassign", (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (["running", "verifying", "repairing", "cancelling"].includes(task.status)) {
    return res.status(400).json({ error: `Cannot reassign ${task.status} task; please stop it first` });
  }

  const { agent } = req.body || {};
  if (!["auto", "hermes", "codex", "claude", "antigravity", "grok-build", "grok", "grok-bot", "deepseek"].includes(agent)) {
    return res.status(400).json({ error: "Unsupported agent" });
  }

  const updated = updateTask(task.id, { agent });
  res.json({ ok: true, task: updated });
});

app.post("/api/tasks/:id/run", async (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (["queued", "running", "verifying", "repairing", "cancelling"].includes(task.status)) {
    return res.status(409).json({ error: `Task is already ${task.status}` });
  }

  const currentHash = computePayloadHash(task);
  if (task.riskLevel === "high" && (task.approvalStatus !== "approved" || task.approvedHash !== currentHash)) {
    updateTask(task.id, { status: "awaiting_approval", approvalStatus: "pending" });
    return res.status(403).json({ error: "High-risk task requires founder approval before execution", task: getTask(task.id) });
  }

  updateTask(task.id, { status: "queued" });

  dispatchTask(task.id, config).catch((error) => {
    updateTask(task.id, {
      status: "failed",
      error: error?.stack || String(error),
      finishedAt: new Date().toISOString()
    });
  });

  res.json({ ok: true, taskId: task.id, status: "queued" });
});

app.post("/api/tasks/:id/pause", (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (task.status !== "queued") {
    return res.status(400).json({
      error: task.status === "running"
        ? "Running tasks cannot be paused; use stop/cancel instead"
        : `Cannot pause task in '${task.status}' state`
    });
  }
  const updated = updateTask(task.id, { status: "paused" });
  res.json({ ok: true, task: updated });
});

app.post("/api/tasks/:id/resume", (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (!["paused", "draft", "awaiting_approval"].includes(task.status)) {
    return res.status(400).json({ error: `Cannot resume task in '${task.status}' state` });
  }

  const currentHash = computePayloadHash(task);
  if (task.riskLevel === "high" && (task.approvalStatus !== "approved" || task.approvedHash !== currentHash)) {
    return res.status(403).json({ error: "Cannot resume unapproved high-risk task; approve it first" });
  }

  updateTask(task.id, { status: "queued" });
  dispatchTask(task.id, config).catch((error) => {
    updateTask(task.id, {
      status: "failed",
      error: error?.stack || String(error),
      finishedAt: new Date().toISOString()
    });
  });
  res.json({ ok: true, taskId: task.id, status: "queued" });
});

app.post("/api/tasks/:id/stop", (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (!["queued", "running", "verifying", "repairing"].includes(task.status)) {
    return res.status(400).json({ error: `Task is not running (current status: ${task.status})` });
  }
  updateTask(task.id, { status: "cancelling" });
  abortTaskProcess(task.id, "Task stopped by user");
  const updated = updateTask(task.id, {
    status: "cancelled",
    finishedAt: new Date().toISOString(),
    error: "Task stopped by user"
  });
  res.json({ ok: true, task: updated });
});

app.delete("/api/tasks/:id", (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (["queued", "running", "verifying", "repairing"].includes(task.status)) {
    updateTask(task.id, { status: "cancelling" });
    abortTaskProcess(task.id, "Task deleted by user");
    updateTask(task.id, { status: "cancelled", finishedAt: new Date().toISOString() });
  }
  const trashed = moveTaskToTrash(task.id);
  res.json({ ok: true, message: "Task moved to trash", task: trashed });
});

app.get("/api/trash", (_req, res) => {
  res.json(listTrashTasks());
});

app.post("/api/trash/:id/restore", (req, res) => {
  const task = getTrashTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Trash task not found" });
  const restored = restoreTaskFromTrash(req.params.id);
  res.json({ ok: true, task: restored });
});

app.delete("/api/trash/:id", (req, res) => {
  const ok = deleteTaskPermanently(req.params.id);
  if (!ok) return res.status(404).json({ error: "Trash task not found" });
  res.json({ ok: true, message: "Task deleted permanently" });
});

app.delete("/api/trash", (_req, res) => {
  const count = clearTrash();
  res.json({ ok: true, count, message: "Trash cleared" });
});

// Founder Brief (需求简报) API — a dedicated file that captures the founder's requirements
app.get("/api/brief", (_req, res) => {
  try {
    res.json(getBrief());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/brief/extract", (req, res) => {
  try {
    const result = extractBriefHighlights(req.body?.text, { source: req.body?.source });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/brief/hermes", (req, res) => {
  if (req.body?.confirmedByFounder !== true) {
    return res.status(403).json({ error: "Hermes brief handoff requires founder confirmation" });
  }
  try {
    const brief = updateHermesBrief(req.body?.content);
    res.json({ ok: true, source: "hermes", brief });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put("/api/brief", (req, res) => {
  try {
    const brief = updateBrief(req.body?.content);
    res.json({ ok: true, brief });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Founder Review / Feedback API (per finished product)
app.get("/api/tasks/:id/reviews", (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json({ reviews: listReviews(task.id) });
});

app.post("/api/tasks/:id/reviews", async (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });

  let review;
  try {
    review = addReview(task.id, { text: req.body?.text, kind: req.body?.kind, author: "founder" });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const refine = req.body?.refine === true;
  if (!refine) {
    return res.status(201).json({ ok: true, review });
  }

  if (["queued", "running", "verifying", "repairing", "cancelling"].includes(task.status)) {
    return res.status(409).json({ error: `Task is ${task.status}; cannot refine now`, review });
  }

  const currentHash = computePayloadHash(task);
  if (task.riskLevel === "high" && (task.approvalStatus !== "approved" || task.approvedHash !== currentHash)) {
    updateTask(task.id, { status: "awaiting_approval", approvalStatus: "pending" });
    return res.status(403).json({ error: "High-risk task requires founder approval before refinement", review, task: getTask(task.id) });
  }

  updateTask(task.id, { status: "queued" });
  dispatchTask(task.id, config).catch((error) => {
    updateTask(task.id, {
      status: "failed",
      error: error?.stack || String(error),
      finishedAt: new Date().toISOString()
    });
  });
  res.status(202).json({ ok: true, review, refining: true, task: getTask(task.id) });
});

// Memory Ledger API
app.get("/api/memory", (req, res) => {
  try {
    const list = listActive({ project: req.query.project });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/memory/candidates", (_req, res) => {
  try {
    const list = listCandidates();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/memory/:id", (req, res) => {
  const item = getMemory(req.params.id);
  if (!item) return res.status(404).json({ error: "Memory item not found" });
  res.json(item);
});

app.post("/api/memory/candidates", (req, res) => {
  try {
    const candidate = createCandidate(req.body);
    res.status(201).json({ ok: true, candidate });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/memory/candidates/:id/confirm", (req, res) => {
  try {
    const active = confirmCandidate(req.params.id, req.body || {});
    res.json({ ok: true, memory: active });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/memory/candidates/:id/reject", (req, res) => {
  try {
    const rejected = rejectCandidate(req.params.id, req.body || {});
    res.json({ ok: true, memory: rejected });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/memory/:id/updates", (req, res) => {
  try {
    const candidate = proposeUpdate(req.params.id, req.body || {});
    res.status(201).json({ ok: true, candidate });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Billing & DeepSeek Budget API
app.get("/api/billing/deepseek", (_req, res) => {
  try {
    res.json(getBudgetSummary());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/billing/alerts", (_req, res) => {
  try {
    res.json(listAlerts());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/billing/alerts/:id/ack", (req, res) => {
  try {
    const alert = acknowledgeAlert(req.params.id);
    res.json({ ok: true, alert });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/billing/deepseek/topup", (req, res) => {
  try {
    const summary = addFounderTopup(req.body || {});
    res.json({ ok: true, summary });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Content Packages API (内容三层 + 冻结发布包)
app.get("/api/content/layout-templates", (_req, res) => {
  res.json({ platform: "xiaohongshu", templates: listXiaohongshuLayoutTemplates() });
});

app.post("/api/content/packages", (req, res) => {
  try {
    const pkg = createPackage(req.body || {});
    res.status(201).json({ ok: true, package: pkg });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/content/packages", (_req, res) => {
  try {
    const list = listPackages();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/content/packages/:id", (req, res) => {
  const pkg = getPackage(req.params.id);
  if (!pkg) return res.status(404).json({ error: "Content package not found" });
  res.json(pkg);
});

app.post("/api/content/packages/:id/artifacts/:index/open", (req, res) => {
  try {
    const pkg = getPackage(req.params.id);
    const media = pkg?.media?.[Number(req.params.index)];
    if (!media?.path) return res.status(404).json({ error: "Artifact not found" });
    const artifactPath = path.isAbsolute(media.path) ? path.resolve(media.path) : path.resolve(__dirname, media.path);
    openLocalPath(artifactPath);
    res.json({ ok: true, path: artifactPath });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.patch("/api/content/packages/:id", (req, res) => {
  try {
    const updated = updatePackage(req.params.id, req.body || {});
    res.json({ ok: true, package: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/content/packages/:id/freeze", (req, res) => {
  try {
    const frozen = freezePackage(req.params.id);
    res.json({ ok: true, package: frozen });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/content/packages/:id/approve", (req, res) => {
  try {
    const approved = approvePackage(req.params.id);
    res.json({ ok: true, package: approved });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/content/packages/:id/reject", (req, res) => {
  try {
    const rejected = rejectPackage(req.params.id, req.body || {});
    res.json({ ok: true, package: rejected });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/content/packages/:id/ready", (req, res) => {
  try {
    const ready = markReadyManual(req.params.id);
    res.json({ ok: true, package: ready });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Explicit rejection for any automated external publishing attempt
const rejectAutoSend = (_req, res) => {
  res.status(403).json({
    ok: false,
    error: "External automated publishing is strictly prohibited. AI Founder OS generates drafts and frozen packages for manual review and founder release only."
  });
};

app.post("/api/content/packages/:id/send", rejectAutoSend);
app.post("/api/publish/:id/send", rejectAutoSend);

app.get("/api/content/packages/:id/preview", (req, res) => {
  try {
    const preview = generatePackagePreview(req.params.id);
    res.json({ ok: true, preview });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Scoped CORS middleware strictly for ChatGPT bridge endpoints
const bridgeCorsMiddleware = (req, res, next) => {
  const origin = req.headers.origin;
  const allowed = config.bridge?.allowedOrigins || ["https://chatgpt.com", "https://chat.openai.com"];
  if (origin && allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-bridge-token");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
};

app.use("/api/bridge", bridgeCorsMiddleware);

// ChatGPT Memory Bridge API
app.get("/api/bridge/status", (_req, res) => {
  const bridgeConfig = config.bridge || {};
  res.json({
    enabled: bridgeConfig.enabled !== false,
    corsOrigins: bridgeConfig.allowedOrigins || [],
    tokenConfigured: !!bridgeConfig.token,
    weakToken: bridgeConfig.token === "change-me"
  });
});

app.post("/api/bridge/chatgpt/extract", (req, res) => {
  try {
    const bridgeConfig = config.bridge || {};
    if (bridgeConfig.enabled === false) {
      return res.status(403).json({ error: "ChatGPT browser bridge is disabled in configuration" });
    }

    const expectedToken = bridgeConfig.token || "change-me";
    const authHeader = req.headers.authorization || "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    const providedToken = req.body?.token || req.headers["x-bridge-token"] || bearerToken;

    if (!providedToken || providedToken !== expectedToken) {
      return res.status(401).json({ error: "Invalid or missing bridge token" });
    }

    const { turns, conversationId, url } = req.body || {};
    if (!Array.isArray(turns) || turns.length === 0) {
      return res.status(400).json({ error: "turns array is required and cannot be empty" });
    }

    const result = extractFromTranscript(turns, { conversationId, url });

    // Write minimal audit entry WITHOUT raw conversation text
    const auditDir = path.join(__dirname, "data", "memory");
    fs.mkdirSync(auditDir, { recursive: true });
    const auditEntry = JSON.stringify({
      at: new Date().toISOString(),
      conversationId: String(conversationId || ""),
      createdCount: result.created.length,
      skippedCount: result.skipped
    }) + "\n";
    fs.appendFileSync(path.join(auditDir, "bridge_audit.jsonl"), auditEntry, "utf8");

    res.json({
      ok: true,
      created: result.created,
      skipped: result.skipped,
      needsQuickReview: result.needsQuickReview
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Secretary Inbox Endpoints
app.get("/api/secretary/inbox", (_req, res) => {
  res.json(listInbox());
});

app.post("/api/secretary/inbox", (req, res) => {
  try {
    const msg = receiveMessage(req.body || {});
    res.json({ ok: true, message: msg });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/secretary/inbox/:id/accept", (req, res) => {
  try {
    const msg = acceptMessage(req.params.id, req.body || {});
    res.json({ ok: true, message: msg });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/secretary/inbox/:id/reject", (req, res) => {
  try {
    const msg = rejectMessage(req.params.id, req.body || {});
    res.json({ ok: true, message: msg });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

function runTaskRetention() {
  try {
    const result = applyTaskRetention();
    if (result.movedToTrash || result.purgedFromTrash) {
      console.log(`Task retention: moved ${result.movedToTrash}, purged ${result.purgedFromTrash}`);
    }
  } catch (error) {
    console.error("Task retention failed:", error.message);
  }
}

runTaskRetention();
const retentionTimer = setInterval(runTaskRetention, 60 * 1000);
retentionTimer.unref?.();

app.listen(config.port, config.host, () => {
  console.log(`AI Founder OS ${version} running at http://${config.host}:${config.port}`);
  console.log(`dryRun=${config.dryRun}`);
});
