import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import {
  classifyTaskRisk,
  computePayloadHash,
  generateSelectionPreview
} from "./tasks/risk.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const defaultTasksDir = path.join(root, "data", "tasks");
const defaultTrashDir = path.join(root, "data", "trash");
const DAY_MS = 24 * 60 * 60 * 1000;

export const TASK_RETENTION = Object.freeze({
  completedDays: 3,
  trashDays: 7
});

export function getTasksDir(options = {}) {
  const dir = options.tasksDir || (process.env.TASKS_BASE_DIR ? path.join(process.env.TASKS_BASE_DIR, "tasks") : defaultTasksDir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getTrashDir(options = {}) {
  const dir = options.trashDir || (process.env.TASKS_BASE_DIR ? path.join(process.env.TASKS_BASE_DIR, "trash") : defaultTrashDir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function validateTaskId(id) {
  if (!/^[a-zA-Z0-9_-]+$/.test(String(id))) {
    throw new Error("Invalid task id");
  }
}

function taskFile(id, options = {}) {
  validateTaskId(id);
  return path.join(getTasksDir(options), `${id}.json`);
}

function trashFile(id, options = {}) {
  validateTaskId(id);
  return path.join(getTrashDir(options), `${id}.json`);
}

function normalizeTask(task) {
  if (!task) return null;
  if (!task.riskLevel) {
    const risk = classifyTaskRisk(task);
    task.riskLevel = risk.level;
    task.riskReasons = risk.reasons;
    task.interruptLevel = risk.interruptLevel;
    task.approvalStatus = risk.level === "high" ? (task.approvedHash ? "approved" : "pending") : "not_required";
    task.approvedAt = task.approvedAt || null;
    task.approvedHash = task.approvedHash || null;
    task.payloadHash = computePayloadHash(task);
    task.selectionPreview = generateSelectionPreview(task);
    task.workflow = task.selectionPreview.workflow;
  }
  return task;
}

export function createTask(input) {
  const now = new Date().toISOString();
  const risk = classifyTaskRisk(input);
  const payloadHash = computePayloadHash(input);
  const selectionPreview = generateSelectionPreview(input);
  const approvalStatus = risk.level === "high" ? "pending" : "not_required";
  const status = risk.level === "high" ? "awaiting_approval" : (input.status || "draft");

  const task = {
    id: input.id || `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    title: input.title,
    description: input.description,
    agent: input.agent || "auto",
    projectPath: input.projectPath || "",
    acceptanceCriteria: input.acceptanceCriteria || [],
    riskLevel: risk.level,
    riskReasons: risk.reasons,
    interruptLevel: risk.interruptLevel,
    approvalStatus,
    approvedAt: null,
    approvedHash: null,
    workflow: selectionPreview.workflow,
    selectionPreview,
    payloadHash,
    status,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
    result: null,
    executionHistory: [],
    verificationHistory: [],
    error: null
  };
  fs.writeFileSync(taskFile(task.id), JSON.stringify(task, null, 2));
  return task;
}

export function getTask(id) {
  let p;
  try {
    p = taskFile(id);
  } catch {
    return null;
  }
  if (!fs.existsSync(p)) return null;
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  return normalizeTask(raw);
}

export function updateTask(id, patch) {
  const current = getTask(id);
  if (!current) throw new Error(`Task ${id} not found`);
  
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString()
  };

  // If content/agent changed, recompute hash, preview & risk
  const isContentChanged = patch.title !== undefined ||
    patch.description !== undefined ||
    patch.agent !== undefined ||
    patch.projectPath !== undefined ||
    patch.acceptanceCriteria !== undefined;

  if (isContentChanged) {
    const newRisk = classifyTaskRisk(next);
    const newHash = computePayloadHash(next);
    const newPreview = generateSelectionPreview(next);

    next.riskLevel = newRisk.level;
    next.riskReasons = newRisk.reasons;
    next.interruptLevel = newRisk.interruptLevel;
    next.payloadHash = newHash;
    next.selectionPreview = newPreview;
    next.workflow = newPreview.workflow;

    if (next.riskLevel === "high") {
      if (next.approvedHash !== newHash) {
        next.approvalStatus = "pending";
        if (["queued", "draft"].includes(next.status)) {
          next.status = "awaiting_approval";
        }
      }
    } else {
      next.approvalStatus = "not_required";
    }
  }

  fs.writeFileSync(taskFile(id), JSON.stringify(next, null, 2));
  return next;
}

export function listTasks(options = {}) {
  const dir = getTasksDir(options);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      try {
        return normalizeTask(JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getTrashTask(id, options = {}) {
  let p;
  try {
    p = trashFile(id, options);
  } catch {
    return null;
  }
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export function listTrashTasks(options = {}) {
  const dir = getTrashDir(options);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")))
    .sort((a, b) => (b.deletedAt || b.updatedAt || b.createdAt).localeCompare(a.deletedAt || a.updatedAt || a.createdAt));
}

function timestampMs(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Apply the founder's retention policy without touching non-completed work.
 * `now` is injectable so the policy stays deterministic in tests.
 */
export function applyTaskRetention(options = {}, now = Date.now()) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(nowMs)) throw new Error("Invalid retention timestamp");

  const completedCutoff = nowMs - TASK_RETENTION.completedDays * DAY_MS;
  const trashCutoff = nowMs - TASK_RETENTION.trashDays * DAY_MS;
  let movedToTrash = 0;
  let purgedFromTrash = 0;

  for (const task of listTasks(options)) {
    if (task.status !== "completed") continue;
    const completedAt = timestampMs(task.finishedAt || task.updatedAt || task.createdAt);
    if (completedAt === null || completedAt > completedCutoff) continue;

    const trashed = {
      ...task,
      deletedAt: new Date(nowMs).toISOString(),
      retentionReason: "completed_after_3_days"
    };
    fs.writeFileSync(trashFile(task.id, options), JSON.stringify(trashed, null, 2));
    fs.unlinkSync(taskFile(task.id, options));
    movedToTrash += 1;
  }

  for (const task of listTrashTasks(options)) {
    const deletedAt = timestampMs(task.deletedAt || task.updatedAt || task.createdAt);
    if (deletedAt === null || deletedAt > trashCutoff) continue;
    const file = trashFile(task.id, options);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      purgedFromTrash += 1;
    }
  }

  return { movedToTrash, purgedFromTrash };
}

export function moveTaskToTrash(id, options = {}) {
  const task = getTask(id, options);
  if (!task) throw new Error(`Task ${id} not found`);
  const trashRecord = {
    ...task,
    deletedAt: new Date().toISOString()
  };
  fs.writeFileSync(trashFile(id, options), JSON.stringify(trashRecord, null, 2));
  try {
    fs.unlinkSync(taskFile(id, options));
  } catch {}
  return trashRecord;
}

export function restoreTaskFromTrash(id, options = {}) {
  const task = getTrashTask(id, options);
  if (!task) throw new Error(`Trash task ${id} not found`);
  const { deletedAt, ...rest } = task;
  const activeRecord = {
    ...rest,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(taskFile(id, options), JSON.stringify(activeRecord, null, 2));
  try {
    fs.unlinkSync(trashFile(id, options));
  } catch {}
  return activeRecord;
}

export function deleteTaskPermanently(id, options = {}) {
  let p;
  try {
    p = trashFile(id, options);
  } catch {
    return false;
  }
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    return true;
  }
  return false;
}

export function clearTrash(options = {}) {
  const dir = getTrashDir(options);
  if (!fs.existsSync(dir)) return 0;
  const files = fs.readdirSync(dir).filter((name) => name.endsWith(".json"));
  for (const f of files) {
    try {
      fs.unlinkSync(path.join(dir, f));
    } catch {}
  }
  return files.length;
}
