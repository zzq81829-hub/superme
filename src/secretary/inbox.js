import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createTask, getTask } from "../store.js";
import { createCandidate } from "../memory/store.js";
import { probeGrokBot } from "./probeGrokBot.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultBaseDir = path.resolve(__dirname, "../../data/secretary");

export function getSecretaryDir(options = {}) {
  const dir = options.baseDir || process.env.SECRETARY_BASE_DIR || defaultBaseDir;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getInboxDir(options = {}) {
  const dir = path.join(getSecretaryDir(options), "inbox");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getProcessedDir(options = {}) {
  const dir = path.join(getSecretaryDir(options), "processed");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function guessIntent(text) {
  const t = String(text || "").trim().toLowerCase();
  if (/审美|风格|以后都|必须|禁忌|原则|核心判断|目标是|优先级/.test(t)) {
    return "memory_candidate";
  }
  if (/发布|创建|修复|改写|写代码|运行|测试|分析|实现|优化|重构|生成|排版/.test(t)) {
    return "task";
  }
  return "unknown";
}

function messageFile(id, options = {}) {
  const inboxFile = path.join(getInboxDir(options), `${id}.json`);
  if (fs.existsSync(inboxFile)) return inboxFile;
  const processedFile = path.join(getProcessedDir(options), `${id}.json`);
  if (fs.existsSync(processedFile)) return processedFile;
  return inboxFile;
}

export function receiveMessage(input = {}, options = {}) {
  if (!input || typeof input !== "object") {
    throw new Error("Message input must be an object");
  }

  const rawText = String(input.text || "").trim();
  if (!rawText) {
    throw new Error("Message text cannot be empty");
  }

  let source = input.source || "dashboard";
  const botProbe = probeGrokBot();
  if (source === "grok-bot" && !botProbe.canSubmit) {
    // If Grok Bot control interface is unverified, do not pretend it came directly from a live Bot protocol
    source = "manual (grok-bot-unverified)";
  }

  const intent = input.intentGuess || guessIntent(rawText);
  const now = new Date().toISOString();
  const id = `msg-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;

  const message = {
    id,
    receivedAt: now,
    source,
    text: rawText,
    intentGuess: intent,
    status: "received",
    convertedTo: null,
    error: null
  };

  // Convert intent safely without auto-executing or auto-confirming
  if (input.autoConvert !== false) {
    if (intent === "task") {
      try {
        const firstSentence = rawText.split(/[。\n!?；;]/)[0].trim();
        const title = firstSentence.length > 30 ? firstSentence.slice(0, 30) + "..." : firstSentence;
        // Create draft task safely: NEVER dispatches
        const task = createTask({
          title: `[秘书收件箱] ${title}`,
          description: rawText,
          agent: "auto",
          projectPath: ""
        });
        message.convertedTo = { type: "task", id: task.id };
        message.status = "converted";
      } catch (err) {
        message.error = `Task creation failed: ${err.message}`;
      }
    } else if (intent === "memory_candidate") {
      try {
        const firstSentence = rawText.split(/[。\n!?；;]/)[0].trim();
        const title = firstSentence.length > 25 ? firstSentence.slice(0, 25) + "..." : firstSentence;
        // Create candidate memory safely: NEVER confirms
        const candidate = createCandidate({
          title: `秘书提议 · ${title}`,
          content: rawText,
          type: "judgment",
          source: { kind: "secretary_inbox", ref: id, note: "auto-ingest" },
          license: "understand_only",
          needsQuickReview: true
        });
        message.convertedTo = { type: "memory_candidate", id: candidate.id };
        message.status = "converted";
      } catch (err) {
        message.error = `Candidate creation failed: ${err.message}`;
      }
    }
  }

  const filePath = path.join(getInboxDir(options), `${id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(message, null, 2), "utf8");
  return message;
}

export function getMessage(id, options = {}) {
  const file = messageFile(id, options);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function acceptMessage(id, { convertType = "task" } = {}, options = {}) {
  const message = getMessage(id, options);
  if (!message) {
    throw new Error(`Secretary message ${id} not found`);
  }

  if (convertType === "task" && !message.convertedTo) {
    const firstSentence = message.text.split(/[。\n!?；;]/)[0].trim();
    const title = firstSentence.length > 30 ? firstSentence.slice(0, 30) + "..." : firstSentence;
    // Create draft task safely: NEVER dispatches
    const task = createTask({
      title: `[秘书任务草稿] ${title}`,
      description: message.text,
      agent: "auto"
    });
    message.convertedTo = { type: "task", id: task.id };
  } else if (convertType === "memory_candidate" && !message.convertedTo) {
    const firstSentence = message.text.split(/[。\n!?；;]/)[0].trim();
    const title = firstSentence.length > 25 ? firstSentence.slice(0, 25) + "..." : firstSentence;
    // Create candidate memory safely: NEVER confirms
    const candidate = createCandidate({
      title: `秘书记忆候选 · ${title}`,
      content: message.text,
      type: "judgment",
      source: { kind: "secretary_inbox", ref: id, note: "founder-accepted" },
      license: "understand_only"
    });
    message.convertedTo = { type: "memory_candidate", id: candidate.id };
  }

  message.status = "accepted";
  message.updatedAt = new Date().toISOString();

  // Move to processed
  const inboxPath = path.join(getInboxDir(options), `${id}.json`);
  const processedPath = path.join(getProcessedDir(options), `${id}.json`);

  fs.writeFileSync(processedPath, JSON.stringify(message, null, 2), "utf8");
  if (fs.existsSync(inboxPath)) {
    try {
      fs.unlinkSync(inboxPath);
    } catch {}
  }

  return message;
}

export function rejectMessage(id, { reason = "Rejected by founder" } = {}, options = {}) {
  const message = getMessage(id, options);
  if (!message) {
    throw new Error(`Secretary message ${id} not found`);
  }

  message.status = "rejected";
  message.rejectReason = reason;
  message.updatedAt = new Date().toISOString();

  const inboxPath = path.join(getInboxDir(options), `${id}.json`);
  const processedPath = path.join(getProcessedDir(options), `${id}.json`);

  fs.writeFileSync(processedPath, JSON.stringify(message, null, 2), "utf8");
  if (fs.existsSync(inboxPath)) {
    try {
      fs.unlinkSync(inboxPath);
    } catch {}
  }

  return message;
}

export function listInbox(options = {}) {
  const inboxDir = getInboxDir(options);
  const processedDir = getProcessedDir(options);

  const readDirMessages = (dir) => {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((n) => n.endsWith(".json"))
      .map((n) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(dir, n), "utf8"));
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  };

  const all = [...readDirMessages(inboxDir), ...readDirMessages(processedDir)];
  return all.sort((a, b) => (b.receivedAt || "").localeCompare(a.receivedAt || ""));
}
