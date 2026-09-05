import fs from "fs";
import path from "path";
import crypto from "crypto";
import { runProcess } from "../adapters/processRunner.js";
import { resolveAgentCommand } from "../adapters/resolveCommand.js";
import { subscriptionEnv } from "../billing/policy.js";
import { getSecretaryDir, receiveMessage, getMessage, guessIntent } from "./inbox.js";
import { getPersona, appendPersonaRule } from "./persona.js";
import { getSecretaryOsSnapshot, buildOsSnapshotText } from "./osSnapshot.js";
import { createSecretaryWork } from "./work.js";

// Grok Bot secretary chat line. Each founder message is answered by a fresh
// `grok -p` (subscription CLI, no xAI API) call whose prompt carries the
// current persona file + recent turns. The bot NEVER dispatches or executes:
// its only action outlets are "to-inbox" (task/memory drafts the founder must
// accept) and "tune" (append a reply to the persona as a founder rule).

const CHAT_SUBDIR = "chat";
const MAX_HISTORY_TURNS = 10;
const MAX_TURN_CHARS = 400;
const MAX_PROMPT_CHARS = 4000;
const DEFAULT_TIMEOUT_MS = 180000;

function chatDir(options = {}) {
  const dir = path.join(getSecretaryDir(options), CHAT_SUBDIR);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function now() {
  return new Date().toISOString();
}

function newTurnId() {
  return `turn-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
}

export function listTurns(options = {}) {
  const dir = chatDir(options);
  const turns = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    try {
      const turn = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
      if (turn && turn.id) turns.push(turn);
    } catch {
      // Skip a corrupt turn file rather than failing the whole thread.
    }
  }
  return turns.sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));
}

function saveTurn(turn, options = {}) {
  const file = path.join(chatDir(options), `${turn.id}.json`);
  fs.writeFileSync(file, JSON.stringify(turn, null, 2), "utf8");
  return turn;
}

export function getTurn(id, options = {}) {
  const dir = chatDir(options);
  const file = path.join(dir, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function compactLine(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TURN_CHARS);
}

function personaForPrompt(options = {}) {
  const { content } = getPersona(options);
  const clean = String(content || "").replace(/\r\n/g, "\n").trim();
  if (clean.length <= 6000) return clean;
  // Keep identity/iron-rules (head) and the newest 调教记录 rules (tail).
  return `${clean.slice(0, 4000)}\n…(中段省略，完整人格见 founder_os/GROK_BOT_PERSONA.md)…\n${clean.slice(-2000)}`;
}

function compactOsSnapshot(config = {}, options = {}) {
  try {
    const snapshot = getSecretaryOsSnapshot(config, { skipWorkerProbe: true, ...options });
    return buildOsSnapshotText(snapshot);
  } catch {
    return "=== OS SNAPSHOT ===\n{\"error\":\"snapshot unavailable\"}\n=== END OS SNAPSHOT ===";
  }
}

export function buildChatPrompt({ text, turns = [], persona = "", snapshot = "", taskDirective = "" }, options = {}) {
  const body = String(persona || personaForPrompt(options) || "").trim();
  const history = turns
    .slice(-MAX_HISTORY_TURNS)
    .map((t) => {
      const who = t.role === "user" ? "创始人" : "Grok Bot";
      const time = String(t.at || "").slice(11, 16);
      const marker = t.kind === "error" ? "（上一条回复失败）" : "";
      return `${who}(${time})${marker}: ${compactLine(t.text)}`;
    })
    .join("\n");

  const directiveBlock = taskDirective
    ? ["", "=== 调度与任务状态（系统注入 · 由 OS CEO 掌管） ===", taskDirective, "=== END 调度与任务状态 ==="]
    : [];

  let snapshotBlock = "";
  if (typeof snapshot === "string" && snapshot.includes("=== OS SNAPSHOT ===")) {
    snapshotBlock = snapshot;
  } else if (snapshot && typeof snapshot === "object") {
    snapshotBlock = buildOsSnapshotText(snapshot);
  } else {
    snapshotBlock = [
      "=== OS SNAPSHOT ===",
      snapshot || "（本轮未注入快照）",
      "=== END OS SNAPSHOT ==="
    ].join("\n");
  }

  return [
    "你是「Grok Bot」，创始人的私人秘书（人格设定见下）。",
    "",
    "=== 人格设定 ===",
    body,
    "=== END 人格设定 ===",
    "",
    "铁律重申：你没有任何执行权——不派工、不改文件、不跑命令、不发布、不调付费 API。你负责倾听、梳理意图，由 OS 控制中枢（AI CEO）登记任务账本并指派 Hermes (COO) 调度编排。对于普通任务，系统已自动转交 Hermes 调度；对于涉及发布/付费/删除的高风险任务，OS CEO 已拦截在待审批队列等待创始人签字。",
    "状态只来自下面的 OS SNAPSHOT 和调度状态，禁止编造任务/审批/额度。不知道就说不确定。",
    ...directiveBlock,
    "",
    snapshotBlock,
    "",
    "=== 最近对话（旧→新） ===",
    history || "（这是第一句，还没有历史）",
    "",
    "=== 创始人现在说 ===",
    String(text || "").trim().slice(0, MAX_PROMPT_CHARS)
  ].join("\n");
}

// Engine: one-shot grok -p chat call through the shared spawn choke point
// (proxy env injected). Mirrors the grok worker adapter but NEVER passes
// --always-approve, so the secretary has no autonomous tool approval.
export async function runGrokChatReply(prompt, config = {}) {
  const agent = config.agents?.grokBot || { enabled: true, command: "grok" };
  if (agent.enabled === false) {
    return { ok: false, agent: "grok-bot", error: "grok-bot chat is disabled in config" };
  }
  const command = resolveAgentCommand("grok", agent.command || "grok");
  const result = await runProcess({
    command,
    args: ["-p", prompt, "--output-format", "plain"],
    displayArgs: ["-p", "<secretary prompt>", "--output-format", "plain"],
    cwd: path.resolve(config.workspaceRoot || process.cwd()),
    dryRun: config.dryRun === true,
    timeoutMs: agent.timeoutMs || config.execution?.timeoutMs || DEFAULT_TIMEOUT_MS,
    maxOutputBytes: config.execution?.maxOutputBytes,
    env: subscriptionEnv(),
    input: ""
  });

  if (result.dryRun) {
    return { agent: "grok-bot", ok: true, dryRun: true, message: "[dry-run] Grok Bot 已收到。", command };
  }
  const message = (result.stdout || "").trim();
  return {
    agent: "grok-bot",
    ok: result.ok && !!message,
    command,
    message,
    error: result.ok ? (message ? null : "Grok Bot completed without a response") : result.error,
    stderr: result.stderr || null,
    exitCode: result.exitCode,
    durationMs: result.durationMs
  };
}

let replyLock = false;

export async function sendMessage(
  { text, autoDispatch = false, delegateToHermes = true, attachments = [] } = {},
  config = {},
  { engine, options = {} } = {}
) {
  const raw = String(text ?? "").trim();
  if (!raw) throw new Error("Message text cannot be empty");
  if (raw.length > MAX_PROMPT_CHARS) throw new Error(`Message too long (max ${MAX_PROMPT_CHARS} chars)`);
  if (replyLock) throw new Error("Grok Bot 正在回复上一条消息，请稍等");

  const intent = guessIntent(raw);

  let delegatedTask = null;
  let taskDirective = "";
  if (intent === "task" && autoDispatch) {
    try {
      delegatedTask = createSecretaryWork({
        text: raw,
        delegateToHermes,
        attachments
      }, config);

      if (delegatedTask) {
        if (delegatedTask.riskLevel === "high") {
          taskDirective = `【OS CEO 判定与风控拦截】已在 OS 登记高风险任务 #${delegatedTask.id}（${delegatedTask.title}），涉及发布/付费/删除等高风险动作，已被 OS 拦截在【待审批队列】。请在回复中明确告知创始人：任务已创建，但必须由创始人在控制台签字批准后，Hermes (COO) 才能执行调度。`;
        } else {
          taskDirective = `【OS CEO 派工成功】已在 OS 登记任务 #${delegatedTask.id}（${delegatedTask.title}）并指派 Hermes (COO) 调度编排（当前状态：${delegatedTask.status}）。请在回复中明确告知创始人：已转交给 Hermes 调度执行，OS 正在监控任务账本与执行进度。`;
        }
      }
    } catch (err) {
      taskDirective = `【OS 登记异常】自动登记任务失败：${err.message}。请作为秘书告知创始人。`;
    }
  }

  const userTurn = saveTurn({
    id: newTurnId(),
    role: "user",
    kind: "text",
    text: raw,
    intentGuess: intent,
    at: now(),
    inboxMsgId: null,
    taskId: delegatedTask ? delegatedTask.id : null,
    taskStatus: delegatedTask ? delegatedTask.status : null,
    taskRisk: delegatedTask ? delegatedTask.riskLevel : null,
    agentResolved: delegatedTask ? (delegatedTask.agentResolved || "hermes") : null
  }, options);

  const prior = listTurns(options);
  const prompt = buildChatPrompt({
    text: raw,
    turns: prior,
    snapshot: compactOsSnapshot(config, options),
    taskDirective
  }, options);

  replyLock = true;
  const started = Date.now();
  let assistantTurn;
  try {
    const runner = engine || runGrokChatReply;
    const res = await runner(prompt, config);
    const reply = (res?.message || "").trim();
    if (!res?.ok || !reply) {
      throw new Error(res?.error || "Grok Bot 未返回内容");
    }
    assistantTurn = saveTurn({
      id: newTurnId(),
      role: "assistant",
      kind: "text",
      text: reply,
      at: now(),
      durationMs: Date.now() - started,
      engine: "grok -p (subscription CLI)",
      taskId: delegatedTask ? delegatedTask.id : null,
      taskStatus: delegatedTask ? delegatedTask.status : null,
      tunedAt: null,
      tunedRule: null
    }, options);
  } catch (err) {
    assistantTurn = saveTurn({
      id: newTurnId(),
      role: "assistant",
      kind: "error",
      text: `回复失败：${err.message}`,
      at: now(),
      durationMs: Date.now() - started,
      engine: "grok -p (subscription CLI)",
      taskId: delegatedTask ? delegatedTask.id : null,
      taskStatus: delegatedTask ? delegatedTask.status : null
    }, options);
  } finally {
    replyLock = false;
  }

  return { userTurn, assistantTurn, task: delegatedTask };
}

// "设为规则": append an assistant reply (or an explicit founder-edited rule)
// to the persona file's 调教记录 section.
export function tuneTurnToRule(id, { rule } = {}, options = {}) {
  const turn = getTurn(id, options);
  if (!turn) throw new Error(`Chat turn ${id} not found`);
  if (turn.role !== "assistant" || turn.kind !== "text") {
    throw new Error("Only a text reply from Grok Bot can be adopted as a rule");
  }
  const ruleText = String(rule ?? "").trim() || turn.text;
  const persona = appendPersonaRule(ruleText, options);
  turn.tunedAt = now();
  turn.tunedRule = ruleText;
  saveTurn(turn, options);
  return { turn, persona };
}

// "转为收件箱草稿": hand a founder message to the secretary inbox as a draft
// (task / memory candidate). Never dispatches anything by itself.
export function turnToInbox(id, options = {}) {
  const turn = getTurn(id, options);
  if (!turn) throw new Error(`Chat turn ${id} not found`);
  if (turn.role !== "user") throw new Error("Only a founder message can go to the inbox");

  if (turn.inboxMsgId) {
    const existing = getMessage(turn.inboxMsgId, options);
    if (existing) return { duplicate: true, message: existing };
  }

  const message = receiveMessage({
    text: turn.text,
    source: "grok-bot-chat",
    autoConvert: true
  }, options);

  turn.inboxMsgId = message.id;
  saveTurn(turn, options);
  return { duplicate: false, message };
}
