import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import {
  EVENT_TYPES,
  getEventsDir,
  recordEvent,
  getEvent,
  listEvents,
  markProcessed
} from "../src/learning/events.js";
import { emitLearningEvent, applyLearningEvent } from "../src/learning/router.js";
import { evaluateModelNeed } from "../src/workforce/modelNeed.js";
import { FALLBACK_CHAIN } from "../src/workers/ids.js";
import { applyCostGuard } from "../src/workers/costGuard.js";
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
import { createTask, getTask, updateTask, listTasks } from "../src/store.js";
import { dispatchTask } from "../src/router.js";

function setupIsolatedSandbox(prefix = "gate2-stress-") {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const tasksDir = path.join(baseDir, "tasks");
  const eventsDir = path.join(baseDir, "events");
  const memoryDir = path.join(baseDir, "memory");
  const candidatesDir = path.join(memoryDir, "candidates");
  const workforceDir = path.join(baseDir, "workforce");
  const quotaDir = path.join(baseDir, "quota");

  fs.mkdirSync(tasksDir, { recursive: true });
  fs.mkdirSync(eventsDir, { recursive: true });
  fs.mkdirSync(memoryDir, { recursive: true });
  fs.mkdirSync(candidatesDir, { recursive: true });
  fs.mkdirSync(workforceDir, { recursive: true });
  fs.mkdirSync(quotaDir, { recursive: true });

  process.env.TASKS_BASE_DIR = baseDir;
  process.env.LEARNING_EVENTS_DIR = eventsDir;
  process.env.MEMORY_BASE_DIR = memoryDir;
  process.env.WORKFORCE_BASE_DIR = workforceDir;
  process.env.QUOTA_BASE_DIR = quotaDir;

  const options = {
    baseDir,
    tasksDir,
    eventsDir,
    memoryDir,
    workforceDir,
    quotaDir
  };

  return {
    baseDir,
    eventsDir,
    workforceDir,
    tasksDir,
    options,
    cleanup: () => {
      try {
        fs.rmSync(baseDir, { recursive: true, force: true });
      } catch {}
    }
  };
}

const online = (id) => ({
  id,
  status: "ONLINE",
  available: true,
  billingMode: "subscription",
  apiAllowed: false
});

const offline = (id) => ({
  id,
  status: "OFFLINE",
  available: false,
  billingMode: "subscription",
  apiAllowed: false
});

// ===========================================================================
// STRESS TEST HARNESS 1: Learning Event Invalid Payload Injection & Edge Cases
// ===========================================================================

test("Stress 1.1: Invalid event types injection rejects with exact error across all malformed variants", () => {
  const { options, cleanup } = setupIsolatedSandbox("gate2-stress-1-1-");
  try {
    const invalidTypes = [
      "UNKNOWN_EVENT",
      "found_approved", // wrong case
      "founder_rejected",
      "",
      null,
      undefined,
      12345,
      {},
      [],
      true,
      "__proto__",
      "DROP TABLE events;",
      "CONSTRUCT_EXPLOIT"
    ];

    for (const badType of invalidTypes) {
      assert.throws(
        () => recordEvent({ type: badType }, options),
        /Invalid learning event type/,
        `Expected rejection for invalid event type: ${badType}`
      );
    }

    // Verify nothing leaked to disk
    const all = listEvents({}, options);
    assert.equal(all.length, 0, "No invalid events should be persisted to disk");
  } finally {
    cleanup();
  }
});

test("Stress 1.2: Missing/null actors, domains, subjects, and payloads default safely", () => {
  const { options, cleanup } = setupIsolatedSandbox("gate2-stress-1-2-");
  try {
    // A: Null/undefined actor & domain
    const evt1 = recordEvent({
      type: "FOUNDER_APPROVED",
      actor: null,
      domain: null,
      subject: null,
      payload: null
    }, options);

    assert.equal(evt1.actor, "system", "Null actor must default to 'system'");
    assert.equal(evt1.domain, "general", "Null domain must default to 'general'");
    assert.deepEqual(evt1.subject, { kind: "unknown", id: null }, "Null subject defaults to unknown/null");
    assert.deepEqual(evt1.payload, {}, "Null payload defaults to empty object");
    assert.equal(evt1.processed, false);

    // B: Non-object payload
    const evt2 = recordEvent({
      type: "TASK_SUCCEEDED",
      actor: "antigravity",
      domain: "coding",
      payload: "primitive string payload"
    }, options);
    assert.deepEqual(evt2.payload, {}, "Primitive payload should default to empty object safely");

    // C: Verify disk retrieval parses intact
    const fetched1 = getEvent(evt1.id, options);
    assert.equal(fetched1.id, evt1.id);
    assert.equal(fetched1.actor, "system");

    const fetched2 = getEvent(evt2.id, options);
    assert.equal(fetched2.id, evt2.id);
    assert.equal(fetched2.domain, "coding");
  } finally {
    cleanup();
  }
});

test("Stress 1.3: Duplicate Event ID injection enforces append-only tamper prevention", () => {
  const { options, cleanup } = setupIsolatedSandbox("gate2-stress-1-3-");
  try {
    const fixedId = "evt-immutable-integrity-001";
    const originalPayload = { key: "initial_genuine_value" };

    const first = recordEvent({
      id: fixedId,
      type: "FOUNDER_APPROVED",
      domain: "content",
      payload: originalPayload
    }, options);
    assert.equal(first.id, fixedId);

    // Attempt second write with identical ID but tampered payload
    assert.throws(() => {
      recordEvent({
        id: fixedId,
        type: "FOUNDER_REJECTED",
        domain: "hacked",
        payload: { key: "malicious_overwrite" }
      }, options);
    }, /append-only ledger violation/);

    // Verify disk content was NEVER altered
    const onDisk = getEvent(fixedId, options);
    assert.equal(onDisk.type, "FOUNDER_APPROVED", "Disk state must retain original type");
    assert.deepEqual(onDisk.payload, originalPayload, "Disk payload must not be overwritten");
  } finally {
    cleanup();
  }
});

test("Stress 1.4: High-concurrency burst emission of 100 events maintains FIFO integrity", async () => {
  const { options, cleanup } = setupIsolatedSandbox("gate2-stress-1-4-");
  try {
    const COUNT = 100;
    const promises = [];

    for (let i = 0; i < COUNT; i++) {
      promises.push(
        new Promise((resolve, reject) => {
          try {
            const event = recordEvent({
              type: i % 2 === 0 ? "FOUNDER_APPROVED" : "TASK_SUCCEEDED",
              domain: `burst_domain_${i % 5}`,
              actor: `worker_${i % 3}`,
              subject: { kind: "task", id: `task-${i}` },
              payload: { index: i, nonce: crypto.randomBytes(4).toString("hex") }
            }, options);
            resolve(event);
          } catch (err) {
            reject(err);
          }
        })
      );
    }

    const created = await Promise.all(promises);
    assert.equal(created.length, COUNT);

    // Check uniqueness of IDs
    const idSet = new Set(created.map((e) => e.id));
    assert.equal(idSet.size, COUNT, "All 100 event IDs must be strictly unique");

    // Check disk listing
    const listed = listEvents({}, options);
    assert.equal(listed.length, COUNT, "All 100 events must be listed from disk");

    // Verify no temporary files remain
    const dirFiles = fs.readdirSync(options.eventsDir);
    const tmpFiles = dirFiles.filter((f) => f.includes(".tmp"));
    assert.equal(tmpFiles.length, 0, "Zero .tmp files should linger after concurrent writes");
  } finally {
    cleanup();
  }
});

test("Stress 1.5: Large Unicode, astral plane emojis, and special control character payloads", () => {
  const { options, cleanup } = setupIsolatedSandbox("gate2-stress-1-5-");
  try {
    const complexString = "🚀🌟🔥【爆款标题】小红书3秒留存\n\t测试'\"`~!@#$%^&*()_+-=[]{}|;:,.<>?/\\特殊字符\u0000\u001F";
    const largeArray = Array.from({ length: 500 }, (_, i) => ({ idx: i, text: `样本_${i}_${complexString}` }));

    const event = recordEvent({
      type: "CONTENT_OUTPERFORMED",
      domain: "xhs_intelligence",
      actor: "founder",
      subject: { kind: "content_package", id: "pkg-emoji-123" },
      explicitFeedback: complexString,
      payload: { data: largeArray }
    }, options);

    assert.ok(event.id);
    const readBack = getEvent(event.id, options);
    assert.ok(readBack);
    assert.equal(readBack.explicitFeedback, complexString);
    assert.equal(readBack.payload.data.length, 500);
    assert.equal(readBack.payload.data[499].text, `样本_499_${complexString}`);
  } finally {
    cleanup();
  }
});

test("Stress 1.6: Router resilience when subject memory does not exist or event is null", () => {
  const { options, cleanup } = setupIsolatedSandbox("gate2-stress-1-6-");
  try {
    // A: null event
    const nullResult = applyLearningEvent(null, options);
    assert.equal(nullResult, null);

    // B: already processed event
    const processedEvent = { id: "evt-proc", processed: true };
    const resProc = applyLearningEvent(processedEvent, options);
    assert.equal(resProc.processed, true);

    // C: emitLearningEvent with missing memory
    const ghostMemEvent = emitLearningEvent({
      type: "FOUNDER_FAVORITED",
      domain: "visual",
      subject: { kind: "memory", id: "non-existent-candidate-999" },
      explicitFeedback: "Ghost feedback"
    }, options);

    assert.ok(ghostMemEvent.id);
    assert.equal(ghostMemEvent.processed, true, "Event should be marked processed even if target memory was absent");
  } finally {
    cleanup();
  }
});

// ===========================================================================
// STRESS TEST HARNESS 2: ModelNeed Boundary Tuning with "重构"
// ===========================================================================

test("Stress 2.1: Simple UI tasks mentioning '重构' stay LOW complexity and do NOT escalate to HIGH", () => {
  const testCases = [
    { title: "重构前端登录按钮hover效果", desc: "微调按钮在悬停时的css样式" },
    { title: "重构页面css样式与主色调颜色", desc: "把背景色从灰白改成浅蓝" },
    { title: "重构按钮组件的margin与padding", desc: "调整UI边距" },
    { title: "重构文案与排版格式", desc: "修正关于我们界面的文字排版" },
    { title: "重构按钮样式并修改边框", desc: "修改border为圆角" },
    { title: "重构小按钮", desc: "加个小按钮，调整边框" },
    { title: "重构导航栏ui微调", desc: "修改导航栏样式" },
    { title: "加个按钮并重构页面hover动效", desc: "简单的前端组件样式调整" }
  ];

  for (const tc of testCases) {
    const result = evaluateModelNeed({
      title: tc.title,
      description: tc.desc,
      acceptanceCriteria: ["界面样式正常显示", "无控制台报错"]
    });

    assert.equal(result.tier, "LOW", `Task '${tc.title}' must be LOW tier, got ${result.tier}`);
    assert.equal(result.requiresSeniorWorker, false, `Task '${tc.title}' must not require senior worker`);
    assert.equal(result.preferredWorker, "antigravity", `Task '${tc.title}' must prefer antigravity`);
    assert.ok(result.modelNeedScore <= 35, `Task '${tc.title}' score ${result.modelNeedScore} should be <= 35`);
  }
});

test("Stress 2.2: Architectural and core engineering tasks mentioning '重构' strictly escalate to HIGH", () => {
  const testCases = [
    { title: "重构底层架构与并发调度器", desc: "重构整个调度引擎的cross-module底层协议" },
    { title: "重构核心系统协议与编译器解析器", desc: "重构核心内核 parser 与 state machine" },
    { title: "重构状态机与底层协议", desc: "重构异步状态流与协议驱动" },
    { title: "重构调度器排查并发race condition和内存泄漏", desc: "解决死锁和并发调度问题" },
    { title: "重构核心系统的算法优化与kernel通信", desc: "提高核心底层算法效率" }
  ];

  for (const tc of testCases) {
    const result = evaluateModelNeed({
      title: tc.title,
      description: tc.desc,
      acceptanceCriteria: ["所有底层并发测试通过", "无race condition"]
    });

    assert.equal(result.tier, "HIGH", `Task '${tc.title}' must be HIGH tier, got ${result.tier}`);
    assert.equal(result.requiresSeniorWorker, true, `Task '${tc.title}' must require senior worker`);
    assert.equal(result.preferredWorker, "codex", `Task '${tc.title}' must prefer codex`);
    assert.ok(result.modelNeedScore >= 75, `Task '${tc.title}' score ${result.modelNeedScore} should be >= 75`);
  }
});

test("Stress 2.3: Boundary & mixed context: UI + Architectural keywords correctly resolves", () => {
  // Case A: Mixed - mentions both UI and deep core kernel -> HIGH
  const mixedDeep = evaluateModelNeed({
    title: "重构前端按钮样式，同时修改底层调度器并发状态机",
    description: "涉及内核架构与UI"
  });
  assert.equal(mixedDeep.tier, "HIGH", "Task with explicit underlying kernel/scheduler must be HIGH even if UI is mentioned");

  // Case B: Neutral - "重构用户手册文档" -> LOW
  const neutralDoc = evaluateModelNeed({
    title: "重构用户手册文档",
    description: "文档修正与格式化"
  });
  assert.equal(neutralDoc.tier, "LOW", "Document refactoring must remain LOW tier");

  // Case C: Empty inputs -> LOW
  const emptyTask = evaluateModelNeed({});
  assert.equal(emptyTask.tier, "LOW", "Empty task defaults to LOW tier");
  assert.equal(emptyTask.preferredWorker, "antigravity");
});

// ===========================================================================
// STRESS TEST HARNESS 3: CostGuard Fallback Stress & Senior Reasoning Protection
// ===========================================================================

test("Stress 3.1: LOW tier task strictly skips Codex, Claude, and Grok-Build when Antigravity fails", () => {
  const { options, cleanup } = setupIsolatedSandbox("gate2-stress-3-1-");
  try {
    // Setup health map: Antigravity OFFLINE, Claude ONLINE, Grok-Build ONLINE, Codex ONLINE
    const health = {
      antigravity: offline("antigravity"),
      claude: online("claude"),
      "grok-build": online("grok-build"),
      codex: online("codex"),
      "grok-bot": { available: false, status: "UNAVAILABLE" }
    };

    const lowTask = {
      id: "task-low-1",
      title: "修改前端按钮边框",
      tier: "LOW",
      modelNeed: { tier: "LOW", requiresSeniorWorker: false }
    };

    const guard = applyCostGuard("auto", health, { task: lowTask, ...options });

    // Result must be false because all available workers (claude, grok-build, codex) are senior models!
    assert.equal(guard.ok, false, "CostGuard must reject fallback to senior models for LOW tasks");
    assert.equal(guard.worker, null, "No worker should be selected");
    assert.equal(guard.action, "HUMAN_ACTION_REQUIRED");

    // Inspect attempts: Claude, Grok-Build, and Codex must all be skipped with SENIOR_MODEL_RESERVED
    const skippedSenior = guard.attempts.filter((a) =>
      a.skip && a.skip.includes("SENIOR_MODEL_RESERVED")
    );
    assert.equal(skippedSenior.length, 3, "All 3 senior workers must be skipped due to senior model reservation");
    assert.deepEqual(skippedSenior.map((s) => s.id), ["claude", "grok-build", "codex"]);
  } finally {
    cleanup();
  }
});

test("Stress 3.2: LOW tier task with requested='antigravity' fails cleanly without falling back to Codex", () => {
  const { options, cleanup } = setupIsolatedSandbox("gate2-stress-3-2-");
  try {
    const health = {
      antigravity: offline("antigravity"),
      claude: online("claude"),
      "grok-build": online("grok-build"),
      codex: online("codex")
    };

    const lowTask = {
      id: "task-low-explicit",
      title: "微调CSS颜色",
      tier: "LOW"
    };

    const guard = applyCostGuard("antigravity", health, { task: lowTask, ...options });
    assert.equal(guard.ok, false);
    assert.equal(guard.worker, null);

    // Codex must NOT be chosen
    const codexAttempt = guard.attempts.find((a) => a.id === "codex");
    assert.ok(codexAttempt);
    assert.ok(codexAttempt.skip.includes("SENIOR_MODEL_RESERVED"));
  } finally {
    cleanup();
  }
});

test("Stress 3.3: dispatchTask on LOW tier task with Antigravity exhausted halts at waiting_for_capacity", async () => {
  const { options, cleanup } = setupIsolatedSandbox("gate2-stress-3-3-");
  try {
    // Mark antigravity EXHAUSTED in workforce registry
    // The dispatcher reads WORKFORCE_BASE_DIR, not the task-store baseDir.
    updateWorker("antigravity", { status: "EXHAUSTED", failureReason: "Rate limited" }, { baseDir: options.workforceDir });

    const task = createTask({
      title: "按钮css小修",
      description: "微调颜色",
      agent: "antigravity",
      modelNeed: { tier: "LOW", preferredWorker: "antigravity" },
      tier: "LOW",
      status: "queued"
    }, options);

    // Dispatch task
    const updated = await dispatchTask(task.id, {
      dryRun: true,
      agents: {
        antigravity: { enabled: true, command: "antigravity" },
        codex: { enabled: true, command: "codex" }
      }
    });

    assert.equal(updated.status, "waiting_for_capacity", "Task must wait for capacity, not execute on Codex");
    assert.notEqual(updated.agentResolved, "codex", "Resolved agent must never be codex");

    const refreshed = getTask(task.id, options);
    assert.equal(refreshed.status, "waiting_for_capacity");
  } finally {
    cleanup();
  }
});

test("Stress 3.4: HIGH tier task CAN fallback to Codex when antigravity is offline", () => {
  const { options, cleanup } = setupIsolatedSandbox("gate2-stress-3-4-");
  try {
    const health = {
      antigravity: offline("antigravity"),
      claude: offline("claude"),
      "grok-build": offline("grok-build"),
      codex: online("codex")
    };

    const highTask = {
      id: "task-high-arch",
      title: "重构调度器内核",
      tier: "HIGH",
      modelNeed: { tier: "HIGH", requiresSeniorWorker: true }
    };

    const guard = applyCostGuard("auto", health, { task: highTask, ...options });
    assert.equal(guard.ok, true, "HIGH task is permitted to use Codex");
    assert.equal(guard.worker, "codex");
  } finally {
    cleanup();
  }
});

// ===========================================================================
// STRESS TEST HARNESS 4: Workforce Rebound Race Conditions & Concurrency
// ===========================================================================

test("Stress 4.1: Concurrent wakeWaitingTasks calls on 10 waiting tasks execute idempotently", async () => {
  const { options, cleanup } = setupIsolatedSandbox("gate2-stress-4-1-");
  try {
    const TASK_COUNT = 10;
    const taskIds = [];

    // Create 10 tasks waiting for codex capacity
    for (let i = 0; i < TASK_COUNT; i++) {
      const t = createTask({
        title: `Waiting Task ${i}`,
        status: "waiting_for_capacity",
        targetSeniorWorker: "codex",
        agent: "codex"
      }, options);
      taskIds.push(t.id);
    }

    // Also create 3 tasks waiting for antigravity to test worker targeting isolation
    const antiTasks = [];
    for (let i = 0; i < 3; i++) {
      const t = createTask({
        title: `Anti Task ${i}`,
        status: "waiting_for_capacity",
        targetSeniorWorker: "antigravity",
        agent: "antigravity"
      }, options);
      antiTasks.push(t.id);
    }

    // Fire 5 concurrent wakeWaitingTasks for "codex"
    let mockDispatches = 0;
    const mockDispatchFn = async (id) => {
      mockDispatches++;
      return { ok: true, taskId: id };
    };

    const concurrentCalls = [
      wakeWaitingTasks("codex", { ...options, autoDispatch: true, dispatchTask: mockDispatchFn }),
      wakeWaitingTasks("codex", { ...options, autoDispatch: true, dispatchTask: mockDispatchFn }),
      wakeWaitingTasks("codex", { ...options, autoDispatch: true, dispatchTask: mockDispatchFn }),
      wakeWaitingTasks("codex", { ...options, autoDispatch: true, dispatchTask: mockDispatchFn }),
      wakeWaitingTasks("codex", { ...options, autoDispatch: true, dispatchTask: mockDispatchFn })
    ];

    const results = await Promise.all(concurrentCalls);

    // Sum of awakened count across all concurrent calls
    const totalAwakened = results.reduce((sum, c) => sum + c, 0);
    assert.equal(totalAwakened, TASK_COUNT, "All 10 tasks should be awakened exactly once in total");

    // Check all codex tasks are now queued
    for (const id of taskIds) {
      const t = getTask(id, options);
      assert.equal(t.status, "queued", `Task ${id} should be queued`);
      assert.equal(t.agentResolved, "codex");
    }

    // Verify antigravity tasks were NOT touched
    for (const id of antiTasks) {
      const t = getTask(id, options);
      assert.equal(t.status, "waiting_for_capacity", `Anti task ${id} must remain waiting_for_capacity`);
    }
  } finally {
    cleanup();
  }
});

test("Stress 4.2: Interleaved checkAndReboundWorker race condition settles worker and wakes tasks", async () => {
  const { options, cleanup } = setupIsolatedSandbox("gate2-stress-4-2-");
  try {
    // Put codex in COOLDOWN
    updateWorker("codex", {
      status: "COOLDOWN",
      failureReason: "Simulated quota error",
      cooldownCount: 1
    }, options);

    // Create 3 waiting tasks
    for (let i = 0; i < 3; i++) {
      createTask({
        title: `Codex Task ${i}`,
        status: "waiting_for_capacity",
        agent: "codex",
        targetSeniorWorker: "codex"
      }, options);
    }

    // Mock probe function that returns true (recovered)
    let probeCalls = 0;
    const mockProbe = (workerId) => {
      probeCalls++;
      return true;
    };

    // Run 3 concurrent checkAndReboundWorker
    const rebounds = await Promise.all([
      checkAndReboundWorker("codex", { forceProbe: true, probeImpl: mockProbe, options: { ...options, autoDispatch: false } }),
      checkAndReboundWorker("codex", { forceProbe: true, probeImpl: mockProbe, options: { ...options, autoDispatch: false } }),
      checkAndReboundWorker("codex", { forceProbe: true, probeImpl: mockProbe, options: { ...options, autoDispatch: false } })
    ]);

    // Check that at least one succeeded and worker is now AVAILABLE
    const finalWorker = getWorker("codex", options);
    assert.equal(finalWorker.status, "AVAILABLE", "Codex must be recovered to AVAILABLE");
    assert.equal(finalWorker.cooldownCount, 0, "cooldownCount must be reset to 0");

    // Check that all 3 waiting tasks are now queued
    const tasks = listTasks(options);
    const waiting = tasks.filter((t) => t.status === "waiting_for_capacity");
    assert.equal(waiting.length, 0, "No tasks should remain in waiting_for_capacity");
    const queued = tasks.filter((t) => t.status === "queued");
    assert.equal(queued.length, 3, "All 3 tasks must be transitioned to queued");
  } finally {
    cleanup();
  }
});

test("Stress 4.3: checkAndReboundWorker handles unknown workers and failed probes cleanly", () => {
  const { options, cleanup } = setupIsolatedSandbox("gate2-stress-4-3-");
  try {
    // Unknown worker
    const r1 = checkAndReboundWorker("non-existent-worker", { options });
    assert.equal(r1.rebounded, false);
    assert.equal(r1.reason, "worker_not_found");

    // Worker already AVAILABLE (not in cooldown)
    const r2 = checkAndReboundWorker("antigravity", { options });
    assert.equal(r2.rebounded, false);
    assert.equal(r2.reason, "not_in_cooldown");

    // Worker fails probe
    updateWorker("codex", { status: "COOLDOWN" }, options);
    const r3 = checkAndReboundWorker("codex", {
      forceProbe: true,
      probeImpl: () => false, // fails probe
      options
    });
    assert.equal(r3.rebounded, false);
    assert.equal(r3.status, "COOLDOWN");
    assert.equal(r3.reason, "probe_unsuccessful");

    const codex = getWorker("codex", options);
    assert.equal(codex.status, "COOLDOWN");
  } finally {
    cleanup();
  }
});
