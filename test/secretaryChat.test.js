import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import {
  sendMessage,
  listTurns,
  getTurn,
  tuneTurnToRule,
  turnToInbox,
  buildChatPrompt
} from "../src/secretary/chat.js";
import {
  getPersona,
  updatePersona,
  appendPersonaRule
} from "../src/secretary/persona.js";
import { getMessage, listInbox } from "../src/secretary/inbox.js";

function isolate() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "founder-chat-test-"));
  process.env.SECRETARY_BASE_DIR = tmpDir;
  process.env.PERSONA_FILE = path.join(tmpDir, "persona.md");
  return tmpDir;
}

const fakeEngine = (reply) => async (prompt) => {
  assert.ok(typeof prompt === "string" && prompt.length > 0);
  return { ok: true, agent: "grok-bot", message: reply };
};

test("Grok Bot Chat: 1. persona file update + append rule (调教) round-trip", () => {
  isolate();
  updatePersona("# 测试人格\n\n你是秘书。");
  const p1 = getPersona();
  assert.equal(p1.exists, true);
  assert.match(p1.content, /你是秘书/);

  appendPersonaRule("永远先问目标再动手");
  const p2 = getPersona();
  assert.match(p2.content, /## 调教记录/);
  assert.match(p2.content, /永远先问目标再动手/);

  appendPersonaRule("回复控制在三行以内");
  const p3 = getPersona();
  // Both rules kept, newest last.
  assert.ok(p3.content.indexOf("永远先问目标再动手") < p3.content.indexOf("回复控制在三行以内"));

  assert.throws(() => updatePersona("   "), /cannot be empty/);
});

test("Grok Bot Chat: 2. missing persona file falls back to built-in default", () => {
  const tmpDir = isolate();
  const p = getPersona();
  assert.equal(p.exists, false);
  assert.match(p.content, /Grok Bot/);
  assert.ok(fs.existsSync(path.join(tmpDir, "persona.md")) === false);
});

test("Grok Bot Chat: 3. sendMessage stores user + assistant turns with fake engine", async () => {
  isolate();
  const captured = {};
  const engine = async (prompt) => {
    captured.prompt = prompt;
    return { ok: true, agent: "grok-bot", message: "好的，我记下了。你想让我跟进什么？" };
  };
  const { userTurn, assistantTurn } = await sendMessage(
    { text: "以后每周日提醒我复盘一次本周发的内容" },
    {},
    { engine }
  );

  assert.equal(userTurn.role, "user");
  assert.equal(assistantTurn.role, "assistant");
  assert.equal(assistantTurn.kind, "text");
  assert.match(assistantTurn.text, /好的/);

  const turns = listTurns();
  assert.equal(turns.length, 2);
  assert.deepEqual([turns[0].role, turns[1].role], ["user", "assistant"]);

  // Prompt carries persona, iron rules, history scaffolding and the new text.
  assert.match(captured.prompt, /人格设定/);
  assert.match(captured.prompt, /没有任何执行权/);
  assert.match(captured.prompt, /创始人现在说/);
  assert.match(captured.prompt, /每周日提醒我复盘/);
});

test("Grok Bot Chat: 4. engine failure stores an error turn, never throws", async () => {
  isolate();
  const failingEngine = async () => {
    throw new Error("quota exhausted (simulated)");
  };
  const { userTurn, assistantTurn } = await sendMessage(
    { text: "帮我看看这个任务怎么拆" },
    {},
    { engine: failingEngine }
  );
  assert.equal(userTurn.role, "user");
  assert.equal(assistantTurn.kind, "error");
  assert.match(assistantTurn.text, /quota exhausted/);
  assert.equal(listTurns().length, 2);
});

test("Grok Bot Chat: 5. intentGuess flows through for task-like founder text", async () => {
  isolate();
  const { userTurn } = await sendMessage(
    { text: "分析并优化小红书排版模板" },
    {},
    { engine: fakeEngine("📥 建议任务草稿：分析并优化小红书排版模板") }
  );
  assert.equal(userTurn.intentGuess, "task");
});

test("Grok Bot Chat: 6. tune adopts an assistant reply into the persona file", async () => {
  isolate();
  const { assistantTurn } = await sendMessage(
    { text: "以后回复都用简体中文" },
    {},
    { engine: fakeEngine("明白：以后一律用简体中文回复。") }
  );
  const { turn, persona } = tuneTurnToRule(assistantTurn.id);
  assert.ok(turn.tunedAt);
  assert.match(persona.content, /明白：以后一律用简体中文回复/);

  const persisted = getTurn(assistantTurn.id);
  assert.ok(persisted.tunedAt);

  // A founder (user) turn cannot be adopted as a rule.
  const turns = listTurns();
  const userTurn = turns.find((t) => t.role === "user");
  assert.throws(() => tuneTurnToRule(userTurn.id), /Only a text reply/);
});

test("Grok Bot Chat: 7. to-inbox converts a founder message to a draft (never dispatches)", async () => {
  isolate();
  const { userTurn } = await sendMessage(
    { text: "重构首页介绍文案模块" },
    {},
    { engine: fakeEngine("📥 建议任务草稿：重构首页介绍文案模块") }
  );

  const first = turnToInbox(userTurn.id);
  assert.equal(first.duplicate, false);
  assert.ok(first.message.convertedTo);
  assert.equal(first.message.convertedTo.type, "task");
  assert.equal(first.message.source, "grok-bot-chat");
  assert.equal(first.message.intentGuess, "task");

  // Second attempt returns the same inbox message, no duplicate draft.
  const second = turnToInbox(userTurn.id);
  assert.equal(second.duplicate, true);
  assert.equal(second.message.id, first.message.id);
  assert.equal(listInbox().length, 1);
});

test("Grok Bot Chat: 8. buildChatPrompt keeps persona head+tail and caps history at 10 turns", () => {
  isolate();
  updatePersona("X".repeat(9000));
  const turns = [];
  for (let i = 0; i < 12; i += 1) {
    const role = i % 2 === 0 ? "user" : "assistant";
    turns.push({ role, at: new Date(Date.now() + i * 60000).toISOString(), text: `turn-${i}` });
  }
  const prompt = buildChatPrompt({ text: "最新一句", turns });
  assert.match(prompt, /人格设定 ===\nX{4000}/); // persona head kept after the intro wrapper
  assert.match(prompt, /中段省略/); // truncation marker
  const historySection = prompt.split("=== 创始人现在说 ===")[0];
  const historyLines = (historySection.match(/\n(创始人|Grok Bot)\(\d{2}:\d{2}\)/g) || []).length;
  assert.equal(historyLines, 10); // 12 turns -> last 10
  assert.doesNotMatch(historySection, /turn-0/); // oldest dropped
  assert.match(prompt, /最新一句/);
});
