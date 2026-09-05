import path from "path";
import { createTask, getTask, updateTask } from "../store.js";
import { dispatchTask } from "../router.js";
import { readSafeComputerText } from "../access/computerRead.js";

const MAX_TEXT_CHARS = 4000;
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_CHARS = 12000;

function titleFrom(text) {
  const first = String(text).split(/[。\n!?；;]/)[0].trim();
  return first.length > 30 ? `${first.slice(0, 30)}...` : first;
}

function attachmentContext(attachments = []) {
  if (attachments === undefined || attachments === null) return "";
  if (!Array.isArray(attachments)) throw new Error("attachments must be an array");
  if (attachments.length > MAX_ATTACHMENTS) throw new Error(`最多只能附加 ${MAX_ATTACHMENTS} 个文件`);

  const blocks = attachments.map((item) => {
    const rootName = String(item?.rootName || "").trim();
    const relativePath = String(item?.path || item?.relativePath || "").trim();
    if (!rootName || !relativePath) throw new Error("每个附件必须提供安全根目录和相对路径");
    const content = readSafeComputerText({ rootName, relativePath });
    return `文件：${path.basename(relativePath)}\n${content.slice(0, MAX_ATTACHMENT_CHARS)}`;
  });

  return blocks.length
    ? `\n\n[秘书安全读取的文件上下文，仅来自隐私过滤读取器]\n${blocks.join("\n\n")}`
    : "";
}

export function createSecretaryWork(input = {}, config = {}) {
  const text = String(input.text || "").trim();
  if (!text) throw new Error("工作意图不能为空");
  if (text.length > MAX_TEXT_CHARS) throw new Error(`工作意图不能超过 ${MAX_TEXT_CHARS} 个字符`);

  const description = `${text}${attachmentContext(input.attachments)}`;
  const task = createTask({
    title: String(input.title || titleFrom(text)).trim(),
    description,
    agent: "auto",
    delegateToHermes: input.delegateToHermes !== false,
    source: input.source || "secretary",
    projectPath: typeof input.projectPath === "string" ? input.projectPath : "",
    acceptanceCriteria: input.acceptanceCriteria || []
  });

  if (task.riskLevel === "high") return task;

  updateTask(task.id, { status: "queued" });
  dispatchTask(task.id, config).catch((error) => {
    try {
      updateTask(task.id, {
        status: "failed",
        error: error?.stack || String(error),
        finishedAt: new Date().toISOString()
      });
    } catch {
      // The task result is already persisted; a secondary error must not crash the server.
    }
  });
  return getTask(task.id);
}

