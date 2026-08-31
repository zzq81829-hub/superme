import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const policyPath = path.resolve(__dirname, "../../config/billing-policy.yaml");

const WORKER_POLICY_KEYS = {
  hermes: "Hermes",
  codex: "Codex",
  claude: "Claude",
  antigravity: "Antigravity",
  "grok-build": "GrokBuild",
  grok: "Grok",
  "grok-bot": "GrokBot",
  deepseek: "DeepSeek"
};

const FORBIDDEN_APIS = ["OpenRouter", "OpenAIAPI", "AnthropicAPI", "XAIAPI", "GeminiAPI"];

function parseSimpleYaml(text) {
  const out = {};
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "");
    if (!line.trim()) continue;
    const top = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    const nested = line.match(/^\s+([A-Za-z0-9_]+):\s*(.*)$/);
    if (top && !raw.startsWith(" ") && !raw.startsWith("\t")) {
      current = top[1];
      out[current] = top[2] ? coerce(top[2]) : {};
      if (top[2] === "") out[current] = {};
    } else if (nested && current) {
      if (typeof out[current] !== "object" || out[current] === null) out[current] = {};
      out[current][nested[1]] = coerce(nested[2]);
    }
  }
  return out;
}

function coerce(value) {
  const v = String(value).trim();
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "") return "";
  return v;
}

let cached;

export function loadBillingPolicy() {
  if (cached) return cached;
  cached = parseSimpleYaml(fs.readFileSync(policyPath, "utf8"));
  return cached;
}

export function workerPolicy(workerId) {
  const policy = loadBillingPolicy();
  const key = WORKER_POLICY_KEYS[workerId];
  return key ? policy[key] || {} : {};
}

export function isForbiddenApiEnabled() {
  const policy = loadBillingPolicy();
  return FORBIDDEN_APIS.filter((name) => policy[name]?.enabled === true);
}

export function subscriptionEnv(base = process.env) {
  const env = { ...base };
  delete env.OPENAI_API_KEY;
  delete env.ANTHROPIC_API_KEY;
  delete env.XAI_API_KEY;
  delete env.GEMINI_API_KEY;
  delete env.GOOGLE_API_KEY;
  return env;
}

export function localAnthropicProxy(base = process.env) {
  const url = String(base.ANTHROPIC_BASE_URL || "");
  const match = url.match(/^https?:\/\/(127\.0\.0\.1|localhost):(\d+)/i);
  if (!match) return null;
  return { url, host: match[1], port: Number(match[2]) };
}

export function claudeRuntimeEnv(base = process.env) {
  const env = subscriptionEnv(base);
  const proxy = localAnthropicProxy(base);
  if (proxy) {
    env.ANTHROPIC_BASE_URL = proxy.url;
    if (base.ANTHROPIC_API_KEY) env.ANTHROPIC_API_KEY = base.ANTHROPIC_API_KEY;
  }
  return env;
}

export function getDeepSeekMonthlyLimit() {
  const policy = workerPolicy("deepseek");
  const limit = Number(policy.monthly_limit_cny);
  return !isNaN(limit) && limit > 0 ? limit : 30;
}

export function getDeepSeekDefaultCallCost() {
  const policy = workerPolicy("deepseek");
  const cost = Number(policy.conservative_cost_per_call_cny);
  return !isNaN(cost) && cost > 0 ? cost : 0.20;
}

