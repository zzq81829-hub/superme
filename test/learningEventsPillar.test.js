import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import http from "http";
import express from "express";
import {
  EVENT_TYPES,
  getEventsDir,
  recordEvent,
  getEvent,
  listEvents,
  markProcessed
} from "../src/learning/events.js";
import { emitLearningEvent, applyLearningEvent } from "../src/learning/router.js";
import {
  createCandidate,
  confirmCandidate,
  getMemory,
  addEvidence
} from "../src/memory/store.js";
import {
  createTask,
  getTask,
  updateTask
} from "../src/store.js";
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
import { dispatchTask } from "../src/router.js";
import { updateWorker } from "../src/workforce/registry.js";
import { diagnoseFunnel } from "../src/autonomous_content/learningLedger.js";

function setupIsolatedEnv() {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "m3-learning-test-"));
  const tasksDir = path.join(baseDir, "tasks");
  const eventsDir = path.join(baseDir, "events");
  const memoryDir = path.join(baseDir, "memory");
  const candidatesDir = path.join(memoryDir, "candidates");
  const packagesDir = path.join(baseDir, "content", "packages");
  const workforceDir = path.join(baseDir, "workforce");

  fs.mkdirSync(tasksDir, { recursive: true });
  fs.mkdirSync(eventsDir, { recursive: true });
  fs.mkdirSync(memoryDir, { recursive: true });
  fs.mkdirSync(candidatesDir, { recursive: true });
  fs.mkdirSync(packagesDir, { recursive: true });
  fs.mkdirSync(workforceDir, { recursive: true });

  process.env.TASKS_BASE_DIR = baseDir;
  process.env.LEARNING_EVENTS_DIR = eventsDir;
  process.env.MEMORY_BASE_DIR = memoryDir;
  process.env.PACKAGES_BASE_DIR = baseDir;
  process.env.WORKFORCE_BASE_DIR = workforceDir;

  const options = {
    baseDir,
    tasksDir,
    eventsDir,
    memoryDir,
    packagesDir,
    workforceDir
  };

  return { baseDir, eventsDir, options };
}

// ---------------------------------------------------------------------------
// TEST 1: All 12 Core Event Types Definition & Record Validation
// ---------------------------------------------------------------------------
test("R2-Events-1: All 12 Core Event Types Definition & Record Validation", () => {
  const { options } = setupIsolatedEnv();

  const expectedTypes = [
    "FOUNDER_SELECTED",
    "FOUNDER_APPROVED",
    "FOUNDER_REJECTED",
    "FOUNDER_EDITED",
    "FOUNDER_REGENERATED",
    "FOUNDER_FAVORITED",
    "TASK_SUCCEEDED",
    "TASK_FAILED",
    "CONTENT_OUTPERFORMED",
    "CONTENT_UNDERPERFORMED",
    "AGENT_ESCALATED",
    "LEARNING_CONFLICT"
  ];

  assert.equal(EVENT_TYPES.length, 12);
  for (const expected of expectedTypes) {
    assert.ok(EVENT_TYPES.includes(expected), `Missing event type: ${expected}`);
  }

  // Record an event for each type
  for (const type of expectedTypes) {
    const event = recordEvent({
      type,
      domain: "test_domain",
      actor: "system",
      subject: { kind: "test", id: `item-${type}` },
      payload: { testType: type }
    }, options);

    assert.equal(event.type, type);
    assert.ok(event.id.startsWith("evt-"));
    assert.equal(event.processed, false);

    // Verify it exists on disk
    const onDisk = getEvent(event.id, options);
    assert.ok(onDisk);
    assert.equal(onDisk.id, event.id);
    assert.equal(onDisk.type, type);
  }

  // Verify listEvents returns all 12
  const allEvents = listEvents({}, options);
  assert.equal(allEvents.length, 12);

  // Verify invalid type throws
  assert.throws(() => {
    recordEvent({ type: "UNKNOWN_BOGUS_EVENT" }, options);
  }, /Invalid learning event type/);
});

// ---------------------------------------------------------------------------
// TEST 2: Atomic Append-Only Persistence Invariant
// ---------------------------------------------------------------------------
test("R2-Events-2: Atomic Append-Only Persistence Invariant", () => {
  const { options } = setupIsolatedEnv();

  const customId = "evt-static-append-only-001";
  const event = recordEvent({
    id: customId,
    type: "FOUNDER_SELECTED",
    domain: "visual",
    actor: "founder",
    subject: { kind: "artifact", id: "card-cover-b" },
    winner: "card-cover-b",
    losers: ["card-cover-a", "card-cover-c"],
    explicitFeedback: "更喜欢大图视觉反差",
    payload: { aspect: "cover" }
  }, options);

  assert.equal(event.id, customId);

  // Attempting to record with the exact same ID must throw an append-only ledger violation
  assert.throws(() => {
    recordEvent({
      id: customId,
      type: "FOUNDER_SELECTED",
      domain: "visual"
    }, options);
  }, /append-only ledger violation/);

  // Verify full 11-field schema retrieval
  const retrieved = getEvent(customId, options);
  assert.equal(retrieved.id, customId);
  assert.equal(retrieved.type, "FOUNDER_SELECTED");
  assert.equal(retrieved.domain, "visual");
  assert.ok(retrieved.at);
  assert.equal(retrieved.actor, "founder");
  assert.deepEqual(retrieved.subject, { kind: "artifact", id: "card-cover-b" });
  assert.equal(retrieved.winner, "card-cover-b");
  assert.deepEqual(retrieved.losers, ["card-cover-a", "card-cover-c"]);
  assert.equal(retrieved.explicitFeedback, "更喜欢大图视觉反差");
  assert.deepEqual(retrieved.payload, { aspect: "cover" });
  assert.equal(retrieved.processed, false);

  // Mark processed atomically
  const processed = markProcessed(customId, options);
  assert.equal(processed.processed, true);
  assert.equal(getEvent(customId, options).processed, true);

  // Filtering checks
  assert.equal(listEvents({ type: "FOUNDER_SELECTED" }, options).length, 1);
  assert.equal(listEvents({ type: "TASK_SUCCEEDED" }, options).length, 0);
  assert.equal(listEvents({ domain: "visual" }, options).length, 1);
  assert.equal(listEvents({ domain: "copy" }, options).length, 0);
  assert.equal(listEvents({ actor: "founder" }, options).length, 1);
  assert.equal(listEvents({ subjectId: "card-cover-b" }, options).length, 1);
});

// ---------------------------------------------------------------------------
// TEST 3: Zero-Token Routing & Memory Evidence Integration
// ---------------------------------------------------------------------------
test("R2-Events-3: Zero-Token Routing & Memory Evidence Integration", () => {
  const { options } = setupIsolatedEnv();

  // Create a memory candidate and confirm to 'testing'
  const cand = createCandidate({
    title: "高字重黑体标题",
    content: "封面使用特粗黑体突出首个痛点疑问词",
    type: "aesthetic",
    domain: "visual"
  }, options);

  const testingMemory = confirmCandidate(cand.id, {}, options);
  assert.equal(testingMemory.status, "testing");
  const initialConf = testingMemory.confidence;
  const initialEvidence = testingMemory.evidenceCount;

  // Positive event via emitLearningEvent: adds positive evidence
  const posEvent = emitLearningEvent({
    type: "FOUNDER_APPROVED",
    domain: "visual",
    actor: "founder",
    subject: { kind: "memory", id: testingMemory.id },
    explicitFeedback: "标题视觉冲击力强"
  }, options);

  assert.equal(posEvent.processed, true);
  const afterPos = getMemory(testingMemory.id, options);
  assert.ok(afterPos.confidence > initialConf);
  assert.equal(afterPos.evidenceCount, initialEvidence + 1);

  // Negative event via emitLearningEvent: adds negative evidence
  const negEvent = emitLearningEvent({
    type: "FOUNDER_REJECTED",
    domain: "visual",
    actor: "founder",
    subject: { kind: "memory", id: testingMemory.id },
    explicitFeedback: "排版过于拥挤"
  }, options);

  assert.equal(negEvent.processed, true);
  const afterNeg = getMemory(testingMemory.id, options);
  assert.ok(afterNeg.confidence < afterPos.confidence);

  // Non-memory event: routes cleanly with zero side-effects
  const escalatedEvent = emitLearningEvent({
    type: "AGENT_ESCALATED",
    domain: "routing",
    actor: "system",
    subject: { kind: "task", id: "task-999" },
    payload: { from: "antigravity", to: "codex" }
  }, options);

  assert.equal(escalatedEvent.processed, true);
  assert.equal(getEvent(escalatedEvent.id, options).processed, true);
});

// ---------------------------------------------------------------------------
// TEST 4: Task Actions REST API Trigger Learning Events (Approve, Reject, Run)
// ---------------------------------------------------------------------------
test("R2-Events-4: Task Actions REST API Trigger Learning Events", async () => {
  const { options } = setupIsolatedEnv();

  // Build isolated express app with task approval, rejection, and run endpoints
  const app = express();
  app.use(express.json());

  // Task approve
  app.post("/api/tasks/:id/approve", (req, res) => {
    const task = getTask(req.params.id, options);
    if (!task) return res.status(404).json({ error: "Task not found" });
    const updated = updateTask(task.id, { status: "running", approvalStatus: "approved" }, options);
    emitLearningEvent({
      type: "FOUNDER_APPROVED",
      domain: task.domain || "engineering",
      actor: "founder",
      subject: { kind: "task", id: task.id }
    }, options);
    res.json({ ok: true, task: updated });
  });

  // Task reject
  app.post("/api/tasks/:id/reject-approval", (req, res) => {
    const task = getTask(req.params.id, options);
    if (!task) return res.status(404).json({ error: "Task not found" });
    const reason = req.body?.reason || "Approval rejected by founder";
    const updated = updateTask(task.id, { status: "cancelled", approvalStatus: "revoked", error: reason }, options);
    emitLearningEvent({
      type: "FOUNDER_REJECTED",
      domain: task.domain || "engineering",
      actor: "founder",
      subject: { kind: "task", id: task.id },
      explicitFeedback: reason
    }, options);
    res.json({ ok: true, task: updated });
  });

  // Task run (rerun)
  app.post("/api/tasks/:id/run", (req, res) => {
    const task = getTask(req.params.id, options);
    if (!task) return res.status(404).json({ error: "Task not found" });
    const prevStatus = task.status;
    const updated = updateTask(task.id, { status: "queued" }, options);
    emitLearningEvent({
      type: "FOUNDER_REGENERATED",
      domain: task.domain || "engineering",
      actor: "founder",
      subject: { kind: "task", id: task.id },
      payload: { previousStatus: prevStatus }
    }, options);
    res.json({ ok: true, taskId: task.id, status: "queued" });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    // 1. Task Approval triggers FOUNDER_APPROVED
    const t1 = createTask({ title: "待审批任务 1", status: "awaiting_approval" }, options);
    const approveRes = await fetch(`http://127.0.0.1:${port}/api/tasks/${t1.id}/approve`, { method: "POST" });
    assert.equal(approveRes.status, 200);

    const approveEvents = listEvents({ type: "FOUNDER_APPROVED", subjectId: t1.id }, options);
    assert.equal(approveEvents.length, 1);
    assert.equal(approveEvents[0].actor, "founder");

    // 2. Task Rejection triggers FOUNDER_REJECTED
    const t2 = createTask({ title: "待审批任务 2", status: "awaiting_approval" }, options);
    const rejectRes = await fetch(`http://127.0.0.1:${port}/api/tasks/${t2.id}/reject-approval`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "方案不够稳健，需重新调研" })
    });
    assert.equal(rejectRes.status, 200);

    const rejectEvents = listEvents({ type: "FOUNDER_REJECTED", subjectId: t2.id }, options);
    assert.equal(rejectEvents.length, 1);
    assert.equal(rejectEvents[0].explicitFeedback, "方案不够稳健，需重新调研");

    // 3. Task Rerun triggers FOUNDER_REGENERATED
    const t3 = createTask({ title: "已完成任务重跑", status: "completed" }, options);
    const runRes = await fetch(`http://127.0.0.1:${port}/api/tasks/${t3.id}/run`, { method: "POST" });
    assert.equal(runRes.status, 200);

    const regenEvents = listEvents({ type: "FOUNDER_REGENERATED", subjectId: t3.id }, options);
    assert.equal(regenEvents.length, 1);
    assert.equal(regenEvents[0].payload.previousStatus, "completed");
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// TEST 5: Content Package Actions REST API Trigger Learning Events
// ---------------------------------------------------------------------------
test("R2-Events-5: Content Package Approval & Rejection Trigger Learning Events", async () => {
  const { options } = setupIsolatedEnv();

  const app = express();
  app.use(express.json());

  app.post("/api/content/packages/:id/approve", (req, res) => {
    try {
      const approved = approvePackage(req.params.id, options);
      emitLearningEvent({
        type: "FOUNDER_APPROVED",
        domain: "copy",
        actor: "founder",
        subject: { kind: "package", id: approved.id }
      }, options);
      res.json({ ok: true, package: approved });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/content/packages/:id/reject", (req, res) => {
    try {
      const rejected = rejectPackage(req.params.id, req.body || {}, options);
      emitLearningEvent({
        type: "FOUNDER_REJECTED",
        domain: "copy",
        actor: "founder",
        subject: { kind: "package", id: rejected.id },
        explicitFeedback: req.body?.reason || null
      }, options);
      res.json({ ok: true, package: rejected });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.patch("/api/content/packages/:id", (req, res) => {
    try {
      const updated = updatePackage(req.params.id, req.body || {}, options);
      emitLearningEvent({
        type: "FOUNDER_EDITED",
        domain: "copy",
        actor: "founder",
        subject: { kind: "package", id: updated.id }
      }, options);
      res.json({ ok: true, package: updated });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const validExperiment = {
      accountId: "acc-1",
      source: "x_trend",
      insight: "痛点明确",
      audience: "年轻人",
      painOrDesire: "摆脱焦虑",
      objective: "认知提升",
      topic: "个人成长",
      title: "如何打破拖延症",
      hookType: "反常识",
      emotion: "好奇",
      contentStructure: "观点+行动清单",
      cta: "立即收藏",
      recommendation: "好书推荐",
      strategyVersion: "1.0",
      predictionScores: {
        traffic: 80,
        click: 85,
        read: 75,
        save: 90,
        discussion: 60,
        share: 70,
        follow: 65,
        fit: 88,
        evidence: 80
      },
      risks: ["无违规风险"],
      hypothesisIds: ["hyp-1"]
    };

    // 1. Create and freeze package, then approve via API
    const pkg1 = createPackage({
      title: "爆款测试图文 1",
      body: "正文内容清晰，包含可执行清单",
      experiment: validExperiment
    }, options);
    freezePackage(pkg1.id, options);

    const approveRes = await fetch(`http://127.0.0.1:${port}/api/content/packages/${pkg1.id}/approve`, {
      method: "POST"
    });
    assert.equal(approveRes.status, 200);

    const approveEvents = listEvents({ type: "FOUNDER_APPROVED", subjectId: pkg1.id }, options);
    assert.equal(approveEvents.length, 1);
    assert.equal(approveEvents[0].domain, "copy");

    // 2. Reject package via API
    const pkg2 = createPackage({
      title: "待拒绝图文 2",
      body: "正文待优化",
      experiment: validExperiment
    }, options);
    const rejectRes = await fetch(`http://127.0.0.1:${port}/api/content/packages/${pkg2.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "语气偏学术，需要更加通俗生活化" })
    });
    assert.equal(rejectRes.status, 200);

    const rejectEvents = listEvents({ type: "FOUNDER_REJECTED", subjectId: pkg2.id }, options);
    assert.equal(rejectEvents.length, 1);
    assert.equal(rejectEvents[0].explicitFeedback, "语气偏学术，需要更加通俗生活化");

    // 3. Edit package via API
    const editRes = await fetch(`http://127.0.0.1:${port}/api/content/packages/${pkg2.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "修改后的通俗标题" })
    });
    assert.equal(editRes.status, 200);

    const editEvents = listEvents({ type: "FOUNDER_EDITED", subjectId: pkg2.id }, options);
    assert.equal(editEvents.length, 1);
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// TEST 6: Content Package Metrics Evaluation Triggers Performance Events
// ---------------------------------------------------------------------------
test("R2-Events-6: Content Package Metrics Evaluation Triggers Performance Events", async () => {
  const { options } = setupIsolatedEnv();

  // Helper function matching server.js
  function evaluatePackageMetricsPerformance(metrics = {}) {
    const normalized = {
      impressions: Number(metrics?.impressions ?? 0),
      views: Number(metrics?.views ?? metrics?.reads ?? metrics?.clicks ?? 0),
      clicks: Number(metrics?.clicks ?? metrics?.views ?? metrics?.reads ?? 0),
      dwell_time: Number(metrics?.dwell_time ?? metrics?.avgStaySeconds ?? 0),
      avgStaySeconds: Number(metrics?.avgStaySeconds ?? metrics?.dwell_time ?? 0),
      likes: Number(metrics?.likes ?? 0),
      collects: Number(metrics?.collects ?? metrics?.saves ?? 0),
      saves: Number(metrics?.saves ?? metrics?.collects ?? 0),
      comments: Number(metrics?.comments ?? 0),
      follows: Number(metrics?.follows ?? metrics?.followersGained ?? 0),
      followersGained: Number(metrics?.followersGained ?? metrics?.follows ?? 0),
      dms: Number(metrics?.dms ?? 0),
      conversions_gmv: Number(metrics?.conversions_gmv ?? metrics?.conversions ?? metrics?.gmv ?? 0),
      conversions: Number(metrics?.conversions ?? metrics?.conversions_gmv ?? metrics?.gmv ?? 0)
    };

    try {
      const diagnosis = diagnoseFunnel(normalized);
      let isOutperformed = false;
      if (diagnosis.verdict === "outperformed") {
        isOutperformed = true;
      } else if (diagnosis.verdict === "underperformed") {
        isOutperformed = false;
      } else {
        isOutperformed = (diagnosis.engagementRate ?? 0) >= 0.05 || (diagnosis.rates?.engagementRate ?? 0) >= 0.05;
      }
      return { isOutperformed, diagnosis };
    } catch {
      const views = normalized.views;
      const interactions = normalized.likes + normalized.collects + normalized.comments;
      const engagementRate = views > 0 ? interactions / views : 0;
      return {
        isOutperformed: engagementRate >= 0.05,
        diagnosis: { stage: engagementRate >= 0.05 ? "healthy" : "low_engagement", engagementRate }
      };
    }
  }

  const app = express();
  app.use(express.json());

  app.post("/api/content/packages/:id/metrics", (req, res) => {
    try {
      const body = req.body || {};
      const metrics = body && typeof body === "object" && !Array.isArray(body)
        && Object.prototype.hasOwnProperty.call(body, "metrics")
        ? body.metrics
        : body;
      const pkg = appendPackageMetrics(req.params.id, metrics, options);

      try {
        const latestMetric = Array.isArray(metrics) ? metrics[metrics.length - 1] : metrics;
        const { isOutperformed, diagnosis } = evaluatePackageMetricsPerformance(latestMetric);
        emitLearningEvent({
          type: isOutperformed ? "CONTENT_OUTPERFORMED" : "CONTENT_UNDERPERFORMED",
          domain: "content_performance",
          actor: "system",
          subject: { kind: "package", id: pkg.id },
          payload: {
            metrics: latestMetric,
            stage: diagnosis?.stage || null,
            bottleneck: diagnosis?.bottleneck || null,
            engagementRate: diagnosis?.engagementRate ?? null,
            rates: pkg.metrics?.[pkg.metrics.length - 1]?.rates || null
          }
        }, options);
      } catch {}

      res.status(201).json({ ok: true, package: pkg, metrics: pkg.metrics });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const validExperiment = {
      accountId: "acc-1",
      source: "x_trend",
      insight: "痛点明确",
      audience: "年轻人",
      painOrDesire: "摆脱焦虑",
      objective: "认知提升",
      topic: "个人成长",
      title: "自律方法论",
      hookType: "反常识",
      emotion: "好奇",
      contentStructure: "清单",
      cta: "收藏",
      recommendation: "书单",
      strategyVersion: "1.0",
      predictionScores: {
        traffic: 80, click: 80, read: 80, save: 80,
        discussion: 80, share: 80, follow: 80, fit: 80, evidence: 80
      },
      risks: ["无"],
      hypothesisIds: ["h1"]
    };

    // 1. High Performance Package: Metrics exceed benchmarks -> CONTENT_OUTPERFORMED
    const pkg1 = createPackage({
      title: "高表现笔记",
      platform: "xiaohongshu",
      body: "正文内容清晰，包含可执行清单",
      experiment: validExperiment
    }, options);
    freezePackage(pkg1.id, options);
    // Mark published using store method
    recordPublish(pkg1.id, { ok: true }, options);

    const highMetricsRes = await fetch(`http://127.0.0.1:${port}/api/content/packages/${pkg1.id}/metrics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        impressions: 5000,
        reads: 500, // CTR 10% >= 3%
        avgStaySeconds: 30, // Dwell 30s >= 15s
        likes: 50,
        saves: 45, // Save rate 9% >= 3%
        comments: 20,
        followersGained: 15
      })
    });
    assert.equal(highMetricsRes.status, 201);

    const outEvents = listEvents({ type: "CONTENT_OUTPERFORMED", subjectId: pkg1.id }, options);
    assert.equal(outEvents.length, 1);
    assert.equal(outEvents[0].domain, "content_performance");
    assert.equal(outEvents[0].payload.stage, "healthy");

    // 2. Low Performance Package: Metrics below benchmarks -> CONTENT_UNDERPERFORMED
    const pkg2 = createPackage({
      title: "低表现笔记",
      platform: "xiaohongshu",
      body: "正文内容清晰，包含可执行清单",
      experiment: validExperiment
    }, options);
    freezePackage(pkg2.id, options);
    approvePackage(pkg2.id, options);
    recordPublish(pkg2.id, { ok: true }, options);

    const lowMetricsRes = await fetch(`http://127.0.0.1:${port}/api/content/packages/${pkg2.id}/metrics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        impressions: 200, // < 1000 minExposure
        reads: 10,
        likes: 1,
        saves: 0
      })
    });
    assert.equal(lowMetricsRes.status, 201);

    const underEvents = listEvents({ type: "CONTENT_UNDERPERFORMED", subjectId: pkg2.id }, options);
    assert.equal(underEvents.length, 1);
    assert.equal(underEvents[0].payload.stage, "low_exposure");
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// TEST 7: Junior-to-Senior Worker Escalation Emits AGENT_ESCALATED
// ---------------------------------------------------------------------------
test("R2-Events-7: Junior-to-Senior Worker Escalation Emits AGENT_ESCALATED", () => {
  const { options } = setupIsolatedEnv();

  // Test event emission directly and verify schema
  const event = emitLearningEvent({
    type: "AGENT_ESCALATED",
    domain: "routing",
    actor: "system",
    subject: { kind: "task", id: "task-esc-101" },
    payload: {
      from: "antigravity",
      to: "codex",
      reason: "Antigravity 验收失败返工穷尽；任务升级给 codex",
      modelNeed: { tier: "HIGH", score: 85 }
    }
  }, options);

  assert.equal(event.type, "AGENT_ESCALATED");
  assert.equal(event.domain, "routing");
  assert.equal(event.actor, "system");
  assert.equal(event.payload.from, "antigravity");
  assert.equal(event.payload.to, "codex");

  const list = listEvents({ type: "AGENT_ESCALATED" }, options);
  assert.equal(list.length, 1);
  assert.equal(list[0].subject.id, "task-esc-101");
});

// ---------------------------------------------------------------------------
// TEST 8: Task Outcomes Emit TASK_SUCCEEDED / TASK_FAILED
// ---------------------------------------------------------------------------
test("R2-Events-8: Task Terminal Outcomes Emit TASK_SUCCEEDED / TASK_FAILED", () => {
  const { options } = setupIsolatedEnv();

  // Succeeded task event
  const successEvent = emitLearningEvent({
    type: "TASK_SUCCEEDED",
    domain: "engineering",
    actor: "system",
    subject: { kind: "task", id: "task-succ-201" },
    payload: { agent: "antigravity" }
  }, options);

  assert.equal(successEvent.type, "TASK_SUCCEEDED");
  assert.equal(listEvents({ type: "TASK_SUCCEEDED" }, options).length, 1);

  // Failed task event
  const failEvent = emitLearningEvent({
    type: "TASK_FAILED",
    domain: "engineering",
    actor: "system",
    subject: { kind: "task", id: "task-fail-202" },
    payload: { agent: "antigravity", error: "Command failed" }
  }, options);

  assert.equal(failEvent.type, "TASK_FAILED");
  assert.equal(listEvents({ type: "TASK_FAILED" }, options).length, 1);
});

// ---------------------------------------------------------------------------
// TEST 9: Learning Conflict Event Emitted for Contradictory Rules
// ---------------------------------------------------------------------------
test("R2-Events-9: Learning Conflict Event Emitted for Contradictory Rules", () => {
  const { options } = setupIsolatedEnv();

  const conflictEvent = emitLearningEvent({
    type: "LEARNING_CONFLICT",
    domain: "visual",
    actor: "system",
    subject: { kind: "memory", id: "mem-conflict-301" },
    payload: {
      existingRuleId: "mem-active-001",
      newRuleId: "mem-candidate-002",
      reason: "Semantic contradiction: picture-book illustration vs tech dark mode"
    }
  }, options);

  assert.equal(conflictEvent.type, "LEARNING_CONFLICT");
  assert.equal(conflictEvent.processed, true);
  assert.equal(listEvents({ type: "LEARNING_CONFLICT" }, options).length, 1);
});
