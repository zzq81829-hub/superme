import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import {
  applyTaskRetention,
  createTask,
  getTask,
  getTrashDir,
  getTrashTask,
  listTasks,
  listTrashTasks,
  moveTaskToTrash,
  updateTask
} from "../src/store.js";

const DAY_MS = 24 * 60 * 60 * 1000;

test("task retention moves old completed tasks and purges old trash", () => {
  const now = Date.parse("2026-09-01T00:00:00.000Z");
  const oldCompleted = createTask({ title: "Old completed", description: "retention test" });
  updateTask(oldCompleted.id, {
    status: "completed",
    finishedAt: new Date(now - 4 * DAY_MS).toISOString()
  });

  const recentCompleted = createTask({ title: "Recent completed", description: "retention test" });
  updateTask(recentCompleted.id, {
    status: "completed",
    finishedAt: new Date(now - 2 * DAY_MS).toISOString()
  });

  const oldTrash = createTask({ title: "Old trash", description: "retention test" });
  moveTaskToTrash(oldTrash.id);
  const oldTrashPath = path.join(getTrashDir(), `${oldTrash.id}.json`);
  const oldTrashRecord = JSON.parse(fs.readFileSync(oldTrashPath, "utf8"));
  oldTrashRecord.deletedAt = new Date(now - 8 * DAY_MS).toISOString();
  fs.writeFileSync(oldTrashPath, JSON.stringify(oldTrashRecord, null, 2));

  const recentTrash = createTask({ title: "Recent trash", description: "retention test" });
  moveTaskToTrash(recentTrash.id);

  const result = applyTaskRetention({}, now);

  assert.equal(result.movedToTrash, 1);
  assert.equal(result.purgedFromTrash, 1);
  assert.equal(getTask(oldCompleted.id), null);
  assert.ok(getTrashTask(oldCompleted.id));
  assert.ok(getTask(recentCompleted.id));
  assert.equal(getTrashTask(oldTrash.id), null);
  assert.ok(getTrashTask(recentTrash.id));

  for (const task of listTasks()) {
    if ([oldCompleted.id, recentCompleted.id].includes(task.id)) fs.rmSync(path.join(process.env.TASKS_BASE_DIR, "tasks", `${task.id}.json`), { force: true });
  }
  for (const task of listTrashTasks()) {
    if ([oldCompleted.id, recentTrash.id].includes(task.id)) fs.rmSync(path.join(process.env.TASKS_BASE_DIR, "trash", `${task.id}.json`), { force: true });
  }
});
