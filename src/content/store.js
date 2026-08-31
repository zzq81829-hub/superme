import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { getMemory, listActive } from "../memory/store.js";
import { buildXiaohongshuLayoutPlan, normalizeXiaohongshuLayout } from "./xiaohongshuLayout.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..", "..");

const defaultPackagesDir = path.join(root, "data", "content", "packages");

export const ALLOWED_STATUSES = [
  "draft",
  "frozen",
  "awaiting_approval",
  "approved",
  "revoked",
  "ready_manual"
];

export const ALLOWED_USAGES = ["none", "influence", "quote"];

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function getPackagesDir(options = {}) {
  const dir = options.baseDir || defaultPackagesDir;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function packageFilePath(id, options = {}) {
  if (!/^[a-zA-Z0-9_-]+$/.test(String(id))) {
    throw new Error(`Invalid package id: ${id}`);
  }
  return path.join(getPackagesDir(options), `${id}.json`);
}

// Compute stable 16-hex sha256 of all public and core content payload elements
export function computeContentPackageHash(pkg) {
  if (!pkg || typeof pkg !== "object") return "";

  // Normalize layers
  const facts = (pkg.layers?.facts || []).map((f) => ({
    text: String(f.text || "").trim(),
    source: String(f.source || "").trim()
  }));

  const expressions = (pkg.layers?.expressions || []).map((e) => ({
    text: String(e.text || "").trim()
  }));

  const viewpoints = (pkg.layers?.viewpoints || []).map((v) => ({
    memoryId: v.memoryId || null,
    title: String(v.title || "").trim(),
    content: String(v.content || "").trim(),
    license: v.license || "understand_only",
    usage: v.usage || "none",
    public: !!v.public
  }));

  const usedViewpoints = (pkg.usedViewpoints || []).map((v) => ({
    memoryId: v.memoryId || null,
    title: String(v.title || "").trim(),
    license: v.license || "understand_only",
    usage: v.usage || "none",
    public: !!v.public
  }));

  const media = (pkg.media || []).map((m) => ({
    kind: m.kind || "image",
    path: String(m.path || "").trim()
  }));

  const links = (pkg.links || []).map(String).map((l) => l.trim()).filter(Boolean);

  const payload = {
    project: String(pkg.project || "shuzhai").trim(),
    platform: String(pkg.platform || "xiaohongshu").trim(),
    title: String(pkg.title || "").trim(),
    body: String(pkg.body || "").trim(),
    media,
    links,
    scheduledAt: pkg.scheduledAt || null,
    layout: pkg.layout || null,
    layers: { facts, expressions, viewpoints },
    usedViewpoints
  };

  const jsonStr = stableStringify(payload);
  return crypto.createHash("sha256").update(jsonStr, "utf8").digest("hex").slice(0, 16);
}

// Validate viewpoint licenses and public exposure constraints
export function validatePackageLicenses(pkg) {
  if (!pkg || typeof pkg !== "object") {
    throw new Error("Invalid content package object");
  }

  const viewpoints = pkg.layers?.viewpoints || [];
  const usedViewpoints = pkg.usedViewpoints || [];

  for (const vp of viewpoints) {
    const license = vp.license || "understand_only";
    const usage = vp.usage || "none";
    const isPublic = !!vp.public;

    if (!ALLOWED_USAGES.includes(usage)) {
      throw new Error(`Invalid viewpoint usage: ${usage}`);
    }

    // Constraint 1: understand_only must NEVER be public or quoted
    if (license === "understand_only") {
      if (isPublic) {
        throw new Error(`Viewpoint '${vp.title || vp.id}' with license 'understand_only' cannot be marked public.`);
      }
      if (usage === "quote") {
        throw new Error(`Viewpoint '${vp.title || vp.id}' with license 'understand_only' cannot be quoted directly.`);
      }
    }

    // Constraint 2: influence_or_paraphrase cannot be claimed as direct quote
    if (license === "influence_or_paraphrase") {
      if (usage === "quote") {
        throw new Error(`Viewpoint '${vp.title || vp.id}' with license 'influence_or_paraphrase' cannot be used as direct quote.`);
      }
    }

    // Constraint 3: attributable allows quote and public
  }

  // Check usedViewpoints consistency
  for (const uv of usedViewpoints) {
    if (uv.license === "understand_only" && uv.public) {
      throw new Error(`usedViewpoint '${uv.title || uv.id}' with license 'understand_only' cannot be public.`);
    }
  }

  return true;
}

// Helper to snapshot active memories into package viewpoints
export function snapshotViewpointsFromMemory(memoryIds = [], existingViewpoints = []) {
  const result = [...existingViewpoints];

  for (const mid of memoryIds) {
    if (!mid) continue;
    // Check if already in list
    if (result.some((v) => v.memoryId === mid || v.id === mid)) continue;

    const mem = getMemory(mid);
    if (!mem) {
      throw new Error(`Memory ${mid} not found.`);
    }
    if (mem.status !== "active") {
      throw new Error(`Memory ${mid} is not active (status: ${mem.status}). Unconfirmed memories cannot be used in content packages.`);
    }

    result.push({
      id: `vp-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`,
      memoryId: mem.id,
      title: mem.title,
      content: mem.content,
      license: mem.license || "understand_only",
      usage: "influence",
      public: mem.license === "attributable"
    });
  }

  return result;
}

export function createPackage(input = {}, options = {}) {
  if (!input || typeof input !== "object") {
    throw new Error("Content package input must be an object");
  }

  const now = new Date().toISOString();
  const id = input.id || `pkg-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const project = String(input.project || "shuzhai").trim();
  const platform = String(input.platform || "xiaohongshu").trim();
  const title = String(input.title || "").trim();
  const body = String(input.body || "").trim();
  const scheduledAt = input.scheduledAt || null;
  const layout = normalizeXiaohongshuLayout(input.layout, { platform });

  // Resolve layers
  const facts = Array.isArray(input.layers?.facts) ? input.layers.facts : [];
  const expressions = Array.isArray(input.layers?.expressions) ? input.layers.expressions : [];
  
  let viewpoints = Array.isArray(input.layers?.viewpoints) ? input.layers.viewpoints : [];
  if (Array.isArray(input.memoryIds) && input.memoryIds.length > 0) {
    viewpoints = snapshotViewpointsFromMemory(input.memoryIds, viewpoints);
  }

  // Compute usedViewpoints (viewpoints with usage !== 'none')
  const usedViewpoints = viewpoints
    .filter((v) => v.usage && v.usage !== "none")
    .map((v) => ({
      id: v.id,
      memoryId: v.memoryId || null,
      title: v.title,
      license: v.license,
      usage: v.usage,
      public: !!v.public
    }));

  const pkg = {
    id,
    project,
    platform,
    status: "draft",
    title,
    body,
    layout,
    media: Array.isArray(input.media) ? input.media : [],
    links: Array.isArray(input.links) ? input.links : [],
    scheduledAt,
    layers: {
      facts,
      expressions,
      viewpoints
    },
    usedViewpoints,
    payloadHash: "",
    approvalStatus: "not_required",
    approvedAt: null,
    approvedHash: null,
    createdAt: now,
    updatedAt: now,
    frozenAt: null
  };

  pkg.payloadHash = computeContentPackageHash(pkg);

  const file = packageFilePath(id, options);
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2), "utf8");
  return pkg;
}

export function getPackage(id, options = {}) {
  try {
    const file = packageFilePath(id, options);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function listPackages(options = {}) {
  const dir = getPackagesDir(options);
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
}

export function updatePackage(id, patch = {}, options = {}) {
  const pkg = getPackage(id, options);
  if (!pkg) {
    throw new Error(`Content package ${id} not found`);
  }

  const now = new Date().toISOString();
  const oldHash = pkg.payloadHash;

  if (patch.project !== undefined) pkg.project = String(patch.project).trim();
  if (patch.platform !== undefined) {
    pkg.platform = String(patch.platform).trim();
    if (patch.layout === undefined) {
      pkg.layout = normalizeXiaohongshuLayout(pkg.layout, { platform: pkg.platform });
    }
  }
  if (patch.title !== undefined) pkg.title = String(patch.title).trim();
  if (patch.body !== undefined) pkg.body = String(patch.body).trim();
  if (patch.layout !== undefined) pkg.layout = normalizeXiaohongshuLayout(patch.layout, { platform: patch.platform ?? pkg.platform });
  if (patch.media !== undefined && Array.isArray(patch.media)) pkg.media = patch.media;
  if (patch.links !== undefined && Array.isArray(patch.links)) pkg.links = patch.links;
  if (patch.scheduledAt !== undefined) pkg.scheduledAt = patch.scheduledAt || null;

  if (patch.layers) {
    if (Array.isArray(patch.layers.facts)) pkg.layers.facts = patch.layers.facts;
    if (Array.isArray(patch.layers.expressions)) pkg.layers.expressions = patch.layers.expressions;
    if (Array.isArray(patch.layers.viewpoints)) pkg.layers.viewpoints = patch.layers.viewpoints;
  }

  if (Array.isArray(patch.memoryIds) && patch.memoryIds.length > 0) {
    pkg.layers.viewpoints = snapshotViewpointsFromMemory(patch.memoryIds, pkg.layers.viewpoints);
  }

  // Re-sync usedViewpoints
  pkg.usedViewpoints = (pkg.layers.viewpoints || [])
    .filter((v) => v.usage && v.usage !== "none")
    .map((v) => ({
      id: v.id,
      memoryId: v.memoryId || null,
      title: v.title,
      license: v.license,
      usage: v.usage,
      public: !!v.public
    }));

  const newHash = computeContentPackageHash(pkg);
  pkg.payloadHash = newHash;
  pkg.updatedAt = now;

  // Invalidate approval if hash changed and was frozen/approved
  if (oldHash && oldHash !== newHash && ["frozen", "awaiting_approval", "approved", "ready_manual"].includes(pkg.status)) {
    pkg.status = "draft";
    pkg.approvalStatus = "revoked";
    pkg.approvedAt = null;
    pkg.approvedHash = null;
  }

  const file = packageFilePath(id, options);
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2), "utf8");
  return pkg;
}

export function freezePackage(id, options = {}) {
  const pkg = getPackage(id, options);
  if (!pkg) {
    throw new Error(`Content package ${id} not found`);
  }

  if (!pkg.title || !pkg.body || !pkg.platform) {
    throw new Error("Cannot freeze package: title, body, and platform are required.");
  }

  // Persist the resolved Xiaohongshu default before computing the approval hash.
  // This keeps legacy drafts from being approved with an implicit, mutable template.
  if (pkg.platform === "xiaohongshu") {
    pkg.layout = normalizeXiaohongshuLayout(pkg.layout, { platform: pkg.platform });
  }

  // Validate licenses before freeze
  validatePackageLicenses(pkg);

  const now = new Date().toISOString();
  pkg.payloadHash = computeContentPackageHash(pkg);
  pkg.status = "awaiting_approval";
  pkg.approvalStatus = "pending";
  pkg.frozenAt = now;
  pkg.updatedAt = now;

  const file = packageFilePath(id, options);
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2), "utf8");
  return pkg;
}

export function approvePackage(id, options = {}) {
  const pkg = getPackage(id, options);
  if (!pkg) {
    throw new Error(`Content package ${id} not found`);
  }

  if (pkg.status !== "awaiting_approval" && pkg.status !== "frozen") {
    throw new Error(`Cannot approve package in '${pkg.status}' status. Package must be frozen/awaiting_approval.`);
  }

  // Validate licenses and hash consistency
  validatePackageLicenses(pkg);
  const currentHash = computeContentPackageHash(pkg);
  if (pkg.payloadHash !== currentHash) {
    throw new Error("Package payload hash mismatch. Content was modified since freezing; please re-freeze.");
  }

  const now = new Date().toISOString();
  pkg.status = "approved";
  pkg.approvalStatus = "approved";
  pkg.approvedAt = now;
  pkg.approvedHash = currentHash;
  pkg.updatedAt = now;

  const file = packageFilePath(id, options);
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2), "utf8");
  return pkg;
}

export function rejectPackage(id, { reason = "Founder rejected publishing package" } = {}, options = {}) {
  const pkg = getPackage(id, options);
  if (!pkg) {
    throw new Error(`Content package ${id} not found`);
  }

  const now = new Date().toISOString();
  pkg.status = "revoked";
  pkg.approvalStatus = "revoked";
  pkg.approvedAt = null;
  pkg.approvedHash = null;
  pkg.updatedAt = now;
  pkg.rejectionReason = reason;

  const file = packageFilePath(id, options);
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2), "utf8");
  return pkg;
}

export function markReadyManual(id, options = {}) {
  const pkg = getPackage(id, options);
  if (!pkg) {
    throw new Error(`Content package ${id} not found`);
  }

  if (pkg.status !== "approved" || pkg.approvalStatus !== "approved") {
    throw new Error(`Cannot mark ready: package must be approved first (current status: ${pkg.status}, approval: ${pkg.approvalStatus}).`);
  }

  const currentHash = computeContentPackageHash(pkg);
  if (pkg.approvedHash !== currentHash) {
    throw new Error("Approved hash mismatch. Content was modified after approval; re-approval required.");
  }

  const now = new Date().toISOString();
  pkg.status = "ready_manual";
  pkg.updatedAt = now;

  const file = packageFilePath(id, options);
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2), "utf8");
  return pkg;
}

export function generatePackagePreview(idOrPkg, options = {}) {
  const pkg = typeof idOrPkg === "object" ? idOrPkg : getPackage(idOrPkg, options);
  if (!pkg) {
    throw new Error(`Content package not found`);
  }

  const currentHash = computeContentPackageHash(pkg);
  const publicViewpoints = (pkg.usedViewpoints || []).filter((v) => v.public && v.license !== "understand_only");

  return {
    id: pkg.id,
    project: pkg.project,
    platform: pkg.platform,
    status: pkg.status,
    approvalStatus: pkg.approvalStatus,
    scheduledAt: pkg.scheduledAt,
    frozenAt: pkg.frozenAt,
    approvedAt: pkg.approvedAt,
    publicFacing: {
      title: pkg.title,
      body: pkg.body,
      media: pkg.media || [],
      links: pkg.links || [],
      layoutPlan: buildXiaohongshuLayoutPlan(pkg),
      publicViewpoints
    },
    layers: {
      facts: pkg.layers?.facts || [],
      expressions: pkg.layers?.expressions || [],
      viewpoints: (pkg.layers?.viewpoints || []).map((v) => ({
        id: v.id,
        memoryId: v.memoryId,
        title: v.title,
        content: v.content,
        license: v.license,
        usage: v.usage,
        public: !!v.public,
        exposedToPublic: v.public && v.license !== "understand_only"
      }))
    },
    integrity: {
      payloadHash: pkg.payloadHash,
      approvedHash: pkg.approvedHash,
      currentHash,
      isHashValid: pkg.payloadHash === currentHash,
      isApprovedHashMatch: pkg.approvedHash === currentHash
    }
  };
}

export const createDraft = createPackage;
export const freeze = freezePackage;
export const approve = approvePackage;
