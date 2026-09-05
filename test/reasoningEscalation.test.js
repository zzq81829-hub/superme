import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import {
  assessTaskRisk,
  evaluateReasoningMode,
  runBoostVerification,
  createFailureAuditReport
} from "../src/policy/reasoningEscalation.js";
import { createTask, getTask, updateTask } from "../src/store.js";
import { dispatchTask } from "../src/router.js";

test("Rule 1: 普通低风险任务默认使用 normal 模式，不启用 boost", () => {
  const tasks = [
    { title: "文案修改", description: "修改登录页副标题文本文案，修正错别字" },
    { title: "样式微调 UI", description: "调整按钮右间距 4px 和字体颜色" },
    { title: "单文件轻量修改", description: "在 utils.js 中增加一个去除首尾空格的辅助函数" },
    { title: "明确方案重复执行", description: "导出今日系统日志至本地 backup.log" }
  ];

  for (const t of tasks) {
    const risk = assessTaskRisk(t);
    assert.equal(risk.level, "low", `Task "${t.title}" should be low risk`);
    const mode = evaluateReasoningMode(t);
    assert.equal(mode.reasoning_mode, "normal", `Task "${t.title}" should use normal mode`);
    assert.equal(mode.boost_reason, null);
    assert.equal(mode.stop_for_review, false);
  }
});

test("Rule 2: 命中高阶特征自动升级为 Boost 模式", () => {
  // 1. 涉及 3 个及以上文件
  const multiFileTask = {
    title: "重构配置读取链路",
    description: "涉及 a.js, b.js, c.json 3 个文件的同步修改"
  };
  const multiFileEval = evaluateReasoningMode(multiFileTask);
  assert.equal(multiFileEval.reasoning_mode, "boost");
  assert.ok(multiFileEval.boost_reason.includes("3 个及以上文件") || multiFileEval.boost_reason.includes("重构"));

  // 2. 涉及架构、API、数据库、状态管理
  const archTask = {
    title: "新增用户会话 API",
    description: "设计并实现 /api/session 路由，接入 sqlite 数据库存储与全局状态管理"
  };
  const archEval = evaluateReasoningMode(archTask);
  assert.equal(archEval.reasoning_mode, "boost");
  assert.ok(archEval.boost_reason.includes("架构、API、数据库或状态管理"));

  // 3. 涉及删除、迁移、重构
  const refactorTask = {
    title: "重构网络适配器",
    description: "迁移旧版请求方法并清理无用模块"
  };
  const refactorEval = evaluateReasoningMode(refactorTask);
  assert.equal(refactorEval.reasoning_mode, "boost");
  assert.ok(refactorEval.boost_reason.includes("删除、迁移或重构"));

  // 4. 任务描述存在歧义 / 先分析
  const ambiguityTask = {
    title: "技术选型调研",
    description: "先分析当前系统的瓶颈，方案设计存在歧义需进一步调研确定"
  };
  const ambEval = evaluateReasoningMode(ambiguityTask);
  assert.equal(ambEval.reasoning_mode, "boost");
  assert.ok(ambEval.boost_reason.includes("歧义或需先分析"));

  // 5. 涉及多个 Agent 协同
  const multiAgentTask = {
    title: "自动化业务拆解",
    description: "需要 Hermes 与 Codex 协同作业完成",
    delegateToHermes: true
  };
  const maEval = evaluateReasoningMode(multiAgentTask);
  assert.equal(maEval.reasoning_mode, "boost");
  assert.ok(maEval.boost_reason.includes("Agent") || maEval.boost_reason.includes("协同"));

  // 6. 涉及当前 Phase 验收
  const phaseTask = {
    title: "Phase 1 里程碑验收",
    description: "对当前 Phase 的功能进行全面验收"
  };
  const phaseEval = evaluateReasoningMode(phaseTask);
  assert.equal(phaseEval.reasoning_mode, "boost");
  assert.ok(phaseEval.boost_reason.includes("Phase 的验收"));

  // 7. 潜在回归风险
  const regTask = {
    title: "核心拦截器调整",
    description: "可能产生 breaking change，注意影响已有功能的回归风险"
  };
  const regEval = evaluateReasoningMode(regTask);
  assert.equal(regEval.reasoning_mode, "boost");
  assert.ok(regEval.boost_reason.includes("回归风险"));
});

test("Rule 3: 连续失败升级机制 (第 1 次普通重试，第 2 次升级 Boost，第 3 次熔断报告)", () => {
  const task = {
    title: "普通功能微调",
    description: "单文件简单逻辑调整",
    risk_level: "low"
  };

  // 第 1 次失败: retry_count = 1
  const retry1 = evaluateReasoningMode(task, { retry_count: 1 });
  assert.equal(retry1.reasoning_mode, "normal");
  assert.equal(retry1.stop_for_review, false);

  // 第 2 次失败: retry_count = 2 自动升级 Boost
  const retry2 = evaluateReasoningMode(task, { retry_count: 2 });
  assert.equal(retry2.reasoning_mode, "boost");
  assert.ok(retry2.boost_reason.includes("连续第 2 次失败"));
  assert.equal(retry2.stop_for_review, false);

  // 第 3 次失败: retry_count = 3 熔断保护，停止自动修改
  const retry3 = evaluateReasoningMode(task, { retry_count: 3 });
  assert.equal(retry3.reasoning_mode, "boost");
  assert.equal(retry3.stop_for_review, true);
  assert.ok(retry3.boost_reason.includes("熔断保护"));

  // 校验失败审计报告格式
  const report = createFailureAuditReport(
    { id: "test-task-1", title: "微调测试" },
    { error: "AssertionError: expected 1 to equal 2" },
    { reason: "acceptance check failed" }
  );
  assert.equal(report.taskId, "test-task-1");
  assert.ok(report.reason.includes("熔断保护"));
  assert.ok(report.audit_recommendations.length >= 3);
});

test("Rule 4: Boost 6 维验收质检 (需求、范围越界、功能完好、测试充分、Phase边界、隐藏回归)", async () => {
  const task = {
    id: "task-boost-verify",
    title: "重构数据库状态模块",
    description: "重构 store.js 并保证所有测试通过",
    risk_level: "medium"
  };

  const goodResult = {
    ok: true,
    message: "成功完成状态模块重构并通过全部测试",
    deliverables: ["src/store.js"]
  };
  const standardVerification = {
    ok: true,
    reason: "checks passed",
    checks: [{ name: "file-exists:src/store.js", ok: true }]
  };

  const boostAudit = await runBoostVerification({
    projectPath: process.cwd(),
    result: goodResult,
    config: {},
    task,
    standardVerification
  });

  assert.equal(boostAudit.ok, true);
  assert.equal(boostAudit.boost_verified, true);
  assert.equal(boostAudit.boost_checks.length, 6);
  assert.ok(boostAudit.boost_checks.every((c) => c.ok === true));

  // 验证越界敏感文件排查
  const badScopeResult = {
    ok: true,
    message: "完成修改",
    deliverables: ["src/store.js", "config/auth.json"]
  };
  const scopeAudit = await runBoostVerification({
    projectPath: process.cwd(),
    result: badScopeResult,
    config: {},
    task,
    standardVerification
  });
  assert.equal(scopeAudit.ok, false);
  const scopeCheck = scopeAudit.boost_checks.find((c) => c.name === "scope_boundary");
  assert.equal(scopeCheck.ok, false);
  assert.ok(scopeCheck.detail.includes("敏感路径"));
});

test("Rule 5 & 7: 字段持久化与中风险免审批自动派工", () => {
  const mediumTask = createTask({
    title: "优化 API 路由与状态逻辑",
    description: "涉及 API 架构优化与状态迁移",
    agent: "antigravity"
  });

  // 验证 Rule 5: 字段落盘
  assert.equal(mediumTask.risk_level, "medium");
  assert.equal(mediumTask.reasoning_mode, "boost");
  assert.ok(mediumTask.boost_reason);
  assert.equal(mediumTask.retry_count, 0);
  assert.equal(mediumTask.verification_result, null);

  // 验证 Rule 7: 中风险不需要 Founder 审批介入，保持 not_required
  assert.equal(mediumTask.approvalStatus, "not_required");
  assert.notEqual(mediumTask.status, "awaiting_approval");

  // 更新任务测试
  const updated = updateTask(mediumTask.id, {
    retry_count: 1,
    verification_result: { ok: true, boost_verified: true }
  });
  assert.equal(updated.retry_count, 1);
  assert.equal(updated.verification_result.boost_verified, true);
});
