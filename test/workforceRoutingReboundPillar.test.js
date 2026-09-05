import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
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
import { chooseAgent, dispatchTask } from "../src/router.js";
import { createTask, getTask, updateTask } from "../src/store.js";
import { recordWorkerFailure, recordWorkerSuccess } from "../src/workforce/statusMachine.js";

function setupIsolatedTestEnv(prefix = "wf-pillar-") {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
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
    quotaDir,
    workforceDir,
    options: { baseDir: workforceDir, tasksDir, quotaDir },
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

// ---------------------------------------------------------------------------
// Suite 1: Cost-First Workforce Fallback Sequencing
// ---------------------------------------------------------------------------
test("Suite 1.1: FALLBACK_CHAIN strictly prioritizes cost-effective workers first", () => {
  // Requirement 1: ["antigravity", "claude", "grok-build", "codex"]
  assert.deepEqual(FALLBACK_CHAIN, ["antigravity", "claude", "grok-build", "codex"]);
  assert.equal(FALLBACK_CHAIN[0], "antigravity", "Antigravity must be the primary included worker");
  assert.equal(FALLBACK_CHAIN[1], "claude", "Claude must precede Grok Build and Codex");
  assert.equal(FALLBACK_CHAIN[2], "grok-build", "Grok Build must precede Codex");
  assert.equal(FALLBACK_CHAIN[3], "codex", "Codex is reserved at the end of the chain");
});

test("Suite 1.2: applyCostGuard('auto') traverses the cost-first hierarchy step-by-step", () => {
  // Case A: All online -> antigravity chosen
  const allOnline = {
    antigravity: online("antigravity"),
    claude: online("claude"),
    "grok-build": online("grok-build"),
    codex: online("codex"),
    "grok-bot": { available: false, status: "UNAVAILABLE" }
  };
  const r1 = applyCostGuard("auto", allOnline);
  assert.equal(r1.ok, true);
  assert.equal(r1.worker, "antigravity", "Antigravity must be chosen first under auto");

  // Case B: Antigravity down -> falls back to claude
  const antigravityDown = {
    ...allOnline,
    antigravity: offline("antigravity")
  };
  const r2 = applyCostGuard("auto", antigravityDown);
  assert.equal(r2.ok, true);
  assert.equal(r2.worker, "claude", "Auto fallback must choose claude after antigravity");

  // Case C: Antigravity and Claude down -> falls back to grok-build
  const claudeDown = {
    ...antigravityDown,
    claude: offline("claude")
  };
  const r3 = applyCostGuard("auto", claudeDown);
  assert.equal(r3.ok, true);
  assert.equal(r3.worker, "grok-build", "Auto fallback must choose grok-build after claude");

  // Case D: Antigravity, Claude, and Grok Build down -> falls back to codex (for non-LOW tasks)
  const grokDown = {
    ...claudeDown,
    "grok-build": offline("grok-build")
  };
  const r4 = applyCostGuard("auto", grokDown);
  assert.equal(r4.ok, true);
  assert.equal(r4.worker, "codex", "Codex is the final subscription fallback for high/medium tasks");

  // Case E: All down -> HUMAN_ACTION_REQUIRED
  const allDown = {
    ...grokDown,
    codex: offline("codex")
  };
  const r5 = applyCostGuard("auto", allDown);
  assert.equal(r5.ok, false);
  assert.equal(r5.action, "HUMAN_ACTION_REQUIRED");
});

test("Suite 1.3: grok-bot unavailable falls back directly to cost-first antigravity", () => {
  const health = {
    "grok-bot": { id: "grok-bot", status: "UNKNOWN_CONTROL_INTERFACE", available: false, billingMode: "subscription_or_quota" },
    antigravity: online("antigravity"),
    claude: online("claude"),
    "grok-build": online("grok-build"),
    codex: online("codex")
  };
  const r = applyCostGuard("grok-bot", health);
  assert.equal(r.ok, true);
  assert.equal(r.worker, "antigravity", "grok-bot fallback must pick antigravity, not codex");
});

// ---------------------------------------------------------------------------
// Suite 2: Senior Reasoning Model Protection for LOW-Tier Tasks
// ---------------------------------------------------------------------------
test("Suite 2.1: LOW-tier tasks strictly skip Codex and senior models on fallback", () => {
  const health = {
    antigravity: offline("antigravity"),
    claude: online("claude"),
    "grok-build": online("grok-build"),
    codex: online("codex")
  };

  const lowTask = {
    title: "修改按钮 hover 颜色",
    modelNeed: { tier: "LOW", modelNeedScore: 20 }
  };

  // Requested auto with a LOW tier task
  const rAuto = applyCostGuard("auto", health, { task: lowTask });
  assert.equal(rAuto.ok, false, "LOW tier task must not fall back to senior workers");
  assert.equal(rAuto.action, "HUMAN_ACTION_REQUIRED");
  assert.ok(
    rAuto.attempts.some(
      (a) => a.id === "codex" && a.skip.includes("SENIOR_MODEL_RESERVED")
    ),
    "Codex must be skipped with SENIOR_MODEL_RESERVED"
  );
  assert.ok(
    rAuto.attempts.some(
      (a) => a.id === "claude" && a.skip.includes("SENIOR_MODEL_RESERVED")
    ),
    "Claude must be skipped with SENIOR_MODEL_RESERVED"
  );
  assert.ok(
    rAuto.attempts.some(
      (a) => a.id === "grok-build" && a.skip.includes("SENIOR_MODEL_RESERVED")
    ),
    "Grok Build must be skipped with SENIOR_MODEL_RESERVED"
  );
});

test("Suite 2.2: LOW-tier task dispatch transitions to waiting_for_capacity instead of running on Codex", async () => {
  const env = setupIsolatedTestEnv("wf-low-guard-");

  // Make antigravity in cooldown
  updateWorker("antigravity", { status: "COOLDOWN", failureReason: "rate limited" }, env.options);

  const task = createTask({
    title: "修改按钮 hover 效果",
    description: "调整按钮的 hover 颜色为暗金微光",
    status: "queued"
  });

  const config = { dryRun: true };
  const dispatched = await dispatchTask(task.id, config);

  // The task MUST NOT be executed by Codex; it must wait for capacity
  assert.notEqual(dispatched.agentResolved, "codex", "LOW task must never execute on Codex");
  assert.ok(
    dispatched.status === "waiting_for_capacity" || dispatched.status === "blocked",
    `Status should be waiting_for_capacity or blocked, got: ${dispatched.status}`
  );

  env.cleanup();
});

test("Suite 2.3: HIGH-tier tasks correctly route to Codex when available", () => {
  const highTask = {
    title: "重构 Task Scheduler 核心架构",
    description: "重构底层跨模块状态机与并发队列",
    acceptanceCriteria: ["并发安全"]
  };
  const need = evaluateModelNeed(highTask);
  assert.equal(need.tier, "HIGH");
  assert.equal(need.preferredWorker, "codex");
  assert.equal(need.requiresSeniorWorker, true);

  const agent = chooseAgent(highTask);
  assert.equal(agent, "codex");
});

// ---------------------------------------------------------------------------
// Suite 3: ModelNeed Keyword Over-Triggering Tuning
// ---------------------------------------------------------------------------
test("Suite 3.1: Simple UI tasks mentioning '重构按钮' or 'hover' do NOT escalate to HIGH", () => {
  const uiTasks = [
    { title: "重构按钮样式", description: "更新按钮的高光与阴影" },
    { title: "重构按钮", description: "修改按钮颜色" },
    { title: "修改按钮 hover 效果", description: "添加 hover 动效" },
    { title: "重构前端UI组件边框样式", description: "调整表格与按钮的 padding 与 margin" },
    { title: "重构按钮组件动效", description: "添加平滑过渡动画" }
  ];

  for (const t of uiTasks) {
    const need = evaluateModelNeed(t);
    assert.equal(
      need.tier,
      "LOW",
      `Task "${t.title}" should be LOW tier, got: ${need.tier} (score: ${need.modelNeedScore})`
    );
    assert.equal(
      need.preferredWorker,
      "antigravity",
      `Task "${t.title}" should prefer antigravity, got: ${need.preferredWorker}`
    );
    assert.equal(
      need.requiresSeniorWorker,
      false,
      `Task "${t.title}" must not require senior worker`
    );
  }
});

test("Suite 3.2: Architecture and scheduler tasks WITH refactor keywords STILL escalate to HIGH", () => {
  const archTasks = [
    {
      title: "重构 Task Scheduler 核心架构",
      description: "重构底层跨模块状态机与并发队列，修复并发竞争条件"
    },
    {
      title: "重构跨模块调度器内核",
      description: "重写核心系统调度逻辑与并发控制"
    },
    {
      title: "重构底层协议解析器",
      description: "优化状态机协议解析与算法"
    }
  ];

  for (const t of archTasks) {
    const need = evaluateModelNeed(t);
    assert.equal(
      need.tier,
      "HIGH",
      `Task "${t.title}" should be HIGH tier, got: ${need.tier} (score: ${need.modelNeedScore})`
    );
    assert.equal(
      need.preferredWorker,
      "codex",
      `Task "${t.title}" should prefer codex, got: ${need.preferredWorker}`
    );
    assert.equal(
      need.requiresSeniorWorker,
      true,
      `Task "${t.title}" must require senior worker`
    );
  }
});

test("Suite 3.3: Pure architecture inspection tasks remain with Antigravity", () => {
  const inspectTask = {
    title: "检查代码架构",
    description: "inspect the design"
  };
  const need = evaluateModelNeed(inspectTask);
  assert.equal(need.tier, "LOW");
  assert.equal(need.preferredWorker, "antigravity");
  assert.equal(chooseAgent({ agent: "auto", ...inspectTask }), "antigravity");
});

// ---------------------------------------------------------------------------
// Suite 4: Active Rebound Re-Dispatch
// ---------------------------------------------------------------------------
test("Suite 4.1: wakeWaitingTasks actively triggers dispatchTask on awakened tasks", async () => {
  const env = setupIsolatedTestEnv("wf-rebound-active-");

  // Create 2 waiting tasks for codex
  const task1 = createTask({
    title: "重构 Task Scheduler 核心架构 1",
    description: "重构底层跨模块状态机",
    status: "waiting_for_capacity",
    targetSeniorWorker: "codex",
    prework: { completed: true }
  });

  const task2 = createTask({
    title: "重构 Task Scheduler 核心架构 2",
    description: "重构底层跨模块状态机",
    status: "waiting_for_capacity",
    targetSeniorWorker: "codex",
    prework: { completed: true }
  });

  // Track dispatched task IDs
  const dispatchedIds = [];
  const mockDispatch = async (taskId, cfg) => {
    dispatchedIds.push(taskId);
    return updateTask(taskId, { status: "running", config: cfg });
  };

  // Wake waiting tasks for codex
  const count = wakeWaitingTasks("codex", {
    ...env.options,
    dispatchTask: mockDispatch,
    config: { dryRun: true }
  });

  assert.equal(count, 2, "Should wake exactly 2 tasks");

  // Wait for active dispatch promises
  if (wakeWaitingTasks.lastDispatches) {
    await Promise.all(wakeWaitingTasks.lastDispatches);
  }

  // Verify mock dispatch was called on both tasks
  assert.equal(dispatchedIds.length, 2);
  assert.ok(dispatchedIds.includes(task1.id));
  assert.ok(dispatchedIds.includes(task2.id));

  // Verify task status was updated from waiting_for_capacity to running
  const updated1 = getTask(task1.id);
  const updated2 = getTask(task2.id);
  assert.equal(updated1.status, "running");
  assert.equal(updated2.status, "running");

  env.cleanup();
});

test("Suite 4.2: checkAndReboundWorker triggers active re-dispatch end-to-end with dryRun execution", async () => {
  const env = setupIsolatedTestEnv("wf-rebound-e2e-");

  // Put codex in cooldown
  updateWorker("codex", { status: "COOLDOWN" }, env.options);

  // Setup a waiting task
  const task = createTask({
    title: "重构 Task Scheduler 核心架构",
    description: "重构底层跨模块状态机",
    status: "waiting_for_capacity",
    targetSeniorWorker: "codex",
    prework: { completed: true, summary: "Prework done" }
  });

  // Rebound codex with a healthy probe and dryRun config
  const reboundResult = checkAndReboundWorker("codex", {
    forceProbe: true,
    probeImpl: () => true,
    options: {
      ...env.options,
      config: {
        dryRun: true,
        agents: {
          codex: { enabled: true, command: "codex" },
          antigravity: { enabled: true, command: "antigravity" }
        }
      }
    }
  });

  assert.equal(reboundResult.rebounded, true);
  assert.equal(reboundResult.status, "AVAILABLE");
  assert.equal(reboundResult.awakenedTasks, 1);

  // Worker is restored to AVAILABLE
  const worker = getWorker("codex", env.options);
  assert.equal(worker.status, "AVAILABLE");

  // Await the active dispatches triggered by rebound
  if (reboundResult.dispatches && reboundResult.dispatches.length > 0) {
    await Promise.all(reboundResult.dispatches);
  }

  // Task was actively re-dispatched and finished dryRun execution!
  const finalTask = getTask(task.id);
  assert.equal(
    finalTask.status,
    "completed",
    `Task should have actively executed to completed, got: ${finalTask.status}`
  );
  assert.equal(finalTask.agentResolved, "codex");

  env.cleanup();
});

test("Suite 4.3: wakeWaitingTasks ignores tasks waiting for other workers", () => {
  const env = setupIsolatedTestEnv("wf-rebound-filter-");

  const grokTask = createTask({
    title: "调研国外 AI 生态",
    description: "深度战略分析",
    status: "waiting_for_capacity",
    targetSeniorWorker: "grok-build"
  });

  const count = wakeWaitingTasks("codex", {
    ...env.options,
    autoDispatch: false
  });

  assert.equal(count, 0, "Should not wake tasks waiting for grok-build when codex rebounds");

  const checkTask = getTask(grokTask.id);
  assert.equal(checkTask.status, "waiting_for_capacity");

  env.cleanup();
});
