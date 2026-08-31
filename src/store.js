import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const tasksDir = path.join(root, "data", "tasks");

fs.mkdirSync(tasksDir, { recursive: true });

function taskFile(id) {
  if (!/^[a-zA-Z0-9_-]+$/.test(String(id))) {
    throw new Error("Invalid task id");
  }
  return path.join(tasksDir, `${id}.json`);
}

export function createTask(input) {
  const now = new Date().toISOString();
  const task = {
    id: `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    title: input.title,
    description: input.description,
    agent: input.agent || "auto",
    projectPath: input.projectPath || "",
    status: "draft",
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
    result: null,
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
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export function updateTask(id, patch) {
  const current = getTask(id);
  if (!current) throw new Error(`Task ${id} not found`);
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(taskFile(id), JSON.stringify(next, null, 2));
  return next;
}

export function listTasks() {
  return fs.readdirSync(tasksDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(fs.readFileSync(path.join(tasksDir, name), "utf8")))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
