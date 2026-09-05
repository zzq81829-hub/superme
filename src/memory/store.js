import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { emitLearningEvent } from "../learning/router.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..", "..");

const defaultMemoryDir = path.join(root, "data", "memory");

export function getMemoryDir(options = {}) {
  const dir = options.memoryDir || options.baseDir || process.env.MEMORY_BASE_DIR || defaultMemoryDir;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getItemsDir(options = {}) {
  const dir = path.join(getMemoryDir(options), "items");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getCandidatesDir(options = {}) {
  const dir = path.join(getMemoryDir(options), "candidates");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export const ALLOWED_TYPES = [
  "aesthetic",
  "goal",
  "priority",
  "project_context",
  "judgment",
  "taboo",
  "decision",
  "life"
];

export const ALLOWED_SENSITIVITY = ["low", "medium", "high"];
export const ALLOWED_LICENSES = ["understand_only", "influence_or_paraphrase", "attributable"];

function validateId(id) {
  if (!/^[a-zA-Z0-9_-]+$/.test(String(id))) {
    throw new Error("Invalid memory id");
  }
}

function candidateFile(id, options = {}) {
  validateId(id);
  return path.join(getCandidatesDir(options), `${id}.json`);
}

function itemFile(id, options = {}) {
  validateId(id);
  return path.join(getItemsDir(options), `${id}.json`);
}

// Secret detection: reject passwords, bank cards, ID cards, API keys, private keys
export function assertNoSecrets(text) {
  if (!text || typeof text !== "string") return;
  
  const patterns = [
    /password\s*[:=]\s*\S+/i,
    /api[_-]?key\s*[:=]\s*['"]?[a-zA-Z0-9_-]{8,}['"]?/i,
    /sk-[a-zA-Z0-9_-]{8,}/i,
    /bearer\s+[a-zA-Z0-9_\-\.]{16,}/i,
    /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
    /\b\d{17}[\dXx]\b/, // Chinese 18-digit citizen ID
    /\b(?:\d{4}[ -]?){3}\d{4,7}\b/ // 16-19 digit credit/bank card
  ];

  for (const p of patterns) {
    if (p.test(text)) {
      throw new Error("Secret or sensitive credential pattern detected; storage rejected.");
    }
  }
}

export const OPPOSITION_CLUSTERS = Object.freeze([
  [
    "visual_style",
    ["黑白", "黑白红", "克制", "高级黑", "极简", "巴黎时装秀", "黑底", "冷淡风", "大字极简", "无图", "暗黑"],
    ["马卡龙", "彩色", "高饱和", "鲜艳", "霓虹", "活泼", "动漫风", "二次元", "手绘风", "插画风", "画报风", "绘本风", "小清新", "温暖暖色"]
  ],
  [
    "tone",
    ["严肃", "求真", "硬核", "严谨", "客观", "冷峻", "理性", "批判性", "打假", "质检官", "事实核查"],
    ["幽默", "搞笑", "戏谑", "轻浮", "煽情", "情绪化", "夸张", "震惊体", "营销噱头", "娱乐风", "段子"]
  ],
  [
    "perspective",
    ["第一人称", "以我为主", "博主视角", "个人视角", "用我"],
    ["第三人称", "客观视角", "禁止第一人称", "严禁使用我", "不得用'我'", "禁用第一人称"]
  ],
  [
    "length",
    ["深度长文", "万字", "详尽长篇", "大篇幅", "长图文"],
    ["短平快", "极简短文", "百字", "碎片化", "微头条", "速读", "秒懂"]
  ],
  [
    "appearance",
    ["不露脸", "无真人", "严禁真人", "纯文字卡", "大字报", "文字排版"],
    ["真人出镜", "真人实拍", "必须露脸", "真人自拍", "出镜讲解", "真人形象"]
  ],
  [
    "emoji",
    ["严禁使用emoji", "禁止emoji", "不用emoji", "零emoji", "无emoji", "不加emoji"],
    ["大量使用emoji", "必须带emoji", "丰富emoji", "多用emoji", "emoji排版", "必须使用emoji"]
  ],
  [
    "monetization",
    ["纯公益", "不带货", "严禁商业变现", "零广告", "无转化"],
    ["带货变现", "强力转化", "嵌入cta", "必须挂车", "商业闭环"]
  ]
]);

export const CONTRADICTION_TOPICS = Object.freeze([
  "emoji",
  "表情包",
  "感叹号",
  "真人出镜",
  "露脸",
  "标题党",
  "营销词",
  "夸张",
  "口语化",
  "英文",
  "专业术语",
  "第一人称",
  "游戏风",
  "霓虹灯",
  "带货",
  "商业推广",
  "书单推荐"
]);

function hasProhibition(text, topic) {
  const p = new RegExp(`(?:严禁|禁止|拒绝|不要|不得|切忌|杜绝|禁绝|不能|严禁使用)\\s*(?:[^，。！？\\n;]{0,10})?${topic}`, "i");
  return p.test(text);
}

function hasRequirement(text, topic) {
  const p = new RegExp(`(?:必须|强制|务必|一定要|坚持|提倡|大量使用|采用|鼓励|要求)\\s*(?:[^，。！？\\n;]{0,10})?${topic}`, "i");
  return p.test(text);
}

function emitConflictEvent(item, conflictingIds, reason, options = {}) {
  try {
    emitLearningEvent({
      type: "LEARNING_CONFLICT",
      domain: item.domain || "general",
      actor: "system",
      subject: { kind: "memory", id: item.id },
      payload: {
        conflictingWith: conflictingIds,
        reason: reason || `Conflicting memory cards in domain '${item.domain || "general"}'`
      }
    }, options);
  } catch {
    // Graceful fallback if learning event store is unavailable
  }
}

export function detectMemoryConflict(item, existingItems = []) {
  if (!item || !item.content) {
    return { hasConflict: false, conflictingIds: [], conflictingItems: [], reason: "" };
  }

  const conflictingIds = [];
  const conflictingItems = [];
  const reasons = [];

  const itemContent = String(item.content || "").toLowerCase();
  const itemTitle = String(item.title || "").toLowerCase();
  const itemDomain = String(item.domain || "general").toLowerCase();

  for (const other of existingItems) {
    if (!other || !other.id || other.id === item.id) continue;
    if (item.supersedes === other.id || other.supersedes === item.id) continue;
    if (other.supersededBy || other.status === "superseded" || other.status === "rejected") continue;

    const otherDomain = String(other.domain || "general").toLowerCase();
    const domainMatches = itemDomain === otherDomain || (itemDomain !== "general" && otherDomain !== "general" && item.type === other.type);

    const explicitConflict = (
      (Array.isArray(item.conflictWith) && item.conflictWith.includes(other.id)) ||
      (Array.isArray(item.conflictsWith) && item.conflictsWith.includes(other.id)) ||
      (Array.isArray(other.conflictWith) && other.conflictWith.includes(item.id)) ||
      (Array.isArray(other.conflictsWith) && other.conflictsWith.includes(item.id)) ||
      (item.conflictKey && other.conflictKey && item.conflictKey === other.conflictKey && item.content !== other.content)
    );

    if (explicitConflict) {
      conflictingIds.push(other.id);
      conflictingItems.push(other);
      reasons.push(`Explicit conflict with ${other.id}`);
      continue;
    }

    if (!domainMatches) continue;

    const otherContent = String(other.content || "").toLowerCase();
    const otherTitle = String(other.title || "").toLowerCase();

    let hasOpposition = false;
    let oppositionReason = "";

    for (const [groupName, clusterA, clusterB] of OPPOSITION_CLUSTERS) {
      const aInItem = clusterA.some((kw) => itemContent.includes(kw) || itemTitle.includes(kw));
      const bInItem = clusterB.some((kw) => itemContent.includes(kw) || itemTitle.includes(kw));
      const aInOther = clusterA.some((kw) => otherContent.includes(kw) || otherTitle.includes(kw));
      const bInOther = clusterB.some((kw) => otherContent.includes(kw) || otherTitle.includes(kw));

      if ((aInItem && bInOther) || (bInItem && aInOther)) {
        hasOpposition = true;
        oppositionReason = `Opposing ${groupName} directions in domain '${item.domain || "general"}'`;
        break;
      }
    }

    if (!hasOpposition) {
      for (const topic of CONTRADICTION_TOPICS) {
        const itemProhibits = hasProhibition(itemContent, topic) || hasProhibition(itemTitle, topic);
        const itemRequires = hasRequirement(itemContent, topic) || hasRequirement(itemTitle, topic);
        const otherProhibits = hasProhibition(otherContent, topic) || hasProhibition(otherTitle, topic);
        const otherRequires = hasRequirement(otherContent, topic) || hasRequirement(otherTitle, topic);

        if ((itemProhibits && otherRequires) || (itemRequires && otherProhibits)) {
          hasOpposition = true;
          oppositionReason = `Contradictory rule on '${topic}' in domain '${item.domain || "general"}'`;
          break;
        }
      }
    }

    if (hasOpposition) {
      conflictingIds.push(other.id);
      conflictingItems.push(other);
      reasons.push(oppositionReason);
    }
  }

  return {
    hasConflict: conflictingIds.length > 0,
    conflictingIds,
    conflictingItems,
    reason: reasons.join("; ")
  };
}

export function checkMemoryConflict(idOrItem, options = {}) {
  let item = null;
  if (typeof idOrItem === "string") {
    item = getMemory(idOrItem, options);
  } else if (idOrItem && typeof idOrItem === "object") {
    item = idOrItem;
  }
  if (!item) {
    return { hasConflict: false, conflictingIds: [], conflictingItems: [], reason: "" };
  }

  const existing = listActive({ includeTesting: true }, options);
  const result = detectMemoryConflict(item, existing);

  if (result.hasConflict) {
    emitConflictEvent(item, result.conflictingIds, result.reason, options);
  }

  return result;
}

export function createCandidate(input, options = {}) {
  if (!input || typeof input !== "object") {
    throw new Error("Candidate input must be an object");
  }

  const title = String(input.title || "").trim();
  const content = String(input.content || "").trim();
  if (!title || !content) {
    throw new Error("Memory candidate requires title and content");
  }

  assertNoSecrets(title);
  assertNoSecrets(content);

  const type = ALLOWED_TYPES.includes(input.type) ? input.type : "judgment";
  const sensitivity = ALLOWED_SENSITIVITY.includes(input.sensitivity) ? input.sensitivity : "medium";
  const license = ALLOWED_LICENSES.includes(input.license) ? input.license : "understand_only";
  
  let projectScope = ["*"];
  if (Array.isArray(input.projectScope) && input.projectScope.length > 0) {
    projectScope = input.projectScope.map(String).filter(Boolean);
  } else if (typeof input.projectScope === "string" && input.projectScope.trim()) {
    projectScope = input.projectScope.split(/[,，\s]+/).filter(Boolean);
  }
  if (!projectScope.length) projectScope = ["*"];

  const now = new Date().toISOString();
  const id = input.id || `mem-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;

  const candidate = {
    id,
    type,
    title,
    content,
    source: input.source || { kind: "manual_founder", ref: "", note: "" },
    sensitivity,
    license,
    projectScope,
    needsQuickReview: !!input.needsQuickReview,
    status: "candidate",
    domain: input.domain || "general",
    confidence: Number(input.confidence) || 0,
    evidenceCount: Number(input.evidenceCount) || 0,
    sources: Array.isArray(input.sources) ? input.sources : [],
    trend: input.trend || "unknown",
    positiveExamples: Array.isArray(input.positiveExamples) ? input.positiveExamples : [],
    negativeExamples: Array.isArray(input.negativeExamples) ? input.negativeExamples : [],
    hasConflict: false,
    conflictWith: Array.isArray(input.conflictWith) ? input.conflictWith : (Array.isArray(input.conflictsWith) ? input.conflictsWith : []),
    conflictsWith: Array.isArray(input.conflictsWith) ? input.conflictsWith : (Array.isArray(input.conflictWith) ? input.conflictWith : []),
    conflictKey: input.conflictKey || null,
    lastValidated: input.lastValidated || null,
    mutable: input.mutable !== false,
    version: Number(input.version) || 1,
    supersedes: input.supersedes || null,
    supersededBy: null,
    validFrom: input.validFrom || now,
    validTo: input.validTo || null,
    createdAt: now,
    updatedAt: now,
    confirmedAt: null,
    history: [
      {
        at: now,
        action: input.supersedes ? "proposed_update" : "created_candidate",
        reason: input.reason || "initial candidate proposal"
      }
    ]
  };

  fs.writeFileSync(candidateFile(id, options), JSON.stringify(candidate, null, 2), "utf8");
  return candidate;
}

export function listCandidates(options = {}) {
  const dir = getCandidatesDir(options);
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
    .filter(Boolean)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getMemory(id, options = {}) {
  try {
    validateId(id);
  } catch {
    return null;
  }
  const cPath = candidateFile(id, options);
  if (fs.existsSync(cPath)) {
    try {
      return JSON.parse(fs.readFileSync(cPath, "utf8"));
    } catch {
      return null;
    }
  }
  const iPath = itemFile(id, options);
  if (fs.existsSync(iPath)) {
    try {
      return JSON.parse(fs.readFileSync(iPath, "utf8"));
    } catch {
      return null;
    }
  }
  return null;
}

export function confirmCandidate(id, reasonOrOptions = {}, maybeOptions = {}) {
  let reason = "Confirmed by founder";
  let options = {};
  if (typeof reasonOrOptions === "string") {
    reason = reasonOrOptions;
    options = maybeOptions || {};
  } else if (reasonOrOptions && typeof reasonOrOptions === "object") {
    if (reasonOrOptions.reason) reason = reasonOrOptions.reason;
    options = { ...reasonOrOptions, ...(maybeOptions || {}) };
  }

  const cPath = candidateFile(id, options);
  if (!fs.existsSync(cPath)) {
    throw new Error(`Candidate memory ${id} not found`);
  }

  const candidate = JSON.parse(fs.readFileSync(cPath, "utf8"));
  if (candidate.status !== "candidate") {
    throw new Error(`Memory ${id} is not in candidate status`);
  }

  const now = new Date().toISOString();

  // Founder confirm enters TESTING, never directly to permanent ACTIVE.
  // Existing on-disk active cards are grandfathered; only new confirms use this path.
  const testingRecord = {
    ...candidate,
    status: "testing",
    confirmedAt: now,
    updatedAt: now,
    lastValidated: now,
    evidenceCount: Math.max(1, Number(candidate.evidenceCount) || 0),
    confidence: Math.max(Number(candidate.confidence) || 0, 0.33),
    sources: [...(candidate.sources || []), { at: now, action: "founder_confirm", reason }],
    history: [
      ...(candidate.history || []),
      {
        at: now,
        action: "confirmed_testing",
        reason
      }
    ]
  };

  // Check for conflicts before quarantining in testing
  const existing = listActive({ includeTesting: true }, options);
  const conflictResult = detectMemoryConflict(testingRecord, existing);
  if (conflictResult.hasConflict) {
    testingRecord.hasConflict = true;
    testingRecord.conflictsWith = conflictResult.conflictingIds;
    testingRecord.conflictWith = conflictResult.conflictingIds;
    emitConflictEvent(testingRecord, conflictResult.conflictingIds, conflictResult.reason, options);
  } else {
    testingRecord.hasConflict = false;
    testingRecord.conflictsWith = [];
    testingRecord.conflictWith = [];
  }

  fs.writeFileSync(itemFile(id, options), JSON.stringify(testingRecord, null, 2), "utf8");
  try {
    fs.unlinkSync(cPath);
  } catch {}

  return testingRecord;
}

function supersedeItem(oldId, newId, reason, now, options = {}) {
  const oldPath = itemFile(oldId, options);
  if (!fs.existsSync(oldPath)) return;
  const oldItem = JSON.parse(fs.readFileSync(oldPath, "utf8"));
  oldItem.status = "superseded";
  oldItem.supersededBy = newId;
  oldItem.validTo = now;
  oldItem.updatedAt = now;
  oldItem.history = oldItem.history || [];
  oldItem.history.push({
    at: now,
    action: "superseded",
    reason: `Superseded by ${newId}: ${reason}`
  });
  fs.writeFileSync(oldPath, JSON.stringify(oldItem, null, 2), "utf8");
}

export function addEvidence(id, input = {}, options = {}) {
  const opts = {
    ...(options || {}),
    ...(input.baseDir ? { baseDir: input.baseDir } : {}),
    ...(input.memoryDir ? { memoryDir: input.memoryDir } : {})
  };
  const current = getMemory(id, opts);
  if (!current) throw new Error(`Memory ${id} not found`);
  if (!["testing", "active", "declining"].includes(current.status)) {
    throw new Error(`Cannot add evidence to memory in status ${current.status}`);
  }

  const positive = input.positive !== false;
  const source = input.source || "";
  const exampleRef = input.exampleRef || "";
  const note = input.note || "";

  const now = new Date().toISOString();
  const nextCount = (Number(current.evidenceCount) || 0) + 1;
  const examplesKey = positive ? "positiveExamples" : "negativeExamples";
  const examples = [...(current[examplesKey] || [])];
  if (exampleRef || note) {
    examples.push({ ref: exampleRef || source, note, at: now });
  }

  let confidence = Number(current.confidence) || 0;
  confidence = positive
    ? Math.min(1, confidence + 0.22)
    : Math.max(0, confidence - 0.22);
  confidence = Math.round(confidence * 100) / 100;

  let status = current.status;
  let trend = current.trend || "unknown";
  if (positive) trend = confidence >= 0.7 ? "rising" : "stable";
  else trend = "falling";

  // Negative feedback demotion: drops < 0.40 demote to declining
  if (!positive && (status === "active" || status === "testing") && confidence < 0.4) {
    status = "declining";
  }

  // Conflict detection check
  const existing = listActive({ includeTesting: true }, opts);
  const conflictResult = detectMemoryConflict(current, existing);
  const hasConflict = conflictResult.hasConflict;

  if (hasConflict) {
    emitConflictEvent(current, conflictResult.conflictingIds, conflictResult.reason, opts);
  }

  let historyAction = positive ? "evidence_positive" : "evidence_negative";
  let historyReason = note || source;

  // Escalation to active: Only when status === "testing" && positive && nextCount >= 3 && confidence >= 0.70 && !hasConflict
  if (status === "testing" && positive && nextCount >= 3 && confidence >= 0.7) {
    if (!hasConflict) {
      status = "active";
      if (current.supersedes) {
        supersedeItem(current.supersedes, id, note || "evidence threshold", now, opts);
      }
    } else {
      // Quarantined in testing
      status = "testing";
      historyAction = "promotion_blocked_by_conflict";
      historyReason = `Quarantined in testing: conflict with ${conflictResult.conflictingIds.join(", ")}`;
    }
  }

  const updated = {
    ...current,
    status,
    hasConflict,
    conflictsWith: conflictResult.conflictingIds,
    conflictWith: conflictResult.conflictingIds,
    evidenceCount: nextCount,
    confidence,
    trend,
    lastValidated: now,
    updatedAt: now,
    sources: [...(current.sources || []), source].filter(Boolean),
    [examplesKey]: examples,
    history: [
      ...(current.history || []),
      { at: now, action: historyAction, reason: historyReason }
    ]
  };

  const dest = updated.status === "candidate" ? candidateFile(id, opts) : itemFile(id, opts);
  fs.writeFileSync(dest, JSON.stringify(updated, null, 2), "utf8");
  return updated;
}

export function rejectCandidate(id, reasonOrOptions = {}, maybeOptions = {}) {
  let reason = "Rejected by founder";
  let options = {};
  if (typeof reasonOrOptions === "string") {
    reason = reasonOrOptions;
    options = maybeOptions || {};
  } else if (reasonOrOptions && typeof reasonOrOptions === "object") {
    if (reasonOrOptions.reason) reason = reasonOrOptions.reason;
    options = { ...reasonOrOptions, ...(maybeOptions || {}) };
  }

  const cPath = candidateFile(id, options);
  if (!fs.existsSync(cPath)) {
    throw new Error(`Candidate memory ${id} not found`);
  }

  const candidate = JSON.parse(fs.readFileSync(cPath, "utf8"));
  if (candidate.status !== "candidate") {
    throw new Error(`Memory ${id} is not in candidate status`);
  }

  const now = new Date().toISOString();
  const rejectedRecord = {
    ...candidate,
    status: "rejected",
    updatedAt: now,
    history: [
      ...(candidate.history || []),
      {
        at: now,
        action: "rejected",
        reason
      }
    ]
  };

  fs.writeFileSync(itemFile(id, options), JSON.stringify(rejectedRecord, null, 2), "utf8");
  try {
    fs.unlinkSync(cPath);
  } catch {}

  return rejectedRecord;
}

export function listActive({ project, domain, includeTesting = false } = {}, options = {}) {
  const dir = getItemsDir(options);
  if (!fs.existsSync(dir)) return [];
  const nowTime = Date.now();
  const allowed = includeTesting ? new Set(["active", "testing"]) : new Set(["active"]);

  const items = fs.readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .map((n) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, n), "utf8"));
      } catch {
        return null;
      }
    })
    .filter((m) => m && allowed.has(m.status))
    .filter((m) => {
      if (m.validTo) {
        const toTime = new Date(m.validTo).getTime();
        if (!isNaN(toTime) && toTime <= nowTime) return false;
      }
      return true;
    });

  let filtered = project
    ? items.filter((m) => {
        const scopes = Array.isArray(m.projectScope) ? m.projectScope : ["*"];
        return scopes.includes("*") || scopes.includes(project) || scopes.some((s) => project.includes(s));
      })
    : items;

  if (domain && domain !== "*") {
    filtered = filtered.filter((m) => !m.domain || m.domain === domain || m.domain === "general");
  }

  return filtered.sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
}

export function proposeUpdate(id, patch = {}, options = {}) {
  const current = getMemory(id, options);
  if (!current) {
    throw new Error(`Active memory ${id} not found`);
  }
  if (!["active", "testing"].includes(current.status)) {
    throw new Error(`Can only propose updates on active or testing memories, current status: ${current.status}`);
  }

  const title = patch.title !== undefined ? String(patch.title).trim() : current.title;
  const content = patch.content !== undefined ? String(patch.content).trim() : current.content;

  assertNoSecrets(title);
  assertNoSecrets(content);

  const candidate = createCandidate({
    title,
    content,
    type: patch.type || current.type,
    sensitivity: patch.sensitivity || current.sensitivity,
    license: patch.license || current.license,
    projectScope: patch.projectScope || current.projectScope,
    domain: patch.domain || current.domain || "general",
    source: patch.source || { kind: "update_proposal", ref: id, note: patch.reason || `Update for ${id}` },
    version: (current.version || 1) + 1,
    supersedes: current.id,
    reason: patch.reason || `Proposing update from version ${current.version || 1}`
  }, options);

  return candidate;
}
