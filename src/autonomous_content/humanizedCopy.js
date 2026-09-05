/**
 * Humanized Copywriting Style Enforcement & Anti-AI Tone Engine
 *
 * Implements:
 * - Anti-AI Tone Linter (intercepts mandatory clichés, extended corporate buzzwords, and evasion tactics)
 * - Paragraph Line-Length Enforcer (strictly <= 3 lines per paragraph)
 * - Humanized Copy Rewriter (cleans buzzwords, reformats long paragraphs)
 * - Dual-Criteria Xiaohongshu Tag Recommender (niche domain matched, verified high volume, zero banned words)
 */

export const MANDATORY_BANNED_CLICHES = [
  "在这个快节奏的时代",
  "总有一款适合你",
  "建议收藏反复阅读",
  "建议收藏",
  "底层逻辑",
  "赋能",
  "闭环",
  "维度",
  "颠覆认知"
];

export const EXTENDED_AI_BUZZWORDS = [
  "认知重塑",
  "心智模型",
  "抓手",
  "对齐颗粒度",
  "对齐",
  "打通底层",
  "沉淀方法论",
  "组合拳",
  "私域流量",
  "链路"
];

export const DOMAIN_TAGS_MAP = {
  wealth: [
    "#怎样变得富有",
    "#搞钱思维",
    "#财富思维",
    "#变美变富变强",
    "#搞钱女孩",
    "#认知觉醒"
  ],
  shuzhai: [
    "#书斋",
    "#深度阅读",
    "#书单推荐",
    "#思考快与慢",
    "#卡尼曼",
    "#认知升级"
  ],
  growth: [
    "#个人成长",
    "#自律打卡",
    "#反内耗指南",
    "#认知突破",
    "#思维重塑"
  ],
  business: [
    "#商业洞察",
    "#搞钱逻辑",
    "#创业思维",
    "#商业认知",
    "#商业模式"
  ],
  psychology: [
    "#心理学",
    "#心理学效应",
    "#认知觉醒",
    "#情绪管理",
    "#深度思考"
  ]
};

export const DEFAULT_FALLBACK_TAGS = [
  "#精选分享",
  "#自我提升",
  "#认知觉醒",
  "#深度思考",
  "#生活感悟",
  "#读书笔记"
];

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildEvasionRegex(phrase) {
  const chars = Array.from(phrase);
  const pattern = chars
    .map(escapeRegExp)
    .join("[\\s._\\-~*#·/\\\\|\\u200B-\\u200D\\uFEFF]*");
  return new RegExp(pattern, "i");
}

const PRECOMPILED_BANNED_PATTERNS = [...MANDATORY_BANNED_CLICHES, ...EXTENDED_AI_BUZZWORDS].map((phrase) => ({
  phrase,
  regex: buildEvasionRegex(phrase)
}));

function normalizeTextForToneCheck(text) {
  if (!text) return "";
  let normalized = String(text).replace(/[\u200B-\u200D\uFEFF]/g, "");
  normalized = normalized.replace(/([\u4e00-\u9fa5])[\s._\-~*#·/\\|]+(?=[\u4e00-\u9fa5])/g, "$1");
  return normalized;
}

/**
 * Lints copy against AI buzzwords, corporate clichés, and paragraph line limits.
 *
 * @param {string} text
 * @param {object} [options]
 * @returns {{ ok: boolean, violations: string[], cleanedText: string }}
 */
export function lintAntiAITone(text, options = {}) {
  if (text == null) {
    return { ok: true, violations: [], cleanedText: "" };
  }

  const rawText = String(text);
  if (!rawText.trim()) {
    return { ok: true, violations: [], cleanedText: "" };
  }

  const violations = [];
  const normalizedNewlines = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const normalizedForCheck = normalizeTextForToneCheck(normalizedNewlines);

  // 1. Check for mandatory banned clichés and extended AI buzzwords
  const extraBanned = Array.isArray(options.extraBanned) ? options.extraBanned : [];
  const activePatterns = extraBanned.length > 0
    ? [...PRECOMPILED_BANNED_PATTERNS, ...extraBanned.map((p) => ({ phrase: p, regex: buildEvasionRegex(p) }))]
    : PRECOMPILED_BANNED_PATTERNS;

  for (const { phrase, regex } of activePatterns) {
    if (regex.test(rawText) || normalizedForCheck.includes(phrase)) {
      violations.push(`检测到违规套话/AI黑话: "${phrase}"`);
    }
  }

  // 2. Enforce paragraph line length (<= 3 lines per paragraph)
  const maxLines = options.maxLinesPerParagraph || 3;
  const paragraphs = normalizedNewlines.split(/\n\s*\n+/);

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i].trim();
    if (!p) continue;
    const lines = p.split(/\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length > maxLines) {
      violations.push(
        `段落行数超标 (paragraph line count exceeds limit: 第 ${i + 1} 个段落包含 ${lines.length} 行，要求 <= ${maxLines} 行)`
      );
    }
  }

  const ok = violations.length === 0;
  const cleanedText = ok ? rawText : humanizeText(rawText);

  return {
    ok,
    violations,
    cleanedText
  };
}

const CLICHE_REPLACEMENTS = [
  { pattern: /在这个快\s*节\s*奏\s*的\s*时\s*代[，,]?/g, replacement: "" },
  { pattern: /总有一款适合你[。.]?/g, replacement: "" },
  { pattern: /建议收藏反复阅读[。.]?/g, replacement: "" },
  { pattern: /建议收藏[。.]?/g, replacement: "" },
  { pattern: /底[.\s_]*层[.\s_]*逻[.\s_]*辑/g, replacement: "核心规律" },
  { pattern: /全面赋能|深度赋能|赋能/g, replacement: "助力" },
  { pattern: /自闭环|业务闭环|闭环/g, replacement: "完整流程" },
  { pattern: /多维度|维度/g, replacement: "角度" },
  { pattern: /颠[.\s_]*覆[.\s_]*认[.\s_]*知/g, replacement: "刷新认识" },
  { pattern: /认知重塑/g, replacement: "重塑思路" },
  { pattern: /心智模型/g, replacement: "思考模型" },
  { pattern: /抓手/g, replacement: "突破口" },
  { pattern: /对齐颗粒度/g, replacement: "明确细节" },
  { pattern: /对齐/g, replacement: "同步" },
  { pattern: /打通底层/g, replacement: "理清根基" },
  { pattern: /沉淀方法论/g, replacement: "提炼方法" },
  { pattern: /组合拳/g, replacement: "系统策略" },
  { pattern: /私域流量/g, replacement: "核心读者" },
  { pattern: /全链路|链路/g, replacement: "流程" }
];

/**
 * Transforms AI-style copy into grounded humanized text:
 * cleans zero-width tricks, substitutes clichés, and chunks overlong paragraphs.
 *
 * @param {string} text
 * @param {object} [options]
 * @returns {string}
 */
export function humanizeText(text, options = {}) {
  if (text == null) return "";
  let clean = String(text).replace(/[\u200B-\u200D\uFEFF]/g, "");

  for (const { pattern, replacement } of CLICHE_REPLACEMENTS) {
    clean = clean.replace(pattern, replacement);
  }

  const maxLines = options.maxLinesPerParagraph || 3;
  const normalizedNewlines = clean.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const paragraphs = normalizedNewlines.split(/\n\s*\n+/);
  const reformattedParagraphs = [];

  for (const p of paragraphs) {
    const pTrimmed = p.trim();
    if (!pTrimmed) continue;
    const lines = pTrimmed.split(/\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length <= maxLines) {
      reformattedParagraphs.push(lines.join("\n"));
    } else {
      for (let i = 0; i < lines.length; i += maxLines) {
        const chunk = lines.slice(i, i + maxLines);
        reformattedParagraphs.push(chunk.join("\n"));
      }
    }
  }

  return reformattedParagraphs.join("\n\n");
}

function formatSingleTag(raw) {
  if (!raw) return "";
  let tag = String(raw).trim();
  tag = tag.replace(/^#+/, "").replace(/\s+/g, "");
  if (!tag) return "";
  return `#${tag}`;
}

function isTagClean(tag) {
  for (const banned of MANDATORY_BANNED_CLICHES) {
    if (tag.includes(banned)) return false;
  }
  for (const buzz of EXTENDED_AI_BUZZWORDS) {
    if (tag.includes(buzz)) return false;
  }
  return true;
}

function detectDomainFromTopic(topic = "") {
  const t = String(topic).toLowerCase();
  if (/搞钱|财富|富有|变富|被动收入|理财/i.test(t)) return "wealth";
  if (/书斋|书单|读书|卡尼曼|思考快与慢|阅读/i.test(t)) return "shuzhai";
  if (/成长|自律|反内耗|习惯|内耗/i.test(t)) return "growth";
  if (/商业|创业|商业模式/i.test(t)) return "business";
  if (/心理|潜意识|情绪/i.test(t)) return "psychology";
  return null;
}

/**
 * Recommends 4 to 6 curated, niche-matched, high-traffic Xiaohongshu tags.
 *
 * @param {string} topic
 * @param {string} [domain]
 * @param {object} [options]
 * @returns {string[]} strictly 4 to 6 tags
 */
export function recommendXiaohongshuTags(topic = "", domain = "", options = {}) {
  const requestedDomain = String(domain || "").trim().toLowerCase();
  const inferredDomain = (requestedDomain && requestedDomain !== "default" && DOMAIN_TAGS_MAP[requestedDomain])
    ? requestedDomain
    : (detectDomainFromTopic(topic) || "default");
  const domainPool = DOMAIN_TAGS_MAP[inferredDomain] || DEFAULT_FALLBACK_TAGS;

  const selected = new Set();

  // If extra custom tags provided, evaluate first
  if (Array.isArray(options.extraTags)) {
    for (const tag of options.extraTags) {
      const clean = formatSingleTag(tag);
      if (clean && clean.length > 1 && isTagClean(clean)) {
        selected.add(clean);
      }
    }
  }

  // Topic-sensitive priority tags
  const topicLower = String(topic || "").toLowerCase();
  if (topicLower.includes("卡尼曼") || topicLower.includes("思考快与慢")) {
    selected.add("#卡尼曼");
    selected.add("#思考快与慢");
  }

  // Add primary domain tags
  for (const tag of domainPool) {
    if (selected.size >= 6) break;
    const clean = formatSingleTag(tag);
    if (clean && clean.length > 1 && isTagClean(clean)) {
      selected.add(clean);
    }
  }

  // If still fewer than 4 tags, backfill from default fallback tags
  if (selected.size < 4) {
    for (const tag of DEFAULT_FALLBACK_TAGS) {
      if (selected.size >= 4) break;
      const clean = formatSingleTag(tag);
      if (clean && clean.length > 1 && isTagClean(clean)) {
        selected.add(clean);
      }
    }
  }

  const result = Array.from(selected);
  if (result.length > 6) {
    return result.slice(0, 6);
  }
  return result;
}
