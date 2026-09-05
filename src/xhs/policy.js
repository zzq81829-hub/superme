import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");

export function getXhsPolicyFile(options = {}) {
  if (options.policyFile) return options.policyFile;
  if (process.env.XHS_POLICY_FILE) return process.env.XHS_POLICY_FILE;
  return path.join(root, "data", "xhs", "policies.json");
}

export const DEFAULT_XHS_POLICIES = {
  global: {
    min_topic_score: 75,
    max_daily_total_posts: 6,
    require_founder_approval_on_major_shift: true,
    safe_hours_start: "08:30",
    safe_hours_end: "23:00",
    max_retries: 3
  },
  x_curation: {
    name: "Gold chance",
    account: "x_curation",
    role: "海外信息雷达 / 信息差 / 筛选与更正",
    daily_quota: 2,
    content_mix: {
      opinion_content: 0.35,
      trend_content: 0.45,
      experimental_content: 0.20
    },
    publish_times: ["12:30", "20:00"],
    title_style: "grounded_concise",
    qc_min_quality: 0.80,
    qc_max_risk: 0.25
  },
  shuzhai: {
    name: "good try",
    account: "shuzhai",
    role: "认知资产 / 深度拆书 / 决策清单",
    daily_quota: 2,
    content_mix: {
      opinion_content: 0.40,
      book_content: 0.40,
      experimental_content: 0.20
    },
    publish_times: ["11:45", "19:30"],
    title_style: "question_conflict",
    qc_min_quality: 0.82,
    qc_max_risk: 0.25
  },
  personal_ip: {
    name: "枳子8",
    account: "personal_ip",
    role: "创始人人设 / 商业思考 / 实践复盘 / 创业闭环",
    daily_quota: 1,
    content_mix: {
      opinion_content: 0.50,
      founder_reflection: 0.30,
      experimental_content: 0.20
    },
    publish_times: ["20:45"],
    title_style: "candid_first_person",
    qc_min_quality: 0.85,
    qc_max_risk: 0.20
  }
};

export function getXhsPolicy(account = null, options = {}) {
  const file = getXhsPolicyFile(options);
  let policies = DEFAULT_XHS_POLICIES;

  if (fs.existsSync(file)) {
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      policies = {
        ...DEFAULT_XHS_POLICIES,
        ...data,
        global: { ...DEFAULT_XHS_POLICIES.global, ...(data.global || {}) },
        x_curation: { ...DEFAULT_XHS_POLICIES.x_curation, ...(data.x_curation || {}) },
        shuzhai: { ...DEFAULT_XHS_POLICIES.shuzhai, ...(data.shuzhai || {}) },
        personal_ip: { ...DEFAULT_XHS_POLICIES.personal_ip, ...(data.personal_ip || {}) }
      };
    } catch {}
  }

  if (account) {
    return policies[account] || null;
  }
  return policies;
}

export function patchXhsPolicy(patch = {}, options = {}) {
  const file = getXhsPolicyFile(options);
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });

  const current = getXhsPolicy(null, options);

  // Safety boundary: prevent illegal bypass of founder safety constitutions
  if (patch.global && patch.global.require_founder_approval_on_major_shift === false) {
    if (!options.founderApproved) {
      throw new Error("Governance guard: Disabling founder approval on major shifts requires explicit founder authorization.");
    }
  }

  const updated = {
    ...current,
    updatedAt: new Date().toISOString()
  };

  for (const [key, value] of Object.entries(patch)) {
    if (key === "updatedAt") continue;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      updated[key] = {
        ...(updated[key] || {}),
        ...value
      };
    } else {
      updated[key] = value;
    }
  }

  fs.writeFileSync(file, JSON.stringify(updated, null, 2), "utf8");
  return updated;
}
