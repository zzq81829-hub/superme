import test from "node:test";
import assert from "node:assert/strict";
import http from "http";
import express from "express";
import fs from "fs";
import path from "path";
import os from "os";
import {
  createTask,
  getTask,
  updateTask,
  listTasks,
  moveTaskToTrash,
  listTrashTasks,
  getTrashTask,
  restoreTaskFromTrash,
  deleteTaskPermanently,
  clearTrash
} from "../src/store.js";
import { abortTaskProcess } from "../src/adapters/processRunner.js";

test("Server REST API Lifecycle Endpoints", async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "founder-serverapi-test-"));
  const prevTasksDir = process.env.TASKS_BASE_DIR;
  process.env.TASKS_BASE_DIR = tmpDir;

  const app = express();
  app.use(express.json());

  app.post("/api/tasks/:id/pause", (req, res) => {
    const task = getTask(req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (task.status !== "queued") {
      return res.status(400).json({ error: "Cannot pause non-queued task" });
    }
    const updated = updateTask(task.id, { status: "paused" });
    res.json({ ok: true, task: updated });
  });

  app.post("/api/tasks/:id/resume", (req, res) => {
    const task = getTask(req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (!["paused", "draft"].includes(task.status)) {
      return res.status(400).json({ error: "Cannot resume task" });
    }
    const updated = updateTask(task.id, { status: "queued" });
    res.json({ ok: true, task: updated });
  });

  app.post("/api/tasks/:id/stop", (req, res) => {
    const task = getTask(req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    updateTask(task.id, { status: "cancelling" });
    abortTaskProcess(task.id, "Stopped by user");
    const updated = updateTask(task.id, { status: "cancelled", finishedAt: new Date().toISOString() });
    res.json({ ok: true, task: updated });
  });

  app.delete("/api/tasks/:id", (req, res) => {
    const task = getTask(req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (["queued", "running", "verifying", "repairing"].includes(task.status)) {
      abortTaskProcess(task.id, "Deleted by user");
      updateTask(task.id, { status: "cancelled" });
    }
    const trashed = moveTaskToTrash(task.id);
    res.json({ ok: true, task: trashed });
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
    res.json({ ok: true });
  });

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Create task
    const task = createTask({ title: "API Test", description: "Desc" });
    updateTask(task.id, { status: "queued" });

    // 2. Pause
    const pauseRes = await fetch(`${baseUrl}/api/tasks/${task.id}/pause`, { method: "POST" });
    const pauseData = await pauseRes.json();
    assert.equal(pauseRes.status, 200);
    assert.equal(pauseData.task.status, "paused");

    // 3. Resume
    const resumeRes = await fetch(`${baseUrl}/api/tasks/${task.id}/resume`, { method: "POST" });
    const resumeData = await resumeRes.json();
    assert.equal(resumeRes.status, 200);
    assert.equal(resumeData.task.status, "queued");

    // 4. Stop
    const stopRes = await fetch(`${baseUrl}/api/tasks/${task.id}/stop`, { method: "POST" });
    const stopData = await stopRes.json();
    assert.equal(stopRes.status, 200);
    assert.equal(stopData.task.status, "cancelled");

    // 5. Delete to Trash
    const delRes = await fetch(`${baseUrl}/api/tasks/${task.id}`, { method: "DELETE" });
    const delData = await delRes.json();
    assert.equal(delRes.status, 200);
    assert.ok(delData.task.deletedAt);

    // 6. List Trash
    const trashRes = await fetch(`${baseUrl}/api/trash`);
    const trashData = await trashRes.json();
    assert.ok(trashData.some(t => t.id === task.id));

    // 7. Restore from Trash
    const restoreRes = await fetch(`${baseUrl}/api/trash/${task.id}/restore`, { method: "POST" });
    const restoreData = await restoreRes.json();
    assert.equal(restoreRes.status, 200);
    assert.equal(restoreData.task.status, "cancelled");

    // Clean up
    moveTaskToTrash(task.id);
    await fetch(`${baseUrl}/api/trash/${task.id}`, { method: "DELETE" });
  } finally {
    server.close();
    process.env.TASKS_BASE_DIR = prevTasksDir;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
});
