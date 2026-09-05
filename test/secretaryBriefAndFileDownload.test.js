import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import http from "http";
import express from "express";
import { generateSecretaryBrief } from "../src/secretary/brief.js";
import {
  registerFile,
  getFile,
  updateFile,
  listFiles,
  validateSafePath,
  isSensitivePath,
  computeFileHash
} from "../src/files/registry.js";
import { createTask, getTask, updateTask } from "../src/store.js";
import { getPhoneAccessToken, peekPhoneAccessToken } from "../src/phoneAccess.js";
import { handleFileDownload } from "../src/files/download.js";

function setupIsolatedEnv() {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "sec-test-"));
  const tasksDir = path.join(baseDir, "tasks");
  const filesDir = path.join(baseDir, "files");
  const reportsDir = path.join(baseDir, "reports");
  const tokenDir = path.join(baseDir, "auth");
  fs.mkdirSync(tasksDir, { recursive: true });
  fs.mkdirSync(filesDir, { recursive: true });
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.mkdirSync(tokenDir, { recursive: true });

  const tokenPath = path.join(tokenDir, "token");
  const phoneToken = getPhoneAccessToken({ tokenPath });

  process.env.TASKS_BASE_DIR = baseDir;
  process.env.FILES_BASE_DIR = filesDir;
  process.env.REPORTS_BASE_DIR = reportsDir;

  return {
    baseDir,
    tasksDir,
    filesDir,
    reportsDir,
    tokenPath,
    phoneToken,
    options: { baseDir, tasksDir, filesDir, reportsDir }
  };
}

test("TEST A: Secretary brief 能正常读取，包含所有核心字段，且已安全脱敏", () => {
  const { baseDir, reportsDir, options } = setupIsolatedEnv();

  // Create a completed task, a running task, an approval task, and a failed task
  const t1 = createTask({ title: "已完成任务", status: "completed" });
  updateTask(t1.id, { finishedAt: new Date().toISOString() });

  const t2 = createTask({ title: "正在执行任务", status: "running" });
  updateTask(t2.id, { startedAt: new Date().toISOString() });

  const t3 = createTask({
    title: "待审批高风险任务",
    status: "awaiting_approval",
    riskLevel: "high",
    riskReasons: ["包含敏感文件修改"]
  });

  const t4 = createTask({
    title: "失败任务"
  });
  updateTask(t4.id, {
    status: "failed",
    error: "Auth error with sk-1234567890abcdef123456 secret token"
  });

  // Create a mock report file in reportsDir
  fs.writeFileSync(path.join(reportsDir, "test-report-antigravity.json"), JSON.stringify({ ok: true }), "utf8");

  const brief = generateSecretaryBrief({}, options);

  assert.ok(brief.generatedAt);
  assert.equal(Array.isArray(brief.runningTasks), true);
  assert.equal(brief.runningTasks.some((t) => t.id === t2.id), true);

  assert.equal(Array.isArray(brief.recentCompletedTasks), true);
  assert.equal(brief.recentCompletedTasks.some((t) => t.id === t1.id), true);

  assert.equal(Array.isArray(brief.recentFailedTasks), true);
  assert.equal(brief.recentFailedTasks.some((t) => t.id === t4.id), true);
  // Sensitive key in error must be masked!
  assert.match(brief.recentFailedTasks.find((t) => t.id === t4.id).error, /sk-\*\*\*/);

  assert.equal(brief.pendingApprovals.count >= 1, true);
  assert.equal(brief.pendingApprovals.items.some((t) => t.id === t3.id), true);

  assert.equal(Array.isArray(brief.latestReports), true);
  const report = brief.latestReports.find((r) => r.name === "test-report-antigravity.json");
  assert.ok(report);
  assert.equal(report.ok, true);
  assert.equal(Object.prototype.hasOwnProperty.call(report, "stdout"), false);

  assert.ok(brief.workerStatus);
  assert.ok(brief.founderDecisionsRequired);
  assert.ok(brief.systemExceptions);
});

test("TEST B: Secretary brief 是纯只读操作，绝不触发任务执行或修改状态", () => {
  const { options } = setupIsolatedEnv();

  const queuedTask = createTask({ title: "待执行任务", status: "queued" });
  const initialTask = getTask(queuedTask.id);
  assert.equal(initialTask.status, "queued");
  assert.equal(initialTask.startedAt, null);

  // Call brief multiple times
  generateSecretaryBrief({}, options);
  generateSecretaryBrief({}, options);
  generateSecretaryBrief({}, options);

  const taskAfterBrief = getTask(queuedTask.id);
  assert.equal(taskAfterBrief.status, "queued", "Task status must remain queued");
  assert.equal(taskAfterBrief.startedAt, null, "Task startedAt must remain null");
  assert.equal(taskAfterBrief.attemptCount || 0, 0, "No attempt count should be incremented");
});

test("TEST B2: brief 对不存在的存储目录保持真正只读", () => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "sec-brief-readonly-"));
  const options = {
    baseDir,
    tasksDir: path.join(baseDir, "tasks"),
    filesDir: path.join(baseDir, "files"),
    memoryDir: path.join(baseDir, "memory"),
    packagesDir: path.join(baseDir, "packages"),
    workforceDir: path.join(baseDir, "workforce"),
    billingDir: path.join(baseDir, "billing"),
    reportsDir: path.join(baseDir, "reports")
  };
  const before = Object.fromEntries(Object.entries(options).map(([k, v]) => [k, fs.existsSync(v)]));
  generateSecretaryBrief({}, options);
  const after = Object.fromEntries(Object.entries(options).map(([k, v]) => [k, fs.existsSync(v)]));
  assert.deepEqual(after, before);
});

test("TEST B3: brief 在 billing 目录存在但无账本文件时不写入", () => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "sec-brief-billing-"));
  const billingDir = path.join(baseDir, "billing");
  fs.mkdirSync(billingDir, { recursive: true });
  const options = {
    baseDir,
    tasksDir: path.join(baseDir, "tasks"),
    filesDir: path.join(baseDir, "files"),
    memoryDir: path.join(baseDir, "memory"),
    packagesDir: path.join(baseDir, "packages"),
    workforceDir: path.join(baseDir, "workforce"),
    billingDir,
    reportsDir: path.join(baseDir, "reports")
  };
  const brief = generateSecretaryBrief({}, options);
  assert.equal(fs.readdirSync(billingDir).length, 0);
  assert.equal(brief.billing?.amounts, "withheld");
  assert.equal(brief.billing?.spentCny, undefined);
});

test("TEST C: 未验收文件不能标记为可发送 (Unverified files cannot be sendable)", () => {
  const { baseDir, options } = setupIsolatedEnv();
  const testFile = path.join(baseDir, "output.txt");
  fs.writeFileSync(testFile, "hello output", "utf8");

  // 1. Cannot register with verified=false and sendable=true
  assert.throws(
    () => {
      registerFile(
        {
          filePath: testFile,
          projectRoot: baseDir,
          verified: false,
          sendable: true
        },
        options
      );
    },
    /未验收文件不能标记为可发送/
  );

  // 2. Can register with verified=false, sendable=false
  const rec = registerFile(
    {
      filePath: testFile,
      projectRoot: baseDir,
      verified: false,
      sendable: false
    },
    options
  );
  assert.equal(rec.verified, false);
  assert.equal(rec.sendable, false);

  // 3. Updating sendable=true on unverified file must be rejected
  assert.throws(
    () => {
      updateFile(rec.fileId, { sendable: true }, options);
    },
    /未验收文件不能标记为可发送/
  );

  // 4. Once verified=true, can be marked sendable=true
  const updated = updateFile(rec.fileId, { verified: true, sendable: true }, options);
  assert.equal(updated.verified, true);
  assert.equal(updated.sendable, true);
});

test("TEST D: 越权路径与敏感配置文件被坚决拒绝", () => {
  const { baseDir } = setupIsolatedEnv();

  // 1. Path traversal outside projectRoot
  assert.throws(
    () => {
      validateSafePath("../../windows/system32/cmd.exe", baseDir);
    },
    /Path traversal outside project root is forbidden/
  );

  // 2. Sensitive file patterns
  assert.equal(isSensitivePath("data/phone-access-token"), true);
  assert.equal(isSensitivePath(".env"), true);
  assert.equal(isSensitivePath("config/billing-policy.yaml"), true);
  assert.equal(isSensitivePath("secrets.json"), true);
  assert.equal(isSensitivePath("finance/tax-records.xlsx"), true);

  assert.throws(
    () => {
      validateSafePath("data/phone-access-token", baseDir);
    },
    /Access to sensitive or private file is forbidden/
  );

  const outside = path.join(os.tmpdir(), `sec-outside-${Date.now()}.txt`);
  const link = path.join(baseDir, "linked.txt");
  fs.writeFileSync(outside, "outside", "utf8");
  try {
    fs.symlinkSync(outside, link, "file");
    assert.throws(() => validateSafePath(link, baseDir), /Resolved file path is outside project root|Symbolic-link file paths are forbidden/);
  } catch (err) {
    // Windows without symlink privilege: the path check remains covered by traversal tests.
    if (!/EPERM|EEXIST|Privilege/i.test(String(err?.code || err?.message || err))) throw err;
  } finally {
    try { fs.unlinkSync(link); } catch {}
    try { fs.unlinkSync(outside); } catch {}
  }
});

test("TEST E: 本地手机安全下载 HTTP 端点测试 (Token缺失、未登记、未验收、越权、正常下载)", async () => {
  const { baseDir, options, tokenPath, phoneToken } = setupIsolatedEnv();

  // Setup sample file on disk
  const sampleFile = path.join(baseDir, "chart.png");
  fs.writeFileSync(sampleFile, "PNG_MOCK_DATA", "utf8");

  // Register unverified file
  const unverifiedRecord = registerFile(
    {
      filePath: sampleFile,
      projectRoot: baseDir,
      verified: false,
      sendable: false
    },
    options
  );

  // Register a verified local deliverable (sendable is reserved for external publication)
  const sampleFile2 = path.join(baseDir, "verified_report.md");
  fs.writeFileSync(sampleFile2, "# Verified Report", "utf8");
  const verifiedRecord = registerFile(
    {
      filePath: sampleFile2,
      projectRoot: baseDir,
      verified: true,
      sendable: false
    },
    options
  );

  const app = express();
  app.get("/api/secretary/files/:id/download", (req, res) => {
    handleFileDownload(req, res, {
      projectRoot: baseDir,
      fileOptions: options,
      getFile: (id) => getFile(id, options),
      tokenOptions: { tokenPath }
    });
  });

  const server = await new Promise((resolve) => {
    const s = http.createServer(app).listen(0, "127.0.0.1", () => resolve(s));
  });
  const port = server.address().port;

  try {
    // 1. Token 缺失 -> 401
    const resNoToken = await fetch(`http://127.0.0.1:${port}/api/secretary/files/${verifiedRecord.fileId}/download`);
    assert.equal(resNoToken.status, 401);
    const bodyNoToken = await resNoToken.json();
    assert.match(bodyNoToken.error, /口令缺失/);

    // 2. Token 错误 -> 401
    const resBadToken = await fetch(`http://127.0.0.1:${port}/api/secretary/files/${verifiedRecord.fileId}/download`, {
      headers: { "X-OS-Phone-Token": "wrong-token" }
    });
    assert.equal(resBadToken.status, 401);

    // 3. 未登记文件 -> 404
    const resNotRegistered = await fetch(`http://127.0.0.1:${port}/api/secretary/files/fil_999999/download`, {
      headers: { "X-OS-Phone-Token": phoneToken }
    });
    assert.equal(resNotRegistered.status, 404);
    const bodyNotRegistered = await resNotRegistered.json();
    assert.match(bodyNotRegistered.error, /未登记文件/);

    // 4. 未验收文件 -> 403
    const resUnverified = await fetch(`http://127.0.0.1:${port}/api/secretary/files/${unverifiedRecord.fileId}/download`, {
      headers: { "X-OS-Phone-Token": phoneToken }
    });
    assert.equal(resUnverified.status, 403);
    const bodyUnverified = await resUnverified.json();
    assert.match(bodyUnverified.error, /未验收/);

    // 5. 正常已验收且可发送文件 -> 200 下载成功
    const resSuccess = await fetch(`http://127.0.0.1:${port}/api/secretary/files/${verifiedRecord.fileId}/download`, {
      headers: { "X-OS-Phone-Token": phoneToken }
    });
    assert.equal(resSuccess.status, 200);
    assert.match(resSuccess.headers.get("content-type"), /text\/markdown/);
    const downloadedContent = await resSuccess.text();
    assert.equal(downloadedContent, "# Verified Report");

    // Query-string tokens must never authenticate the endpoint.
    const resQueryToken = await fetch(`http://127.0.0.1:${port}/api/secretary/files/${verifiedRecord.fileId}/download?token=${encodeURIComponent(phoneToken)}`);
    assert.equal(resQueryToken.status, 401);

    // A post-registration mutation is detected by the download hash check.
    fs.writeFileSync(sampleFile2, "# Tampered Report", "utf8");
    const resTampered = await fetch(`http://127.0.0.1:${port}/api/secretary/files/${verifiedRecord.fileId}/download`, {
      headers: { "X-OS-Phone-Token": phoneToken }
    });
    assert.equal(resTampered.status, 409);
  } finally {
    server.close();
  }
});

test("TEST E2: 下载 GET 在口令文件不存在时不创建口令", async () => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "sec-dl-"));
  const tokenPath = path.join(baseDir, "token");
  const app = express();
  app.get("/api/secretary/files/:id/download", (req, res) => {
    handleFileDownload(req, res, {
      projectRoot: baseDir,
      tokenOptions: { tokenPath }
    });
  });
  const server = await new Promise((resolve) => {
    const s = http.createServer(app).listen(0, "127.0.0.1", () => resolve(s));
  });
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/secretary/files/fil_none/download`, {
      headers: { "X-OS-Phone-Token": "any" }
    });
    assert.equal(res.status, 401);
    assert.equal(fs.existsSync(tokenPath), false);
    assert.equal(peekPhoneAccessToken({ tokenPath }), null);
  } finally {
    server.close();
  }
});
