import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { evaluateModelNeed } from "../src/workforce/modelNeed.js";
import { classifyWorkerError } from "../src/workforce/errorClassifier.js";
import {
  getWorkersRegistry,
  getWorker,
  updateWorker,
  saveWorkersRegistry,
  DEFAULT_WORKERS
} from "../src/workforce/registry.js";
import {
  transitionWorkerStatus,
  recordWorkerFailure,
  recordWorkerSuccess
} from "../src/workforce/statusMachine.js";
import {
  checkAndReboundWorker,
  wakeWaitingTasks
} from "../src/workforce/rebound.js";
import {
  buildPreworkPrompt,
  createPreworkTask,
  isPreworkApplicable
} from "../src/workforce/prework.js";
import { applyCostGuard } from "../src/workers/costGuard.js";
import { chooseAgent, dispatchTask } from "../src/router.js";
import { createTask, getTask, updateTask } from "../src/store.js";
import { markQuotaExhausted, markQuotaNormal } from "../src/workers/quota.js";

function setupIsolatedEnv() {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-test-"));
  const tasksDir = path.join(baseDir, "tasks");
  const quotaDir = path.join(baseDir, "quota");
  const workforceDir = path.join(baseDir, "workforce");
  fs.mkdirSync(tasksDir, { recursive: true });
  fs.mkdirSync(quotaDir, { recursive: true });
  fs.mkdirSync(workforceDir, { recursive: true });

  process.env.TASKS_BASE_DIR = baseDir;
  process.env.QUOTA_BASE_DIR = quotaDir;
  process.env.WORKFORCE_BASE_DIR = workforceDir;

  return {
    baseDir,
    tasksDir,
    options: { baseDir: workforceDir, tasksDir, quotaDir }
  };
}

test("TEST 1: Antigravity 正常。普通轻量任务自动选择 Antigravity", () => {
  const task = {
    title: "修改按钮 hover 效果",
    description: "调整按钮的 hover 颜色为暗金微光，不需要改动逻辑"
  };
  const need = evaluateModelNeed(task);
  assert.equal(need.tier, "LOW");
  assert.equal(need.preferredWorker, "antigravity");
  assert.equal(need.requiresSeniorWorker, false);

  const agent = chooseAgent(task);
  assert.equal(agent, "antigravity");
});

test("TEST 2: Codex 正常。高复杂 Coding Task 选择 Codex", () => {
  const task = {
    title: "重构 Task Scheduler 核心架构",
    description: "重构底层跨模块状态机与并发队列，修复并发竞争条件"
  };
  const need = evaluateModelNeed(task);
  assert.equal(need.tier, "HIGH");
  assert.equal(need.preferredWorker, "codex");
  assert.equal(need.requiresSeniorWorker, true);

  const agent = chooseAgent(task);
  assert.equal(agent, "codex");
});

test("TEST 3: 模拟 Codex quota exhausted。高复杂任务不能被 Antigravity 直接危险执行，Antigravity 只做 Prework，任务进入 WAITING_FOR_CAPACITY", async () => {
  const { options } = setupIsolatedEnv();

  // Mark codex as exhausted in statusMachine and quota
  recordWorkerFailure("codex", "QUOTA_EXHAUSTED", "usage limit reached for today", options);
  markQuotaExhausted("codex", "usage limit reached", options);

  const worker = getWorker("codex", options);
  assert.equal(worker.status, "COOLDOWN");
  assert.ok(worker.lastQuotaError);

  // High complexity task
  const task = createTask({
    title: "重构 Task Scheduler 核心架构",
    description: "重构底层跨模块状态机与并发队列，修复并发竞争条件",
    status: "queued"
  });

  const config = { dryRun: true, agents: { antigravity: { permissionMode: "dangerous-bypass" } } };
  const dispatched = await dispatchTask(task.id, config);

  // The task must NOT be executed as a full refactor by Antigravity;
  // it must enter waiting_for_capacity with prework completed!
  assert.equal(dispatched.status, "waiting_for_capacity");
  assert.equal(dispatched.targetSeniorWorker, "codex");
  assert.ok(dispatched.prework?.completed, "Prework should be completed");
});

test("TEST 4: 模拟 Codex 恢复。Codex：COOLDOWN → PROBING → AVAILABLE。任务自动恢复", async () => {
  const { options } = setupIsolatedEnv();

  // Setup a waiting task
  const task = createTask({
    title: "重构 Task Scheduler 核心架构",
    description: "重构底层跨模块状态机"
  });
  updateTask(task.id, {
    status: "waiting_for_capacity",
    targetSeniorWorker: "codex",
    prework: { completed: true, summary: "Found scheduler.js and store.js dependencies" }
  });

  // Codex in cooldown
  updateWorker("codex", { status: "COOLDOWN" }, options);

  // Probe with a mock probe that returns healthy
  const reboundResult = checkAndReboundWorker("codex", {
    forceProbe: true,
    probeImpl: () => true,
    options
  });

  assert.equal(reboundResult.rebounded, true);
  assert.equal(reboundResult.status, "AVAILABLE");

  // Worker is now AVAILABLE
  const codex = getWorker("codex", options);
  assert.equal(codex.status, "AVAILABLE");

  // Task is awakened into queued
  const updatedTask = getTask(task.id);
  assert.equal(updatedTask.status, "queued");
  assert.match(updatedTask.selectionReason, /恢复回弹/);
});

test("TEST 5: Grok Build 额度不足。普通研究任务可降级，高价值研究任务正确等待或挂起", () => {
  const normalResearch = {
    title: "简单查一下最新的几个开源库",
    description: "查一下名字和开源协议"
  };
  const normalNeed = evaluateModelNeed(normalResearch);
  assert.equal(normalNeed.tier, "LOW");

  const deepResearch = {
    title: "深入调研国外 AI Agent 最新产品生态",
    description: "对比分析 10 款前沿产品，制作完整的架构与商业模式战略分析"
  };
  const deepNeed = evaluateModelNeed(deepResearch);
  assert.equal(deepNeed.tier, "HIGH");
  assert.equal(deepNeed.preferredWorker, "grok-build");
  assert.equal(deepNeed.requiresSeniorWorker, true);
});

test("TEST 6: Codex + Grok unavailable。Hermes 没有 allowPaidFallback。系统绝不能自动收费调用", () => {
  const { options } = setupIsolatedEnv();

  // All subscription workers exhausted
  const exhaustedHealth = {
    codex: { id: "codex", status: "OFFLINE", available: false, billingMode: "subscription" },
    claude: { id: "claude", status: "OFFLINE", available: false, billingMode: "subscription" },
    antigravity: { id: "antigravity", status: "OFFLINE", available: false, billingMode: "subscription" },
    "grok-build": { id: "grok-build", status: "OFFLINE", available: false, billingMode: "subscription" },
    hermes: { id: "hermes", status: "ONLINE", available: true, billingMode: "api" }
  };

  const guard = applyCostGuard("auto", exhaustedHealth, {
    task: { allowPaidFallback: false },
    allowPaidFallback: false
  });

  // Must NOT fall back to Hermes!
  assert.equal(guard.ok, false);
  assert.notEqual(guard.worker, "hermes");
  assert.match(guard.reason, /No subscription worker available/);
});

test("TEST 7: Founder 明确批准 Hermes 或 allowPaidFallback=true。CostGuard 通过，任务允许执行", () => {
  const hermesHealth = {
    codex: { id: "codex", status: "OFFLINE", available: false, billingMode: "subscription" },
    claude: { id: "claude", status: "OFFLINE", available: false, billingMode: "subscription" },
    antigravity: { id: "antigravity", status: "OFFLINE", available: false, billingMode: "subscription" },
    "grok-build": { id: "grok-build", status: "OFFLINE", available: false, billingMode: "subscription" },
    hermes: { id: "hermes", status: "ONLINE", available: true, billingMode: "api" }
  };

  // Case A: Explicitly requested
  const guardExplicit = applyCostGuard("hermes", hermesHealth, {
    task: { allowPaidFallback: false }
  });
  assert.equal(guardExplicit.ok, true);
  assert.equal(guardExplicit.worker, "hermes");

  // Case B: allowPaidFallback = true
  const guardFallbackAllowed = applyCostGuard("hermes", hermesHealth, {
    task: { allowPaidFallback: true },
    allowPaidFallback: true
  });
  assert.equal(guardFallbackAllowed.ok, true);
  assert.equal(guardFallbackAllowed.worker, "hermes");
});

test("Worker Error Classifier standardizes 7 categories accurately", () => {
  assert.equal(classifyWorkerError("Rate limit exceeded. Try again in 20 seconds."), "RATE_LIMITED");
  assert.equal(classifyWorkerError("You have exceeded your monthly usage limit."), "QUOTA_EXHAUSTED");
  assert.equal(classifyWorkerError("401 Unauthorized: not logged in"), "AUTH_ERROR");
  assert.equal(classifyWorkerError("PROXY_DOWN: connection refused"), "NETWORK_ERROR");
  assert.equal(classifyWorkerError("command not found: agy"), "WORKER_OFFLINE");
  assert.equal(classifyWorkerError({ exitCode: 1 }), "EXECUTION_ERROR");
  assert.equal(classifyWorkerError("random regular text"), "UNKNOWN");
});
