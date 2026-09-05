import crypto from "crypto";
import { chooseAgent } from "../router.js";
import { applyCostGuard } from "../workers/costGuard.js";
import { FALLBACK_CHAIN } from "../workers/ids.js";

const QUOTA_TYPES = {
  hermes: "cheap_api",
  codex: "subscription",
  claude: "subscription",
  antigravity: "subscription",
  "grok-build": "subscription",
  grok: "subscription",
  "grok-bot": "experimental",
  deepseek: "cheap_api"
};

export function getQuotaType(workerId) {
  return QUOTA_TYPES[workerId] || "subscription";
}

const HIGH_RISK_PATTERNS = [
  {
    regex: /发布|publish|上架|对外发送|推送|推文|发送到/i,
    reason: "涉及对外公开发布内容 (Level 1 立即打断)"
  },
  {
    regex: /付费|充值|purchase|付款|超限|支付|扣款|购买/i,
    reason: "涉及资金、付费或成本超限风险 (Level 1 立即打断)"
  },
  {
    regex: /删除重要数据|不可逆|irreversible|物理删除|清空数据库|清空生产/i,
    reason: "涉及不可逆破坏性数据操作 (Level 1 立即打断)"
  },
  {
    regex: /安全|密钥|权限提升|dangerous-bypass|私钥|提权|越权/i,
    reason: "涉及安全漏洞或权限越界操作 (Level 1 立即打断)"
  },
  {
    regex: /最高目标|主目标|业务优先级切换|切换主航道|变更战略/i,
    reason: "涉及最高业务目标或公司治理原则变更 (Level 1 立即打断)"
  }
];

import { assessTaskRisk } from "../policy/reasoningEscalation.js";

export function classifyTaskRisk(task = {}) {
  return assessTaskRisk(task);
}

export function computePayloadHash(task = {}) {
  const normalized = {
    title: String(task.title || "").trim(),
    description: String(task.description || "").trim(),
    agent: String(task.agent || "auto").trim(),
    projectPath: String(task.projectPath || "").trim(),
    acceptanceCriteria: Array.isArray(task.acceptanceCriteria)
      ? task.acceptanceCriteria.map((c) => (typeof c === "string" ? c : JSON.stringify(c))).sort()
      : []
  };

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex")
    .slice(0, 16);
}

export function generateSelectionPreview(task = {}) {
  const requested = task.agent || "auto";
  const resolved = requested === "auto" ? chooseAgent(task) : requested;
  const quotaType = getQuotaType(resolved);
  const alternatives = FALLBACK_CHAIN.filter((id) => id !== resolved).map((id) => ({
    id,
    quotaType: getQuotaType(id)
  }));

  const defaultWorkflow = [
    "1. 意向解析与 Worker 路由",
    "2. Worker 派工与本地执行",
    "3. 机器验收与自动修复",
    "4. 结果汇报与看板落盘"
  ];

  return {
    requested,
    resolved,
    reason: requested === "auto" ? `自动路由至 ${resolved}` : `指定 Worker ${requested}`,
    quotaType,
    alternatives,
    workflow: defaultWorkflow
  };
}
