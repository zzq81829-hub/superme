import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Grok Bot persona (人格) — the founder-editable instruction file that shapes
// the secretary's role, tone and iron rules. Mirrors the briefs/store.js
// pattern. Editing this file (or PUTting it from the dashboard) is the
// "调教" surface: every chat turn is prompted with its current content.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "../..");
const defaultPersonaPath = path.join(root, "founder_os", "GROK_BOT_PERSONA.md");

const DEFAULT_PERSONA = [
  "# Grok Bot · 私人秘书人格（调教文件）",
  "",
  "你是 Grok Bot——创始人的私人秘书，运行在本机 AI Founder OS（:3210）。底层模型 = grok.com 订阅（grok-4.x），经本机 CLI 逐轮调起。你不是任务 Worker（Grok/Grok Build 工程执行是你的同事，不是你）。",
  "",
  "语气：中文为主，简洁具体，不端不喊口号；不知道就说不确定，绝不编造状态（你从不执行，就永远别说『已执行/已完成』）。",
  "",
  "职责（只做四类）：① 陪伴——接住随口的话，追问，帮创始人把模糊想法说清楚；② 收集想法——把灵感/偏好/判断整理成可入库表述（审美、原则、优先级）；③ 提醒与汇报——记住托付的待办，被问到时汇报指令与状态；④ 接收并整理指令——整理成『一句任务描述 + 期望结果』。",
  "",
  "铁律（永不可违背）：没有任何执行权——不派工、不改文件、不跑命令、不发布、不调付费 API；不直接命令/联系 Hermes 或其他 Worker，一切经本机收件箱流转；创始人说『去执行』时只整理成【任务草稿建议】，绝不假装已执行；隐私与金钱内容不读取不存储。",
  "",
  "动作协议：任务类指令 → 回复末尾附『📥 建议任务草稿：<一句话>』；偏好/原则/审美 → 附『🧠 建议记忆候选：<一句话>』；日常对话正常聊，不必每句都生成建议。",
  "",
  "## 调教记录（创始人采纳的规则）"
].join("\n");

export function getPersonaPath(options = {}) {
  return options.personaPath || process.env.PERSONA_FILE || defaultPersonaPath;
}

export function getPersona(options = {}) {
  const file = getPersonaPath(options);
  let exists = fs.existsSync(file);
  let content = "";
  if (exists) {
    try {
      content = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    } catch {
      content = "";
    }
  }
  if (!content.trim()) {
    exists = false;
    content = DEFAULT_PERSONA;
  }

  let updatedAt = null;
  if (exists) {
    try {
      updatedAt = fs.statSync(file).mtime.toISOString();
    } catch {
      // Best-effort mtime; not worth failing the read over.
    }
  }

  return { path: file, content, updatedAt, exists };
}

export function updatePersona(content, options = {}) {
  const text = String(content ?? "").replace(/\r\n/g, "\n");
  if (!text.trim()) throw new Error("Grok Bot persona cannot be empty");
  const file = getPersonaPath(options);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
  return getPersona(options);
}

// Appends one founder-accepted rule under the "调教记录" section at the end.
export function appendPersonaRule(rule, options = {}) {
  const raw = String(rule ?? "").replace(/\s+/g, " ").trim();
  if (!raw) throw new Error("Rule cannot be empty");
  const oneLine = raw.length > 300 ? `${raw.slice(0, 300)}…` : raw;
  const file = getPersonaPath(options);
  let text = "";
  if (fs.existsSync(file)) {
    text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  }
  if (!text.trim()) text = DEFAULT_PERSONA;
  if (!text.includes("## 调教记录")) {
    text = text.replace(/\s*$/, "") + "\n\n## 调教记录（创始人采纳的规则）\n";
  }
  const ts = new Date().toISOString().slice(0, 16).replace("T", " ");
  text = text.replace(/\s*$/, "") + `\n- ${ts} 采纳：「${oneLine}」\n`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
  return getPersona(options);
}
