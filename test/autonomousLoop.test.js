import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createTask, getTask, updateTask } from "../src/store.js";
import { getRunStatus, pauseRun, resumeRun, cancelRun } from "../src/tasks/runs.js";
import { publishEvent, queryEvents, getEventStats } from "../src/events/bus.js";
import { verifyTaskExecution } from "../src/verify/taskVerifier.js";
import { dispatchTaskUnified, detectTaskDomain, evaluateReasoningMode } from "../src/workforce/unifiedDispatcher.js";
import { listPolicies, getPolicy, updatePolicy } from "../src/policy/policyManager.js";
import { saveLesson, listLessons, getLesson } from "../src/memory/lessons.js";
import { runReflection } from "../src/learning/reflector.js";
import { createGoal, listGoals, generatePlan } from "../src/planner/goalPlanner.js";
import { runAutonomousCycle } from "../src/autonomous/loop.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("Pillar 1: Run Lifecycle Controls (Status, Pause, Resume, Cancel)", () => {
  // 1. Create a task in queued state
  const task = createTask({
    title: "测试运行生命周期控制",
    body: "验证 pause, resume, cancel 状态机与进程管控",
    status: "queued",
    agent: "antigravity"
  });

  // 2. Status inspection
  const status = getRunStatus(task.id);
  assert.ok(status);
  assert.equal(status.id, task.id);
  assert.equal(status.status, "queued");
  assert.match(status.step, /Queued/);

  // 3. Pause
  const pauseRes = pauseRun(task.id);
  assert.equal(pauseRes.ok, true);
  assert.equal(pauseRes.run.status, "paused");
  assert.equal(getTask(task.id).status, "paused");

  // Cannot pause already paused task
  assert.throws(() => pauseRun(task.id), /Cannot pause run in 'paused' state/);

  // 4. Resume
  const resumeRes = resumeRun(task.id, { autoDispatch: false });
  assert.equal(resumeRes.ok, true);
  assert.equal(resumeRes.run.status, "queued");
  assert.equal(getTask(task.id).status, "queued");

  // 5. Cancel
  const cancelRes = cancelRun(task.id, "用户手动停止并回收算力");
  assert.equal(cancelRes.ok, true);
  assert.equal(cancelRes.run.status, "cancelled");
  assert.equal(getTask(task.id).error, "用户手动停止并回收算力");
});

test("Pillar 2: Universal Event Bus (Publish, Query, Stats)", () => {
  const testTaskId = `t-${Date.now()}`;

  // 1. Publish standard events
  const evt1 = publishEvent({
    type: "task_started",
    project_id: "xiaohongshu",
    task_id: testTaskId,
    source: "antigravity",
    metrics: { duration: 0 }
  });
  assert.ok(evt1.id.startsWith("evt-"));
  assert.equal(evt1.type, "task_started");

  const evt2 = publishEvent({
    type: "task_completed",
    project_id: "xiaohongshu",
    task_id: testTaskId,
    source: "antigravity",
    outcome: "success",
    metrics: { duration: 420, cost: 0.12 }
  });
  assert.equal(evt2.outcome, "success");

  // 2. Query events
  const queried = queryEvents({ task_id: testTaskId });
  assert.equal(queried.length, 2);

  const stats = getEventStats();
  assert.ok(stats.total >= 2);
  assert.ok(stats.byType.task_started >= 1);
  assert.ok(stats.byType.task_completed >= 1);
});

test("Pillar 3: Independent Machine Verification (执行 Agent ≠ 验收 Agent)", async () => {
  // Scenario A: Valid task with existing deliverable passes
  const validTask = createTask({
    title: "实现独立验收测试用例",
    body: "校验验收得分与决策判定",
    status: "completed",
    result: { ok: true, message: "Done successfully", preview: "All tests green" }
  });

  const vA = await verifyTaskExecution(validTask.id);
  assert.equal(vA.passed, true);
  assert.ok(vA.score >= 0.8);
  assert.equal(vA.next_action, "mark_done");

  // Scenario B: Task missing declared deliverables fails with retry_with_boost
  const flawedTask = createTask({
    title: "未完成产物的缺陷任务",
    body: "要求产出不存在的文件",
    deliverables: ["non_existent_file_xyz_123.json"],
    status: "completed",
    result: { ok: true, message: "Claimed complete", preview: "Fake output" }
  });

  const vB = await verifyTaskExecution(flawedTask.id);
  assert.equal(vB.passed, false);
  assert.ok(vB.score < 0.75);
  assert.equal(vB.next_action, "retry_with_boost");
  assert.ok(vB.issues.some(i => i.includes("non_existent_file_xyz_123.json")));
});

test("Pillar 4: Unified Agent Dispatcher & Router (Auto Agent + Auto Boost)", async () => {
  // Test domain detection
  assert.equal(detectTaskDomain({ title: "美化小红书图文卡片 UI 布局" }), "frontend");
  assert.equal(detectTaskDomain({ title: "新增 SQLite 数据库迁移与 API 路由" }), "backend");
  assert.equal(detectTaskDomain({ title: "海外竞品与行业趋势调研报告" }), "research");

  // Test reasoning mode evaluation
  const simpleTask = { title: "微调文案标点符号", body: "修改一个错字" };
  const complexTask = { title: "跨多模块系统重构与状态管理重塑", body: "涉及 3+ 文件重构与 API 变更" };

  const modeSimple = evaluateReasoningMode(simpleTask, { rules: { boost_threshold: 0.68, auto_boost_on_refactor: true } });
  assert.equal(modeSimple.mode, "normal");

  const modeComplex = evaluateReasoningMode(complexTask, { rules: { boost_threshold: 0.68, auto_boost_on_refactor: true } });
  assert.equal(modeComplex.mode, "boost");

  // Test full dispatch call
  const task = createTask({
    title: "【前端】自适应微卡片半透明排版组件",
    body: "实现 CSS 玻璃拟态与呼吸留白间隙",
    agent: "auto"
  });

  const dispatchRes = await dispatchTaskUnified(task.id, {
    autoRun: false,
    dryRun: true
  });

  assert.equal(dispatchRes.ok, true);
  assert.equal(dispatchRes.domain, "frontend");
  assert.equal(dispatchRes.agent, "antigravity");
  assert.equal(dispatchRes.task.status, "queued");
});

test("Pillar 5: Policy Management & Safe Evolution", () => {
  const policies = listPolicies();
  assert.ok(policies.length >= 4);

  const routerPolicy = getPolicy("agent_router");
  assert.ok(routerPolicy);
  assert.ok(routerPolicy.rules.frontend);

  // Update policy parameter (Safe parameter tuning)
  const updated = updatePolicy("boost_policy", {
    rules: { boost_threshold: 0.62 }
  });
  assert.equal(updated.rules.boost_threshold, 0.62);

  // Governance check: Cannot disable safety boundaries
  assert.throws(() => {
    updatePolicy("boost_policy", {
      rules: { disable_safety_boundaries: true }
    });
  }, /Governance Violation/);
});

test("Pillar 6: Reflections & Experience Lessons Memory", async () => {
  const uniqueText = `复杂跨文件 UI 修改直接使用普通推理容易漏改关键样式-${Date.now()}`;
  // 1. Save lesson & accumulate evidence
  const l1 = saveLesson({
    lesson: uniqueText,
    domain: "frontend",
    confidence: 0.75,
    recommended_action: "复杂 UI 自动启用 boost 校验"
  });
  assert.equal(l1.evidence_count, 1);
  assert.equal(l1.domain, "frontend");

  // Save same lesson again -> evidence count increments
  const l2 = saveLesson({
    lesson: uniqueText,
    domain: "frontend",
    confidence: 0.75
  });
  assert.equal(l2.evidence_count, 2);
  assert.ok(l2.confidence >= 0.75);

  const lessons = listLessons({ domain: "frontend" });
  assert.ok(lessons.length >= 1);

  // 2. Run reflection
  const reflection = await runReflection({ timeframeHours: 12 });
  assert.ok(reflection.id.startsWith("ref-"));
  assert.ok(Array.isArray(reflection.observations));
  assert.ok(Array.isArray(reflection.lessons));
});

test("Pillar 7: Strategic Goals & Autonomous Planner", async () => {
  // 1. Create strategic goal
  const goal = createGoal({
    title: "小红书双轨内容变现跑通",
    description: "验证 Gold chance 与 good try 双账号变现模式",
    timeframe: "1m",
    business_model: "digital_knowledge_products"
  });
  assert.ok(goal.id.startsWith("goal-"));
  assert.equal(goal.status, "active");

  const goals = listGoals();
  assert.ok(goals.some(g => g.id === goal.id));

  // 2. Generate Plan
  const plan = await generatePlan({
    goal_id: goal.id,
    objective: "把小红书业务做到稳定变现"
  }, { persistTasks: true });

  assert.ok(plan.plan_id.startsWith("plan-"));
  assert.ok(plan.milestones.length >= 2);
  assert.ok(plan.tasks.length >= 2);

  // Ensure generated tasks exist in task store and are queued
  for (const t of plan.tasks) {
    const fetched = getTask(t.id);
    assert.ok(fetched);
    assert.equal(fetched.status, "queued");
  }
});

test("Pillar 8: Autonomous Closed Loop (Task -> Dispatch -> Run -> Verify -> Reflection -> Replan)", async () => {
  // Execute end-to-end autonomous cycle
  const cycleResult = await runAutonomousCycle({
    objective: "小红书优质推文求真纠偏卡片自主运营验证"
  }, { dryRun: true });

  assert.equal(cycleResult.ok, true);
  assert.equal(cycleResult.autonomous_cycle_completed, true);
  assert.ok(Array.isArray(cycleResult.steps));

  const stepNames = cycleResult.steps.map(s => s.step);
  assert.deepEqual(stepNames, ["PLAN", "DISPATCH", "RUN", "VERIFY", "REFLECTION", "REPLAN"]);

  // Verification passed with high score
  assert.equal(cycleResult.verification.passed, true);
  assert.ok(cycleResult.verification.score >= 0.8);

  // Next action decided autonomously without founder intervention
  assert.equal(cycleResult.next_action.needsFounder, false);
  assert.equal(cycleResult.next_action.action, "mark_done");
});
