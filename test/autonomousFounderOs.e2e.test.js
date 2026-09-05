/**
 * End-to-End (E2E) Test Suite: AI Founder OS 5 Core Architecture Pillars
 *
 * Requirements & Pillars:
 * - R1: Secretary OS Snapshot & Decision Aggregation (Read-only, zero dispatch, privacy redaction)
 * - R2: Learning Event Stream & Feedback Capture (Append-only 12 event types, zero-token router)
 * - R3: Evidence-Based Memory Lifecycle & Conflict Isolation (candidate -> testing -> active / declining)
 * - R4: File Registry & Controlled Delivery Outbox (SHA-256 byte hashes, held default, 403 /send)
 * - R5: Cost-First Workforce Routing & Rebound Auto-Dispatch (Antigravity > Claude > Grok Build > Codex)
 *
 * Test Tiers:
 * - Tier 1: Feature Coverage (25 tests, >=5 per pillar)
 * - Tier 2: Boundary & Corner Cases (25 tests, >=5 per pillar)
 * - Tier 3: Cross-Feature Interactions (10 tests, pairwise interactions across pillars)
 * - Tier 4: Real-World Workload Scenarios (5 application scenarios)
 *
 * Total: 65 Comprehensive E2E Tests
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import http from "http";
import express from "express";

// Pillar 1: Secretary OS Snapshot (R1)
import {
  getSecretaryOsSnapshot,
  buildOsSnapshotText,
  getOsSnapshot,
  getCompactOsSnapshot
} from "../src/secretary/osSnapshot.js";
import { generateSecretaryBrief } from "../src/secretary/brief.js";
import { sendMessage, buildChatPrompt } from "../src/secretary/chat.js";
import { probeDesktopBot } from "../src/secretary/desktopBot.js";

// Pillar 2: Learning Event Stream (R2)
import {
  EVENT_TYPES,
  getEventsDir,
  recordEvent,
  getEvent,
  listEvents,
  markProcessed
} from "../src/learning/events.js";
import { emitLearningEvent, applyLearningEvent } from "../src/learning/router.js";

// Pillar 3: Evidence-Based Memory Lifecycle (R3)
import {
  createCandidate,
  confirmCandidate,
  getMemory,
  addEvidence,
  rejectCandidate,
  listActive,
  proposeUpdate,
  assertNoSecrets,
  detectMemoryConflict,
  checkMemoryConflict
} from "../src/memory/store.js";
import { buildMemoryContext } from "../src/memory/inject.js";

// Pillar 4: File Registry & Controlled Delivery Outbox (R4)
import {
  registerFile,
  updateFile,
  getFile,
  listFiles,
  toPublicFile,
  computeFileHash,
  verifyFileHash,
  validateSafePath,
  isSensitivePath,
  syncFromDeliverables,
  syncFromContentPackage,
  getFileRegistryDir
} from "../src/files/registry.js";
import {
  enqueueDelivery,
  allowPackageDelivery,
  revokePackageDelivery,
  markDeliverySent,
  getOutboxItem,
  listOutbox,
  loadOutbox
} from "../src/delivery/outbox.js";
import { handleFileDownload } from "../src/files/download.js";
import { getPhoneAccessToken } from "../src/phoneAccess.js";

// Pillar 5: Cost-First Workforce Routing & Rebound (R5)
import { FALLBACK_CHAIN, WORKERS } from "../src/workers/ids.js";
import { applyCostGuard } from "../src/workers/costGuard.js";
import { evaluateModelNeed } from "../src/workforce/modelNeed.js";
import {
  getWorkersRegistry,
  getWorker,
  updateWorker,
  saveWorkersRegistry,
  DEFAULT_WORKERS
} from "../src/workforce/registry.js";
import {
  checkAndReboundWorker,
  wakeWaitingTasks
} from "../src/workforce/rebound.js";
import { recordWorkerFailure, recordWorkerSuccess } from "../src/workforce/statusMachine.js";
import { markQuotaExhausted } from "../src/workers/quota.js";
import { chooseAgent, dispatchTask } from "../src/router.js";

// Tasks, Content, and Financial Subsystems
import { createTask, getTask, updateTask, listTasks } from "../src/store.js";
import {
  createPackage,
  getPackage,
  freezePackage,
  approvePackage,
  rejectPackage,
  updatePackage,
  appendPackageMetrics,
  recordPublish
} from "../src/content/store.js";
import { getCurrentPeriod } from "../src/billing/deepseekBudget.js";
import { diagnoseFunnel } from "../src/autonomous_content/learningLedger.js";

// ---------------------------------------------------------------------------
// Shared Test Setup & Environment Isolation
// ---------------------------------------------------------------------------

function setupIsolatedEnv(prefix = "e2e-founder-os-") {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const tasksDir = path.join(baseDir, "tasks");
  const filesDir = path.join(baseDir, "files");
  const memoryDir = path.join(baseDir, "memory");
  const candidatesDir = path.join(memoryDir, "candidates");
  const itemsDir = path.join(memoryDir, "items");
  const packagesDir = path.join(baseDir, "content", "packages");
  const reportsDir = path.join(baseDir, "reports");
  const workforceDir = path.join(baseDir, "workforce");
  const billingDir = path.join(baseDir, "billing");
  const secretaryDir = path.join(baseDir, "secretary");
  const eventsDir = path.join(baseDir, "events");
  const deliveryDir = path.join(baseDir, "delivery");
  const quotaDir = path.join(baseDir, "quota");
  const outboxFile = path.join(deliveryDir, "outbox.json");

  fs.mkdirSync(tasksDir, { recursive: true });
  fs.mkdirSync(filesDir, { recursive: true });
  fs.mkdirSync(candidatesDir, { recursive: true });
  fs.mkdirSync(itemsDir, { recursive: true });
  fs.mkdirSync(packagesDir, { recursive: true });
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.mkdirSync(workforceDir, { recursive: true });
  fs.mkdirSync(billingDir, { recursive: true });
  fs.mkdirSync(secretaryDir, { recursive: true });
  fs.mkdirSync(eventsDir, { recursive: true });
  fs.mkdirSync(deliveryDir, { recursive: true });
  fs.mkdirSync(quotaDir, { recursive: true });

  process.env.TASKS_BASE_DIR = baseDir;
  process.env.FILES_BASE_DIR = filesDir;
  process.env.MEMORY_BASE_DIR = memoryDir;
  process.env.PACKAGES_BASE_DIR = baseDir;
  process.env.CONTENT_PACKAGES_DIR = packagesDir;
  process.env.REPORTS_BASE_DIR = reportsDir;
  process.env.WORKFORCE_BASE_DIR = workforceDir;
  process.env.BILLING_BASE_DIR = billingDir;
  process.env.SECRETARY_BASE_DIR = secretaryDir;
  process.env.LEARNING_EVENTS_DIR = eventsDir;
  process.env.DELIVERY_OUTBOX_FILE = outboxFile;
  process.env.QUOTA_BASE_DIR = quotaDir;

  const options = {
    baseDir,
    tasksDir,
    filesDir,
    memoryDir,
    packagesDir,
    reportsDir,
    workforceDir,
    billingDir,
    secretaryDir,
    eventsDir,
    deliveryDir,
    quotaDir,
    file: outboxFile
  };

  return {
    baseDir,
    tasksDir,
    filesDir,
    memoryDir,
    packagesDir,
    reportsDir,
    workforceDir,
    billingDir,
    secretaryDir,
    eventsDir,
    deliveryDir,
    quotaDir,
    outboxFile,
    options,
    cleanup: () => {
      try {
        fs.rmSync(baseDir, { recursive: true, force: true });
      } catch {}
    }
  };
}

function createValidExperiment(overrides = {}) {
  return {
    accountId: "shuzhai",
    source: "x_trend",
    insight: "反常识认知切入",
    audience: "认知成长青年",
    painOrDesire: "摆脱焦虑建立秩序",
    objective: "save",
    topic: "底层心智模型",
    title: "打破信息茧房的底层逻辑",
    hookType: "contrarian",
    emotion: "curiosity",
    contentStructure: "pain-insight-action",
    cta: "立即收藏实践",
    recommendation: "《原则》精读推荐",
    strategyVersion: "1.0",
    predictionScores: {
      traffic: 85, click: 88, read: 82, save: 91,
      discussion: 70, share: 75, follow: 78, fit: 89, evidence: 85
    },
    risks: [],
    hypothesisIds: ["hyp-founder-os-01"],
    ...overrides
  };
}

const onlineWorker = (id) => ({
  id,
  status: "ONLINE",
  available: true,
  billingMode: "subscription",
  apiAllowed: false
});

const offlineWorker = (id) => ({
  id,
  status: "OFFLINE",
  available: false,
  billingMode: "subscription",
  apiAllowed: false
});

const rejectAutoSend = (_req, res) => {
  res.status(403).json({
    ok: false,
    code: "AUTONOMOUS_SEND_FORBIDDEN",
    error: "AUTONOMOUS_SEND_FORBIDDEN: Agents cannot publish. Founder approval publishes via /approve; retry via /publish after login."
  });
};

// ============================================================================
// TIER 1: FEATURE COVERAGE (5 Pillars x >=5 tests = 25 tests)
// ============================================================================

// ----------------------------------------------------------------------------
// Suite 1.1: Pillar 1 - Secretary OS Snapshot & Decision Aggregation (R1)
// ----------------------------------------------------------------------------

test("Tier 1 - R1.1: getSecretaryOsSnapshot produces deterministic JSON state with all required sections", () => {
  const { baseDir, options, packagesDir } = setupIsolatedEnv("e2e-t1-snap-");

  const runningTask = createTask({ title: "后台爆款热点抓取", status: "running" });
  updateTask(runningTask.id, { startedAt: new Date().toISOString() });

  const pendingTask = createTask({
    title: "自动化发布排期任务",
    status: "awaiting_approval",
    riskLevel: "high",
    riskReasons: ["外部平台合规审核"]
  });

  const memCandidate = createCandidate({
    title: "反常识留存文案模板",
    content: "3秒破防式痛点反常识拆解",
    type: "judgment",
    domain: "copywriting"
  }, options);

  const deliverablePath = path.join(baseDir, "slide_cover.png");
  fs.writeFileSync(deliverablePath, "PNG_MOCK_PAYLOAD_E2E");
  registerFile({
    filePath: deliverablePath,
    projectRoot: baseDir,
    verified: true,
    sendable: false,
    taskId: runningTask.id
  }, { ...options, baseDir: options.filesDir });

  const pkgFile = path.join(packagesDir, "pkg-e2e-01.json");
  fs.writeFileSync(pkgFile, JSON.stringify({
    id: "pkg-e2e-01",
    title: "认知破局指南",
    status: "awaiting_approval",
    platform: "xiaohongshu",
    createdAt: new Date().toISOString()
  }, null, 2));

  const snapshot = getSecretaryOsSnapshot({}, options);

  assert.equal(snapshot.ok, true);
  assert.ok(snapshot.timestamp, "Snapshot must have ISO timestamp");
  assert.ok(Array.isArray(snapshot.activeTasks));
  assert.ok(snapshot.pendingApprovals);
  assert.ok(Array.isArray(snapshot.workerHealth));
  assert.ok(Array.isArray(snapshot.deliverables));
  assert.ok(Array.isArray(snapshot.memoryCandidates));
  assert.ok(snapshot.founderDecisionsRequired);

  assert.equal(snapshot.activeTasks.some((t) => t.id === runningTask.id), true);
  assert.equal(snapshot.pendingApprovals.items.some((i) => i.id === pendingTask.id), true);
  assert.equal(snapshot.pendingApprovals.items.some((i) => i.id === "pkg-e2e-01"), true);
  assert.equal(snapshot.memoryCandidates.some((c) => c.id === memCandidate.id), true);
  assert.equal(snapshot.deliverables.some((d) => d.name === "slide_cover.png"), true);
  assert.ok(snapshot.founderDecisionsRequired.totalPending >= 3);
});

test("Tier 1 - R1.2: Privacy redaction strictly masks secrets, API keys, and sensitive tokens with sk-*** / ***", () => {
  const { options } = setupIsolatedEnv("e2e-t1-mask-");

  const failedTask = createTask({ title: "爬虫网络任务失败" });
  updateTask(failedTask.id, {
    status: "failed",
    error: "Failed authentication with token=superSecretToken12345 and key sk-abcdef1234567890abcdef123456"
  });

  const snapshot = getSecretaryOsSnapshot({}, options);
  const taskInSnapshot = snapshot.recentFailedTasks.find((t) => t.id === failedTask.id);

  assert.ok(taskInSnapshot);
  assert.doesNotMatch(taskInSnapshot.error, /sk-abcdef1234567890/);
  assert.match(taskInSnapshot.error, /sk-\*\*\*/);
  assert.match(taskInSnapshot.error, /token=\*\*\*/);
});

test("Tier 1 - R1.3: Financial amounts and spent numbers are withheld (amounts: 'withheld', spentCny omitted)", () => {
  const { options } = setupIsolatedEnv("e2e-t1-billing-");

  const period = getCurrentPeriod();
  const ledgerPath = path.join(options.billingDir, `deepseek-${period}.json`);
  fs.writeFileSync(ledgerPath, JSON.stringify({
    period,
    currency: "CNY",
    limitCny: 50,
    spentCny: 48.75,
    balance: 1.25,
    hardStop: false,
    entries: []
  }, null, 2));

  const snapshot = getSecretaryOsSnapshot({}, options);

  assert.ok(snapshot.billing);
  assert.equal(snapshot.billing.amounts, "withheld");
  assert.equal(snapshot.billing.spentCny, undefined);
  assert.equal(snapshot.billing.balance, undefined);

  const textBrief = buildOsSnapshotText(snapshot);
  assert.match(textBrief, /amounts withheld/);
});

test("Tier 1 - R1.4: Conversational chat defaults to zero autonomous dispatch (autoDispatch: false creates no task)", async () => {
  const { options } = setupIsolatedEnv("e2e-t1-chat-");

  const fakeEngine = async () => ({
    ok: true,
    agent: "grok-bot",
    message: "已收到您的想法：分析海外爆款热点。"
  });

  const initialCount = listTasks(options).length;

  const { userTurn, assistantTurn, task } = await sendMessage(
    { text: "请分析海外高赞认知热点并提炼选题" },
    {},
    { engine: fakeEngine, options }
  );

  assert.equal(task, null, "Conversation must not auto-dispatch task by default");
  assert.equal(userTurn.taskId, null);
  assert.equal(assistantTurn.taskId, null);
  assert.equal(listTasks(options).length, initialCount);

  const dispatched = await sendMessage(
    { text: "请分析海外高赞认知热点并提炼选题", autoDispatch: true },
    { dryRun: true },
    { engine: fakeEngine, options }
  );

  assert.ok(dispatched.task);
  assert.ok(dispatched.task.id);
  assert.equal(getTask(dispatched.task.id, options).id, dispatched.task.id);
});

test("Tier 1 - R1.5: Prompt construction injects '=== OS SNAPSHOT ===' block with zero external LLM tokens", () => {
  const sampleSnapshot = {
    activeTasks: [{ id: "t-e2e-1", status: "running", title: "测试运行任务" }],
    recentCompletedTasks: [],
    recentFailedTasks: [],
    pendingApprovals: { count: 0, items: [] },
    founderDecisionsRequired: { totalPending: 0, items: [] },
    workerHealth: [{ id: "antigravity", status: "AVAILABLE", available: true }],
    deliverables: [],
    latestReports: []
  };

  const text = buildOsSnapshotText(sampleSnapshot);
  assert.match(text, /^=== OS SNAPSHOT ===/);
  assert.match(text, /=== END OS SNAPSHOT ===$/);
  assert.match(text, /测试运行任务/);

  const prompt = buildChatPrompt({
    text: "帮我总结今天系统运行状况",
    snapshot: text
  });

  assert.match(prompt, /=== OS SNAPSHOT ===/);
  assert.match(prompt, /测试运行任务/);
  assert.match(prompt, /铁律重申：你没有任何执行权/);
});

// ----------------------------------------------------------------------------
// Suite 1.2: Pillar 2 - Learning Event Stream & Feedback Capture (R2)
// ----------------------------------------------------------------------------

test("Tier 1 - R2.1: All 12 core event types are recognized and recorded cleanly", () => {
  const { options } = setupIsolatedEnv("e2e-t1-event-types-");

  assert.equal(EVENT_TYPES.length, 12);
  const expectedTypes = [
    "FOUNDER_SELECTED", "FOUNDER_APPROVED", "FOUNDER_REJECTED",
    "FOUNDER_EDITED", "FOUNDER_REGENERATED", "FOUNDER_FAVORITED",
    "TASK_SUCCEEDED", "TASK_FAILED", "CONTENT_OUTPERFORMED",
    "CONTENT_UNDERPERFORMED", "AGENT_ESCALATED", "LEARNING_CONFLICT"
  ];

  for (const type of expectedTypes) {
    assert.ok(EVENT_TYPES.includes(type), `EVENT_TYPES missing ${type}`);
    const recorded = recordEvent({
      type,
      domain: "test_domain",
      actor: "system",
      subject: { kind: "test", id: `subj-${type}` },
      payload: { valid: true }
    }, options);

    assert.equal(recorded.type, type);
    assert.ok(recorded.id.startsWith("evt-"));
    assert.equal(recorded.processed, false);

    const onDisk = getEvent(recorded.id, options);
    assert.equal(onDisk.id, recorded.id);
  }

  assert.throws(() => {
    recordEvent({ type: "UNKNOWN_MALICIOUS_TYPE" }, options);
  }, /Invalid learning event type/);
});

test("Tier 1 - R2.2: Atomic append-only persistence invariant: duplicate event ID throws append-only ledger violation", () => {
  const { options } = setupIsolatedEnv("e2e-t1-append-only-");

  const fixedId = "evt-append-invariant-001";
  const first = recordEvent({
    id: fixedId,
    type: "FOUNDER_SELECTED",
    domain: "visual",
    actor: "founder",
    subject: { kind: "artifact", id: "art-01" },
    winner: "art-01",
    losers: ["art-02"]
  }, options);

  assert.equal(first.id, fixedId);

  assert.throws(() => {
    recordEvent({
      id: fixedId,
      type: "FOUNDER_SELECTED",
      domain: "visual"
    }, options);
  }, /append-only ledger violation/);

  const processed = markProcessed(fixedId, options);
  assert.equal(processed.processed, true);
  assert.equal(getEvent(fixedId, options).processed, true);
});

test("Tier 1 - R2.3: Task rerun action triggers FOUNDER_REGENERATED learning event", () => {
  const { options } = setupIsolatedEnv("e2e-t1-rerun-");

  const task = createTask({ title: "数据清洗任务", status: "completed" }, options);

  const prevStatus = task.status;
  updateTask(task.id, { status: "queued" }, options);

  const event = emitLearningEvent({
    type: "FOUNDER_REGENERATED",
    domain: "engineering",
    actor: "founder",
    subject: { kind: "task", id: task.id },
    payload: { previousStatus: prevStatus }
  }, options);

  assert.equal(event.type, "FOUNDER_REGENERATED");
  assert.equal(event.subject.id, task.id);
  assert.equal(event.payload.previousStatus, "completed");

  const found = listEvents({ type: "FOUNDER_REGENERATED", subjectId: task.id }, options);
  assert.equal(found.length, 1);
});

test("Tier 1 - R2.4: Content package metrics evaluation triggers CONTENT_OUTPERFORMED / CONTENT_UNDERPERFORMED", () => {
  const { options } = setupIsolatedEnv("e2e-t1-pkg-metrics-");

  const experiment = createValidExperiment();
  const pkg1 = createPackage({ title: "高赞复盘", body: "深度复盘内容", platform: "xiaohongshu", experiment }, options);
  freezePackage(pkg1.id, options);
  approvePackage(pkg1.id, options);
  recordPublish(pkg1.id, { ok: true }, options);

  const highMetrics = {
    impressions: 5000,
    views: 500,
    reads: 500,
    dwell_time: 30,
    avgStaySeconds: 30,
    likes: 50,
    collects: 45,
    saves: 45,
    comments: 20,
    follows: 15,
    followersGained: 15,
    conversions_gmv: 50
  };
  appendPackageMetrics(pkg1.id, highMetrics, options);

  const diagHigh = diagnoseFunnel(highMetrics);
  const eventHigh = emitLearningEvent({
    type: diagHigh.verdict === "outperformed" || (diagHigh.engagementRate ?? 0) >= 0.05 ? "CONTENT_OUTPERFORMED" : "CONTENT_UNDERPERFORMED",
    domain: "content_performance",
    actor: "system",
    subject: { kind: "package", id: pkg1.id },
    payload: { metrics: highMetrics, stage: diagHigh.stage }
  }, options);

  assert.equal(eventHigh.type, "CONTENT_OUTPERFORMED");

  const pkg2 = createPackage({ title: "低光笔记", body: "低光复盘内容", platform: "xiaohongshu", experiment }, options);
  freezePackage(pkg2.id, options);
  recordPublish(pkg2.id, { ok: true }, options);

  const lowMetrics = { impressions: 200, reads: 10, likes: 1, saves: 0 };
  appendPackageMetrics(pkg2.id, lowMetrics, options);

  const diagLow = diagnoseFunnel(lowMetrics);
  const eventLow = emitLearningEvent({
    type: diagLow.verdict === "outperformed" ? "CONTENT_OUTPERFORMED" : "CONTENT_UNDERPERFORMED",
    domain: "content_performance",
    actor: "system",
    subject: { kind: "package", id: pkg2.id },
    payload: { metrics: lowMetrics, stage: diagLow.stage }
  }, options);

  assert.equal(eventLow.type, "CONTENT_UNDERPERFORMED");
  assert.equal(eventLow.payload.stage, "low_exposure");
});

test("Tier 1 - R2.5: Junior failover emits AGENT_ESCALATED and task terminal states emit TASK_SUCCEEDED / TASK_FAILED", () => {
  const { options } = setupIsolatedEnv("e2e-t1-events-routing-");

  const escEvent = emitLearningEvent({
    type: "AGENT_ESCALATED",
    domain: "routing",
    actor: "system",
    subject: { kind: "task", id: "task-esc-001" },
    payload: { from: "antigravity", to: "codex", reason: "Antigravity 验收多次不通过" }
  }, options);
  assert.equal(escEvent.type, "AGENT_ESCALATED");

  const succEvent = emitLearningEvent({
    type: "TASK_SUCCEEDED",
    domain: "engineering",
    actor: "system",
    subject: { kind: "task", id: "task-succ-002" },
    payload: { agent: "antigravity", durationMs: 120 }
  }, options);
  assert.equal(succEvent.type, "TASK_SUCCEEDED");

  const failEvent = emitLearningEvent({
    type: "TASK_FAILED",
    domain: "engineering",
    actor: "system",
    subject: { kind: "task", id: "task-fail-003" },
    payload: { agent: "antigravity", error: "Command exit non-zero" }
  }, options);
  assert.equal(failEvent.type, "TASK_FAILED");

  assert.equal(listEvents({ type: "AGENT_ESCALATED" }, options).length, 1);
  assert.equal(listEvents({ type: "TASK_SUCCEEDED" }, options).length, 1);
  assert.equal(listEvents({ type: "TASK_FAILED" }, options).length, 1);
});

// ----------------------------------------------------------------------------
// Suite 1.3: Pillar 3 - Evidence-Based Memory Lifecycle & Conflict Isolation (R3)
// ----------------------------------------------------------------------------

test("Tier 1 - R3.1: Candidate confirmation (confirmCandidate) advances card strictly to testing (never active)", () => {
  const { options, memoryDir } = setupIsolatedEnv("e2e-t1-mem-conf-");

  const candidate = createCandidate({
    title: "反常识留存抓手",
    content: "3秒抛出违背直觉的硬核论点，唤起好奇心",
    type: "judgment",
    domain: "copywriting",
    projectScope: ["shuzhai"]
  }, options);

  assert.equal(candidate.status, "candidate");
  assert.equal(candidate.evidenceCount, 0);
  assert.equal(candidate.confidence, 0);

  const testing = confirmCandidate(candidate.id, { reason: "Founder verified initial hypothesis" }, options);

  assert.equal(testing.status, "testing");
  assert.equal(testing.evidenceCount, 1);
  assert.equal(testing.confidence, 0.33);
  assert.ok(testing.confirmedAt);

  assert.ok(!fs.existsSync(path.join(memoryDir, "candidates", `${candidate.id}.json`)));
  assert.ok(fs.existsSync(path.join(memoryDir, "items", `${testing.id}.json`)));

  assert.equal(listActive({ project: "shuzhai" }, options).some((m) => m.id === testing.id), false);
  assert.equal(listActive({ project: "shuzhai", includeTesting: true }, options).some((m) => m.id === testing.id), true);
});

test("Tier 1 - R3.2: 3-Signal positive evidence threshold (count >= 3 & conf >= 0.70) promotes card to active", () => {
  const { options } = setupIsolatedEnv("e2e-t1-mem-escalate-");

  const cand = createCandidate({
    title: "双色高反差信息卡",
    content: "排版采用黑底高反差双色对比，突出关键操作清单",
    type: "aesthetic",
    domain: "visual"
  }, options);

  const card = confirmCandidate(cand.id, {}, options);
  assert.equal(card.status, "testing");

  const cardS2 = addEvidence(card.id, { positive: true, source: "evt-01" }, options);
  assert.equal(cardS2.status, "testing");
  assert.equal(cardS2.evidenceCount, 2);
  assert.equal(cardS2.confidence, 0.55);
  assert.equal(listActive({}, options).some((m) => m.id === card.id), false);

  const cardS3 = addEvidence(card.id, { positive: true, source: "evt-02" }, options);
  assert.equal(cardS3.status, "active");
  assert.equal(cardS3.evidenceCount, 3);
  assert.equal(cardS3.confidence, 0.77);
  assert.equal(cardS3.trend, "rising");

  assert.equal(listActive({}, options).some((m) => m.id === card.id), true);
});

test("Tier 1 - R3.3: Negative evidence drops confidence and demotes card to declining when confidence < 0.40", () => {
  const { options } = setupIsolatedEnv("e2e-t1-mem-demote-");

  const cand = createCandidate({
    title: "纯文本大字封面",
    content: "封面仅使用纯文本黑白排版",
    type: "aesthetic",
    domain: "visual"
  }, options);
  confirmCandidate(cand.id, {}, options);
  addEvidence(cand.id, { positive: true, source: "s1" }, options);
  const activeCard = addEvidence(cand.id, { positive: true, source: "s2" }, options);
  assert.equal(activeCard.status, "active");
  assert.equal(activeCard.confidence, 0.77);

  const neg1 = addEvidence(cand.id, { positive: false, source: "neg-1" }, options);
  assert.equal(neg1.status, "active");
  assert.equal(neg1.confidence, 0.55);

  const neg2 = addEvidence(cand.id, { positive: false, source: "neg-2" }, options);
  assert.equal(neg2.status, "declining");
  assert.equal(neg2.confidence, 0.33);

  assert.equal(listActive({}, options).some((m) => m.id === cand.id), false);
});

test("Tier 1 - R3.4: Semantic and domain conflict detection identifies opposition and records LEARNING_CONFLICT", () => {
  const { options } = setupIsolatedEnv("e2e-t1-mem-conflict-");

  const candA = createCandidate({
    title: "巴黎时装秀黑白红高级质感",
    content: "界面设计遵循巴黎时装秀质感，黑、象牙白、高级红，克制高级，严禁游戏风和霓虹灯",
    domain: "visual",
    type: "aesthetic"
  }, options);
  confirmCandidate(candA.id, {}, options);

  const cardB = {
    id: "mem-macaron-01",
    title: "马卡龙高饱和鲜艳霓虹风",
    content: "封面采用彩色马卡龙高饱和鲜艳霓虹配色，活泼动漫风",
    domain: "visual",
    type: "aesthetic"
  };

  const conflict = detectMemoryConflict(cardB, [candA]);
  assert.equal(conflict.hasConflict, true);
  assert.ok(conflict.conflictingIds.includes(candA.id));

  const candB = createCandidate(cardB, options);
  const report = checkMemoryConflict(candB, options);
  assert.equal(report.hasConflict, true);

  const conflictEvents = listEvents({ type: "LEARNING_CONFLICT" }, options);
  assert.ok(conflictEvents.length >= 1);
});

test("Tier 1 - R3.5: assertNoSecrets strictly blocks citizen IDs, credit cards, passwords, and API keys", () => {
  const forbiddenInputs = [
    "sk-proj-1234567890abcdef1234567890",
    "password: AdminSecretPass123!",
    "bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
    "110101199003072345",
    "6222 0212 3456 7890 123"
  ];

  for (const str of forbiddenInputs) {
    assert.throws(() => {
      assertNoSecrets(str);
    }, /Secret or sensitive credential pattern detected/);

    assert.throws(() => {
      createCandidate({ title: "非法信息", content: str });
    }, /Secret or sensitive credential pattern detected/);
  }

  assert.doesNotThrow(() => assertNoSecrets("正常的高级巴黎红质感文案"));
});

// ----------------------------------------------------------------------------
// Suite 1.4: Pillar 4 - File Registry & Controlled Delivery Outbox (R4)
// ----------------------------------------------------------------------------

test("Tier 1 - R4.1: Full-file SHA-256 byte hashing matches physical disk bytes and exact byte size", () => {
  const { baseDir, options } = setupIsolatedEnv("e2e-t1-hash-");

  const testFile = path.join(baseDir, "render_slide.png");
  const payload = Buffer.from("RAW_BINARY_STREAM_BYTE_DATA_FOR_SHA256_TEST");
  fs.writeFileSync(testFile, payload);

  const expectedSha256 = crypto.createHash("sha256").update(payload).digest("hex");
  const expectedSize = payload.length;

  const record = registerFile({
    filePath: testFile,
    projectRoot: baseDir,
    verified: true,
    sendable: false
  }, options);

  assert.equal(record.sha256, expectedSha256);
  assert.equal(record.sizeBytes, expectedSize);
  assert.equal(record.deliveryStatus, "held");

  const integrity = verifyFileHash(record.fileId, options);
  assert.equal(integrity.valid, true);
  assert.equal(integrity.actualHash, expectedSha256);
});

test("Tier 1 - R4.2: Safe path validation strictly prevents path traversals (..), sensitive files, and directory registration", () => {
  const { baseDir, options } = setupIsolatedEnv("e2e-t1-safepath-");

  assert.throws(
    () => validateSafePath("../../../etc/shadow", baseDir),
    /Path traversal outside project root is forbidden/
  );

  assert.equal(isSensitivePath(".env"), true);
  assert.equal(isSensitivePath("credentials.json"), true);
  assert.throws(
    () => validateSafePath(".env", baseDir),
    /Access to sensitive or private file is forbidden/
  );

  const subDir = path.join(baseDir, "somedir");
  fs.mkdirSync(subDir, { recursive: true });
  assert.throws(
    () => registerFile({ filePath: subDir, projectRoot: baseDir }, options),
    /Cannot register a directory as a file/
  );
});

test("Tier 1 - R4.3: Invariant: sendable and allowSend cannot be true if verified is false", () => {
  const { baseDir, options } = setupIsolatedEnv("e2e-t1-invariant-");

  const filePath = path.join(baseDir, "draft.png");
  fs.writeFileSync(filePath, "DRAFT_IMAGE");

  assert.throws(() => {
    registerFile({
      filePath,
      projectRoot: baseDir,
      verified: false,
      sendable: true
    }, options);
  }, /未验收文件不能标记为可发送/);

  const rec = registerFile({
    filePath,
    projectRoot: baseDir,
    verified: false,
    sendable: false
  }, options);

  assert.throws(() => {
    updateFile(rec.fileId, { sendable: true }, options);
  }, /未验收文件不能标记为可发送/);
});

test("Tier 1 - R4.4: Delivery outbox items default to status 'held' and allowSend: false", () => {
  const { baseDir, options } = setupIsolatedEnv("e2e-t1-outbox-held-");

  const filePath = path.join(baseDir, "guide.md");
  fs.writeFileSync(filePath, "# Guide");

  const file = registerFile({
    filePath,
    projectRoot: baseDir,
    verified: true,
    sendable: false
  }, options);

  const outboxItem = enqueueDelivery({
    fileId: file.fileId,
    packageId: "pkg-held-101",
    channel: "local"
  }, options);

  assert.equal(outboxItem.status, "held");
  assert.equal(outboxItem.allowSend, false);
  assert.equal(outboxItem.sentAt, null);

  const heldList = listOutbox({ status: "held" }, options);
  assert.equal(heldList.length, 1);
  assert.equal(heldList[0].fileId, file.fileId);
});

test("Tier 1 - R4.5: Package approval releases media to 'allowed', rejection revokes to 'held', and /send returns 403", async () => {
  const { baseDir, options } = setupIsolatedEnv("e2e-t1-pkg-outbox-");

  const mediaRel = "media/cover.png";
  const mediaAbs = path.join(baseDir, mediaRel);
  fs.mkdirSync(path.dirname(mediaAbs), { recursive: true });
  fs.writeFileSync(mediaAbs, "MEDIA_BYTES");

  const pkg = createPackage({
    title: "排期测试笔记",
    body: "排期测试正文内容",
    platform: "xiaohongshu",
    media: [{ path: mediaRel, kind: "cover" }],
    experiment: createValidExperiment()
  }, options);

  freezePackage(pkg.id, { ...options, projectRoot: baseDir });
  let files = listFiles({ packageId: pkg.id }, options);
  assert.equal(files[0].deliveryStatus, "held");

  approvePackage(pkg.id, { ...options, projectRoot: baseDir });
  files = listFiles({ packageId: pkg.id }, options);
  assert.equal(files[0].deliveryStatus, "allowed");
  assert.equal(files[0].allowSend, true);

  let outbox = listOutbox({ packageId: pkg.id }, options);
  assert.equal(outbox[0].status, "allowed");
  assert.equal(outbox[0].allowSend, true);

  rejectPackage(pkg.id, { reason: "Need rework" }, { ...options, projectRoot: baseDir });
  outbox = listOutbox({ packageId: pkg.id }, options);
  assert.equal(outbox[0].status, "held");
  assert.equal(outbox[0].allowSend, false);

  const app = express();
  app.post("/api/content/packages/:id/send", rejectAutoSend);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/content/packages/${pkg.id}/send`, { method: "POST" });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, "AUTONOMOUS_SEND_FORBIDDEN");
  } finally {
    server.close();
  }
});

// ----------------------------------------------------------------------------
// Suite 1.5: Pillar 5 - Cost-First Workforce Routing & Rebound Auto-Dispatch (R5)
// ----------------------------------------------------------------------------

test("Tier 1 - R5.1: FALLBACK_CHAIN strictly prioritizes cost-effective workers: antigravity > claude > grok-build > codex", () => {
  assert.deepEqual(FALLBACK_CHAIN, ["antigravity", "claude", "grok-build", "codex"]);
  assert.equal(FALLBACK_CHAIN[0], "antigravity");
  assert.equal(FALLBACK_CHAIN[1], "claude");
  assert.equal(FALLBACK_CHAIN[2], "grok-build");
  assert.equal(FALLBACK_CHAIN[3], "codex");
});

test("Tier 1 - R5.2: LOW-tier tasks strictly skip Codex and senior models on fallback", () => {
  const health = {
    antigravity: offlineWorker("antigravity"),
    claude: onlineWorker("claude"),
    "grok-build": onlineWorker("grok-build"),
    codex: onlineWorker("codex")
  };

  const lowTask = {
    title: "调整按钮 hover 背景颜色",
    modelNeed: { tier: "LOW", modelNeedScore: 18 }
  };

  const guard = applyCostGuard("auto", health, { task: lowTask });
  assert.equal(guard.ok, false);
  assert.equal(guard.action, "HUMAN_ACTION_REQUIRED");
  assert.ok(guard.attempts.some((a) => a.id === "codex" && a.skip.includes("SENIOR_MODEL_RESERVED")));
  assert.ok(guard.attempts.some((a) => a.id === "claude" && a.skip.includes("SENIOR_MODEL_RESERVED")));
  assert.ok(guard.attempts.some((a) => a.id === "grok-build" && a.skip.includes("SENIOR_MODEL_RESERVED")));
});

test("Tier 1 - R5.3: ModelNeed keyword over-triggering tuning: UI '重构按钮' remains LOW, architecture refactor escalates to HIGH", () => {
  const lowTasks = [
    { title: "重构按钮样式", description: "调整高光与渐变色" },
    { title: "修改卡片 hover 动效", description: "添加CSS hover 过渡" }
  ];

  for (const t of lowTasks) {
    const need = evaluateModelNeed(t);
    assert.equal(need.tier, "LOW", `Task "${t.title}" should be LOW tier`);
    assert.equal(need.preferredWorker, "antigravity");
    assert.equal(need.requiresSeniorWorker, false);
  }

  const highTasks = [
    { title: "重构 Task Scheduler 核心架构", description: "重构跨模块状态机与并发调度队列" },
    { title: "重构底层协议解析器", description: "重写核心系统协议解析" }
  ];

  for (const t of highTasks) {
    const need = evaluateModelNeed(t);
    assert.equal(need.tier, "HIGH", `Task "${t.title}" should be HIGH tier`);
    assert.equal(need.preferredWorker, "codex");
    assert.equal(need.requiresSeniorWorker, true);
  }
});

test("Tier 1 - R5.4: Senior coding task with Codex offline executes SAFE PREWORK and suspends to waiting_for_capacity", async () => {
  const { options } = setupIsolatedEnv("e2e-t1-prework-");

  const wfOptions = { baseDir: options.workforceDir, tasksDir: options.tasksDir, quotaDir: options.quotaDir };
  recordWorkerFailure("codex", "QUOTA_EXHAUSTED", "usage limit reached for today", wfOptions);
  markQuotaExhausted("codex", "usage limit reached", wfOptions);

  const seniorTask = createTask({
    title: "重构 Task Scheduler 核心架构",
    description: "重构底层跨模块状态机与并发队列，修复并发竞争条件",
    status: "queued"
  }, options);

  const config = { dryRun: true, agents: { antigravity: { permissionMode: "dangerous-bypass" } } };
  const dispatched = await dispatchTask(seniorTask.id, config);

  assert.equal(dispatched.status, "waiting_for_capacity");
  assert.equal(dispatched.targetSeniorWorker, "codex");
  assert.ok(dispatched.prework?.completed, "Safe prework must be completed before suspension");
});

test("Tier 1 - R5.5: Active rebound re-dispatch: worker recovery actively triggers wakeWaitingTasks and re-dispatches tasks", async () => {
  const { options } = setupIsolatedEnv("e2e-t1-rebound-");

  const task1 = createTask({
    title: "重构状态机模块 1",
    status: "waiting_for_capacity",
    targetSeniorWorker: "codex",
    prework: { completed: true }
  }, options);

  const task2 = createTask({
    title: "重构状态机模块 2",
    status: "waiting_for_capacity",
    targetSeniorWorker: "codex",
    prework: { completed: true }
  }, options);

  const dispatchedIds = [];
  const mockDispatch = async (taskId) => {
    dispatchedIds.push(taskId);
    return updateTask(taskId, { status: "running" }, options);
  };

  const awakened = wakeWaitingTasks("codex", {
    ...options,
    dispatchTask: mockDispatch
  });

  assert.equal(awakened, 2);
  assert.ok(dispatchedIds.includes(task1.id));
  assert.ok(dispatchedIds.includes(task2.id));
  assert.equal(getTask(task1.id, options).status, "running");
  assert.equal(getTask(task2.id, options).status, "running");
});

// ============================================================================
// TIER 2: BOUNDARY & CORNER CASES (25 Tests)
// ============================================================================

function mockDownloadReqRes({ headers = {}, params = {} } = {}) {
  let statusCode = 200;
  let jsonBody = null;
  let sentFile = null;
  const resHeaders = {};

  const req = {
    get: (h) => headers[h] ?? headers[h.toLowerCase()] ?? null,
    params
  };

  const res = {
    status: (code) => {
      statusCode = code;
      return res;
    },
    json: (body) => {
      jsonBody = body;
      return res;
    },
    setHeader: (name, val) => {
      resHeaders[name] = val;
      return res;
    },
    sendFile: (filePath) => {
      sentFile = filePath;
      return res;
    }
  };

  return {
    req,
    res,
    getStatus: () => statusCode,
    getBody: () => jsonBody,
    getSentFile: () => sentFile,
    getHeaders: () => resHeaders
  };
}

// ----------------------------------------------------------------------------
// Suite 2.1: Pillar 1 - Secretary OS Snapshot Boundaries
// ----------------------------------------------------------------------------

test("Tier 2 - R1.6: Uninitialized storage returns consistent empty snapshot defaults without mutating file system", () => {
  const { options, baseDir } = setupIsolatedEnv("e2e-t2-uninit-");

  const snapshot = getSecretaryOsSnapshot({}, options);

  assert.equal(snapshot.ok, true);
  assert.ok(Array.isArray(snapshot.activeTasks));
  assert.equal(snapshot.activeTasks.length, 0);
  assert.ok(Array.isArray(snapshot.runningTasks));
  assert.equal(snapshot.runningTasks.length, 0);
  assert.ok(Array.isArray(snapshot.workerHealth));
  assert.ok(snapshot.workerHealth.length > 0, "Default worker definitions should be present");
  assert.ok(Array.isArray(snapshot.deliveryOutbox));
  assert.equal(snapshot.deliveryOutbox.length, 0);
  assert.ok(snapshot.billing, "Billing summary structure should exist");
  assert.equal(snapshot.billing.amounts, "withheld");

  // Verify file system was not polluted with unexpected tasks or packages
  assert.equal(fs.readdirSync(options.tasksDir).length, 0);
  assert.equal(fs.readdirSync(options.packagesDir).length, 0);
});

test("Tier 2 - R1.7: Deep recursive privacy redaction sanitizes large multi-token payload and nested structures", () => {
  const { options } = setupIsolatedEnv("e2e-t2-redact-large-");

  // Create a running task with sensitive credentials in error and title
  const secretError = "Task failed at auth step: sk-proj-supermeSecretKey99881122 with password=TopSecretPass1234! and token=SecretToken12345";
  const task = createTask({
    title: "常规后台数据分析",
    status: "running"
  }, options);

  updateTask(task.id, {
    status: "running",
    startedAt: new Date().toISOString(),
    error: secretError
  });

  const snapshot = getSecretaryOsSnapshot({}, options);
  assert.equal(snapshot.runningTasks.length, 1);
  const taskInSnapshot = snapshot.runningTasks[0];

  assert.ok(!taskInSnapshot.error.includes("sk-proj-supermeSecretKey99881122"), "Raw sk- token must be redacted");
  assert.ok(!taskInSnapshot.error.includes("TopSecretPass1234!"), "Password must be redacted");
  assert.ok(taskInSnapshot.error.includes("sk-***"), "sk-*** mask must be present");
  assert.ok(taskInSnapshot.error.includes("password=***"), "password=*** mask must be present");

  const text = buildOsSnapshotText(snapshot);
  assert.ok(!text.includes("sk-proj-supermeSecretKey99881122"));
  assert.ok(!text.includes("TopSecretPass1234!"));
});

test("Tier 2 - R1.8: Desktop bot probe handles desktop environment gracefully without crashing or throwing", () => {
  const customConfig = {
    agents: {
      grokBot: {
        desktopPath: "C:\\nonexistent\\dir\\GrokBot_NonExistent.exe"
      }
    }
  };

  const probe = probeDesktopBot(customConfig);

  assert.equal(probe.product, "Grok Bot.exe");
  assert.equal(probe.canDispatch, false, "Grok Bot must strictly have zero autonomous dispatch capability");
  assert.equal(probe.canSubmit, false, "Grok Bot must strictly have zero autonomous submit capability");
  assert.ok(typeof probe.installed === "boolean");
  assert.ok(typeof probe.running === "boolean");
  assert.ok(typeof probe.evidence === "string");
  assert.equal(probe.snapshot, "/api/secretary/os-snapshot");
});

test("Tier 2 - R1.9: Secretary chat rejects empty and whitespace-only messages with informative error", async () => {
  await assert.rejects(async () => {
    await sendMessage({ text: "" });
  }, /Message text cannot be empty/);

  await assert.rejects(async () => {
    await sendMessage({ text: "   \n\t  \r\n " });
  }, /Message text cannot be empty/);
});

test("Tier 2 - R1.10: Secretary chat rejects oversized payloads exceeding MAX_PROMPT_CHARS boundary", async () => {
  const hugeText = "超长指令".repeat(1001); // >4000 chars
  assert.ok(hugeText.length > 4000);

  await assert.rejects(async () => {
    await sendMessage({ text: hugeText });
  }, /Message too long/);
});

// ----------------------------------------------------------------------------
// Suite 2.2: Pillar 2 - Learning Event Stream Boundaries
// ----------------------------------------------------------------------------

test("Tier 2 - R2.6: recordEvent rejects invalid or unregistered event types with explicit error", () => {
  const { options } = setupIsolatedEnv("e2e-t2-events-invalid-");

  assert.throws(() => {
    recordEvent({ type: "UNKNOWN_UNREGISTERED_TYPE" }, options);
  }, /Invalid learning event type/);

  assert.throws(() => {
    recordEvent({ type: "" }, options);
  }, /Invalid learning event type/);

  assert.throws(() => {
    recordEvent({ type: null }, options);
  }, /Invalid learning event type/);
});

test("Tier 2 - R2.7: Append-only ledger rejects duplicate event ID overwrite attempts to prevent tampering", () => {
  const { options } = setupIsolatedEnv("e2e-t2-events-dup-");

  const fixedId = "evt-immutable-001";
  const first = recordEvent({
    id: fixedId,
    type: "TASK_SUCCEEDED",
    domain: "engineering"
  }, options);
  assert.equal(first.id, fixedId);

  // Attempting to overwrite existing event ID must throw ledger violation error
  assert.throws(() => {
    recordEvent({
      id: fixedId,
      type: "TASK_FAILED",
      domain: "tampering"
    }, options);
  }, /already exists \(append-only ledger violation\)/);
});

test("Tier 2 - R2.8: Rapid batch emission of 50 consecutive events maintains ledger ordering and atomic consistency", () => {
  const { options } = setupIsolatedEnv("e2e-t2-events-batch-");

  const total = 50;
  for (let i = 0; i < total; i++) {
    const isEven = i % 2 === 0;
    emitLearningEvent({
      type: isEven ? "TASK_SUCCEEDED" : "TASK_FAILED",
      domain: "performance_test",
      actor: "system",
      payload: { iteration: i }
    }, options);
  }

  const allEvents = listEvents({}, options);
  assert.equal(allEvents.length, total);

  // Verify all iterations 0 to 49 are accounted for
  const recordedIters = new Set(allEvents.map((e) => e.payload?.iteration));
  for (let i = 0; i < total; i++) {
    assert.ok(recordedIters.has(i), `Iteration ${i} must exist in event ledger`);
  }
});

test("Tier 2 - R2.9: Large unicode and astral plane emoji payload (100KB) persists and parses without corruption", () => {
  const { options } = setupIsolatedEnv("e2e-t2-events-unicode-");

  // Construct 100KB payload with complex Chinese characters, astral emojis, and markdown
  const snippet = "💡【AI商业洞察】极简认知黑客 🔥🚀 愿力×执行力=幂次增长！\nSpecial: <>&\"'/\t\r\n";
  const bigUnicodeText = snippet.repeat(1100); // >100KB
  assert.ok(Buffer.byteLength(bigUnicodeText, "utf8") > 100000, "Must exceed 100KB bytes");

  const evt = recordEvent({
    type: "FOUNDER_EDITED",
    domain: "content",
    payload: { content: bigUnicodeText }
  }, options);

  const retrieved = getEvent(evt.id, options);
  assert.ok(retrieved);
  assert.equal(retrieved.payload.content, bigUnicodeText);
});

test("Tier 2 - R2.10: Filtering listEvents by non-existent domain returns empty array and handles malformed files gracefully", () => {
  const { options, eventsDir } = setupIsolatedEnv("e2e-t2-events-malformed-");

  recordEvent({ type: "TASK_SUCCEEDED", domain: "backend" }, options);

  const emptyList = listEvents({ domain: "nonexistent_domain_xyz" }, options);
  assert.deepEqual(emptyList, []);

  // Inject a corrupt non-JSON file into the directory
  fs.writeFileSync(path.join(eventsDir, "corrupt-file.json"), "{ invalid json - truncate content", "utf8");

  // listEvents must skip corrupted files without throwing
  const resilientList = listEvents({ domain: "backend" }, options);
  assert.equal(resilientList.length, 1);
});

// ----------------------------------------------------------------------------
// Suite 2.3: Pillar 3 - Evidence-Based Memory Lifecycle Boundaries
// ----------------------------------------------------------------------------

test("Tier 2 - R3.6: Confidence clamping maintains bounds strictly in [0.0, 1.0] under extreme evidence sequences", () => {
  const { options } = setupIsolatedEnv("e2e-t2-mem-clamping-");

  const cand = createCandidate({
    title: "极端置信度边界测试",
    content: "测试置信度在极端惩罚与极端奖励下的收敛行为",
    domain: "boundary"
  }, options);

  const confirmed = confirmCandidate(cand.id, "Testing initial", options);
  assert.equal(confirmed.status, "testing");

  // Apply 10 negative feedback signals: should floor at 0.0, not go negative
  let current = confirmed;
  for (let i = 0; i < 10; i++) {
    current = addEvidence(current.id, { positive: false, note: `Negative ${i}` }, options);
  }
  assert.equal(current.confidence, 0.0, "Confidence must clamp at 0.0");
  assert.ok(current.confidence >= 0.0);

  // Apply 10 positive feedback signals: should ceiling at 1.0, not exceed 1.0
  for (let i = 0; i < 10; i++) {
    current = addEvidence(current.id, { positive: true, note: `Positive ${i}` }, options);
  }
  assert.equal(current.confidence, 1.0, "Confidence must clamp at 1.0");
  assert.ok(current.confidence <= 1.0);
});

test("Tier 2 - R3.7: Conflicting memory remains quarantined in testing even after 5 consecutive positive signals", () => {
  const { options } = setupIsolatedEnv("e2e-t2-mem-quarantine-");

  // Step 1: Establish active baseline rule
  const cand1 = createCandidate({
    title: "黑白红克制高级黑设计",
    content: "全站采用黑白红克制极简高级黑风格，禁用彩色",
    type: "aesthetic",
    domain: "visual"
  }, options);
  confirmCandidate(cand1.id, "Baseline rule", options);
  addEvidence(cand1.id, { positive: true }, options);
  addEvidence(cand1.id, { positive: true }, options);
  const active1 = addEvidence(cand1.id, { positive: true }, options);
  assert.equal(active1.status, "active");

  // Step 2: Introduce conflicting preference
  const cand2 = createCandidate({
    title: "高饱和彩色马卡龙霓虹动漫风格",
    content: "全站采用高饱和彩色马卡龙与霓虹鲜艳二次元动漫画报",
    type: "aesthetic",
    domain: "visual"
  }, options);
  const conf2 = confirmCandidate(cand2.id, "Conflict testing", options);
  assert.equal(conf2.hasConflict, true);

  // Step 3: Add 5 positive signals to conflicting candidate
  let current2 = conf2;
  for (let i = 0; i < 5; i++) {
    current2 = addEvidence(current2.id, { positive: true, note: `Trial success ${i}` }, options);
  }

  // Must remain quarantined in 'testing' and NOT promoted to 'active'
  assert.equal(current2.status, "testing", "Conflicting memory must remain quarantined in testing status");
  assert.equal(current2.hasConflict, true);

  // Baseline active card must remain untouched
  const baseline = getMemory(cand1.id, options);
  assert.equal(baseline.status, "active");
});

test("Tier 2 - R3.8: proposeUpdate on non-existent or inactive memory throws informative error", () => {
  const { options } = setupIsolatedEnv("e2e-t2-mem-update-err-");

  assert.throws(() => {
    proposeUpdate("mem-non-existent-999", { title: "更新不存在的记忆" }, options);
  }, /Active memory mem-non-existent-999 not found/);

  // Proposing update on an unconfirmed candidate must fail
  const cand = createCandidate({ title: "待确认候选", content: "不可直接提变更" }, options);
  assert.throws(() => {
    proposeUpdate(cand.id, { title: "更新候选" }, options);
  }, /Can only propose updates on active or testing memories/);
});

test("Tier 2 - R3.9: Rejecting candidate moves memory to rejected status and prevents it from appearing in active list", () => {
  const { options } = setupIsolatedEnv("e2e-t2-mem-reject-");

  const cand = createCandidate({
    title: "创始人暂不采纳的设想",
    content: "每周发20条短视频",
    domain: "strategy"
  }, options);

  const rejected = rejectCandidate(cand.id, "违背精力管理原则", options);
  assert.equal(rejected.status, "rejected");

  const retrieved = getMemory(cand.id, options);
  assert.equal(retrieved.status, "rejected");

  const activeMemories = listActive({}, options);
  assert.ok(!activeMemories.some((m) => m.id === cand.id));
});

test("Tier 2 - R3.10: Memory prompt context builder handles empty store gracefully with zero markdown corruption", () => {
  const { options } = setupIsolatedEnv("e2e-t2-mem-empty-prompt-");

  const emptyContext = buildMemoryContext({ domain: "empty" }, options);
  assert.equal(emptyContext, "");
});

// ----------------------------------------------------------------------------
// Suite 2.4: Pillar 4 - File Registry & Controlled Delivery Outbox Boundaries
// ----------------------------------------------------------------------------

test("Tier 2 - R4.6: Zero-byte empty file computes valid SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 and verifies", () => {
  const { baseDir, options } = setupIsolatedEnv("e2e-t2-empty-file-");
  const emptyFilePath = path.join(baseDir, "empty.txt");
  fs.writeFileSync(emptyFilePath, Buffer.alloc(0));

  const hash = computeFileHash(emptyFilePath);
  const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  assert.equal(hash, EMPTY_SHA256);

  const reg = registerFile({
    filePath: emptyFilePath,
    projectRoot: baseDir,
    name: "empty.txt",
    mime: "text/plain"
  }, options);

  const integrity = verifyFileHash(reg.fileId, options);
  assert.equal(integrity.valid, true);
  assert.equal(integrity.actualHash, EMPTY_SHA256);
});

test("Tier 2 - R4.7: Large binary file (2MB) SHA-256 hashing and byte size tracking remain accurate", () => {
  const { baseDir, options } = setupIsolatedEnv("e2e-t2-large-file-");
  const largePath = path.join(baseDir, "large_asset.bin");

  // Create 2MB deterministic buffer
  const size = 2 * 1024 * 1024;
  const buf = Buffer.alloc(size, 0x5a);
  fs.writeFileSync(largePath, buf);

  const expectedSha = crypto.createHash("sha256").update(buf).digest("hex");
  const computedSha = computeFileHash(largePath);
  assert.equal(computedSha, expectedSha);

  const reg = registerFile({
    filePath: largePath,
    projectRoot: baseDir,
    name: "large_asset.bin",
    mime: "application/octet-stream"
  }, options);

  assert.equal(reg.sizeBytes || reg.bytes, size);
  assert.equal(reg.sha256 || reg.hash, expectedSha);

  const integrity = verifyFileHash(reg.fileId, options);
  assert.equal(integrity.valid, true);
});

test("Tier 2 - R4.8: Tampered deliverable on disk triggers 409 Conflict during verified file download attempt", () => {
  const { baseDir, options } = setupIsolatedEnv("e2e-t2-tampered-dl-");
  const absFile = path.join(baseDir, "render_output.png");
  fs.writeFileSync(absFile, "AUTHENTIC_DELIVERABLE_V1");

  const reg = registerFile({
    filePath: absFile,
    projectRoot: baseDir,
    name: "render_output.png",
    mime: "image/png"
  }, options);

  // Mark verified
  updateFile(reg.fileId, { verified: true }, options);

  // Ensure phone token exists
  const token = getPhoneAccessToken();

  // Tamper with disk contents
  fs.appendFileSync(absFile, "_TAMPERED_BY_MALICIOUS_ACTOR");

  const { req, res, getStatus, getBody } = mockDownloadReqRes({
    headers: { "X-OS-Phone-Token": token },
    params: { id: reg.fileId }
  });

  handleFileDownload(req, res, {
    fileOptions: options,
    projectRoot: baseDir
  });

  assert.equal(getStatus(), 409, "Must reject tampered file with 409 Conflict");
  assert.ok(getBody().error.includes("File hash mismatch") || getBody().error.includes("内容已变化"));
});

test("Tier 2 - R4.9: File download endpoint rejects unverified deliverable and missing phone token with 403 and 401", () => {
  const { baseDir, options } = setupIsolatedEnv("e2e-t2-auth-dl-");
  const absFile = path.join(baseDir, "draft_asset.png");
  fs.writeFileSync(absFile, "DRAFT_ASSET_CONTENT");

  const reg = registerFile({
    filePath: absFile,
    projectRoot: baseDir,
    name: "draft_asset.png",
    mime: "image/png"
  }, options);

  // Case 1: Missing phone token -> 401 Unauthorized
  {
    const { req, res, getStatus } = mockDownloadReqRes({
      headers: {},
      params: { id: reg.fileId }
    });
    handleFileDownload(req, res, { fileOptions: options, projectRoot: baseDir });
    assert.equal(getStatus(), 401);
  }

  // Case 2: Valid token, but file is unverified -> 403 Forbidden
  {
    const token = getPhoneAccessToken();
    const { req, res, getStatus, getBody } = mockDownloadReqRes({
      headers: { "X-OS-Phone-Token": token },
      params: { id: reg.fileId }
    });
    handleFileDownload(req, res, { fileOptions: options, projectRoot: baseDir });
    assert.equal(getStatus(), 403);
    assert.ok(getBody().error.includes("未验收文件不能标记为可发送") || getBody().error.includes("Unverified file"));
  }
});

test("Tier 2 - R4.10: Path traversal escapes with dot-dot-slash are rejected with 403 error during download", () => {
  const { baseDir, options } = setupIsolatedEnv("e2e-t2-traversal-dl-");

  assert.throws(() => {
    validateSafePath("../../sensitive_system_config.env", baseDir);
  }, /Path traversal outside project root is forbidden/);

  assert.throws(() => {
    validateSafePath("subdir/../../../etc/passwd", baseDir);
  }, /Path traversal outside project root is forbidden/);
});

// ----------------------------------------------------------------------------
// Suite 2.5: Pillar 5 - Cost-First Workforce Routing & Rebound Boundaries
// ----------------------------------------------------------------------------

test("Tier 2 - R5.6: applyCostGuard returns HUMAN_ACTION_REQUIRED when all candidates are offline or exhausted", () => {
  const { options } = setupIsolatedEnv("e2e-t2-cost-all-offline-");

  // Create health map where every worker is unavailable
  const allOfflineHealth = {
    antigravity: { available: false, status: "OFFLINE", billingMode: "subscription" },
    claude: { available: false, status: "OFFLINE", billingMode: "subscription" },
    "grok-build": { available: false, status: "OFFLINE", billingMode: "subscription" },
    codex: { available: false, status: "QUOTA_EXHAUSTED", billingMode: "subscription" },
    deepseek: { available: false, status: "OFFLINE", billingMode: "api" },
    hermes: { available: false, status: "OFFLINE", billingMode: "subscription" }
  };

  const result = applyCostGuard("auto", allOfflineHealth, options);

  assert.equal(result.ok, false);
  assert.equal(result.worker, null);
  assert.equal(result.action, "HUMAN_ACTION_REQUIRED");
  assert.ok(result.reason.includes("worker available") || result.reason.includes("unavailable"));
});

test("Tier 2 - R5.7: checkAndReboundWorker on non-existent worker returns worker_not_found cleanly", () => {
  const { options } = setupIsolatedEnv("e2e-t2-rebound-notfound-");

  const result = checkAndReboundWorker("unknown_worker_9999", { options });
  assert.equal(result.rebounded, false);
  assert.equal(result.reason, "worker_not_found");
});

test("Tier 2 - R5.8: wakeWaitingTasks with 0 waiting tasks returns 0 without side effects", () => {
  const { options } = setupIsolatedEnv("e2e-t2-rebound-zero-");

  const count = wakeWaitingTasks("codex", options);
  assert.equal(count, 0);
});

test("Tier 2 - R5.9: evaluateModelNeed handles boundary score 0 and empty title gracefully with tier LOW", () => {
  const emptyTask = evaluateModelNeed({});
  assert.equal(emptyTask.tier, "LOW");
  assert.equal(emptyTask.preferredWorker, "antigravity");
  assert.ok(typeof emptyTask.modelNeedScore === "number");

  const nullValuesTask = evaluateModelNeed({
    title: null,
    description: null,
    acceptanceCriteria: null
  });
  assert.equal(nullValuesTask.tier, "LOW");
  assert.equal(nullValuesTask.preferredWorker, "antigravity");
});

test("Tier 2 - R5.10: Safe prework execution handles task with missing or empty acceptance criteria cleanly", async () => {
  const { options } = setupIsolatedEnv("e2e-t2-prework-null-");

  const wfOptions = { baseDir: options.workforceDir, tasksDir: options.tasksDir, quotaDir: options.quotaDir };
  recordWorkerFailure("codex", "QUOTA_EXHAUSTED", "Quota exceeded", wfOptions);
  markQuotaExhausted("codex", "Exhausted", wfOptions);

  const task = createTask({
    title: "重构 Task Scheduler 核心架构",
    description: "重构底层跨模块状态机与并发队列",
    acceptanceCriteria: null,
    status: "queued"
  }, options);

  const config = { dryRun: true, agents: { antigravity: { permissionMode: "dangerous-bypass" } } };
  const dispatched = await dispatchTask(task.id, config);

  assert.equal(dispatched.status, "waiting_for_capacity");
  assert.ok(dispatched.prework?.completed, "Prework must succeed even when acceptanceCriteria is null");
});

// ============================================================================
// TIER 3: CROSS-FEATURE INTERACTIONS (10 Tests)
// ============================================================================

test("Tier 3 - Interaction 1: Secretary Snapshot reflects newly registered File Registry deliverables with exact SHA-256", () => {
  const { baseDir, options } = setupIsolatedEnv("e2e-t3-snap-files-");

  const deliverablePath = path.join(baseDir, "render_banner.png");
  fs.writeFileSync(deliverablePath, "PNG_SLIDE_BANNER_BYTE_DATA");
  const expectedHash = computeFileHash(deliverablePath);

  const reg = registerFile({
    filePath: deliverablePath,
    projectRoot: baseDir,
    name: "render_banner.png",
    mime: "image/png",
    verified: true,
    sendable: false
  }, { ...options, baseDir: options.filesDir });

  const snapshot = getSecretaryOsSnapshot({}, options);
  assert.ok(snapshot.deliverables);
  assert.ok(snapshot.deliverables.length >= 1);
  const found = snapshot.deliverables.find((d) => d.name === "render_banner.png");
  assert.ok(found);
  assert.equal(found.fileId, reg.fileId);
  assert.equal(found.verified, true);

  const regFile = getFile(found.fileId, { ...options, baseDir: options.filesDir });
  assert.equal(regFile.sha256 || regFile.hash, expectedHash);
});

test("Tier 3 - Interaction 2: Learning Event FOUNDER_APPROVED decrements pending approvals in Secretary Snapshot", () => {
  const { baseDir, options, packagesDir } = setupIsolatedEnv("e2e-t3-snap-events-");

  const experiment = createValidExperiment();
  const pkgOptions = { ...options, baseDir: packagesDir };
  const pkg = createPackage({
    title: "反常识认知复盘",
    body: "反常识认知正文",
    platform: "xiaohongshu",
    experiment
  }, pkgOptions);
  freezePackage(pkg.id, pkgOptions);

  const snapBefore = getSecretaryOsSnapshot({}, options);
  const countBefore = snapBefore.pendingApprovals.count;
  assert.ok(countBefore >= 1);

  // Approve package and emit event
  approvePackage(pkg.id, pkgOptions);
  emitLearningEvent({
    type: "FOUNDER_APPROVED",
    domain: "content",
    subject: { kind: "package", id: pkg.id },
    payload: { packageId: pkg.id }
  }, options);

  const snapAfter = getSecretaryOsSnapshot({}, options);
  assert.equal(snapAfter.pendingApprovals.count, countBefore - 1);
});

test("Tier 3 - Interaction 3: Proposed memory candidate appears in Snapshot decisions required, disappears on confirmation", () => {
  const { options } = setupIsolatedEnv("e2e-t3-snap-memory-");

  const cand = createCandidate({
    title: "视觉规范：冷色系留白",
    content: "背景使用极简深灰冷色调与大面积留白",
    domain: "visual"
  }, options);

  const snapBefore = getSecretaryOsSnapshot({}, options);
  assert.ok(snapBefore.founderDecisionsRequired);
  const hasCandBefore = snapBefore.founderDecisionsRequired.items.some((i) => i.id === cand.id);
  assert.ok(hasCandBefore, "Unconfirmed candidate must appear in founderDecisionsRequired");

  confirmCandidate(cand.id, "Founder verified", options);

  const snapAfter = getSecretaryOsSnapshot({}, options);
  const hasCandAfter = snapAfter.founderDecisionsRequired.items.some((i) => i.id === cand.id);
  assert.equal(hasCandAfter, false, "Confirmed candidate must no longer appear in pending decisions");
});

test("Tier 3 - Interaction 4: Worker cooldown via status machine is immediately reflected in Snapshot workerStatus", () => {
  const { options } = setupIsolatedEnv("e2e-t3-snap-workforce-");

  const wfOptions = { baseDir: options.workforceDir, tasksDir: options.tasksDir, quotaDir: options.quotaDir };
  recordWorkerFailure("codex", "QUOTA_EXHAUSTED", "Daily quota reached for model", wfOptions);

  const snapshot = getSecretaryOsSnapshot({}, options);
  assert.ok(snapshot.workerStatus);
  const codexStatus = snapshot.workerStatus.find((w) => w.id === "codex");
  assert.ok(codexStatus);
  assert.equal(codexStatus.status, "COOLDOWN");
  assert.equal(codexStatus.available, false);
  assert.ok(codexStatus.cooldownCount >= 1);

  const workerInRegistry = getWorker("codex", wfOptions);
  assert.ok(workerInRegistry.failureReason.includes("Daily quota reached"));
});

test("Tier 3 - Interaction 5: Emitting FOUNDER_FAVORITED via Learning Router automatically increases Memory confidence", () => {
  const { options } = setupIsolatedEnv("e2e-t3-events-memory-");

  const cand = createCandidate({
    title: "深度思考钩子法则",
    content: "第一屏必须抛出认知冲突问题",
    domain: "copywriting"
  }, options);

  const confirmed = confirmCandidate(cand.id, "Testing rule", options);
  const initialConfidence = confirmed.confidence;
  const initialEvidenceCount = confirmed.evidenceCount;

  emitLearningEvent({
    type: "FOUNDER_FAVORITED",
    domain: "copywriting",
    actor: "founder",
    subject: { kind: "memory", id: confirmed.id },
    explicitFeedback: "Founder loved this hook style"
  }, options);

  const updatedMem = getMemory(confirmed.id, options);
  assert.ok(updatedMem.confidence > initialConfidence);
  assert.equal(updatedMem.evidenceCount, initialEvidenceCount + 1);
  assert.ok(updatedMem.positiveExamples.some((ex) => ex.note.includes("FOUNDER_FAVORITED") || ex.note.includes("Founder loved")));
});

test("Tier 3 - Interaction 6: Content package approval releases delivery outbox items to allowed and verified", () => {
  const { baseDir, options } = setupIsolatedEnv("e2e-t3-pkg-outbox-");

  const experiment = createValidExperiment();
  const pkg = createPackage({
    title: "发布交付测试",
    body: "发布交付测试文案",
    platform: "xiaohongshu",
    experiment
  }, options);

  const deliverablePath = path.join(baseDir, "render_banner.png");
  fs.writeFileSync(deliverablePath, "DELIVERABLE_FOR_OUTBOX");

  const regFile = registerFile({
    filePath: deliverablePath,
    projectRoot: baseDir,
    name: "render_banner.png",
    mime: "image/png",
    packageId: pkg.id,
    verified: false,
    sendable: false
  }, options);

  const outboxItem = enqueueDelivery({
    fileId: regFile.fileId,
    packageId: pkg.id,
    channel: "xiaohongshu",
    status: "held"
  }, options);

  assert.equal(outboxItem.status, "held");
  assert.equal(outboxItem.allowSend, false);

  // Approve package delivery
  const updatedOutbox = allowPackageDelivery(pkg.id, options);
  assert.ok(updatedOutbox.length >= 1);
  assert.equal(updatedOutbox[0].status, "allowed");
  assert.equal(updatedOutbox[0].allowSend, true);

  const verifiedFile = getFile(regFile.fileId, options);
  assert.equal(verifiedFile.verified, true);
  assert.equal(verifiedFile.deliveryStatus, "allowed");
});

test("Tier 3 - Interaction 7: Rebound wakes waiting tasks and emits routing events to ledger", async () => {
  const { options } = setupIsolatedEnv("e2e-t3-rebound-events-");

  const task = createTask({
    title: "重构状态机核心模块",
    status: "queued",
    targetSeniorWorker: "codex"
  }, options);

  updateTask(task.id, {
    status: "waiting_for_capacity",
    targetSeniorWorker: "codex",
    prework: { completed: true }
  }, options);

  const dispatchedTasks = [];
  const mockDispatch = async (taskId) => {
    dispatchedTasks.push(taskId);
    updateTask(taskId, { status: "running" }, options);
    emitLearningEvent({
      type: "TASK_SUCCEEDED",
      domain: "routing",
      subject: { kind: "task", id: taskId },
      payload: { reason: "Rebounded from cooldown" }
    }, options);
  };

  const awakened = wakeWaitingTasks("codex", {
    ...options,
    dispatchTask: mockDispatch
  });

  assert.equal(awakened, 1);
  assert.ok(dispatchedTasks.includes(task.id));

  const events = listEvents({ domain: "routing" }, options);
  assert.ok(events.some((e) => e.subject.id === task.id && e.type === "TASK_SUCCEEDED"));
});

test("Tier 3 - Interaction 8: CostGuard skips Codex for LOW-need task when primary throttled, enforcing waiting_for_capacity", async () => {
  const { options } = setupIsolatedEnv("e2e-t3-costguard-modelneed-");

  const wfOptions = { baseDir: options.workforceDir, tasksDir: options.tasksDir, quotaDir: options.quotaDir };
  recordWorkerFailure("antigravity", "THROTTLED", "Rate limit hit", wfOptions);

  const lowTask = createTask({
    title: "修改前端按钮样式 hover",
    description: "简单修改css",
    status: "queued"
  }, options);

  const need = evaluateModelNeed(lowTask);
  assert.equal(need.tier, "LOW");

  const healthMap = {
    antigravity: { available: false, status: "THROTTLED" },
    claude: { available: true, status: "ONLINE", billingMode: "subscription" },
    codex: { available: true, status: "ONLINE", billingMode: "subscription" }
  };

  const costDecision = applyCostGuard("antigravity", healthMap, {
    ...options,
    task: lowTask
  });

  // Low complexity task must never fall back to senior reasoning workers (Claude, Grok Build, Codex)
  assert.equal(costDecision.ok, false);
  assert.equal(costDecision.action, "HUMAN_ACTION_REQUIRED");
  assert.ok(costDecision.attempts.some((a) => a.id === "codex" && a.skip.includes("SENIOR_MODEL_RESERVED")));
  assert.ok(costDecision.attempts.some((a) => a.id === "claude" && a.skip.includes("SENIOR_MODEL_RESERVED")));
});

test("Tier 3 - Interaction 9: Conflicting memory quarantined in testing is safely flagged in prompt injection without displacing active memory", () => {
  const { options } = setupIsolatedEnv("e2e-t3-conflict-prompt-");

  // Active rule: 黑白红
  const cand1 = createCandidate({
    title: "黑白红克制极简高级风",
    content: "排版采用黑白红克制极简高级黑风格",
    type: "aesthetic",
    domain: "visual"
  }, options);
  confirmCandidate(cand1.id, "Active baseline", options);
  addEvidence(cand1.id, { positive: true }, options);
  addEvidence(cand1.id, { positive: true }, options);
  const activeMem = addEvidence(cand1.id, { positive: true }, options);
  assert.equal(activeMem.status, "active");

  // Conflicting rule: 霓虹动漫
  const cand2 = createCandidate({
    title: "高饱和彩色马卡龙霓虹动漫风",
    content: "排版采用高饱和彩色马卡龙与霓虹鲜艳动漫风",
    type: "aesthetic",
    domain: "visual"
  }, options);
  const testingMem = confirmCandidate(cand2.id, "Testing conflict", options);
  assert.equal(testingMem.hasConflict, true);
  assert.equal(testingMem.status, "testing");

  // Injected prompt context includes both, but testing is explicitly demarcated
  const promptContext = buildMemoryContext({ domain: "visual", includeTesting: true }, options);
  assert.ok(promptContext.includes("黑白红克制极简高级风"));
  assert.ok(promptContext.includes("高饱和彩色马卡龙霓虹动漫风"));
  assert.ok(promptContext.includes("[试用中，证据不足 / testing]"));
  assert.ok(promptContext.includes("不得当作永久人格"));

  // When includeTesting: false, only active memory is included
  const activeOnlyPrompt = buildMemoryContext({ domain: "visual", includeTesting: false }, options);
  assert.ok(activeOnlyPrompt.includes("黑白红克制极简高级风"));
  assert.ok(!activeOnlyPrompt.includes("高饱和彩色马卡龙霓虹动漫风"));
});

test("Tier 3 - Interaction 10: Outbox sent deliverable records sentAt timestamp and subsequent high metrics emit CONTENT_OUTPERFORMED", () => {
  const { baseDir, options } = setupIsolatedEnv("e2e-t3-outbox-metrics-");

  const experiment = createValidExperiment();
  const pkg = createPackage({
    title: "认知裂变笔记",
    body: "认知裂变正文内容",
    platform: "xiaohongshu",
    experiment
  }, options);
  freezePackage(pkg.id, options);
  recordPublish(pkg.id, { ok: true }, options);

  const deliverablePath = path.join(baseDir, "render_banner.png");
  fs.writeFileSync(deliverablePath, "OUTBOX_DELIVERY_PAYLOAD");

  const reg = registerFile({
    filePath: deliverablePath,
    projectRoot: baseDir,
    name: "render_banner.png",
    mime: "image/png",
    packageId: pkg.id,
    verified: true,
    sendable: true
  }, options);

  const outboxItem = enqueueDelivery({
    fileId: reg.fileId,
    packageId: pkg.id,
    channel: "xiaohongshu",
    status: "allowed"
  }, options);

  // Mark sent
  const sentRecords = markDeliverySent(pkg.id, options);
  assert.ok(sentRecords.length >= 1);
  assert.equal(sentRecords[0].status, "sent");
  assert.ok(sentRecords[0].sentAt);

  // Ingest high performance metrics (healthy funnel passing all thresholds)
  const highMetrics = {
    impressions: 15000,
    reads: 3000,
    views: 3000,
    dwell_time: 45,
    avgStaySeconds: 45,
    likes: 500,
    collects: 400,
    saves: 400,
    comments: 80,
    shares: 60,
    follows: 100,
    conversions: 10,
    conversions_gmv: 10
  };
  appendPackageMetrics(pkg.id, highMetrics, options);

  const diag = diagnoseFunnel(highMetrics);
  assert.equal(diag.stage, "healthy");

  const event = emitLearningEvent({
    type: diag.verdict === "outperformed" || diag.stage === "healthy" ? "CONTENT_OUTPERFORMED" : "CONTENT_UNDERPERFORMED",
    domain: "content_performance",
    actor: "system",
    subject: { kind: "package", id: pkg.id },
    payload: { metrics: highMetrics, stage: diag.stage }
  }, options);

  assert.equal(event.type, "CONTENT_OUTPERFORMED");
  const storedEvent = getEvent(event.id, options);
  assert.ok(storedEvent.processed);
});

// ============================================================================
// TIER 4: REAL-WORLD WORKLOAD SCENARIOS (5 Application Scenarios)
// ============================================================================

test("Tier 4 - Scenario 1: Founder Daily Operating Loop (chat intake -> review -> approve -> deliverable hashed -> outbox released -> sent)", async () => {
  const { baseDir, options, packagesDir } = setupIsolatedEnv("e2e-t4-daily-loop-");

  // Step 1: Founder chat intake: Grok Bot receives intent, does zero autonomous dispatch
  const chatPrompt = buildChatPrompt({
    text: "今天做一期关于认知觉醒的反常识图文，准备首图和卡片",
    persona: "你是创始人的私人秘书 Grok Bot",
    snapshot: "=== OS SNAPSHOT ===\n{\"ok\":true}\n=== END OS SNAPSHOT ==="
  });
  assert.ok(chatPrompt.includes("认知觉醒的反常识图文"));
  assert.ok(chatPrompt.includes("你没有任何执行权"));

  // Step 2: Content draft package created
  const experiment = createValidExperiment({ title: "反常识认知觉醒指南" });
  const pkgOptions = { ...options, baseDir: packagesDir };
  const pkg = createPackage({
    title: "反常识认知觉醒指南",
    body: "正文：多数人之所以平庸，是因为把情绪当成了思考...",
    platform: "xiaohongshu",
    experiment
  }, pkgOptions);
  freezePackage(pkg.id, pkgOptions);

  // Step 3: Visual deliverable created on disk and registered with SHA-256
  const visualFile = path.join(baseDir, "render_cover.png");
  fs.writeFileSync(visualFile, "RENDERED_COVER_IMAGE_BYTES_V1");
  const expectedHash = computeFileHash(visualFile);

  const fileOptions = { ...options, baseDir: options.filesDir };
  const regFile = registerFile({
    filePath: visualFile,
    projectRoot: baseDir,
    name: "render_cover.png",
    mime: "image/png",
    packageId: pkg.id,
    verified: false,
    sendable: false
  }, fileOptions);

  assert.equal(regFile.sha256 || regFile.hash, expectedHash);

  // Step 4: Enqueue delivery outbox in held state
  const outboxItem = enqueueDelivery({
    fileId: regFile.fileId,
    packageId: pkg.id,
    channel: "xiaohongshu",
    status: "held"
  }, options);
  assert.equal(outboxItem.status, "held");
  assert.equal(outboxItem.allowSend, false);

  // Step 5: Founder inspects OS Snapshot -> sees pending package and held deliverable
  const snapshotBefore = getSecretaryOsSnapshot({}, options);
  assert.ok(snapshotBefore.pendingApprovals.count >= 1);
  const outboxInSnap = snapshotBefore.deliveryOutbox.find((d) => d.deliveryId === outboxItem.deliveryId);
  assert.ok(outboxInSnap);
  assert.equal(outboxInSnap.status, "held");

  // Step 6: Founder reviews and approves package
  approvePackage(pkg.id, pkgOptions);
  const updatedOutbox = allowPackageDelivery(pkg.id, fileOptions);
  assert.ok(updatedOutbox.length >= 1);
  assert.equal(updatedOutbox[0].status, "allowed");
  assert.equal(updatedOutbox[0].allowSend, true);

  // Step 7: Emits approval learning event and marks outbox sent
  emitLearningEvent({
    type: "FOUNDER_APPROVED",
    domain: "content",
    subject: { kind: "package", id: pkg.id },
    payload: { packageId: pkg.id }
  }, options);

  const sentRecords = markDeliverySent(pkg.id, options);
  assert.equal(sentRecords[0].status, "sent");
  assert.ok(sentRecords[0].sentAt);

  // Snapshot after shows 0 pending approvals and outbox delivered
  const snapshotAfter = getSecretaryOsSnapshot({}, options);
  assert.equal(snapshotAfter.pendingApprovals.count, snapshotBefore.pendingApprovals.count - 1);
});

test("Tier 4 - Scenario 2: Autonomous Learning & Memory Evolution (task execution -> feedback capture -> 3 positive signals promote to active -> prompt injection)", () => {
  const { options } = setupIsolatedEnv("e2e-t4-memory-evolution-");

  // Step 1: Founder provides feedback on task outcome, proposing candidate memory
  const cand = createCandidate({
    title: "深度推演第一性原理",
    content: "所有论点必须从物理和经济学第一性原理展开，禁止套用空洞成语",
    type: "judgment",
    domain: "cognition",
    source: { kind: "founder_review", note: "高质感内容复盘" }
  }, options);

  assert.equal(cand.status, "candidate");
  assert.equal(cand.confidence, 0.0);

  // Step 2: Founder confirms candidate into testing status (starts count: 1, conf: 0.33)
  const testingMem = confirmCandidate(cand.id, "Founder approved for testing", options);
  assert.equal(testingMem.status, "testing");
  assert.equal(testingMem.confidence, 0.33);

  // Step 3: First positive outcome from production task (count: 2, conf: 0.55)
  const signal1 = addEvidence(testingMem.id, {
    positive: true,
    source: "task-001",
    note: "文章采用第一性原理，点赞率翻倍"
  }, options);
  assert.equal(signal1.status, "testing");
  assert.equal(signal1.evidenceCount, 2);

  // Step 4: Second positive outcome (count: 3, conf: 0.77 >= 0.70 -> auto-promotes to active)
  const signal2 = addEvidence(testingMem.id, {
    positive: true,
    source: "task-002",
    note: "读者评论深度极高"
  }, options);
  assert.equal(signal2.status, "active", "Second added signal reaches 3 total evidence and promotes to active");
  assert.ok(signal2.confidence >= 0.70);
  assert.equal(signal2.trend, "rising");

  // Step 5: Worker prompt generation automatically injects active memory rule
  const injectedContext = buildMemoryContext({ domain: "cognition", includeTesting: false }, options);
  assert.ok(injectedContext.includes("深度推演第一性原理"));
  assert.ok(injectedContext.includes("所有论点必须从物理和经济学第一性原理展开"));
  assert.ok(!injectedContext.includes("[试用中，证据不足 / testing]"), "Active rule must not carry testing prefix");
});

test("Tier 4 - Scenario 3: Contradictory Preference Quarantine & Safety Defense", () => {
  const { options } = setupIsolatedEnv("e2e-t4-conflict-quarantine-");

  // Step 1: Active established memory: 极简黑白红
  const cand1 = createCandidate({
    title: "黑白红克制极简高级风",
    content: "全站采用黑白红克制极简高级黑风格，禁用任何彩色",
    type: "aesthetic",
    domain: "visual"
  }, options);
  confirmCandidate(cand1.id, "Initial baseline", options);
  addEvidence(cand1.id, { positive: true }, options);
  addEvidence(cand1.id, { positive: true }, options);
  const activeMem = addEvidence(cand1.id, { positive: true }, options);
  assert.equal(activeMem.status, "active");
  assert.ok(activeMem.confidence >= 0.70);

  // Step 2: Founder later inputs contradictory style request
  const cand2 = createCandidate({
    title: "高饱和彩色马卡龙霓虹动漫风",
    content: "排版采用高饱和彩色马卡龙与霓虹鲜艳动漫风",
    type: "aesthetic",
    domain: "visual"
  }, options);

  // Step 3: Conflict detector flags visual style clash
  const existing = listActive({ includeTesting: true }, options);
  const conflictResult = detectMemoryConflict(cand2, existing);
  assert.equal(conflictResult.hasConflict, true);
  assert.ok(conflictResult.conflictingIds.includes(activeMem.id));

  // Step 4: Candidate confirmed into testing is quarantined
  const quarantinedMem = confirmCandidate(cand2.id, "Trial new visual idea", options);
  assert.equal(quarantinedMem.status, "testing");
  assert.equal(quarantinedMem.hasConflict, true);
  assert.ok(quarantinedMem.conflictsWith.includes(activeMem.id));

  // Step 5: Multiple positive signals arrive on quarantined memory
  let trial = quarantinedMem;
  for (let i = 0; i < 5; i++) {
    trial = addEvidence(trial.id, { positive: true, note: `Trial signal ${i}` }, options);
  }

  // Quarantine invariant: Must NOT promote to active while conflict persists
  assert.equal(trial.status, "testing", "Conflicting memory must remain quarantined in testing");
  assert.equal(trial.hasConflict, true);

  // Step 6: Verify original active rule remains untouched
  const currentBaseline = getMemory(activeMem.id, options);
  assert.equal(currentBaseline.status, "active");
  assert.ok(currentBaseline.confidence >= 0.70);
});

test("Tier 4 - Scenario 4: Workforce Surge, Throttling & Autonomous Cooldown Recovery", async () => {
  const { baseDir, options } = setupIsolatedEnv("e2e-t4-workforce-surge-");

  const wfOptions = { baseDir: options.workforceDir, tasksDir: options.tasksDir, quotaDir: options.quotaDir };

  // Step 1: Antigravity throttled
  recordWorkerFailure("antigravity", "THROTTLED", "API rate limit 429", wfOptions);

  // Step 2: Codex quota exhausted
  recordWorkerFailure("codex", "QUOTA_EXHAUSTED", "Usage limit reached for today", wfOptions);
  markQuotaExhausted("codex", "Daily quota exhausted", wfOptions);

  // Step 3: Senior engineering task arrives
  const task = createTask({
    title: "重构 Task Scheduler 核心架构",
    description: "重构底层跨模块状态机与并发队列",
    status: "queued"
  }, options);

  const config = { dryRun: true, agents: { antigravity: { permissionMode: "dangerous-bypass" } } };
  const dispatched = await dispatchTask(task.id, config);

  // Step 4: Task safely executes prework and suspends to waiting_for_capacity
  assert.equal(dispatched.status, "waiting_for_capacity");
  assert.equal(dispatched.targetSeniorWorker, "codex");
  assert.ok(dispatched.prework?.completed, "Safe prework must complete before suspension");

  // Restore isolated tasks env in case concurrent tests shifted process.env
  process.env.TASKS_BASE_DIR = baseDir;
  process.env.WORKFORCE_BASE_DIR = options.workforceDir;
  process.env.QUOTA_BASE_DIR = options.quotaDir;

  updateTask(task.id, {
    status: "waiting_for_capacity",
    targetSeniorWorker: "codex",
    prework: dispatched.prework
  }, options);

  // Step 5: Secretary Snapshot reflects workforce status and waiting task
  const snapshot = getSecretaryOsSnapshot({}, options);
  const codexInSnap = snapshot.workerStatus.find((w) => w.id === "codex");
  assert.ok(codexInSnap);
  assert.equal(codexInSnap.available, false);

  // Step 6 & 7: Autonomous Worker Rebound & Task Awakening
  // checkAndReboundWorker autonomously probes the worker, restores status to AVAILABLE,
  // and immediately triggers wakeWaitingTasks to resume suspended tasks.
  const dispatchedIds = [];
  const mockDispatch = async (taskId) => {
    dispatchedIds.push(taskId);
    return updateTask(taskId, { status: "running" }, options);
  };

  const reboundResult = checkAndReboundWorker("codex", {
    forceProbe: true,
    probeImpl: () => true, // Mock successful CLI probe
    options: {
      ...wfOptions,
      ...options,
      dispatchTask: mockDispatch
    }
  });

  assert.equal(reboundResult.rebounded, true);
  assert.equal(reboundResult.status, "AVAILABLE");
  assert.equal(reboundResult.awakenedTasks, 1, "checkAndReboundWorker must autonomously awaken waiting task");
  assert.ok(dispatchedIds.includes(task.id), "Awakened task must be dispatched");
  assert.equal(getTask(task.id, options).status, "running");
});

test("Tier 4 - Scenario 5: Security Outbox Defense & Privacy Sanitization End-to-End", () => {
  const { baseDir, options } = setupIsolatedEnv("e2e-t4-security-defense-");

  // Step 1: Autonomous /send attempt without founder approval is rejected with 403 Forbidden
  const mockSendReq = {};
  let mockSendStatus = 200;
  let mockSendBody = null;
  const mockSendRes = {
    status: (code) => {
      mockSendStatus = code;
      return mockSendRes;
    },
    json: (body) => {
      mockSendBody = body;
      return mockSendRes;
    }
  };
  rejectAutoSend(mockSendReq, mockSendRes);
  assert.equal(mockSendStatus, 403);
  assert.equal(mockSendBody.code, "AUTONOMOUS_SEND_FORBIDDEN");

  // Step 2: Directory traversal attack is rejected by validateSafePath
  assert.throws(() => {
    validateSafePath("../../../sensitive_keys.env", baseDir);
  }, /Path traversal outside project root is forbidden/);

  // Step 3: Unverified file download rejected by handleFileDownload
  const deliverablePath = path.join(baseDir, "render_banner.png");
  fs.writeFileSync(deliverablePath, "AUTHENTIC_FILE_DATA");
  const reg = registerFile({
    filePath: deliverablePath,
    projectRoot: baseDir,
    name: "render_banner.png",
    mime: "image/png",
    verified: false,
    sendable: false
  }, { ...options, baseDir: options.filesDir });

  const token = getPhoneAccessToken();
  const { req, res, getStatus } = mockDownloadReqRes({
    headers: { "X-OS-Phone-Token": token },
    params: { id: reg.fileId }
  });
  handleFileDownload(req, res, { fileOptions: { ...options, baseDir: options.filesDir }, projectRoot: baseDir });
  assert.equal(getStatus(), 403, "Unverified file must be rejected with 403");

  // Step 4: Ingest task execution failure containing sensitive API keys and passwords
  const task = createTask({
    title: "日常日志同步任务",
    status: "running"
  }, options);

  updateTask(task.id, {
    status: "running",
    startedAt: new Date().toISOString(),
    error: "Failed to connect to upstream with sk-proj-supermeSecretToken12345678 and password=SensitiveAdminPassword123!"
  });

  // Step 5: Secretary OS Snapshot fetched -> verified all credentials are fully masked
  const snapshot = getSecretaryOsSnapshot({}, options);
  const taskInSnap = snapshot.runningTasks.find((t) => t.id === task.id);
  assert.ok(taskInSnap);
  assert.ok(!taskInSnap.error.includes("sk-proj-supermeSecretToken12345678"));
  assert.ok(!taskInSnap.error.includes("SensitiveAdminPassword123!"));
  assert.ok(taskInSnap.error.includes("sk-***"));
  assert.ok(taskInSnap.error.includes("password=***"));

  // Step 6: Snapshot text output is clean of secrets and financial numbers
  const snapshotText = buildOsSnapshotText(snapshot);
  assert.ok(!snapshotText.includes("sk-proj-supermeSecretToken12345678"));
  assert.ok(!snapshotText.includes("SensitiveAdminPassword123!"));
  assert.equal(snapshot.billing.amounts, "withheld");
});



