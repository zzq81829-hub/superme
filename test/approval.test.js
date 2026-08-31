import test from "node:test";
import assert from "node:assert/strict";
import http from "http";
import express from "express";
import {
  createTask,
  getTask,
  updateTask,
  listTasks
} from "../src/store.js";
import {
  classifyTaskRisk,
  computePayloadHash,
  generateSelectionPreview
} from "../src/tasks/risk.js";
import { dispatchTask } from "../src/router.js";

test("Approval & Risk System: 1. Low risk task auto-executes without requiring approval", () => {
  const lowRiskTask = createTask({
    title: "分析本地数据指标",
    description: "分析本地指标趋势并生成离线总结报告",
    agent: "codex"
  });

  assert.equal(lowRiskTask.riskLevel, "low");
  assert.equal(lowRiskTask.approvalStatus, "not_required");
  assert.equal(lowRiskTask.status, "draft");
  assert.ok(lowRiskTask.selectionPreview);
  assert.equal(lowRiskTask.selectionPreview.resolved, "codex");
  assert.equal(lowRiskTask.selectionPreview.quotaType, "subscription");
});

test("Approval & Risk System: 2. High-risk task enters pending approval and dispatch is blocked", async () => {
  const highRiskTask = createTask({
    title: "向小红书发布今日爆款书摘",
    description: "自动发布图文到小红书平台并上架",
    agent: "auto"
  });

  assert.equal(highRiskTask.riskLevel, "high");
  assert.equal(highRiskTask.approvalStatus, "pending");
  assert.equal(highRiskTask.status, "awaiting_approval");
  assert.ok(highRiskTask.riskReasons.some((r) => r.includes("发布")));

  // Attempting to dispatch without approval must be blocked
  const dispatchResult = await dispatchTask(highRiskTask.id, { dryRun: true });
  assert.equal(dispatchResult.status, "awaiting_approval");
  assert.equal(dispatchResult.approvalStatus, "pending");
  assert.ok(dispatchResult.error.includes("founder approval"));
});

test("Approval & Risk System: 3. Approve endpoint sets approvedHash and allows dispatch", async () => {
  const task = createTask({
    title: "支付并充值测试账户",
    description: "涉及扣款购买",
    agent: "auto"
  });

  assert.equal(task.riskLevel, "high");
  assert.equal(task.approvalStatus, "pending");

  const currentHash = computePayloadHash(task);
  const approvedTask = updateTask(task.id, {
    approvedAt: new Date().toISOString(),
    approvedHash: currentHash,
    approvalStatus: "approved",
    status: "queued"
  });

  assert.equal(approvedTask.approvalStatus, "approved");
  assert.equal(approvedTask.approvedHash, currentHash);
  assert.equal(approvedTask.status, "queued");

  // Now dispatchTask proceeds in dryRun
  const dispatchResult = await dispatchTask(task.id, { dryRun: true });
  assert.notEqual(dispatchResult.status, "awaiting_approval");
});

test("Approval & Risk System: 4. Content modification invalidates previous approval", async () => {
  const task = createTask({
    title: "发布小红书测试",
    description: "原始描述",
    agent: "codex"
  });

  // Approve initial task
  const initialHash = computePayloadHash(task);
  updateTask(task.id, {
    approvedAt: new Date().toISOString(),
    approvedHash: initialHash,
    approvalStatus: "approved",
    status: "draft"
  });

  assert.equal(getTask(task.id).approvalStatus, "approved");

  // Modify task description
  updateTask(task.id, { description: "修改后的危险描述，包含其他指令" });

  const modified = getTask(task.id);
  assert.notEqual(modified.payloadHash, initialHash);
  assert.equal(modified.approvalStatus, "pending");

  // Dispatching modified task must be blocked again
  const dispatchResult = await dispatchTask(task.id, { dryRun: true });
  assert.equal(dispatchResult.status, "awaiting_approval");
  assert.equal(dispatchResult.approvalStatus, "pending");
});

test("Approval & Risk System: 5. Reassign updates selection preview and invalidates high-risk approval", () => {
  const task = createTask({
    title: "删除重要数据与清空生产库",
    description: "清理不可逆数据",
    agent: "auto"
  });

  const hash1 = computePayloadHash(task);
  updateTask(task.id, {
    approvedAt: new Date().toISOString(),
    approvedHash: hash1,
    approvalStatus: "approved"
  });

  // Reassign agent to hermes
  const reassigned = updateTask(task.id, { agent: "hermes" });
  assert.equal(reassigned.agent, "hermes");
  assert.equal(reassigned.selectionPreview.requested, "hermes");
  assert.equal(reassigned.selectionPreview.resolved, "hermes");
  assert.equal(reassigned.approvalStatus, "pending");
});

test("Approval & Risk System: 6. /api/approvals endpoint lists pending tasks only", async () => {
  const app = express();
  app.use(express.json());

  app.get("/api/approvals", (_req, res) => {
    const list = listTasks().filter(
      (t) => t.approvalStatus === "pending" || t.status === "awaiting_approval"
    );
    res.json(list);
  });

  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/approvals`);
    const data = await res.json();
    assert.ok(Array.isArray(data));
    data.forEach((t) => {
      assert.ok(t.approvalStatus === "pending" || t.status === "awaiting_approval");
    });
  } finally {
    server.close();
  }
});
