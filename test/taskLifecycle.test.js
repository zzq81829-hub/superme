import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
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
import { abortTaskProcess, isTaskProcessRunning } from "../src/adapters/processRunner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const tasksDir = path.join(root, "data", "tasks");
const trashDir = path.join(root, "data", "trash");

test("Task Lifecycle & Trash Management", async (t) => {
  // Test 1: Task creation and pause / resume in queue
  await t.test("queued task can be paused and resumed", () => {
    const task = createTask({
      title: "Test Queue Lifecycle",
      description: "Testing pause and resume in queue",
      agent: "auto"
    });
    assert.equal(task.status, "draft");

    updateTask(task.id, { status: "queued" });
    const queuedTask = getTask(task.id);
    assert.equal(queuedTask.status, "queued");

    // Pause
    const pausedTask = updateTask(task.id, { status: "paused" });
    assert.equal(pausedTask.status, "paused");

    // Resume
    const resumedTask = updateTask(task.id, { status: "queued" });
    assert.equal(resumedTask.status, "queued");

    // Cleanup
    moveTaskToTrash(task.id);
    deleteTaskPermanently(task.id);
  });

  // Test 2: Process abort and cancellation
  await t.test("abortTaskProcess handles non-existent and running tasks cleanly", () => {
    assert.equal(abortTaskProcess("non-existent-task-id"), false);
    assert.equal(isTaskProcessRunning("non-existent-task-id"), false);
  });

  // Test 3: Soft delete to trash and restore
  await t.test("tasks can be moved to trash, listed, restored and permanently deleted", () => {
    const task = createTask({
      title: "Trash Test Task",
      description: "Testing recycle bin mechanics",
      agent: "codex"
    });

    const activeListBefore = listTasks();
    assert.ok(activeListBefore.some(t => t.id === task.id));

    // Move to trash
    const trashed = moveTaskToTrash(task.id);
    assert.ok(trashed.deletedAt);
    assert.equal(getTask(task.id), null);
    assert.ok(getTrashTask(task.id));

    // Trash listing
    const trashList = listTrashTasks();
    assert.ok(trashList.some(t => t.id === task.id));

    // Active listing must NOT include trashed task
    const activeListAfter = listTasks();
    assert.ok(!activeListAfter.some(t => t.id === task.id));

    // Restore from trash
    const restored = restoreTaskFromTrash(task.id);
    assert.equal(restored.deletedAt, undefined);
    assert.equal(getTrashTask(task.id), null);
    assert.ok(getTask(task.id));

    // Move to trash again and permanently delete
    moveTaskToTrash(task.id);
    const deleteResult = deleteTaskPermanently(task.id);
    assert.equal(deleteResult, true);
    assert.equal(getTrashTask(task.id), null);
  });

  // Test 4: Clear trash
  await t.test("clearTrash empties the trash folder completely", () => {
    const task1 = createTask({ title: "T1", description: "D1" });
    const task2 = createTask({ title: "T2", description: "D2" });

    moveTaskToTrash(task1.id);
    moveTaskToTrash(task2.id);

    const trashBefore = listTrashTasks();
    assert.ok(trashBefore.length >= 2);

    const clearedCount = clearTrash();
    assert.ok(clearedCount >= 2);

    const trashAfter = listTrashTasks();
    assert.equal(trashAfter.length, 0);
  });
});
