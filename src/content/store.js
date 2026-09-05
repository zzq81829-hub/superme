import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { getMemory, listActive } from "../memory/store.js";
import { buildXiaohongshuLayoutPlan, normalizeXiaohongshuLayout } from "./xiaohongshuLayout.js";
import { syncFromContentPackage } from "../files/registry.js";
import { allowPackageDelivery, markDeliverySent, revokePackageDelivery } from "../delivery/outbox.js";

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
  "ready_manual",
  "published"
];

export const ALLOWED_USAGES = ["none", "influence", "quote"];

export class PipelineRoutingError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "PipelineRoutingError";
    this.code = "PIPELINE_ROUTING_ERROR";
    this.details = details;
  }
}

export const KNOWN_ACCOUNTS = {
  shuzhai: { id: "shuzhai", accountId: "xhs_account_1", canonicalId: "shuzhai", name: "good try", pipeline: "shuzhai", profileDir: "xhs_account_1" },
  xhs_account_1: { id: "shuzhai", accountId: "xhs_account_1", canonicalId: "shuzhai", name: "good try", pipeline: "shuzhai", profileDir: "xhs_account_1" },
  "good try": { id: "shuzhai", accountId: "xhs_account_1", canonicalId: "shuzhai", name: "good try", pipeline: "shuzhai", profileDir: "xhs_account_1" },
  "good_try": { id: "shuzhai", accountId: "xhs_account_1", canonicalId: "shuzhai", name: "good try", pipeline: "shuzhai", profileDir: "xhs_account_1" },

  x_curation: { id: "x_curation", accountId: "xhs_account_2", canonicalId: "x_curation", name: "Gold chance", pipeline: "x_curation", profileDir: "xhs_account_2" },
  xhs_account_2: { id: "x_curation", accountId: "xhs_account_2", canonicalId: "x_curation", name: "Gold chance", pipeline: "x_curation", profileDir: "xhs_account_2" },
  "gold chance": { id: "x_curation", accountId: "xhs_account_2", canonicalId: "x_curation", name: "Gold chance", pipeline: "x_curation", profileDir: "xhs_account_2" },
  "gold_chance": { id: "x_curation", accountId: "xhs_account_2", canonicalId: "x_curation", name: "Gold chance", pipeline: "x_curation", profileDir: "xhs_account_2" },

  personal_ip: { id: "personal_ip", accountId: "xhs_account_3", canonicalId: "personal_ip", name: "枳子8", pipeline: "personal_ip", profileDir: "xhs_account_3" },
  xhs_account_3: { id: "personal_ip", accountId: "xhs_account_3", canonicalId: "personal_ip", name: "枳子8", pipeline: "personal_ip", profileDir: "xhs_account_3" },
  "枳子8": { id: "personal_ip", accountId: "xhs_account_3", canonicalId: "personal_ip", name: "枳子8", pipeline: "personal_ip", profileDir: "xhs_account_3" }
};

export function normalizeAccountIdentifier(account) {
  if (!account) return null;
  const s = String(account).trim().toLowerCase();
  if (KNOWN_ACCOUNTS[s]) return KNOWN_ACCOUNTS[s];
  const raw = String(account).trim();
  if (KNOWN_ACCOUNTS[raw]) return KNOWN_ACCOUNTS[raw];
  return { id: s, accountId: s, canonicalId: s, name: s, pipeline: s, profileDir: s, isCustom: true };
}

export function detectXCurationMarkers(pkg = {}) {
  const violations = [];

  if (pkg.project === "x_curation" || pkg.pipeline === "x_curation") {
    violations.push("project is marked as 'x_curation'");
  }

  const textToCheck = [
    pkg.title || "",
    pkg.body || "",
    ...(pkg.layers?.facts || []).map((f) => f.text || ""),
    ...(pkg.layers?.expressions || []).map((e) => e.text || "")
  ].join("\n");

  const badgeMatch = textToCheck.match(/[✅⚠️❌]|基本靠谱|科学依据充分|因果夸大|偷换概念|包装过头|证据没那么强|纯属营销噱头|营销噱头|伪科学/);
  if (badgeMatch) {
    violations.push(`contains feasibility badge/label ('${badgeMatch[0]}') in text`);
  }

  if (Array.isArray(pkg.feasibilityRatings) && pkg.feasibilityRatings.length > 0) {
    violations.push(`contains feasibilityRatings (${pkg.feasibilityRatings.length} items)`);
  }
  if (pkg.feasibilityScreening) {
    violations.push("contains feasibilityScreening structure");
  }

  if (Array.isArray(pkg.rawClaims) && pkg.rawClaims.length > 0) {
    violations.push(`contains rawClaims (${pkg.rawClaims.length} items)`);
  }
  if (Array.isArray(pkg.claims) && pkg.claims.length > 0) {
    violations.push(`contains claims (${pkg.claims.length} items)`);
  }

  if (pkg.authorPinnedComment) {
    violations.push("contains authorPinnedComment curation asset");
  }

  if (pkg.visualCard) {
    if (pkg.visualCard.theme === "dark" || pkg.visualCard.type === "x_tweet" || /tweet|twitter|x_curation/i.test(pkg.visualCard.path || "")) {
      violations.push("contains X curation dark visualCard");
    }
  }

  const media = Array.isArray(pkg.media) ? pkg.media : [];
  for (const m of media) {
    const p = String(m.path || "");
    const k = String(m.kind || "");
    const theme = String(m.theme || "");
    const src = String(m.source || "");
    if (/tweet|twitter|x_curation|x-curation|x_card|x-card|tweet_screenshot|tweet_visual|original_tweet|x_visual/i.test(p) ||
        /tweet|twitter|x_curation/i.test(k) ||
        /twitter/i.test(src) ||
        (theme === "dark" && /tweet/i.test(p))) {
      violations.push(`media contains X tweet asset: '${p || k}'`);
      break;
    }
  }

  const links = Array.isArray(pkg.links) ? pkg.links : [];
  for (const l of links) {
    if (/x\.com|twitter\.com|twitter-thread\.com/i.test(String(l))) {
      violations.push(`links contains X/Twitter URL: '${l}'`);
      break;
    }
  }

  if (pkg.originalTweet || pkg.tweetInput || pkg.tweetUrl || pkg.tweet) {
    violations.push("contains original tweet data references");
  }

  return {
    isXCuration: violations.length > 0,
    violations
  };
}

export function detectShuzhaiLayoutMarkers(pkg = {}) {
  const violations = [];

  const templateId = pkg.layout?.templateId || "";
  if (templateId === "shuzhai-editorial-v1" || templateId === "shuzhai-card-standard-v1" || /^shuzhai-/i.test(templateId)) {
    violations.push(`uses Shuzhai book template '${templateId}'`);
  }

  const kicker = pkg.layoutPlan?.kicker || pkg.layout?.kicker || "";
  if (/SHUZHAI|READING NOTES|书斋/i.test(String(kicker))) {
    violations.push(`contains Shuzhai reading kicker '${kicker}'`);
  }

  const media = Array.isArray(pkg.media) ? pkg.media : [];
  for (const m of media) {
    const p = String(m.path || "");
    if (/shuzhai|社科书籍号|小红书图文_快与慢|book_card|读书卡/i.test(p)) {
      violations.push(`media contains Shuzhai book card path: '${p}'`);
      break;
    }
  }

  const facts = pkg.layers?.facts || [];
  for (const f of facts) {
    const text = String(f.text || f.source || "");
    if (/《[^》]+》/.test(text)) {
      violations.push(`contains book citations in facts ('${text}')`);
      break;
    }
  }

  if (pkg.project === "shuzhai" || pkg.pipeline === "shuzhai") {
    violations.push("project is marked as 'shuzhai'");
  }

  return {
    isShuzhai: violations.length > 0,
    violations
  };
}

export function hasXCurationAssets(pkg = {}) {
  if (pkg.visualCard) return true;
  if (Array.isArray(pkg.feasibilityRatings) && pkg.feasibilityRatings.length > 0) return true;
  if (pkg.feasibilityScreening) return true;
  if (pkg.authorPinnedComment) return true;
  if (pkg.originalTweet || pkg.tweetInput || pkg.tweetUrl || pkg.tweet) return true;
  const media = Array.isArray(pkg.media) ? pkg.media : [];
  if (media.some((m) => /tweet|twitter|x_curation|x-curation|x_card|x-card|tweet_screenshot|tweet_visual|original_tweet|x_visual/i.test(m.path || ""))) {
    return true;
  }
  const text = `${pkg.title || ""} ${pkg.body || ""}`;
  if (/[✅⚠️❌]/.test(text)) return true;
  return false;
}

export function validateAccountPipelineIsolation(pkg, targetAccount, options = {}) {
  if (!pkg || typeof pkg !== "object") {
    throw new PipelineRoutingError("Invalid content package: package must be an object");
  }

  const targetIdentifier = targetAccount && typeof targetAccount === "object"
    ? (targetAccount.profileDir || targetAccount.profile_dir || targetAccount.id || targetAccount.accountId)
    : targetAccount;

  const rawAccount = targetIdentifier || pkg.accountId || pkg.experiment?.accountId || pkg.project;
  const normalized = normalizeAccountIdentifier(rawAccount);

  if (pkg.accountId && String(pkg.accountId).startsWith("xhs_account_") && normalizeAccountIdentifier(pkg.accountId)?.isCustom) {
    throw new PipelineRoutingError(`Unknown account: ${pkg.accountId}`, { accountId: pkg.accountId });
  }
  if (typeof targetAccount === "string" && targetAccount.startsWith("xhs_account_") && normalizeAccountIdentifier(targetAccount)?.isCustom) {
    throw new PipelineRoutingError(`Unknown account: ${targetAccount}`, { accountId: targetAccount });
  }

  const targetNorm = targetIdentifier ? normalizeAccountIdentifier(targetIdentifier) : null;
  const isTargetShuzhai = targetNorm ? (targetNorm.accountId === "xhs_account_1" || targetNorm.pipeline === "shuzhai") : false;
  const isTargetXCuration = targetNorm ? (targetNorm.accountId === "xhs_account_2" || targetNorm.pipeline === "x_curation") : false;

  const accountId = normalized?.accountId || "";
  const isFreeze = !!options.isFreeze;

  // Direct Account vs Project mismatch checks
  if ((isTargetShuzhai || pkg.accountId === "xhs_account_1" || accountId === "xhs_account_1") && pkg.project === "x_curation") {
    throw new PipelineRoutingError(
      "Account isolation violation (Account-project mismatch): Account 'xhs_account_1' ('good try') strictly rejects X curation packages.",
      { accountId: "xhs_account_1", project: pkg.project }
    );
  }
  if ((isTargetXCuration || pkg.accountId === "xhs_account_2" || accountId === "xhs_account_2") && pkg.project === "shuzhai") {
    throw new PipelineRoutingError(
      "Account isolation violation (Account-project mismatch): Account 'xhs_account_2' ('Gold chance') strictly rejects Shuzhai packages.",
      { accountId: "xhs_account_2", project: pkg.project }
    );
  }

  // Case 1: good try / shuzhai / xhs_account_1
  if (isTargetShuzhai || (!targetIdentifier && (accountId === "xhs_account_1" || normalized?.pipeline === "shuzhai"))) {
    const check = detectXCurationMarkers(pkg);
    if (check.isXCuration) {
      throw new PipelineRoutingError(
        `Account isolation violation: Account 'xhs_account_1' ('good try') strictly rejects X curation packages and assets (detected: ${check.violations.join("; ")}).`,
        { accountId: "xhs_account_1", accountName: "good try", pipeline: "shuzhai", violations: check.violations }
      );
    }
  }

  // Case 2: Gold chance / x_curation / xhs_account_2
  if (isTargetXCuration || (!targetIdentifier && (accountId === "xhs_account_2" || normalized?.pipeline === "x_curation"))) {
    const shuzhaiCheck = detectShuzhaiLayoutMarkers(pkg);
    if (shuzhaiCheck.isShuzhai) {
      throw new PipelineRoutingError(
        `Account isolation violation: Account 'xhs_account_2' ('Gold chance') strictly rejects Shuzhai book card layouts and reading packages (detected: ${shuzhaiCheck.violations.join("; ")}).`,
        { accountId: "xhs_account_2", accountName: "Gold chance", pipeline: "x_curation", violations: shuzhaiCheck.violations }
      );
    }

    if (isFreeze || options.requireAssets) {
      if (!hasXCurationAssets(pkg)) {
        throw new PipelineRoutingError(
          `Account isolation violation: Account 'xhs_account_2' ('Gold chance') requires X curation visual or feasibility assets before proceeding.`,
          { accountId: "xhs_account_2", accountName: "Gold chance", pipeline: "x_curation" }
        );
      }
    }
  }

  return true;
}

const EXPERIMENT_SCORE_KEYS = [
  "traffic",
  "click",
  "read",
  "save",
  "discussion",
  "share",
  "follow",
  "fit",
  "evidence"
];

const REQUIRED_EXPERIMENT_FIELDS = [
  "accountId",
  "source",
  "insight",
  "audience",
  "painOrDesire",
  "objective",
  "topic",
  "title",
  "hookType",
  "emotion",
  "contentStructure",
  "cta",
  "recommendation",
  "strategyVersion"
];

const METRIC_NUMBER_KEYS = [
  "impressions",
  "reads",
  "avgStaySeconds",
  "readCompletion",
  "likes",
  "saves",
  "comments",
  "shares",
  "profileVisits",
  "followersGained"
];

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function optionalString(value) {
  if (value === undefined || value === null) return null;
  return String(value).trim() || null;
}

function stringList(value, field) {
  if (value === undefined || value === null) return [];
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function nonNegativeNumber(value, field) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  if (typeof value !== "number" && typeof value !== "string") {
    throw new Error(`${field} must be a non-negative number or null`);
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${field} must be a non-negative number or null`);
  }
  return number;
}

export function normalizeExperiment(input = {}) {
  if (input === null) input = {};
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new Error("experiment must be an object");
  }

  const scores = input.predictionScores ?? input.scores ?? {};
  if (typeof scores !== "object" || Array.isArray(scores)) {
    throw new Error("experiment.predictionScores must be an object");
  }

  return {
    accountId: optionalString(input.accountId),
    source: optionalString(input.source),
    insight: optionalString(input.insight),
    audience: optionalString(input.audience),
    painOrDesire: optionalString(input.painOrDesire),
    objective: optionalString(input.objective),
    topic: optionalString(input.topic),
    title: optionalString(input.title),
    hookType: optionalString(input.hookType),
    emotion: optionalString(input.emotion),
    contentStructure: optionalString(input.contentStructure),
    cta: optionalString(input.cta),
    predictionScores: Object.fromEntries(
      EXPERIMENT_SCORE_KEYS.map((key) => [key, nonNegativeNumber(scores[key], `experiment.predictionScores.${key}`)])
    ),
    recommendation: optionalString(input.recommendation),
    risks: stringList(input.risks, "experiment.risks"),
    strategyVersion: optionalString(input.strategyVersion),
    hypothesisIds: stringList(input.hypothesisIds, "experiment.hypothesisIds")
  };
}

function requireCompleteExperiment(input) {
  const experiment = normalizeExperiment(input);
  const missing = REQUIRED_EXPERIMENT_FIELDS.filter((field) => !experiment[field]);
  missing.push(...EXPERIMENT_SCORE_KEYS.filter((key) => experiment.predictionScores[key] === null).map((key) => `predictionScores.${key}`));
  if (!Object.prototype.hasOwnProperty.call(input || {}, "risks")) missing.push("risks");
  if (experiment.hypothesisIds.length === 0) missing.push("hypothesisIds");
  if (missing.length) {
    throw new Error(`Cannot freeze package: experiment is incomplete (${missing.join(", ")}).`);
  }
  return experiment;
}

function safeRate(numerator, denominator) {
  if (numerator === null || numerator === undefined || denominator === null || denominator === undefined) return null;
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
  const rate = n / d;
  return Number.isFinite(rate) ? rate : null;
}

export function calculateMetricsRates(metrics = {}) {
  const engagementKeys = ["likes", "saves", "comments", "shares"];
  const hasEngagement = engagementKeys.some((key) => metrics[key] !== null && metrics[key] !== undefined);
  const engagementTotal = hasEngagement
    ? engagementKeys.reduce((sum, key) => sum + (metrics[key] ?? 0), 0)
    : null;

  return {
    clickRate: safeRate(metrics.reads, metrics.impressions),
    saveRate: safeRate(metrics.saves, metrics.reads),
    engagementRate: safeRate(engagementTotal, metrics.reads),
    followRate: safeRate(metrics.followersGained, metrics.reads)
  };
}

export function normalizeMetrics(input = {}, now = new Date().toISOString()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("metrics must be an object");
  }

  const capturedAt = input.capturedAt === undefined || input.capturedAt === null || input.capturedAt === ""
    ? now
    : input.capturedAt;
  const capturedAtMs = Date.parse(String(capturedAt));
  if (!Number.isFinite(capturedAtMs)) {
    throw new Error("metrics.capturedAt must be a valid date");
  }

  const metrics = {
    capturedAt: new Date(capturedAtMs).toISOString(),
    ...Object.fromEntries(
      METRIC_NUMBER_KEYS.map((key) => [key, nonNegativeNumber(input[key], `metrics.${key}`)])
    )
  };
  metrics.rates = calculateMetricsRates(metrics);
  return metrics;
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

  // Legacy packages did not have an experiment field. Keep their existing
  // approval hashes valid until an experiment is explicitly added.
  if (Object.prototype.hasOwnProperty.call(pkg, "experiment")) {
    payload.experiment = normalizeExperiment(pkg.experiment);
  }

  if (pkg.visualCard) payload.visualCard = pkg.visualCard;
  if (Array.isArray(pkg.feasibilityRatings) && pkg.feasibilityRatings.length > 0) payload.feasibilityRatings = pkg.feasibilityRatings;
  if (pkg.authorPinnedComment) payload.authorPinnedComment = pkg.authorPinnedComment;
  if (Array.isArray(pkg.tags) && pkg.tags.length > 0) payload.tags = pkg.tags;

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

  const explicitAccountId = optionalString(input.accountId);
  const experimentAccountId = optionalString(input.experiment?.accountId);

  if (explicitAccountId && explicitAccountId.startsWith("xhs_account_")) {
    const norm = normalizeAccountIdentifier(explicitAccountId);
    if (norm?.isCustom) {
      throw new PipelineRoutingError(`Unknown account: ${explicitAccountId}`, { accountId: explicitAccountId });
    }
  }

  let resolvedAccountId = explicitAccountId;
  if (!resolvedAccountId) {
    if (project === "x_curation") resolvedAccountId = "xhs_account_2";
    else if (project === "personal_ip") resolvedAccountId = "xhs_account_3";
    else if (project === "shuzhai") resolvedAccountId = "xhs_account_1";
    else if (experimentAccountId && KNOWN_ACCOUNTS[experimentAccountId]) {
      resolvedAccountId = KNOWN_ACCOUNTS[experimentAccountId].accountId;
    } else {
      resolvedAccountId = "xhs_account_1";
    }
  }

  let layout;
  if (project === "x_curation" || resolvedAccountId === "xhs_account_2") {
    layout = input.layout || { templateId: "x-curation-dark-v1" };
  } else {
    layout = normalizeXiaohongshuLayout(input.layout, { platform });
  }

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
    accountId: resolvedAccountId,
    status: "draft",
    title,
    body,
    layout,
    media: Array.isArray(input.media) ? input.media : [],
    links: Array.isArray(input.links) ? input.links : [],
    visualCard: input.visualCard || null,
    feasibilityRatings: Array.isArray(input.feasibilityRatings) ? input.feasibilityRatings : [],
    rawClaims: Array.isArray(input.rawClaims) ? input.rawClaims : [],
    authorPinnedComment: optionalString(input.authorPinnedComment),
    tags: stringList(input.tags, "tags"),
    scheduledAt,
    layers: {
      facts,
      expressions,
      viewpoints
    },
    usedViewpoints,
    experiment: normalizeExperiment(input.experiment),
    metrics: [],
    payloadHash: "",
    approvalStatus: "not_required",
    approvedAt: null,
    approvedHash: null,
    createdAt: now,
    updatedAt: now,
    frozenAt: null
  };

  validateAccountPipelineIsolation(pkg, resolvedAccountId, { isCreate: true });

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
      if (pkg.project === "x_curation" || pkg.accountId === "xhs_account_2") {
        pkg.layout = pkg.layout || { templateId: "x-curation-dark-v1" };
      } else {
        pkg.layout = normalizeXiaohongshuLayout(pkg.layout, { platform: pkg.platform });
      }
    }
  }
  if (patch.title !== undefined) pkg.title = String(patch.title).trim();
  if (patch.body !== undefined) pkg.body = String(patch.body).trim();
  if (patch.layout !== undefined) {
    if (pkg.project === "x_curation" || pkg.accountId === "xhs_account_2") {
      pkg.layout = patch.layout;
    } else {
      pkg.layout = normalizeXiaohongshuLayout(patch.layout, { platform: patch.platform ?? pkg.platform });
    }
  }
  if (patch.media !== undefined && Array.isArray(patch.media)) pkg.media = patch.media;
  if (patch.links !== undefined && Array.isArray(patch.links)) pkg.links = patch.links;
  if (patch.scheduledAt !== undefined) pkg.scheduledAt = patch.scheduledAt || null;
  if (patch.accountId !== undefined) pkg.accountId = optionalString(patch.accountId);
  if (patch.visualCard !== undefined) pkg.visualCard = patch.visualCard;
  if (patch.feasibilityRatings !== undefined && Array.isArray(patch.feasibilityRatings)) pkg.feasibilityRatings = patch.feasibilityRatings;
  if (patch.rawClaims !== undefined && Array.isArray(patch.rawClaims)) pkg.rawClaims = patch.rawClaims;
  if (patch.authorPinnedComment !== undefined) pkg.authorPinnedComment = optionalString(patch.authorPinnedComment);
  if (patch.tags !== undefined && Array.isArray(patch.tags)) pkg.tags = stringList(patch.tags, "tags");
  if (patch.experiment !== undefined) {
    const nextExperiment = patch.experiment ?? {};
    if (typeof nextExperiment !== "object" || Array.isArray(nextExperiment)) {
      throw new Error("experiment must be an object");
    }
    const nextScores = nextExperiment.predictionScores ?? nextExperiment.scores;
    if (nextScores !== undefined && nextScores !== null && (typeof nextScores !== "object" || Array.isArray(nextScores))) {
      throw new Error("experiment.predictionScores must be an object");
    }
    pkg.experiment = normalizeExperiment({
      ...(pkg.experiment || {}),
      ...nextExperiment,
      predictionScores: {
        ...(pkg.experiment?.predictionScores || {}),
        ...(nextScores || {})
      }
    });
  }

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

  validateAccountPipelineIsolation(pkg, undefined, { isUpdate: true });

  const newHash = computeContentPackageHash(pkg);
  pkg.payloadHash = newHash;
  pkg.updatedAt = now;

  // Invalidate approval if hash changed and was frozen/approved
  if (oldHash && oldHash !== newHash && ["frozen", "awaiting_approval", "approved", "ready_manual", "published"].includes(pkg.status)) {
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
    if (pkg.project === "x_curation" || pkg.accountId === "xhs_account_2") {
      pkg.layout = pkg.layout || { templateId: "x-curation-dark-v1" };
    } else {
      pkg.layout = normalizeXiaohongshuLayout(pkg.layout, { platform: pkg.platform });
    }
  }

  // Validate licenses before freeze
  validatePackageLicenses(pkg);
  pkg.experiment = requireCompleteExperiment(pkg.experiment);

  // Validate strict account-pipeline isolation at freeze boundary
  validateAccountPipelineIsolation(pkg, undefined, { isFreeze: true });

  const now = new Date().toISOString();
  pkg.payloadHash = computeContentPackageHash(pkg);
  pkg.status = "awaiting_approval";
  pkg.approvalStatus = "pending";
  pkg.frozenAt = now;
  pkg.updatedAt = now;

  const file = packageFilePath(id, options);
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2), "utf8");
  try {
    syncFromContentPackage(pkg, options.projectRoot || process.cwd(), options);
  } catch {
    // Registry outbox must not block freeze
  }
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
  pkg.experiment = requireCompleteExperiment(pkg.experiment);
  validateAccountPipelineIsolation(pkg, undefined, { isFreeze: true });
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
  try {
    syncFromContentPackage(pkg, options.projectRoot || process.cwd(), options);
    const resolvedProfileDir = pkg.accountId === "xhs_account_2" || pkg.project === "x_curation"
      ? "xhs_account_2"
      : (pkg.accountId === "xhs_account_3" || pkg.project === "personal_ip" ? "xhs_account_3" : "xhs_account_1");
    allowPackageDelivery(pkg.id, {
      ...options,
      accountId: pkg.accountId,
      account_id: pkg.accountId,
      profileDir: resolvedProfileDir,
      profile_dir: resolvedProfileDir
    });
  } catch {
    // Registry/outbox must not block founder approval.
  }
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
  try {
    revokePackageDelivery(pkg.id, options);
  } catch {
    // Registry/outbox revocation must not block package rejection
  }
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

export function recordPublish(id, result = {}, options = {}) {
  const pkg = getPackage(id, options);
  if (!pkg) {
    throw new Error(`Content package ${id} not found`);
  }

  const now = new Date().toISOString();
  pkg.lastPublishAt = now;
  pkg.updatedAt = now;
  if (result.ok) {
    pkg.status = "published";
    pkg.publishedAt = now;
    pkg.lastPublishError = null;
    pkg.publishResult = {
      title: result.title || null,
      message: result.message || "published"
    };
    try { markDeliverySent(id, options); } catch { /* outbox must not block publish record */ }
  } else {
    pkg.lastPublishError = result.message || result.error || "publish_failed";
  }

  const file = packageFilePath(id, options);
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2), "utf8");
  return pkg;
}

export function appendPackageMetrics(id, input = {}, options = {}) {
  const pkg = getPackage(id, options);
  if (!pkg) {
    throw new Error(`Content package ${id} not found`);
  }
  if (pkg.status !== "published") {
    throw new Error(`Cannot record metrics before publishing (current status: ${pkg.status}).`);
  }

  const oldHash = pkg.payloadHash;
  const oldApprovedHash = pkg.approvedHash;
  const metrics = normalizeMetrics(input);
  pkg.metrics = Array.isArray(pkg.metrics) ? [...pkg.metrics, metrics] : [metrics];
  pkg.updatedAt = new Date().toISOString();

  // Metrics are observations, not approved publishing content.
  pkg.payloadHash = oldHash;
  pkg.approvedHash = oldApprovedHash;

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
