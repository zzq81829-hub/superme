import { assertNoSecrets } from "../memory/store.js";

const USER_PREFIX = /^(?:用户|我|创始人|user|founder|me)\s*[:：]\s*/i;
const ASSISTANT_PREFIX = /^(?:助手|AI|assistant|gpt|hermes|bot)\s*[:：]\s*/i;
const CORE_PATTERNS = [
  /我希望|我想要|目标是|核心目标|长期目标|定位是|我们要做到/,
  /就定|已决定|决定|确定|定下来|敲定|方案定为|规则定为/,
  /禁止|不要|不能|严禁|绝不|不得|别用|不要自动/,
  /优先级|优先|先做|第一位|首要|重点是|把.*放在第一/,
  /必须|应该|需要|保持|采用|统一|固定为/,
  /(审美|风格|黑白红|高级感|质感|视觉|UI|体验).*(标准|定为|保持|采用|必须|绝不|偏好|要求|统一|极简)/
];

function cleanLine(line) {
  return String(line || "")
    .replace(/^[-*•·▪]\s*/, "")
    .replace(/^\d+[.)、]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function categoryOf(text) {
  if (/(审美|风格|视觉|UI|体验|质感|配色|排版)/i.test(text)) return "审美与体验";
  if (/(禁止|不要|不能|严禁|绝不|不得|别用|不要自动)/.test(text)) return "边界与禁忌";
  if (/(目标|定位|商业|长期|我们要做到)/.test(text)) return "目标与定位";
  if (/(优先|第一位|首要|重点)/.test(text)) return "优先级";
  return "执行原则";
}

function isCoreRequirement(text) {
  return text.length >= 8 && text.length <= 500 && CORE_PATTERNS.some((pattern) => pattern.test(text));
}

function hasSensitiveContent(text) {
  try {
    assertNoSecrets(text);
    return false;
  } catch {
    return true;
  }
}

function extractUserLines(rawText) {
  const lines = String(rawText || "").replace(/\r\n/g, "\n").split("\n");
  const hasSpeakerLabels = lines.some((line) => USER_PREFIX.test(line.trim()) || ASSISTANT_PREFIX.test(line.trim()));
  const userLines = [];
  let role = hasSpeakerLabels ? null : "user";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (USER_PREFIX.test(line)) {
      role = "user";
      userLines.push(cleanLine(line.replace(USER_PREFIX, "")));
      continue;
    }
    if (ASSISTANT_PREFIX.test(line)) {
      role = "assistant";
      continue;
    }
    if (role === "user") userLines.push(cleanLine(line));
  }

  return userLines;
}

export function extractBriefHighlights(rawText, options = {}) {
  const maxCount = Math.max(1, Math.min(Number(options.maxCount) || 12, 20));
  const seen = new Set();
  const highlights = [];
  let ignoredCount = 0;

  for (const line of extractUserLines(rawText)) {
    if (!isCoreRequirement(line) || hasSensitiveContent(line)) {
      ignoredCount += 1;
      continue;
    }
    const key = line.replace(/[\s\p{P}]/gu, "").toLowerCase();
    if (seen.has(key)) {
      ignoredCount += 1;
      continue;
    }
    seen.add(key);
    highlights.push({ text: line, category: categoryOf(line) });
    if (highlights.length >= maxCount) break;
  }

  const grouped = new Map();
  for (const item of highlights) {
    if (!grouped.has(item.category)) grouped.set(item.category, []);
    grouped.get(item.category).push(item.text);
  }
  const proposedContent = [...grouped.entries()]
    .map(([category, items]) => `### ${category}\n${items.map((item) => `- ${item}`).join("\n")}`)
    .join("\n\n");

  return {
    highlights,
    proposedContent,
    ignoredCount,
    source: options.source || "free-ai-transcript"
  };
}
