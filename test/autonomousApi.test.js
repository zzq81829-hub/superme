import test from "node:test";
import assert from "node:assert/strict";
import http from "http";
import express from "express";
import { createTask, getTask, updateTask } from "../src/store.js";
import { getRunStatus, pauseRun, resumeRun, cancelRun } from "../src/tasks/runs.js";
import { publishEvent, queryEvents } from "../src/events/bus.js";
import { verifyTaskExecution } from "../src/verify/taskVerifier.js";
import { dispatchTaskUnified } from "../src/workforce/unifiedDispatcher.js";
import { listPolicies, getPolicy, updatePolicy } from "../src/policy/policyManager.js";
import { runReflection } from "../src/learning/reflector.js";
import { saveLesson, listLessons } from "../src/memory/lessons.js";
import { createGoal, listGoals, generatePlan } from "../src/planner/goalPlanner.js";
import { runAutonomousCycle } from "../src/autonomous/loop.js";

test("Autonomous Loop V1 HTTP REST API Endpoints", async (t) => {
  const app = express();
  app.use(express.json());

  // Mount identical route handlers as in server.js
  app.get("/api/runs/:id/status", (req, res) => {
    try {
      const run = getRunStatus(req.params.id);
      if (!run) return res.status(404).json({ error: `Run ${req.params.id} not found` });
      res.json({ ok: true, run });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/runs/:id/pause", (req, res) => {
    try {
      const result = pauseRun(req.params.id);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/runs/:id/resume", (req, res) => {
    try {
      const result = resumeRun(req.params.id, { autoDispatch: false });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/runs/:id/cancel", (req, res) => {
    try {
      const result = cancelRun(req.params.id, req.body?.reason);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/events", (req, res) => {
    try {
      const events = queryEvents(req.query || {});
      res.json({ ok: true, events });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/events", (req, res) => {
    try {
      const event = publishEvent(req.body || {});
      res.status(201).json({ ok: true, event });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/tasks/:id/verify", async (req, res) => {
    try {
      const verification = await verifyTaskExecution(req.params.id, { dryRun: true, ...req.body });
      res.json({ ok: true, verification });
    } catch (err) {
      res.status(err.message.includes("not found") ? 404 : 400).json({ error: err.message });
    }
  });

  app.post("/api/tasks/:id/dispatch", async (req, res) => {
    try {
      const dispatchResult = await dispatchTaskUnified(req.params.id, { autoRun: false, ...req.body });
      res.json(dispatchResult);
    } catch (err) {
      res.status(err.message.includes("not found") ? 404 : 400).json({ error: err.message });
    }
  });

  app.get("/api/policies", (_req, res) => {
    try {
      res.json({ ok: true, policies: listPolicies() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/policies/:name", (req, res) => {
    try {
      const policy = getPolicy(req.params.name);
      if (!policy) return res.status(404).json({ error: `Policy '${req.params.name}' not found` });
      res.json({ ok: true, policy });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/policies/:name", (req, res) => {
    try {
      const updated = updatePolicy(req.params.name, req.body || {});
      res.json({ ok: true, policy: updated });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/reflections/run", async (req, res) => {
    try {
      const reflection = await runReflection(req.body || {});
      res.json({ ok: true, reflection });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/memory/lessons", (req, res) => {
    try {
      const lessons = listLessons(req.query || {});
      res.json({ ok: true, lessons });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/memory/lessons", (req, res) => {
    try {
      const lesson = saveLesson(req.body || {});
      res.status(201).json({ ok: true, lesson });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/goals", (_req, res) => {
    try {
      res.json({ ok: true, goals: listGoals() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/goals", (req, res) => {
    try {
      const goal = createGoal(req.body || {});
      res.status(201).json({ ok: true, goal });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/plans/generate", async (req, res) => {
    try {
      const plan = await generatePlan(req.body || {});
      res.json({ ok: true, plan });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/autonomous/cycle", async (req, res) => {
    try {
      const cycle = await runAutonomousCycle(req.body || {}, { dryRun: true });
      res.json(cycle);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Start ephemeral server
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(() => {
    server.close();
  });

  // 1. Test Run Lifecycle via HTTP
  const task = createTask({
    title: "HTTP 运行生命周期测试",
    status: "queued"
  });

  const getStatusRes = await fetch(`${baseUrl}/api/runs/${task.id}/status`);
  const getStatusData = await getStatusRes.json();
  assert.equal(getStatusRes.status, 200);
  assert.equal(getStatusData.ok, true);
  assert.equal(getStatusData.run.id, task.id);

  const pauseRes = await fetch(`${baseUrl}/api/runs/${task.id}/pause`, { method: "POST" });
  const pauseData = await pauseRes.json();
  assert.equal(pauseRes.status, 200);
  assert.equal(pauseData.run.status, "paused");

  const resumeRes = await fetch(`${baseUrl}/api/runs/${task.id}/resume`, { method: "POST" });
  const resumeData = await resumeRes.json();
  assert.equal(resumeRes.status, 200);
  assert.equal(resumeData.run.status, "queued");

  const cancelRes = await fetch(`${baseUrl}/api/runs/${task.id}/cancel`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason: "HTTP Cancel Test" })
  });
  const cancelData = await cancelRes.json();
  assert.equal(cancelRes.status, 200);
  assert.equal(cancelData.run.status, "cancelled");

  // 2. Test Events via HTTP
  const postEvtRes = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "content_published",
      project_id: "xiaohongshu",
      source: "good_try_publisher",
      metrics: { views: 120 }
    })
  });
  const postEvtData = await postEvtRes.json();
  assert.equal(postEvtRes.status, 201);
  assert.equal(postEvtData.ok, true);
  assert.equal(postEvtData.event.type, "content_published");

  const getEvtsRes = await fetch(`${baseUrl}/api/events?type=content_published`);
  const getEvtsData = await getEvtsRes.json();
  assert.equal(getEvtsRes.status, 200);
  assert.ok(getEvtsData.events.some(e => e.type === "content_published"));

  // 3. Test Verification via HTTP
  const verifyTaskObj = createTask({
    title: "HTTP 验证测试任务",
    status: "completed",
    result: { ok: true, message: "Done" }
  });
  const verifyRes = await fetch(`${baseUrl}/api/tasks/${verifyTaskObj.id}/verify`, { method: "POST" });
  const verifyData = await verifyRes.json();
  assert.equal(verifyRes.status, 200);
  assert.equal(verifyData.ok, true);
  assert.equal(verifyData.verification.passed, true);
  assert.equal(verifyData.verification.next_action, "mark_done");

  // 4. Test Dispatch via HTTP
  const dispatchTaskObj = createTask({
    title: "HTTP 派工前端 UI 组件任务",
    body: "开发小红书卡片布局",
    status: "queued"
  });
  const dispatchRes = await fetch(`${baseUrl}/api/tasks/${dispatchTaskObj.id}/dispatch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent: "auto", reasoning_mode: "auto" })
  });
  const dispatchData = await dispatchRes.json();
  assert.equal(dispatchRes.status, 200);
  assert.equal(dispatchData.ok, true);
  assert.equal(dispatchData.domain, "frontend");
  assert.equal(dispatchData.agent, "antigravity");

  // 5. Test Policies via HTTP
  const getPoliciesRes = await fetch(`${baseUrl}/api/policies`);
  const getPoliciesData = await getPoliciesRes.json();
  assert.equal(getPoliciesRes.status, 200);
  assert.ok(getPoliciesData.policies.length >= 4);

  const patchPolicyRes = await fetch(`${baseUrl}/api/policies/boost_policy`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rules: { boost_threshold: 0.65 } })
  });
  const patchPolicyData = await patchPolicyRes.json();
  assert.equal(patchPolicyRes.status, 200);
  assert.equal(patchPolicyData.policy.rules.boost_threshold, 0.65);

  // 6. Test Goals & Planner via HTTP
  const postGoalRes = await fetch(`${baseUrl}/api/goals`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "小红书变现目标验证",
      timeframe: "1m"
    })
  });
  const postGoalData = await postGoalRes.json();
  assert.equal(postGoalRes.status, 201);
  assert.ok(postGoalData.goal.id.startsWith("goal-"));

  const postPlanRes = await fetch(`${baseUrl}/api/plans/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      goal_id: postGoalData.goal.id,
      objective: "把小红书业务做到稳定变现"
    })
  });
  const postPlanData = await postPlanRes.json();
  assert.equal(postPlanRes.status, 200);
  assert.ok(postPlanData.plan.plan_id.startsWith("plan-"));
  assert.ok(postPlanData.plan.tasks.length >= 2);

  // 7. Test Autonomous Cycle via HTTP
  const cycleRes = await fetch(`${baseUrl}/api/autonomous/cycle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      objective: "小红书双轨内容闭环验证"
    })
  });
  const cycleData = await cycleRes.json();
  assert.equal(cycleRes.status, 200);
  assert.equal(cycleData.ok, true);
  assert.equal(cycleData.autonomous_cycle_completed, true);
  assert.equal(cycleData.verification.passed, true);
  assert.equal(cycleData.next_action.action, "mark_done");
});
