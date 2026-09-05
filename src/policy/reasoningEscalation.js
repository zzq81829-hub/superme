import path from "path";
import fs from "fs";

/**
 * Reasoning Escalation Policy (推理升级策略)
 *
 * 核心目标：
 * 1. 让 OS 自动判断何时为 Antigravity 附加 /boost 与 --effort high，不依赖人工输入；
 * 2. 普通低风险任务（文案修改、小范围 UI 调整、单文件简单修改）保持 normal 模式，节约算力；
 * 3. 命中高阶特征（3+ 文件、架构/API/数据库/状态管理、重构/删除、歧义分析、跨 Agent、Phase 验收等）自动启用 boost；
 * 4. 连续失败分级熔断：
 *    - 第 1 次失败：重新分析后普通重试；
 *    - 第 2 次失败：自动升级启用 boost 深度推理与验证；
 *    - 第 3 次失败：停止自动修改，生成失败报告并请求上级审核；
 * 5. Boost 验收（6 维质检）：中高风险或 Boost 任务完成后由 boost 检验需求完成、修改越界、功能完好、测试充分、Phase 边界与隐藏回归；
 * 6. 统一记录字段：reasoning_mode, boost_reason, retry_count, risk_level, verification_result。
 */

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

const MEDIUM_RISK_TRIGGERS = [
  {
    id: "architecture_api_db_state",
    regex: /架构|architecture|API|api|接口|路由|router|数据库|database|sqlite|sql|orm|状态管理|state\s*management|全局状态|store/i,
    reason: "涉及架构、API、数据库或状态管理"
  },
  {
    id: "delete_migrate_refactor",
    regex: /删除|delete|移除|remove|清理|迁移|migrate|migration|重构|refactor|restructure/i,
    reason: "涉及删除、迁移或重构"
  },
  {
    id: "ambiguity_analysis_first",
    regex: /歧义|ambiguous|不明确|含糊|调研|先分析|方案制定|design\s*plan|explore|analysis|方案设计|技术选型/i,
    reason: "任务描述存在歧义或需先分析再制定方案"
  },
  {
    id: "multi_agent_coordination",
    regex: /多\s*agent|multi-?agent|协同|协作|协同作业|coordination/i,
    reason: "涉及多个 Agent 协同"
  },
  {
    id: "phase_acceptance",
    regex: /Phase\s*[0-9]|当前\s*Phase|阶段验收|里程碑验收|acceptance/i,
    reason: "涉及当前 Phase 的验收"
  },
  {
    id: "regression_impact",
    regex: /回归|regression|影响已有|破坏已有|破坏性变更|breaking\s*change|兼容性/i,
    reason: "可能影响已通过功能（潜在回归风险）"
  }
];

function extractMentionedFiles(text = "") {
  const matches = text.match(/[a-zA-Z0-9_\-\.\/\\]+\.(?:js|ts|json|md|html|css|py|yaml|yml|sql|sh|ps1)/gi) || [];
  const unique = new Set(matches.map((m) => m.replace(/^[\\\/]+/, "").toLowerCase()));
  return Array.from(unique);
}

/**
 * 任务风险评估（Risk Assessment）
 * 输出: { level: "low" | "medium" | "high", reasons: string[], interruptLevel: 1 | 2 | 3, fileCount: number }
 */
export function assessTaskRisk(task = {}) {
  const text = `${task.title || ""}\n${task.description || ""}\n${(task.acceptanceCriteria || []).join(" ")}`;
  const reasons = [];

  // 1. 显式指定高风险
  if (task.riskLevel === "high" || task.risk_level === "high") {
    reasons.push("创建时显式指定为高风险 (Explicit High Risk)");
  }

  // 2. 高风险特征检测 (Level 1 立即打断，需创始人审批)
  for (const { regex, reason } of HIGH_RISK_PATTERNS) {
    if (regex.test(text)) {
      reasons.push(reason);
    }
  }

  if (reasons.length > 0) {
    return {
      level: "high",
      reasons,
      interruptLevel: 1,
      fileCount: extractMentionedFiles(text).length
    };
  }

  // 3. 中风险特征检测 (自动启用 Boost，但无需 Founder 签字打断)
  const mediumReasons = [];

  // 3.1 涉及 3 个及以上文件
  const mentionedFiles = extractMentionedFiles(text);
  const explicitFiles = Array.isArray(task.files) ? task.files.length : 0;
  const fileCount = Math.max(mentionedFiles.length, explicitFiles);
  if (fileCount >= 3 || /(?:3\s*个文件|三个文件|多文件|多个文件|跨文件)/i.test(text)) {
    mediumReasons.push(`涉及 3 个及以上文件 (匹配到 ${fileCount >= 3 ? fileCount : '3+'} 个文件)`);
  }

  // 3.2 匹配中风险高阶特征
  for (const { regex, reason } of MEDIUM_RISK_TRIGGERS) {
    if (regex.test(text)) {
      mediumReasons.push(reason);
    }
  }

  if (task.riskLevel === "medium" || task.risk_level === "medium") {
    mediumReasons.push("显式标记为中风险任务");
  }

  if (mediumReasons.length > 0) {
    return {
      level: "medium",
      reasons: mediumReasons,
      interruptLevel: 2,
      fileCount
    };
  }

  // 4. 普通低风险任务
  return {
    level: "low",
    reasons: ["常规低风险任务（文案修改/小范围UI/单文件修改/明确方案重复执行）"],
    interruptLevel: 3,
    fileCount
  };
}

/**
 * 推理模式与连续重试升级评估 (Reasoning Mode & Retry Escalation)
 */
export function evaluateReasoningMode(task = {}, options = {}) {
  const retryCount = options.retry_count !== undefined ? options.retry_count : (task.retry_count || 0);
  const risk = assessTaskRisk(task);
  const text = `${task.title || ""}\n${task.description || ""}`;

  // 连续失败升级规则 (Rule 3)
  // 第 3 次及以上失败：熔断，停止自动修改，请求上级/人工审核
  if (retryCount >= 3) {
    return {
      reasoning_mode: "boost",
      boost_reason: `连续第 ${retryCount} 次失败：已触发推理升级熔断保护，停止自动修改并请求审核`,
      risk_level: risk.level,
      retry_count: retryCount,
      stop_for_review: true
    };
  }

  // 第 2 次失败：自动升级启用 boost
  if (retryCount === 2) {
    return {
      reasoning_mode: "boost",
      boost_reason: "连续第 2 次失败：自动升级启用 Boost 深度推理与多智能体验证",
      risk_level: risk.level,
      retry_count: retryCount,
      stop_for_review: false
    };
  }

  // 显式指定 Boost
  if (task.boost === true || options.boost === true) {
    return {
      reasoning_mode: "boost",
      boost_reason: "任务配置显式要求启用 Boost 模式",
      risk_level: risk.level,
      retry_count: retryCount,
      stop_for_review: false
    };
  }

  // 规则 2: 中、高风险任务自动启用 Boost
  if (risk.level === "high" || risk.level === "medium") {
    return {
      reasoning_mode: "boost",
      boost_reason: risk.reasons.join("；"),
      risk_level: risk.level,
      retry_count: retryCount,
      stop_for_review: false
    };
  }

  // 规则 2: 涉及多个 Agent 协同或 Hermes 编排
  if (task.delegateToHermes === true || /(?:多\s*agent|multi-?agent|协同|协作|协同作业|coordination)/i.test(text)) {
    return {
      reasoning_mode: "boost",
      boost_reason: "涉及多个 Agent 协同编排，启用 Boost 模式",
      risk_level: risk.level,
      retry_count: retryCount,
      stop_for_review: false
    };
  }

  // 规则 1: 普通低风险任务默认使用 normal 模式
  return {
    reasoning_mode: "normal",
    boost_reason: null,
    risk_level: "low",
    retry_count: retryCount,
    stop_for_review: false
  };
}

/**
 * Boost 6 维验收质检 (Rule 4)
 * 每个中高风险任务完成后执行:
 * 1. requirement_completion: 是否真正完成需求
 * 2. scope_boundary: 是否修改了不该修改的内容 (越界排查)
 * 3. existing_functionality: 是否破坏已有功能 (测试及断言)
 * 4. test_sufficiency: 测试是否充分
 * 5. phase_boundary: 是否跨越当前 Phase
 * 6. regression_risk: 是否存在隐藏回归风险
 */
export async function runBoostVerification({
  projectPath,
  result,
  config,
  task = {},
  standardVerification = { ok: true, checks: [] }
}) {
  const boostChecks = [];

  // 1. 是否真正完成需求 (requirement_completion)
  const hasUsableOutput = Boolean((result?.message || result?.preview || "").trim());
  const standardPassed = Boolean(standardVerification?.ok && result?.ok);
  boostChecks.push({
    name: "requirement_completion",
    label: "需求实质完成度",
    ok: standardPassed && hasUsableOutput,
    detail: standardPassed && hasUsableOutput
      ? "Worker 产出有效成果且基础机器验收全部通过"
      : "需求未实质完成或基础机器验收未通过"
  });

  // 2. 是否修改了不该修改的内容 (scope_boundary 越界安全排查)
  let scopeSafe = true;
  let scopeDetail = "未越界，变更严格限制在授权范围";
  const forbiddenPatterns = [
    /\.env$/i,
    /id_rsa/i,
    /\.pem$/i,
    /auth\.json$/i,
    /cookie/i,
    /billing.*card/i
  ];

  const artifacts = Array.isArray(result?.deliverables) ? result.deliverables : [];
  for (const item of artifacts) {
    const p = typeof item === "string" ? item : item?.path || "";
    if (forbiddenPatterns.some((rgx) => rgx.test(p))) {
      scopeSafe = false;
      scopeDetail = `检测到触碰隐私/凭据敏感路径：${p}`;
      break;
    }
  }
  boostChecks.push({
    name: "scope_boundary",
    label: "修改范围与边界",
    ok: scopeSafe,
    detail: scopeDetail
  });

  // 3. 是否破坏已有功能 (existing_functionality)
  const failedStandard = (standardVerification?.checks || []).filter((c) => !c.ok);
  const functionalIntact = failedStandard.length === 0;
  boostChecks.push({
    name: "existing_functionality",
    label: "已有功能完好性",
    ok: functionalIntact,
    detail: functionalIntact
      ? "所有既有测试检查与回归断言均正常通过"
      : `检测到破坏已有功能：${failedStandard.map((c) => c.name).join(", ")}`
  });

  // 4. 测试是否充分 (test_sufficiency)
  const executedChecks = (standardVerification?.checks || []).length;
  const testSufficient = executedChecks >= 1;
  boostChecks.push({
    name: "test_sufficiency",
    label: "测试充分性",
    ok: testSufficient,
    detail: testSufficient
      ? `已执行 ${executedChecks} 项显式验收项与自动化测试`
      : "缺乏自动化或显式测试验收用例"
  });

  // 5. 是否跨越当前 Phase (phase_boundary)
  const taskText = `${task.title || ""}\n${task.description || ""}`;
  let phaseRespected = true;
  let phaseDetail = "严格限制在当前 Phase 目标范围";
  if (/未经批准直接发布生产|绕过审批扣款|私自外发真实消息/i.test(taskText)) {
    phaseRespected = false;
    phaseDetail = "任务企图越过 Phase 边界直接调用未授权外部操作";
  }
  boostChecks.push({
    name: "phase_boundary",
    label: "Phase 阶段边界",
    ok: phaseRespected,
    detail: phaseDetail
  });

  // 6. 是否存在隐藏回归风险 (regression_risk)
  const stderrWarnings = String(result?.stderr || "");
  const hasSevereWarning = /fatal|unhandledRejection|syntaxerror|referenceerror/i.test(stderrWarnings);
  boostChecks.push({
    name: "regression_risk",
    label: "隐藏回归风险排查",
    ok: !hasSevereWarning,
    detail: !hasSevereWarning
      ? "无致命未捕获异常、无语法错误或严重运行时警告"
      : `排查到隐藏回归异常警告: ${stderrWarnings.slice(0, 100)}`
  });

  const allPassed = boostChecks.every((c) => c.ok);
  return {
    ok: allPassed && standardPassed,
    boost_verified: true,
    reason: allPassed ? "Boost 6 维质检全部通过" : boostChecks.filter((c) => !c.ok).map((c) => `${c.label}未通过: ${c.detail}`).join("；"),
    checks: standardVerification?.checks || [],
    boost_checks: boostChecks,
    summary: allPassed
      ? "Boost 深度质检通过：需求实质达成、范围受控、功能完好、测试充分、Phase 边界合规、无隐藏回归"
      : "Boost 质检发现潜在缺陷或风险"
  };
}

/**
 * 连续失败熔断审计报告 (Failure Audit Report)
 */
export function createFailureAuditReport(task = {}, lastResult = {}, lastVerification = {}) {
  const at = new Date().toISOString();
  return {
    taskId: task.id,
    title: task.title,
    retry_count: task.retry_count || 3,
    halted_at: at,
    reason: "连续 3 次失败触发推理升级策略熔断保护（Reasoning Escalation Policy Halting）",
    last_error: lastResult?.error || lastResult?.stderr || lastVerification?.reason || "未知异常",
    audit_recommendations: [
      "1. 停止当前 Worker 的盲目返工，避免消耗无效思考 token 与产生代码脏改动；",
      "2. 将失败上下文与质检差异移交高级工程师（Codex 或 Grok Build）审查；",
      "3. 需人工介入确认需求是否存在歧义或环境存在不可控外部阻碍。"
    ]
  };
}
