import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import { sendMessage } from "../src/secretary/chat.js";
import { getTask } from "../src/store.js";
import { buildPrompt, chooseAgent } from "../src/router.js";

function isolate() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "founder-hermes-bridge-"));
  process.env.SECRETARY_BASE_DIR = path.join(tmpDir, "secretary");
  process.env.TASKS_BASE_DIR = path.join(tmpDir, "tasks");
  process.env.PERSONA_FILE = path.join(tmpDir, "persona.md");
  process.env.BILLING_BASE_DIR = path.join(tmpDir, "billing");
  return tmpDir;
}

test("Grok Bot -> Hermes Bridge: 1. Low-risk task intent auto-creates task and routes to Hermes", async () => {
  isolate();
  let capturedPrompt = "";
  const engine = async (prompt) => {
    capturedPrompt = prompt;
    return { ok: true, agent: "grok-bot", message: "收到！已将需求转交 Hermes 调度。" };
  };

  const { userTurn, assistantTurn, task } = await sendMessage(
    { text: "分析并排版小红书画报封面", autoDispatch: true },
    { dryRun: true },
    { engine }
  );

  assert.ok(task, "Task should have been auto-created");
  assert.equal(userTurn.taskId, task.id);
  assert.equal(assistantTurn.taskId, task.id);
  assert.equal(task.delegateToHermes, true);
  assert.equal(chooseAgent(task), "hermes");
  assert.equal(task.riskLevel, "low");
  assert.notEqual(task.status, "draft");
  assert.notEqual(task.status, "awaiting_approval");

  const stored = getTask(task.id);
  assert.equal(stored.id, task.id);
  assert.equal(stored.agentResolved, "hermes");

  // Prompt to Grok Bot reflects Hermes dispatching
  assert.match(capturedPrompt, /Hermes \(COO\)/);
  assert.match(capturedPrompt, /OS CEO 派工成功/);
});

test("Grok Bot -> Hermes Bridge: 2. High-risk task intent is safely intercepted by OS CEO at awaiting_approval", async () => {
  isolate();
  let capturedPrompt = "";
  const engine = async (prompt) => {
    capturedPrompt = prompt;
    return { ok: true, agent: "grok-bot", message: "已拦截高风险发布任务，请审批。" };
  };

  const { userTurn, assistantTurn, task } = await sendMessage(
    { text: "直接把这篇图文发布到小红书", autoDispatch: true },
    { dryRun: true },
    { engine }
  );

  assert.ok(task, "Task should have been created");
  assert.equal(userTurn.taskId, task.id);
  assert.equal(task.riskLevel, "high");
  assert.equal(task.status, "awaiting_approval");
  assert.equal(task.approvalStatus, "pending");

  const stored = getTask(task.id);
  assert.equal(stored.status, "awaiting_approval");
  assert.equal(stored.approvalStatus, "pending");

  // Prompt informs Grok Bot about OS CEO interception
  assert.match(capturedPrompt, /OS CEO 判定与风控拦截/);
  assert.match(capturedPrompt, /拦截在【待审批队列】/);
});

test("Grok Bot -> Hermes Bridge: 3. Hermes COO orchestration directive is injected into buildPrompt", () => {
  const task = {
    id: "test-coo-prompt",
    title: "小红书画报排版",
    description: "多步骤内容拆解与图文生成",
    agent: "auto",
    agentResolved: "hermes",
    delegateToHermes: true
  };

  const prompt = buildPrompt(task, process.cwd());
  assert.match(prompt, /HERMES COO ORCHESTRATION DIRECTIVE/);
  assert.match(prompt, /Local Control Center \(:3210\) is the AI CEO/);
  assert.match(prompt, /decompose complex goals, plan the execution steps, orchestrate the workflow/);
});

test("Grok Bot -> Hermes Bridge: 4. Casual conversation does NOT create tasks", async () => {
  isolate();
  const engine = async () => ({ ok: true, agent: "grok-bot", message: "今天天气确实很好，你感觉怎么样？" });

  const { userTurn, assistantTurn, task } = await sendMessage(
    { text: "今天天气真好，你今天感觉怎么样？", autoDispatch: true },
    { dryRun: true },
    { engine }
  );

  assert.equal(task, null);
  assert.equal(userTurn.taskId, null);
  assert.equal(assistantTurn.taskId, null);
});
