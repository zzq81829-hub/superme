import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");

export const CONTENT_STATES = {
  IDEA: "IDEA",
  PLANNED: "PLANNED",
  GENERATING: "GENERATING",
  QC: "QC",
  APPROVED: "APPROVED",
  SCHEDULED: "SCHEDULED",
  PUBLISHING: "PUBLISHING",
  PUBLISHED: "PUBLISHED",
  METRICS_24H: "24H_METRICS",
  METRICS_72H: "72H_METRICS",
  LEARNED: "LEARNED",
  // Failure / Exceptional states
  BLOCKED: "BLOCKED",
  FAILED: "FAILED",
  RETRYING: "RETRYING",
  NEED_HUMAN: "NEED_HUMAN"
};

export function getContentBaseDir(options = {}) {
  if (options.baseDir) return options.baseDir;
  if (process.env.XHS_CONTENT_BASE_DIR) return process.env.XHS_CONTENT_BASE_DIR;
  return path.join(root, "data", "xhs", "contents");
}

function contentFile(id, options = {}) {
  const safeId = String(id).replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(getContentBaseDir(options), `${safeId}.json`);
}

export function createContentObject(input, options = {}) {
  const baseDir = getContentBaseDir(options);
  fs.mkdirSync(baseDir, { recursive: true });

  const now = new Date().toISOString();
  const dateStr = now.slice(0, 10).replace(/-/g, "");
  const rand = crypto.randomBytes(2).toString("hex");
  const id = input.id || `xhs_${dateStr}_${rand}`;

  const content = {
    id,
    account: input.account || "shuzhai",
    topic: input.topic || "未命名选题",
    content_type: input.content_type || "观点型",
    source: input.source || "book+trend",
    status: input.status || CONTENT_STATES.IDEA,
    publish_time: input.publish_time || null,
    experiment_id: input.experiment_id || null,
    topic_score: typeof input.topic_score === "number" ? input.topic_score : 0,
    quality_score: typeof input.quality_score === "number" ? input.quality_score : null,
    risk_score: typeof input.risk_score === "number" ? input.risk_score : null,
    qc_details: input.qc_details || null,
    package: input.package || {
      title: "",
      body: "",
      hashtags: [],
      cover: null,
      images: [],
      video: null,
      source: input.source || "book+trend",
      content_angle: "",
      experiment_id: input.experiment_id || null
    },
    publish_result: input.publish_result || {
      status: "pending",
      platform: "xiaohongshu",
      url: null,
      published_at: null,
      retry_count: 0,
      reason: null,
      action: null
    },
    metrics: {
      impressions: 0,
      views: 0,
      clicks: 0,
      likes: 0,
      favorites: 0,
      comments: 0,
      shares: 0,
      follows: 0,
      profile_visits: 0,
      dms: 0,
      leads: 0,
      products: 0,
      orders: 0,
      gmv: 0,
      revenue_per_thousand: 0,
      last_synced_at: null,
      ...(input.metrics || {})
    },
    history: [
      {
        status: input.status || CONTENT_STATES.IDEA,
        timestamp: now,
        note: "Created content object"
      }
    ],
    createdAt: now,
    updatedAt: now
  };

  fs.writeFileSync(contentFile(id, options), JSON.stringify(content, null, 2), "utf8");
  return content;
}

export function getContentObject(id, options = {}) {
  const file = contentFile(id, options);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function updateContentObject(id, patch = {}, options = {}) {
  const current = getContentObject(id, options);
  if (!current) throw new Error(`Content object not found: ${id}`);

  const now = new Date().toISOString();
  const nextStatus = patch.status || current.status;
  const history = Array.isArray(current.history) ? [...current.history] : [];

  if (nextStatus !== current.status || patch.historyNote) {
    history.push({
      status: nextStatus,
      timestamp: now,
      note: patch.historyNote || `Transitioned to ${nextStatus}`
    });
  }

  const updated = {
    ...current,
    ...patch,
    status: nextStatus,
    package: {
      ...current.package,
      ...(patch.package || {})
    },
    publish_result: {
      ...current.publish_result,
      ...(patch.publish_result || {})
    },
    metrics: {
      ...current.metrics,
      ...(patch.metrics || {})
    },
    history,
    updatedAt: now
  };

  // Auto calculate RPM (revenue per thousand impressions)
  if (updated.metrics.impressions > 0 && typeof updated.metrics.gmv === "number") {
    updated.metrics.revenue_per_thousand = Math.round((updated.metrics.gmv / updated.metrics.impressions) * 1000 * 100) / 100;
  }

  fs.writeFileSync(contentFile(id, options), JSON.stringify(updated, null, 2), "utf8");
  return updated;
}

export function listContentObjects(filter = {}, options = {}) {
  const baseDir = getContentBaseDir(options);
  if (!fs.existsSync(baseDir)) return [];

  const files = fs.readdirSync(baseDir).filter((f) => f.endsWith(".json"));
  const list = [];
  for (const f of files) {
    try {
      const obj = JSON.parse(fs.readFileSync(path.join(baseDir, f), "utf8"));
      if (filter.account && obj.account !== filter.account) continue;
      if (filter.status && obj.status !== filter.status) continue;
      if (filter.content_type && obj.content_type !== filter.content_type) continue;
      list.push(obj);
    } catch {}
  }

  list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  if (typeof filter.limit === "number") {
    return list.slice(0, filter.limit);
  }
  return list;
}
