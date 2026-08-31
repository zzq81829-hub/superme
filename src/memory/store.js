import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..", "..");

const defaultMemoryDir = path.join(root, "data", "memory");

export function getMemoryDir(options = {}) {
  const dir = options.baseDir || process.env.MEMORY_BASE_DIR || defaultMemoryDir;
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
    /api[_-]?key\s*[:=]\s*['"]?[a-zA-Z0-9_-]{16,}['"]?/i,
    /sk-[a-zA-Z0-9]{20,}/i,
    /bearer\s+[a-zA-Z0-9_\-\.]{20,}/i,
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

export function createCandidate(input) {
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

  fs.writeFileSync(candidateFile(id), JSON.stringify(candidate, null, 2), "utf8");
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

export function getMemory(id) {
  try {
    validateId(id);
  } catch {
    return null;
  }
  const cPath = candidateFile(id);
  if (fs.existsSync(cPath)) {
    try {
      return JSON.parse(fs.readFileSync(cPath, "utf8"));
    } catch {
      return null;
    }
  }
  const iPath = itemFile(id);
  if (fs.existsSync(iPath)) {
    try {
      return JSON.parse(fs.readFileSync(iPath, "utf8"));
    } catch {
      return null;
    }
  }
  return null;
}

export function confirmCandidate(id, { reason = "Confirmed by founder" } = {}) {
  const cPath = candidateFile(id);
  if (!fs.existsSync(cPath)) {
    throw new Error(`Candidate memory ${id} not found`);
  }

  const candidate = JSON.parse(fs.readFileSync(cPath, "utf8"));
  if (candidate.status !== "candidate") {
    throw new Error(`Memory ${id} is not in candidate status`);
  }

  const now = new Date().toISOString();

  // If this candidate supersedes an existing active memory
  if (candidate.supersedes) {
    const oldPath = itemFile(candidate.supersedes);
    if (fs.existsSync(oldPath)) {
      const oldItem = JSON.parse(fs.readFileSync(oldPath, "utf8"));
      oldItem.status = "superseded";
      oldItem.supersededBy = candidate.id;
      oldItem.validTo = now;
      oldItem.updatedAt = now;
      oldItem.history = oldItem.history || [];
      oldItem.history.push({
        at: now,
        action: "superseded",
        reason: `Superseded by version ${candidate.version} (${candidate.id}): ${reason}`
      });
      fs.writeFileSync(oldPath, JSON.stringify(oldItem, null, 2), "utf8");
    }
  }

  // Promote candidate to active item
  const activeRecord = {
    ...candidate,
    status: "active",
    confirmedAt: now,
    updatedAt: now,
    history: [
      ...(candidate.history || []),
      {
        at: now,
        action: "confirmed",
        reason
      }
    ]
  };

  fs.writeFileSync(itemFile(id), JSON.stringify(activeRecord, null, 2), "utf8");
  try {
    fs.unlinkSync(cPath);
  } catch {}

  return activeRecord;
}

export function rejectCandidate(id, { reason = "Rejected by founder" } = {}) {
  const cPath = candidateFile(id);
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

  fs.writeFileSync(itemFile(id), JSON.stringify(rejectedRecord, null, 2), "utf8");
  try {
    fs.unlinkSync(cPath);
  } catch {}

  return rejectedRecord;
}

export function listActive({ project } = {}, options = {}) {
  const dir = getItemsDir(options);
  if (!fs.existsSync(dir)) return [];
  const nowTime = Date.now();

  const items = fs.readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .map((n) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, n), "utf8"));
      } catch {
        return null;
      }
    })
    .filter((m) => m && m.status === "active")
    .filter((m) => {
      if (m.validTo) {
        const toTime = new Date(m.validTo).getTime();
        if (!isNaN(toTime) && toTime <= nowTime) return false;
      }
      return true;
    });

  const filtered = project
    ? items.filter((m) => {
        const scopes = Array.isArray(m.projectScope) ? m.projectScope : ["*"];
        return scopes.includes("*") || scopes.includes(project) || scopes.some((s) => project.includes(s));
      })
    : items;

  return filtered.sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
}

export function proposeUpdate(id, patch = {}) {
  const current = getMemory(id);
  if (!current) {
    throw new Error(`Active memory ${id} not found`);
  }
  if (current.status !== "active") {
    throw new Error(`Can only propose updates on active memories, current status: ${current.status}`);
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
    source: patch.source || { kind: "update_proposal", ref: id, note: patch.reason || `Update for ${id}` },
    version: (current.version || 1) + 1,
    supersedes: current.id,
    reason: patch.reason || `Proposing update from version ${current.version || 1}`
  });

  return candidate;
}
