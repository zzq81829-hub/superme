import crypto from "crypto";
import { assertNoSecrets, listCandidates, listActive, createCandidate } from "./store.js";

const SMALL_TALK_PATTERNS = [
  /^(ok|okay|yes|no|thanks|thank you|好的|好的呢|收到|明白|继续|继续吧|赞|行|可以|在吗|你好|请帮我|麻烦你了)$/i,
  /^.{0,6}$/ // too short to contain substantive judgment
];

function isSmallTalk(text) {
  const trimmed = text.trim();
  return SMALL_TALK_PATTERNS.some((p) => p.test(trimmed));
}

function containsSecret(text) {
  try {
    assertNoSecrets(text);
    return false;
  } catch {
    return true;
  }
}

const ASSERTION_PATTERNS = [
  /就定|已决定|决定|确定|以后都|定下来|敲定|方案定为|规则定为|我们定/,
  /禁止|不要|不能|严禁|绝不|不得|别用|不要自动|严禁自动|不要扣款/,
  /我希望|我想要|目标是|核心目标|长期目标|我们要做到|商业目标|定位是/,
  /优先级|优先|先做|第一位|首要|重点是|把.*放在第一/,
  /(审美|风格|黑白红|高级感|质感|配色|视觉|UI).*(标准|定为|保持|采用|必须|绝不|偏好|要求|统一|极简)/,
  /以后.*(采用|使用|必须|统一)/,
  /我认为|核心判断|原则是|标准是|关键是|本质上/
];

function isSubstantiveJudgment(text) {
  const trimmed = text.trim();
  if (isSmallTalk(trimmed)) return false;
  
  // If it's a pure question or generic request without strong assertion
  if (/[?？]$|^(请|麻烦|帮我|如何|怎么|为什么|请问|分析一下|能否)/.test(trimmed)) {
    if (!ASSERTION_PATTERNS.some((p) => p.test(trimmed))) {
      return false;
    }
  }

  return ASSERTION_PATTERNS.some((p) => p.test(trimmed));
}

function inferCategory(text) {
  const t = text.toLowerCase();

  if (/审美|设计|排版|风格|黑白红|高级感|质感|配色|视觉|ui|前端风格|时装秀|优雅|克制/.test(t)) {
    return "aesthetic";
  }
  if (/禁止|不要|不能|严禁|绝不|不得|别用|不要自动|严禁自动|不要扣款/.test(t)) {
    return "taboo";
  }
  if (/我希望|我想要|目标是|核心目标|长期目标|我们要做到|商业目标|定位是/.test(t)) {
    return "goal";
  }
  if (/优先级|优先|先做|第一位|首要|重点是|把.*放在第一/.test(t)) {
    return "priority";
  }
  if (/就定|已决定|决定|确定|以后都|定下来|敲定|方案定为|规则定为/.test(t)) {
    return "decision";
  }
  return "judgment";
}

function inferProjectScope(text) {
  const t = text.toLowerCase();
  if (/书斋|书摘|小红书|shuzhai/.test(t)) {
    return ["shuzhai"];
  }
  if (/ai ceo|控制中枢|founder os|治理|hermes/.test(t)) {
    return ["ai_ceo"];
  }
  return ["*"];
}

function cleanStatement(text) {
  return text
    .replace(/^(请帮我|你好|请问|麻烦你|我想问|帮我看一下)[,，\s]*/i, "")
    .replace(/[！!]+$/g, "。")
    .trim();
}

function generateTitle(type, cleaned) {
  const firstSentence = cleaned.split(/[。\n!?；;]/)[0].trim();
  const summary = firstSentence.length > 25 ? firstSentence.slice(0, 25) + "..." : firstSentence;
  
  const typeMap = {
    aesthetic: "审美标准",
    taboo: "业务禁忌",
    goal: "业务目标",
    priority: "执行优先级",
    decision: "已定决策",
    judgment: "核心判断"
  };

  const prefix = typeMap[type] || "判断标准";
  return `${prefix} · ${summary}`;
}

export function extractFromTranscript(turns = [], source = {}, options = {}) {
  if (!Array.isArray(turns) || turns.length === 0) {
    return { created: [], skipped: 0, needsQuickReview: [] };
  }

  // Load existing memory items & candidates for deduplication
  const existingActive = options.existingActive || listActive({}, options);
  const existingCandidates = options.existingCandidates || listCandidates(options);

  const normalizeStr = (s) => String(s || "").replace(/[\s\p{P}]/gu, "").toLowerCase();

  const existingHashes = new Set([
    ...existingActive.map((m) => normalizeStr(m.title + m.content)),
    ...existingCandidates.map((m) => normalizeStr(m.title + m.content))
  ]);

  const conversationId = source.conversationId || source.url || "chatgpt-session";
  const results = [];
  let skipped = 0;

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    if (!turn || typeof turn !== "object") continue;

    // CRITICAL: ONLY extract reusable founder judgments from user turns
    if (turn.role !== "user") continue;

    const rawText = String(turn.text || "").trim();
    if (!rawText || !isSubstantiveJudgment(rawText)) {
      skipped++;
      continue;
    }

    // Safety guard: drop secret patterns
    if (containsSecret(rawText)) {
      skipped++;
      continue;
    }

    const type = inferCategory(rawText);
    const cleaned = cleanStatement(rawText);
    if (!cleaned || cleaned.length < 6) {
      skipped++;
      continue;
    }

    const title = generateTitle(type, cleaned);
    const norm = normalizeStr(title + cleaned);

    if (existingHashes.has(norm)) {
      skipped++;
      continue;
    }

    const projectScope = inferProjectScope(cleaned);
    const sensitivity = type === "taboo" || /删除|权限|密码|资金|扣款|发布|安全/.test(cleaned) ? "high" : "medium";
    const needsQuickReview = type === "decision" || type === "taboo" || type === "goal" || sensitivity === "high";

    const turnIndex = turn.index !== undefined ? turn.index : i + 1;
    const candidateData = {
      title,
      content: cleaned,
      type,
      source: {
        kind: "chatgpt",
        ref: conversationId,
        note: `extract:turn ${turnIndex}`
      },
      sensitivity,
      license: "understand_only",
      projectScope,
      needsQuickReview
    };

    try {
      const candidate = createCandidate(candidateData);
      existingHashes.add(norm);
      results.push(candidate);
    } catch {
      skipped++;
    }

    // Limit to max 8 candidates per extraction
    if (results.length >= (options.maxCount || 8)) break;
  }

  const quickReviewIds = results.filter((c) => c.needsQuickReview).map((c) => c.id);

  return {
    ok: true,
    created: results.map((c) => c.id),
    candidates: results,
    skipped,
    needsQuickReview: quickReviewIds
  };
}
