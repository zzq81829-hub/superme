import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import { parseDispatchPlan, dispatchSubtasks, decomposeAndDispatchRequirement } from "../src/workforce/hermesDispatcher.js";
import { createTask, getTask, listSubtasks } from "../src/store.js";
import { chooseAgent } from "../src/router.js";

function isolate() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-dispatcher-test-"));
  process.env.TASKS_BASE_DIR = path.join(tmpDir, "tasks");
  return tmpDir;
}

test("Hermes Dispatcher: 1. parseDispatchPlan parses json:dispatch_plan fence", () => {
  const text = `
Here is my decomposition:
\`\`\`json:dispatch_plan
[
  {
    "title": "搭建数据库模型",
    "description": "设计 SQLite schema 并编写迁移脚本",
    "agent": "codex",
    "acceptanceCriteria": ["运行: npm test"]
  },
  {
    "title": "排版小红书封面卡片",
    "description": "按照 card-layout-standard 渲染 1080x1440 卡片",
    "agent": "antigravity",
    "acceptanceCriteria": ["存在: output/cover.png"]
  }
]
\`\`\`
CAN_USE: Hermes COO plan
`;
  const subtasks = parseDispatchPlan(text);
  assert.equal(subtasks.length, 2);
  assert.equal(subtasks[0].agent, "codex");
  assert.equal(subtasks[0].title, "搭建数据库模型");
  assert.equal(subtasks[1].agent, "antigravity");
});

test("Hermes Dispatcher: 2. parseDispatchPlan handles DISPATCH_PLAN: tag format", () => {
  const text = `
DISPATCH_PLAN: [
  {
    "title": "海外竞品调研",
    "description": "使用 agent-reach 调研海外最新趋势",
    "agent": "grok"
  }
]
`;
  const subtasks = parseDispatchPlan(text);
  assert.equal(subtasks.length, 1);
  assert.equal(subtasks[0].agent, "grok");
  assert.equal(subtasks[0].title, "海外竞品调研");
});

test("Hermes Dispatcher: 3. dispatchSubtasks links child tasks to parentTaskId and updates parent", () => {
  isolate();
  const parent = createTask({
    title: "总需求：构建小红书内容闭环",
    description: "端到端完成从选题、排版到审批的闭环",
    agent: "hermes"
  });

  const subtaskDefs = [
    { title: "子任务1：数据结构设计", description: "定义 schema", agent: "codex" },
    { title: "子任务2：卡片排版渲染", description: "绘制卡片", agent: "antigravity" }
  ];

  const created = dispatchSubtasks(parent.id, subtaskDefs, { autoRun: false });
  assert.equal(created.length, 2);
  assert.equal(created[0].parentTaskId, parent.id);
  assert.equal(created[1].parentTaskId, parent.id);

  const subtasksInStore = listSubtasks(parent.id);
  assert.equal(subtasksInStore.length, 2);

  const updatedParent = getTask(parent.id);
  assert.ok(Array.isArray(updatedParent.subtaskIds));
  assert.equal(updatedParent.subtaskIds.length, 2);
  assert.ok(updatedParent.deliverables?.subtasks?.length === 2);
});

test("Hermes Dispatcher: 4. decomposeAndDispatchRequirement runs end-to-end in dryRun", async () => {
  isolate();
  const res = await decomposeAndDispatchRequirement("将阿德勒心理学整理成小红书图文并排版卡片", {
    dryRun: true,
    autoRun: false
  });

  assert.ok(res.parentTask);
  assert.equal(res.parentTask.status, "completed");
  assert.ok(res.subtasks.length >= 2);
  assert.equal(res.subtasks[0].parentTaskId, res.parentTask.id);
});

test("Hermes Dispatcher: 5. chooseAgent routes requirement decomposition keywords to Hermes", () => {
  assert.equal(chooseAgent({ title: "帮我统筹并拆解这个需求", description: "分发任务到专业worker" }), "hermes");
  assert.equal(chooseAgent({ title: "需求分解与派发", description: "规划执行步骤" }), "hermes");
  assert.equal(chooseAgent({ title: "普通小任务", description: "日常修复", delegateToHermes: true }), "hermes");
});
