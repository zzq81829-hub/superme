import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { publishEvent } from "../events/bus.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultPoliciesDir = path.resolve(__dirname, "../../data/policies");

export const DEFAULT_POLICIES = Object.freeze({
  agent_router: {
    policy: "agent_router",
    description: "Workforce domain routing weights and agent selection rules",
    version: "1.0.0",
    rules: {
      frontend: { antigravity_weight: 0.85, codex_weight: 0.15 },
      backend: { codex_weight: 0.70, antigravity_weight: 0.30 },
      research: { grok_weight: 0.75, antigravity_weight: 0.25 },
      coordination: { hermes_weight: 0.80, antigravity_weight: 0.20 },
      fallback_ladder: ["antigravity", "claude", "grok-build", "codex"]
    }
  },
  boost_policy: {
    policy: "boost_policy",
    description: "Autonomous reasoning escalation and boost threshold rules",
    version: "1.0.0",
    rules: {
      boost_threshold: 0.68,
      high_risk_threshold: 0.80,
      max_retries_before_founder: 2,
      auto_boost_on_multi_file: true,
      auto_boost_on_refactor: true
    }
  },
  content_mix: {
    policy: "content_mix",
    description: "Xiaohongshu multi-account and content distribution mix",
    version: "1.0.0",
    rules: {
      gold_chance_ratio: 0.50,
      shuzhai_ratio: 0.35,
      personal_ip_ratio: 0.15,
      max_daily_posts_per_account: 2
    }
  },
  resource_budget: {
    policy: "resource_budget",
    description: "Financial and compute resource boundaries",
    version: "1.0.0",
    rules: {
      daily_cost_cap_cny: 25.0,
      max_concurrent_agents: 4,
      senior_model_cooldown_seconds: 300,
      quiet_hours_enabled: true
    }
  }
});

export function getPoliciesDir(options = {}) {
  const dir = options.policiesDir || process.env.POLICIES_BASE_DIR || defaultPoliciesDir;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function initializeDefaultPolicies(options = {}) {
  const dir = getPoliciesDir(options);
  for (const [name, defaultData] of Object.entries(DEFAULT_POLICIES)) {
    const file = path.join(dir, `${name}.json`);
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify({
        ...defaultData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, null, 2), "utf8");
    }
  }
}

export function listPolicies(options = {}) {
  initializeDefaultPolicies(options);
  const dir = getPoliciesDir(options);
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".json") && !f.includes(".tmp"));
  const policies = [];

  for (const f of files) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      policies.push(parsed);
    } catch {
      // ignore
    }
  }
  return policies;
}

export function getPolicy(name, options = {}) {
  initializeDefaultPolicies(options);
  const sanitized = String(name || "").replace(/[^a-zA-Z0-9_\-]/g, "");
  const file = path.join(getPoliciesDir(options), `${sanitized}.json`);
  if (!fs.existsSync(file)) {
    return DEFAULT_POLICIES[sanitized] || null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return DEFAULT_POLICIES[sanitized] || null;
  }
}

export function updatePolicy(name, patch = {}, options = {}) {
  initializeDefaultPolicies(options);
  const sanitized = String(name || "").replace(/[^a-zA-Z0-9_\-]/g, "");
  const current = getPolicy(sanitized, options);
  if (!current) throw new Error(`Policy '${name}' not found`);

  // Governance check: Cannot delete safety invariants
  if (patch.rules) {
    for (const [k, v] of Object.entries(patch.rules)) {
      if (k === "disable_safety_boundaries" || k === "allow_unapproved_payments") {
        throw new Error(`Governance Violation: Overriding '${k}' is strictly prohibited by OS constitution`);
      }
      // Weight normalization checks
      if (typeof v === "number" && (v < 0 || v > 100)) {
        throw new Error(`Invalid policy rule value for ${k}: must be non-negative`);
      }
    }
  }

  const updatedRules = {
    ...current.rules,
    ...(patch.rules || {})
  };

  const updated = {
    ...current,
    ...patch,
    rules: updatedRules,
    policy: sanitized,
    updatedAt: new Date().toISOString()
  };

  const dir = getPoliciesDir(options);
  const file = path.join(dir, `${sanitized}.json`);
  const tmpFile = path.join(dir, `${sanitized}.json.tmp.${crypto.randomBytes(4).toString("hex")}`);
  fs.writeFileSync(tmpFile, JSON.stringify(updated, null, 2), "utf8");
  fs.renameSync(tmpFile, file);

  // Publish policy_changed event
  publishEvent({
    type: "policy_changed",
    project_id: "governance",
    source: patch.actor || "policy_manager",
    outcome: "success",
    payload: {
      policy: sanitized,
      previous: current.rules,
      updated: updatedRules
    }
  }, options);

  return updated;
}
