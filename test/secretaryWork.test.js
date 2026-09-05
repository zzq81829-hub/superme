import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { createSecretaryWork } from "../src/secretary/work.js";

test("秘书工作桥接把高风险一句话送入 Task 并停在 Founder Approval", () => {
  const previous = process.env.TASKS_BASE_DIR;
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "secretary-work-"));
  process.env.TASKS_BASE_DIR = baseDir;
  try {
    const task = createSecretaryWork({
      text: "发布这条内容到小红书",
      agent: "hermes"
    }, {});
    assert.equal(task.agent, "auto");
    assert.equal(task.riskLevel, "high");
    assert.equal(task.status, "awaiting_approval");
    assert.equal(task.approvalStatus, "pending");
  } finally {
    if (previous === undefined) delete process.env.TASKS_BASE_DIR;
    else process.env.TASKS_BASE_DIR = previous;
  }
});

test("秘书工作桥接把低风险一句话送入调度而不是草稿", () => {
  const previous = process.env.TASKS_BASE_DIR;
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "secretary-work-low-"));
  process.env.TASKS_BASE_DIR = baseDir;
  try {
    const task = createSecretaryWork({
      text: "整理按钮文案拼写"
    }, { dryRun: true });
    assert.notEqual(task.status, "draft");
    assert.notEqual(task.status, "awaiting_approval");
    assert.ok(["queued", "running", "completed", "failed", "verifying", "repairing"].includes(task.status));
  } finally {
    if (previous === undefined) delete process.env.TASKS_BASE_DIR;
    else process.env.TASKS_BASE_DIR = previous;
  }
});

test("秘书工作桥接限制附件数量并要求安全 reader 定位", () => {
  assert.throws(
    () => createSecretaryWork({
      text: "审查这些文件",
      attachments: [{ rootName: "Desktop", relativePath: "a.txt" }, { rootName: "Desktop", relativePath: "b.txt" }, { rootName: "Desktop", relativePath: "c.txt" }, { rootName: "Desktop", relativePath: "d.txt" }]
    }, {}),
    /最多只能附加 3 个文件/
  );
  assert.throws(
    () => createSecretaryWork({ text: "审查文件", attachments: [{ relativePath: "a.txt" }] }, {}),
    /必须提供安全根目录和相对路径/
  );
});
