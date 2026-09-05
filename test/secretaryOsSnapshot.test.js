import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import http from "http";
import express from "express";
import {
  getSecretaryOsSnapshot,
  buildOsSnapshotText,
  getOsSnapshot,
  getCompactOsSnapshot
} from "../src/secretary/osSnapshot.js";
import { sendMessage, buildChatPrompt } from "../src/secretary/chat.js";
import { createTask, updateTask, listTasks, getTask } from "../src/store.js";
import { createCandidate } from "../src/memory/store.js";
import { registerFile } from "../src/files/registry.js";
import { getCurrentPeriod } from "../src/billing/deepseekBudget.js";

function setupIsolatedEnv() {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "m2-snapshot-test-"));
  const tasksDir = path.join(baseDir, "tasks");
  const filesDir = path.join(baseDir, "files");
  const memoryDir = path.join(baseDir, "memory");
  const candidatesDir = path.join(memoryDir, "candidates");
  const packagesDir = path.join(baseDir, "content", "packages");
  const reportsDir = path.join(baseDir, "reports");
  const workforceDir = path.join(baseDir, "workforce");
  const billingDir = path.join(baseDir, "billing");
  const secretaryDir = path.join(baseDir, "secretary");

  fs.mkdirSync(tasksDir, { recursive: true });
  fs.mkdirSync(filesDir, { recursive: true });
  fs.mkdirSync(candidatesDir, { recursive: true });
  fs.mkdirSync(packagesDir, { recursive: true });
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.mkdirSync(workforceDir, { recursive: true });
  fs.mkdirSync(billingDir, { recursive: true });
  fs.mkdirSync(secretaryDir, { recursive: true });

  process.env.TASKS_BASE_DIR = baseDir;
  process.env.FILES_BASE_DIR = filesDir;
  process.env.MEMORY_BASE_DIR = memoryDir;
  process.env.PACKAGES_BASE_DIR = baseDir;
  process.env.REPORTS_BASE_DIR = reportsDir;
  process.env.WORKFORCE_BASE_DIR = workforceDir;
  process.env.BILLING_BASE_DIR = billingDir;
  process.env.SECRETARY_BASE_DIR = secretaryDir;

  const options = {
    baseDir,
    tasksDir,
    filesDir,
    memoryDir,
    packagesDir,
    reportsDir,
    workforceDir,
    billingDir,
    secretaryDir
  };

  return { baseDir, options, packagesDir };
}

test("R1-Snapshot-1: getSecretaryOsSnapshot returns all required keys and aggregates state", () => {
  const { baseDir, options, packagesDir } = setupIsolatedEnv();

  // 1. Create a running task
  const tRun = createTask({ title: "正在执行分析任务", status: "running" });
  updateTask(tRun.id, { startedAt: new Date().toISOString() });

  // 2. Create an awaiting_approval task
  const tApprove = createTask({
    title: "待审批发布任务",
    status: "awaiting_approval",
    riskLevel: "high",
    riskReasons: ["外部发布平台拦截"]
  });

  // 3. Create a memory candidate
  const candidate = createCandidate({
    title: "小红书双峰封面美学",
    content: "封面采用黑底与双色对比高反差排版",
    type: "style"
  }, options);

  // 4. Create a verified deliverable file
  const testFilePath = path.join(baseDir, "cover.png");
  fs.writeFileSync(testFilePath, "fake image content", "utf8");
  registerFile({
    filePath: testFilePath,
    projectRoot: baseDir,
    verified: true,
    sendable: false
  }, { ...options, baseDir: options.filesDir });

  // 5. Create a content package awaiting approval
  const pkgFile = path.join(packagesDir, "pkg-test-1.json");
  fs.writeFileSync(pkgFile, JSON.stringify({
    id: "pkg-test-1",
    title: "每日爆款复盘",
    status: "awaiting_approval",
    platform: "xiaohongshu",
    createdAt: new Date().toISOString()
  }, null, 2), "utf8");

  const snapshot = getSecretaryOsSnapshot({}, options);

  // Verify Required Top-Level Keys
  assert.equal(snapshot.ok, true);
  assert.ok(snapshot.timestamp, "snapshot must have timestamp");
  assert.ok(Array.isArray(snapshot.activeTasks), "activeTasks must be an array");
  assert.ok(snapshot.pendingApprovals, "pendingApprovals must be present");
  assert.ok(Array.isArray(snapshot.workerHealth), "workerHealth must be an array");
  assert.ok(Array.isArray(snapshot.deliverables), "deliverables must be an array");
  assert.ok(Array.isArray(snapshot.memoryCandidates), "memoryCandidates must be an array");
  assert.ok(snapshot.founderDecisionsRequired, "founderDecisionsRequired must be present");

  // Verify Active Tasks Content
  assert.equal(snapshot.activeTasks.some((t) => t.id === tRun.id), true);

  // Verify Pending Approvals Content (both task and publish package)
  assert.ok(snapshot.pendingApprovals.count >= 2);
  assert.equal(snapshot.pendingApprovals.items.some((i) => i.id === tApprove.id), true);
  assert.equal(snapshot.pendingApprovals.items.some((i) => i.id === "pkg-test-1"), true);

  // Verify Deliverables Content
  assert.ok(snapshot.deliverables.length >= 1);
  assert.equal(snapshot.deliverables.some((d) => d.name === "cover.png"), true);

  // Verify Memory Candidates Content
  assert.ok(snapshot.memoryCandidates.length >= 1);
  assert.equal(snapshot.memoryCandidates.some((c) => c.id === candidate.id), true);

  // Verify Founder Decisions Required Aggregation
  assert.ok(snapshot.founderDecisionsRequired.totalPending >= 3);

  // Verify compatibility aliases
  const aliasSnapshot = getOsSnapshot({}, options);
  assert.equal(aliasSnapshot.ok, true);
  assert.equal(Array.isArray(aliasSnapshot.activeTasks), true);
});

test("R1-Snapshot-2: Strict Privacy Redaction: Secrets, Tokens and Financial Amounts Withheld", () => {
  const { options } = setupIsolatedEnv();

  // 1. Task with sensitive OpenAI / Anthropic key in error
  const failedTask = createTask({ title: "爬虫任务失败" });
  updateTask(failedTask.id, {
    status: "failed",
    error: "Failed due to invalid key sk-abcdef1234567890abcdef123456 and token=mysecretpass123"
  });

  // 2. Budget alert in billing
  const period = getCurrentPeriod();
  const ledgerPath = path.join(options.billingDir, `deepseek-${period}.json`);
  fs.writeFileSync(ledgerPath, JSON.stringify({
    period,
    currency: "CNY",
    limitCny: 50,
    spentCny: 49.80,
    hardStop: true,
    entries: [],
    alerts: [{
      id: "alert-test-1",
      type: "HARD_STOP",
      message: "Monthly budget hard cap reached. Total spent: ¥49.80",
      createdAt: new Date().toISOString(),
      acknowledged: false
    }]
  }, null, 2), "utf8");

  const snapshot = getSecretaryOsSnapshot({}, options);

  // Assert API keys masked to sk-***
  const sanitizedTask = snapshot.recentFailedTasks.find((t) => t.id === failedTask.id);
  assert.ok(sanitizedTask);
  assert.doesNotMatch(sanitizedTask.error, /sk-abcdef1234567890/);
  assert.match(sanitizedTask.error, /sk-\*\*\*/);
  assert.match(sanitizedTask.error, /token=\*\*\*/);

  // Assert Financial amounts withheld
  assert.ok(snapshot.billing, "Billing summary must be present");
  assert.equal(snapshot.billing.amounts, "withheld");
  assert.equal(snapshot.billing.spentCny, undefined);
  assert.equal(snapshot.billing.balance, undefined);

  // Test compact text LLM injection also keeps strict redaction
  const textSnapshot = buildOsSnapshotText(snapshot);
  assert.doesNotMatch(textSnapshot, /sk-abcdef1234567890/);
  assert.match(textSnapshot, /sk-\*\*\*/);
  assert.match(textSnapshot, /amounts withheld/);
});

test("R1-Snapshot-3: Pure Read-Only Invariant: Zero side effects on non-existent storage", () => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "m2-snapshot-readonly-"));
  const nonExistentOptions = {
    baseDir,
    tasksDir: path.join(baseDir, "tasks"),
    filesDir: path.join(baseDir, "files"),
    memoryDir: path.join(baseDir, "memory"),
    packagesDir: path.join(baseDir, "packages"),
    workforceDir: path.join(baseDir, "workforce"),
    billingDir: path.join(baseDir, "billing"),
    reportsDir: path.join(baseDir, "reports")
  };

  const beforeExistence = Object.fromEntries(
    Object.entries(nonExistentOptions).map(([k, v]) => [k, fs.existsSync(v)])
  );

  const snapshot = getSecretaryOsSnapshot({}, nonExistentOptions);

  const afterExistence = Object.fromEntries(
    Object.entries(nonExistentOptions).map(([k, v]) => [k, fs.existsSync(v)])
  );

  assert.deepEqual(afterExistence, beforeExistence, "Snapshot generation must not create uninitialized directories");
  assert.equal(snapshot.ok, true);
  assert.deepEqual(snapshot.activeTasks, []);
  assert.deepEqual(snapshot.deliverables, []);
});

test("R1-Snapshot-4: Chat Zero Autonomous Dispatch Gating (default autoDispatch = false)", async () => {
  const { options } = setupIsolatedEnv();

  const fakeEngine = async () => ({
    ok: true,
    agent: "grok-bot",
    message: "收到您的想法：关于优化小红书排版脚本，已为您整理。"
  });

  // 1. Calling sendMessage without autoDispatch (default must be false)
  const initialTaskCount = listTasks(options).length;

  const { userTurn, assistantTurn, task } = await sendMessage(
    { text: "分析并排版小红书画报封面" },
    {},
    { engine: fakeEngine, options }
  );

  assert.equal(task, null, "Conversational chat must not auto-dispatch task by default");
  assert.equal(userTurn.taskId, null);
  assert.equal(assistantTurn.taskId, null);
  assert.equal(listTasks(options).length, initialTaskCount, "No task should be inserted in task store");

  // 2. Explicit autoDispatch: true creates task
  const resDispatched = await sendMessage(
    { text: "分析并排版小红书画报封面", autoDispatch: true },
    { dryRun: true },
    { engine: fakeEngine, options }
  );

  assert.ok(resDispatched.task, "Explicit autoDispatch: true must create task");
  assert.ok(resDispatched.task.id);
  assert.equal(getTask(resDispatched.task.id, options).id, resDispatched.task.id);
});

test("R1-Snapshot-5: Prompt Construction & Zero LLM Overhead", () => {
  const sampleSnapshot = {
    activeTasks: [{ id: "t-1", status: "running", title: "测试运行任务" }],
    recentCompletedTasks: [{ title: "已完成分析" }],
    recentFailedTasks: [],
    pendingApprovals: { count: 0, items: [] },
    founderDecisionsRequired: { totalPending: 0, items: [] },
    workerHealth: [{ id: "antigravity", status: "AVAILABLE", available: true }],
    deliverables: [],
    latestReports: []
  };

  // 1. buildOsSnapshotText produces clean block
  const snapshotText = buildOsSnapshotText(sampleSnapshot);
  assert.match(snapshotText, /^=== OS SNAPSHOT ===/);
  assert.match(snapshotText, /=== END OS SNAPSHOT ===$/);
  assert.match(snapshotText, /测试运行任务/);

  // 2. buildChatPrompt incorporates === OS SNAPSHOT ===
  const prompt = buildChatPrompt({
    text: "帮我总结今天的内容进度",
    snapshot: snapshotText
  });

  assert.match(prompt, /=== OS SNAPSHOT ===/);
  assert.match(prompt, /=== END OS SNAPSHOT ===/);
  assert.match(prompt, /测试运行任务/);
  assert.match(prompt, /铁律重申：你没有任何执行权/);

  // 3. Fallback when snapshot is omitted
  const promptEmpty = buildChatPrompt({ text: "你好" });
  assert.match(promptEmpty, /=== OS SNAPSHOT ===/);
  assert.match(promptEmpty, /（本轮未注入快照）/);
  assert.match(promptEmpty, /=== END OS SNAPSHOT ===/);
});

test("R1-Snapshot-6: Express API GET /api/secretary/os-snapshot and POST /api/secretary/chat zero-dispatch", async () => {
  const { options } = setupIsolatedEnv();

  // Create mock running task
  createTask({ title: "API测试任务", status: "running" });

  const app = express();
  app.use(express.json());

  app.get("/api/secretary/os-snapshot", (_req, res) => {
    try {
      const snapshot = getSecretaryOsSnapshot({}, options);
      res.json({ ok: true, snapshot });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/secretary/chat", async (req, res) => {
    try {
      const payload = { autoDispatch: false, ...(req.body || {}) };
      const fakeEngine = async () => ({ ok: true, agent: "grok-bot", message: "收到。" });
      const result = await sendMessage(payload, {}, { engine: fakeEngine, options });
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    // 1. Verify GET /api/secretary/os-snapshot
    const snapRes = await fetch(`http://127.0.0.1:${port}/api/secretary/os-snapshot`);
    assert.equal(snapRes.status, 200);
    const snapBody = await snapRes.json();
    assert.equal(snapBody.ok, true);
    assert.ok(snapBody.snapshot);
    assert.ok(Array.isArray(snapBody.snapshot.activeTasks));
    assert.equal(snapBody.snapshot.activeTasks.some((t) => t.title === "API测试任务"), true);
    assert.ok(snapBody.snapshot.pendingApprovals);
    assert.ok(snapBody.snapshot.workerHealth);
    assert.ok(snapBody.snapshot.deliverables);
    assert.ok(snapBody.snapshot.memoryCandidates);
    assert.ok(snapBody.snapshot.founderDecisionsRequired);

    // 2. Verify POST /api/secretary/chat with command text defaults to zero-dispatch
    const tasksBefore = listTasks(options).length;
    const chatRes = await fetch(`http://127.0.0.1:${port}/api/secretary/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "分析并排版小红书画报封面" })
    });
    assert.equal(chatRes.status, 200);
    const chatBody = await chatRes.json();
    assert.equal(chatBody.ok, true);
    assert.equal(chatBody.task, null, "Default chat route must not auto-dispatch");
    assert.equal(listTasks(options).length, tasksBefore, "Task count must not change");
  } finally {
    server.close();
  }
});
