/**
 * Learning Ledger & Peer Adaptation Module (R4)
 * Autonomous Content Operating Company (一人内容公司)
 *
 * Requirements:
 * 1. Strictly no subjective "content got better" claims (Content OS CARD 14).
 * 2. 9 Hard Objective Metrics:
 *    - impressions: 曝光量
 *    - clicks / views: 点击/阅读量
 *    - dwell_time / avgStaySeconds: 停留时长 (秒)
 *    - likes: 点赞
 *    - collects / saves: 收藏
 *    - comments: 评论
 *    - follows / followersGained: 关注
 *    - dms: 私信咨询
 *    - conversions_gmv / conversions / gmv: 成交转化
 * 3. validateAndNormalizeMetrics: handles zero impressions safely (no NaN/Infinity), rejects negative or invalid values.
 * 4. diagnoseFunnel: deterministic CARD 14 funnel diagnosis (low exposure, low click, low read, low save, low follow, low conversion, healthy).
 * 5. deconstructPeerNote: extracts competitor hook formulas, structural patterns, and visual takeaways.
 * 6. recordCycleExperiment: appends structured JSONL record to data/learning/ledger.jsonl and updates current_strategy.json.
 * 7. getLatestStrategyVector: retrieves active strategy deltas for subsequent generation runs.
 * 8. applyFeedbackToTopicSelection: closed-loop consumption adjusting candidate hook and topic weights.
 */

import fs from "fs";
import path from "path";

// ============================================================================
// CONSTANTS & DEFINITIONS
// ============================================================================

export const METRIC_NAMES = Object.freeze([
  "impressions",
  "clicks",
  "views",
  "dwell_time",
  "avgStaySeconds",
  "likes",
  "collects",
  "saves",
  "comments",
  "follows",
  "followersGained",
  "dms",
  "conversions_gmv",
  "conversions",
  "gmv"
]);

export const DEFAULT_BASELINES = Object.freeze({
  minExposure: 1000,
  minCtr: 0.03, // 3%
  minDwellSeconds: 15, // 15 seconds
  minSaveRate: 0.03, // 3%
  minFollowRate: 0.01, // 1%
  minConversionRate: 0.005 // 0.5%
});

export const FUNNEL_STAGES = Object.freeze({
  LOW_EXPOSURE: "low_exposure",
  LOW_CLICK: "low_click",
  LOW_READ: "low_read",
  LOW_SAVE: "low_save",
  LOW_FOLLOW: "low_follow",
  LOW_CONVERSION: "low_conversion",
  HEALTHY: "healthy"
});

export const DEFAULT_STRATEGY_VECTOR = Object.freeze({
  version: 1,
  preferredHookFormulas: ["paradox", "actionable_list", "curiosity", "fact_check"],
  topicWeights: {
    cognitive_growth: 1.2,
    solopreneur: 1.1,
    anti_anxiety: 1.0,
    fact_check: 1.3
  },
  coverLayouts: ["minimalist_black", "editorial_card"],
  ctaHooks: ["book_recommendation", "lead_magnet_toolkit"],
  targetPersona: "20-30岁高内耗年轻职场人与创业者",
  callToAction: "收藏这一页，留给下一次重读。",
  lastUpdated: new Date().toISOString()
});

// ============================================================================
// 1. METRIC VALIDATION & NORMALIZATION
// ============================================================================

/**
 * Validates and normalizes all 9 hard objective metrics.
 * Rejects negative, non-numeric, or invalid values.
 * Safely computes ratios without division by zero (no NaN, no Infinity).
 *
 * @param {object} rawMetrics - Raw metrics input
 * @returns {object} Normalized metrics with rates
 */
export function validateAndNormalizeMetrics(rawMetrics = {}) {
  if (!rawMetrics || typeof rawMetrics !== "object" || Array.isArray(rawMetrics)) {
    throw new Error("Invalid metrics: must be a non-null object");
  }

  // Check all supplied recognized keys for invalid or negative numbers
  for (const [key, val] of Object.entries(rawMetrics)) {
    if (METRIC_NAMES.includes(key)) {
      if (typeof val !== "number" || Number.isNaN(val) || !Number.isFinite(val) || val < 0) {
        throw new Error(`Invalid metric "${key}": must be a non-negative finite number, received ${val}`);
      }
    }
  }

  // Extract 9 dimensions with safe fallbacks and cross-alias resolution
  const impressions = Number(rawMetrics.impressions ?? 0);
  const views = Number(rawMetrics.views ?? rawMetrics.clicks ?? 0);
  const clicks = views;
  const dwell_time = Number(rawMetrics.dwell_time ?? rawMetrics.avgStaySeconds ?? 0);
  const avgStaySeconds = dwell_time;
  const likes = Number(rawMetrics.likes ?? 0);
  const collects = Number(rawMetrics.collects ?? rawMetrics.saves ?? 0);
  const saves = collects;
  const comments = Number(rawMetrics.comments ?? 0);
  const follows = Number(rawMetrics.follows ?? rawMetrics.followersGained ?? 0);
  const followersGained = follows;
  const dms = Number(rawMetrics.dms ?? 0);
  const conversions_gmv = Number(rawMetrics.conversions_gmv ?? rawMetrics.conversions ?? rawMetrics.gmv ?? 0);
  const conversions = conversions_gmv;

  // Zero-division protected funnel rates
  const ctr = impressions > 0 ? views / impressions : 0;
  const saveRate = views > 0 ? collects / views : 0;
  const engagementRate = views > 0 ? (likes + collects + comments) / views : 0;
  const followRate = views > 0 ? follows / views : 0;
  const conversionRate = views > 0 ? conversions_gmv / views : 0;

  return {
    impressions,
    views,
    clicks,
    dwell_time,
    avgStaySeconds,
    likes,
    collects,
    saves,
    comments,
    follows,
    followersGained,
    dms,
    conversions_gmv,
    conversions,
    gmv: conversions_gmv,
    ctr,
    saveRate,
    engagementRate,
    followRate,
    conversionRate,
    rates: {
      ctr,
      saveRate,
      engagementRate,
      followRate,
      conversionRate
    }
  };
}

// ============================================================================
// 2. DETERMINISTIC FUNNEL DIAGNOSIS (CARD 14)
// ============================================================================

/**
 * Deterministic funnel bottleneck diagnosis strictly following Content OS CARD 14:
 * "数据诊断，而不是数据总结。禁止输出主观自嗨。必须定位漏斗。"
 *
 * Hierarchy:
 * - 曝光低: 检查 选题 / 标签 / 初始反馈 / 内容匹配
 * - 曝光高 + 点击低: 检查 标题 / 封面 / 选题包装
 * - 点击高 + 阅读低: 判断 Hook 成功，正文失败
 * - 阅读高 + 收藏低: 判断 内容可能有趣，但长期价值不足
 * - 收藏高 + 关注低: 判断 单篇有价值，但账号持续价值承诺不足
 * - 互动良好 + 转化低: 检查 变现CTA钩子 / 信任递进 / 商品匹配度
 * - 达标: 固化致胜因子并记录 Strategy Memory
 *
 * @param {object} metricsInput - Raw or normalized metrics
 * @param {object} [baselines] - Baseline thresholds
 * @returns {object} Structured funnel diagnosis report
 */
export function diagnoseFunnel(metricsInput = {}, baselines = {}) {
  const norm = validateAndNormalizeMetrics(metricsInput);
  const cfg = { ...DEFAULT_BASELINES, ...baselines };

  let stage = FUNNEL_STAGES.HEALTHY;
  let bottleneck = "";
  let card14Rule = "";
  let checks = [];
  let verdict = "baseline";

  // CARD 14 Funnel evaluation order
  if (norm.impressions < cfg.minExposure) {
    // 1. 曝光低
    stage = FUNNEL_STAGES.LOW_EXPOSURE;
    bottleneck = "low_exposure: 曝光量过低 (<1000)，内容未能突破初级推荐池";
    card14Rule = "CARD 14: 曝光低 -> 检查：选题 / 标签 / 初始反馈 / 内容匹配";
    checks = ["选题吸引力", "垂直标签权重", "冷启动初始受众反馈", "内容与受众胃口匹配度"];
    verdict = "underperformed";
  } else if (norm.ctr < cfg.minCtr) {
    // 2. 曝光高 + 点击低
    stage = FUNNEL_STAGES.LOW_CLICK;
    bottleneck = `low_click: 曝光高 (${norm.impressions}) 但点击低 (CTR: ${(norm.ctr * 100).toFixed(2)}% < ${(cfg.minCtr * 100)}%)，标题与封面 (cover) 包装脱节`;
    card14Rule = "CARD 14: 曝光高 + 点击低 -> 检查：标题 / 封面 / 选题包装";
    checks = ["前3秒Hook标题", "首图封面视觉冲击力", "高反差痛点包装", "字号与排版留白"];
    verdict = "underperformed";
  } else if (norm.dwell_time < cfg.minDwellSeconds) {
    // 3. 点击高 + 阅读低 (dwell / read)
    stage = FUNNEL_STAGES.LOW_READ;
    bottleneck = `low_read: 点击良好但平均停留偏低 (dwell: ${norm.dwell_time}s < ${cfg.minDwellSeconds}s)，Hook有效但正文前30字留存失败`;
    card14Rule = "CARD 14: 点击高 + 阅读低 -> 判断：Hook 成功，正文失败";
    checks = ["剔除冗余说教(CARD 07)", "正文前30字反转节奏", "图文卡片阅读阻力", "排版段落呼吸感"];
    verdict = "underperformed";
  } else if (norm.saveRate < cfg.minSaveRate) {
    // 4. 阅读高 + 收藏低 (save / collect)
    stage = FUNNEL_STAGES.LOW_SAVE;
    bottleneck = `low_save: 阅读留存达标但收藏偏低 (saveRate: ${(norm.saveRate * 100).toFixed(2)}% < ${(cfg.minSaveRate * 100)}%)，内容有趣但缺乏长期复用价值`;
    card14Rule = "CARD 14: 阅读高 + 收藏低 -> 判断：内容可能有趣，但长期价值不足";
    checks = ["可执行清单工具包", "结构化认知框架", "避坑指南模板", "即查即用参考资料"];
    verdict = "underperformed";
  } else if (norm.followRate < cfg.minFollowRate && norm.views >= 500) {
    // 5. 收藏高 + 关注低
    stage = FUNNEL_STAGES.LOW_FOLLOW;
    bottleneck = `low_follow: 单篇互动良好但关注率偏低 (followRate: ${(norm.followRate * 100).toFixed(2)}% < ${(cfg.minFollowRate * 100)}%)，单篇有价值但账号持续价值承诺不足`;
    card14Rule = "CARD 14: 收藏高 + 关注低 -> 判断：单篇有价值，但账号持续价值承诺不足";
    checks = ["主页定位清晰度", "连载专栏一致性", "个人IP信任背书", "关注后预期收益承诺"];
    verdict = "baseline";
  } else if (norm.conversions_gmv === 0 && norm.views >= 1000) {
    // 6. 转化低
    stage = FUNNEL_STAGES.LOW_CONVERSION;
    bottleneck = `low_conversion: 阅读与互动达标但商业转化停滞 (GMV: 0)，CTA钩子与信任递进不足`;
    card14Rule = "CARD 14: 互动良好 + 低转化 -> 检查：变现CTA钩子 / 信任递进 / 商品匹配度";
    checks = ["正文末尾变现CTA卡片", "好物/图书推荐关联度", "痛点解决方案直接性", "行动呼吁(CTA)门槛"];
    verdict = "baseline";
  } else {
    // 7. 健康增长
    stage = FUNNEL_STAGES.HEALTHY;
    bottleneck = "healthy: 全漏斗指标健康，正向反馈达标，各转化节点平稳推进";
    card14Rule = "CARD 14: 全链路健康 -> 固化致胜因子并沉淀至 Strategy Memory";
    checks = ["固化致胜选题Hook公式", "提炼封面排版模板", "加大同类爆款供给"];
    verdict = "outperformed";
  }

  return {
    stage,
    bottleneck,
    card14Rule,
    checks,
    verdict,
    ctr: norm.ctr,
    saveRate: norm.saveRate,
    engagementRate: norm.engagementRate,
    followRate: norm.followRate,
    conversionRate: norm.conversionRate,
    metrics: norm
  };
}

// Backward-compatible alias
export const diagnosePerformance = diagnoseFunnel;

// ============================================================================
// 3. COMPETITOR BENCHMARK NOTE DECONSTRUCTION (Peer Learning)
// ============================================================================

/**
 * Deconstructs competitor high-engagement notes into hook formula,
 * structural layout patterns, and visual highlights.
 *
 * @param {object} peerNote - Note with title, body, and metrics
 * @returns {object} Deconstructed formula and structural breakdown
 */
export function deconstructPeerNote(peerNote = {}) {
  const title = String(peerNote.title || "").trim();
  const body = String(peerNote.body || "").trim();
  const metrics = peerNote.metrics || {};

  // 1. Detect Hook Formula from title patterns
  let hookFormula = "paradox_anti_common_sense";
  let hookType = "paradox";
  let hookDescription = "反常识认知反差型 (Paradox / Anti-Common-Sense)";

  if (/为什么.*越.*反而|反常识|悖论|反直觉|以为.*其实|底层是对.*防御/.test(title + body)) {
    hookFormula = "paradox_anti_common_sense";
    hookType = "paradox";
    hookDescription = "反常识认知反差型 (Paradox / Anti-Common-Sense)";
  } else if (/为什么|怎么|如何|秘密|内幕|潜规则|\d+个|\d+步|仅需/.test(title)) {
    hookFormula = "curiosity_action_list";
    hookType = "curiosity";
    hookDescription = "好奇驱动疑问型 (Curiosity / Question Hook)";
  } else if (/清单|指南|模型|SOP|步骤|方法|干货|操作手册/.test(title)) {
    hookFormula = "actionable_checklist";
    hookType = "actionable_list";
    hookDescription = "即刻可执行清单型 (Actionable List)";
  } else if (/内耗|焦虑|普通人|穷人|迷茫|自卑|自救|停止/.test(title)) {
    hookFormula = "pain_resonance";
    hookType = "pain_resonance";
    hookDescription = "痛点共鸣与扎心洞察型 (Pain Resonance)";
  } else if (/辟谣|打假|求真|外网|真实|我查了资料/.test(title)) {
    hookFormula = "fact_check_mythbusting";
    hookType = "fact_check";
    hookDescription = "信息质检与事实求真打假型 (Fact-Checking & Mythbusting)";
  }

  // 2. Deconstruct body structural pattern
  const sentences = body.split(/[。！？\n]+/).filter(Boolean);
  const structure = {
    openingHook: sentences.slice(0, 2).join("。"),
    painPointReframe: sentences.length > 2 ? sentences.slice(2, 4).join("。") : "核心痛点重构",
    actionSteps: sentences.filter((s) => /步|点|条|方法|建议|\d+/.test(s)).slice(0, 4),
    cta: sentences.at(-1) || "行动号召收尾"
  };

  if (structure.actionSteps.length === 0 && sentences.length > 3) {
    structure.actionSteps = sentences.slice(3, 6);
  }

  // 3. Extract visual highlights & takeaways
  const visualHighlights = [
    "大字反差疑问句封面 (High Contrast Question Headline)",
    "首屏极简黑底高级质感 (Minimalist Dark Layout)",
    "3步结构化卡片排版 (Multi-Card Structured Layout)",
    "强调色高亮核心关键词与避坑要点"
  ];

  const totalInteractions =
    (metrics.likes || 0) + (metrics.collects || 0) * 1.5 + (metrics.comments || 0) * 2;

  return {
    title,
    hookFormula,
    hookType,
    hookDescription,
    structure,
    visualHighlights,
    totalInteractions,
    recommendations: [
      `将对标公式「${hookDescription}」应用于下一篇选题`,
      "保持正文前30字迅速切入反转痛点",
      "末尾嵌入可执行清单促成收藏转化"
    ]
  };
}

// Backward-compatible plural alias
export function dissectPeerHitNotes(notes = [], options = {}) {
  const noteList = Array.isArray(notes) ? notes : [notes];
  return noteList.map((n) => deconstructPeerNote(n));
}

// ============================================================================
// 4. LEARNING LEDGER ARCHIVE & STRATEGY UPDATE
// ============================================================================

/**
 * Appends a structured experiment record to `data/learning/ledger.jsonl`,
 * writes updated strategy deltas to `data/learning/current_strategy.json`,
 * and optionally emits an OS learning event.
 *
 * @param {object} entryData - Cycle experiment payload
 * @param {object} [options] - Options (ledgerPath, strategyPath, emitEvent)
 * @returns {object} Result with persisted status, ledgerEntry, and next_strategy
 */
export function recordCycleExperiment(entryData = {}, options = {}) {
  const opts = { ...options, ...(entryData.options || {}) };
  const ledgerPath = opts.ledgerPath || path.resolve(process.cwd(), "data/learning/ledger.jsonl");
  const strategyPath = opts.strategyPath || path.resolve(process.cwd(), "data/learning/current_strategy.json");

  // Ingest & normalize all 9 dimensions (strict validation)
  const normalizedMetrics = validateAndNormalizeMetrics(entryData.metrics || {});

  // Run deterministic funnel diagnosis
  const diagnosis = diagnoseFunnel(normalizedMetrics, opts.baselines);

  // Derive winning & losing factors objectively
  const winningFactors = [];
  const losingFactors = [];

  if (normalizedMetrics.ctr >= 0.03) {
    winningFactors.push(
      `高点击率 (CTR: ${(normalizedMetrics.ctr * 100).toFixed(1)}%) 验证 topicHook: ${entryData.variables?.topicHook || "默认"}`
    );
  } else {
    losingFactors.push(
      `点击率偏低 (CTR: ${(normalizedMetrics.ctr * 100).toFixed(1)}%)，需优化封面与Hook`
    );
  }

  if (normalizedMetrics.dwell_time >= 20) {
    winningFactors.push(`充足停留时长 (${normalizedMetrics.dwell_time}s) 反映正文留存高`);
  } else if (normalizedMetrics.impressions >= 1000 && normalizedMetrics.ctr >= 0.03) {
    losingFactors.push(`正文停留过短 (${normalizedMetrics.dwell_time}s)，存在说教冗余`);
  }

  if (normalizedMetrics.saveRate >= 0.03) {
    winningFactors.push(`高收藏率 (${(normalizedMetrics.saveRate * 100).toFixed(1)}%) 证明长期实用价值`);
  } else if (normalizedMetrics.views >= 500) {
    losingFactors.push(`收藏率滞后 (${(normalizedMetrics.saveRate * 100).toFixed(1)}%)，需强化清单交付`);
  }

  if (normalizedMetrics.conversions_gmv > 0) {
    winningFactors.push(`商业转化成功产生 GMV: ￥${normalizedMetrics.conversions_gmv}`);
  }

  const attributionScore = Math.min(
    100,
    Math.round(
      normalizedMetrics.ctr * 1000 +
        normalizedMetrics.saveRate * 800 +
        normalizedMetrics.followRate * 1500 +
        (normalizedMetrics.conversions_gmv > 0 ? 25 : 0)
    )
  );

  const conclusions = {
    stage: diagnosis.stage,
    bottleneck: diagnosis.bottleneck,
    verdict: diagnosis.verdict,
    winningFactors,
    losingFactors,
    attributionScore,
    card14Rule: diagnosis.card14Rule,
    checks: diagnosis.checks
  };

  // Derive next strategy vector based on hard conclusions
  const currentStrategy = getLatestStrategyVector({ ledgerPath, strategyPath });
  const nextStrategy = computeNextStrategy(currentStrategy, entryData.variables || {}, conclusions);

  const ledgerEntry = {
    cycleId: entryData.cycleId || `cycle-${Date.now()}`,
    timestamp: new Date().toISOString(),
    noteId: entryData.noteId || null,
    variables: entryData.variables || {},
    metrics: normalizedMetrics,
    conclusions,
    next_strategy: nextStrategy
  };

  // Auto-create parent folders safely
  const ledgerDir = path.dirname(ledgerPath);
  if (!fs.existsSync(ledgerDir)) {
    fs.mkdirSync(ledgerDir, { recursive: true });
  }
  const strategyDir = path.dirname(strategyPath);
  if (!fs.existsSync(strategyDir)) {
    fs.mkdirSync(strategyDir, { recursive: true });
  }

  // Persist JSONL ledger record
  fs.appendFileSync(ledgerPath, JSON.stringify(ledgerEntry) + "\n", "utf8");

  // Persist latest strategy vector
  try {
    fs.writeFileSync(strategyPath, JSON.stringify(nextStrategy, null, 2), "utf8");
  } catch {}

  // Optionally emit OS Learning Event if available
  if (opts.emitEvent !== false) {
    try {
      import("../learning/router.js")
        .then(({ emitLearningEvent }) => {
          emitLearningEvent({
            type: conclusions.verdict === "outperformed" ? "CONTENT_OUTPERFORMED" : "CONTENT_UNDERPERFORMED",
            domain: "content_performance",
            subject: { kind: "cycle_experiment", id: ledgerEntry.cycleId },
            metrics: normalizedMetrics
          });
        })
        .catch(() => {});
    } catch {}
  }

  return {
    persisted: true,
    ledgerEntry,
    next_strategy: nextStrategy
  };
}

/**
 * Computes updated strategy vector from previous state and cycle results.
 */
function computeNextStrategy(currentStrategy, variables, conclusions) {
  const updated = {
    ...DEFAULT_STRATEGY_VECTOR,
    ...currentStrategy,
    version: (currentStrategy.version || 1) + 1,
    lastUpdated: new Date().toISOString()
  };

  const topicWeights = { ...(updated.topicWeights || {}) };
  let preferredHookFormulas = [...(updated.preferredHookFormulas || [])];
  const coverLayouts = [...(updated.coverLayouts || ["minimalist_black", "editorial_card"])];
  const ctaHooks = [...(updated.ctaHooks || ["book_recommendation", "lead_magnet_toolkit"])];

  const currentHook = variables.topicHook;

  if (conclusions.verdict === "outperformed") {
    // Elevate winning hook formula
    if (currentHook && typeof currentHook === "string" && !Object.prototype.hasOwnProperty.call(Object.prototype, currentHook)) {
      preferredHookFormulas = [currentHook, ...preferredHookFormulas.filter((h) => h !== currentHook)];
      const currentWeight = typeof topicWeights[currentHook] === "number" ? topicWeights[currentHook] : 1.0;
      topicWeights[currentHook] = Number((currentWeight + 0.2).toFixed(2));
    }
  } else if (conclusions.stage === FUNNEL_STAGES.LOW_CLICK) {
    // Low click -> shift to high contrast paradox/actionable list hooks
    preferredHookFormulas = ["paradox", "actionable_list", ...preferredHookFormulas.filter((h) => h !== "paradox" && h !== "actionable_list")];
    if (!coverLayouts.includes("high_contrast_yellow")) {
      coverLayouts.unshift("high_contrast_yellow");
    }
  } else if (conclusions.stage === FUNNEL_STAGES.LOW_SAVE) {
    // Low save -> prioritize actionable lists and toolkit CTAs
    preferredHookFormulas = ["actionable_list", ...preferredHookFormulas.filter((h) => h !== "actionable_list")];
    if (!ctaHooks.includes("lead_magnet_toolkit")) {
      ctaHooks.unshift("lead_magnet_toolkit");
    }
  }

  updated.preferredHookFormulas = preferredHookFormulas;
  updated.topicWeights = topicWeights;
  updated.coverLayouts = coverLayouts;
  updated.ctaHooks = ctaHooks;

  return updated;
}

// ============================================================================
// 5. GET LATEST STRATEGY VECTOR (Closed-Loop Retrieval)
// ============================================================================

/**
 * Retrieves the latest active strategy vector from `current_strategy.json` or `ledger.jsonl`.
 * Tolerates corrupted or missing JSONL lines gracefully.
 *
 * @param {object} [options] - Options (ledgerPath, strategyPath)
 * @returns {object} Latest active strategy vector
 */
export function getLatestStrategyVector(options = {}) {
  const ledgerPath = options.ledgerPath || path.resolve(process.cwd(), "data/learning/ledger.jsonl");
  const strategyPath = options.strategyPath || path.resolve(process.cwd(), "data/learning/current_strategy.json");

  // 1. If explicit ledgerPath provided or exists, read latest valid entry
  if (options.ledgerPath && fs.existsSync(ledgerPath)) {
    const fromLedger = readStrategyFromLedger(ledgerPath);
    if (fromLedger) return fromLedger;
  }

  // 2. Read from current_strategy.json if available
  if (fs.existsSync(strategyPath)) {
    try {
      const raw = fs.readFileSync(strategyPath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return { ...DEFAULT_STRATEGY_VECTOR, ...parsed };
      }
    } catch {}
  }

  // 3. Fallback: scan default ledger file if it exists
  if (fs.existsSync(ledgerPath)) {
    const fromLedger = readStrategyFromLedger(ledgerPath);
    if (fromLedger) return fromLedger;
  }

  // 4. Return default baseline strategy vector
  return { ...DEFAULT_STRATEGY_VECTOR };
}

// Backward-compatible alias
export function getCurrentStrategy(accountId = "xhs_account_1", options = {}) {
  return getLatestStrategyVector(options);
}

/**
 * Reads the latest valid strategy vector from a JSONL ledger file,
 * gracefully skipping corrupted or incomplete lines.
 */
function readStrategyFromLedger(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");
    let latestStrategy = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const entry = JSON.parse(trimmed);
        if (entry.next_strategy && typeof entry.next_strategy === "object") {
          latestStrategy = entry.next_strategy;
        } else if (entry.preferredHookFormulas || entry.topicWeights) {
          latestStrategy = entry;
        }
      } catch {
        // Tolerates corrupted lines gracefully
      }
    }

    if (latestStrategy) {
      return { ...DEFAULT_STRATEGY_VECTOR, ...latestStrategy };
    }
  } catch {}
  return null;
}

// ============================================================================
// 6. CLOSED-LOOP CONSUMPTION: APPLY FEEDBACK TO TOPIC SELECTION
// ============================================================================

/**
 * Closed-Loop Consumption:
 * Ingests topic or hook candidates and applies strategy vector adjustments (mandatory consumption).
 * Adjusts candidate weights based on active strategy memory.
 *
 * @param {Array<object|string>} candidates - Candidate topics or hooks
 * @param {object} [strategyVector] - Active strategy vector (fetches latest if omitted)
 * @returns {Array<object>} Ranked candidates with adjusted scores
 */
export function applyFeedbackToTopicSelection(candidates = [], strategyVector = null) {
  const strategy = strategyVector || getLatestStrategyVector();
  const preferredHooks = strategy.preferredHookFormulas || [];
  const topicWeights = strategy.topicWeights || {};

  return candidates.map((item) => {
    const candidate = typeof item === "string" ? { title: item, hookType: "curiosity", score: 1.0 } : { ...item };
    const baseScore = candidate.score ?? 1.0;
    let boost = 0;
    const reasons = [];

    // 1. Hook formula match boost
    if (candidate.hookType && preferredHooks.includes(candidate.hookType)) {
      const rankIndex = preferredHooks.indexOf(candidate.hookType);
      const hookBonus = Math.max(0.1, 0.3 - rankIndex * 0.05);
      boost += hookBonus;
      reasons.push(`匹配高优先级Hook公式 [${candidate.hookType}] (+${hookBonus.toFixed(2)})`);
    }

    // 2. Topic weight multiplier
    if (candidate.topic && topicWeights[candidate.topic]) {
      const weightDelta = topicWeights[candidate.topic] - 1.0;
      boost += weightDelta;
      reasons.push(`匹配优势垂类权重 [${candidate.topic}] (${weightDelta >= 0 ? "+" : ""}${weightDelta.toFixed(2)})`);
    }

    // 3. Fact check directive boost
    if (candidate.isFactCheck || candidate.hookType === "fact_check") {
      boost += 0.25;
      reasons.push("求真质检模式优先级加成 (+0.25)");
    }

    const adjustedScore = Number((baseScore + boost).toFixed(3));

    return {
      ...candidate,
      originalScore: baseScore,
      adjustedScore,
      strategyVersion: strategy.version || 1,
      feedbackApplied: true,
      attributionNotes: reasons.join("; ") || "基础基准权重"
    };
  }).sort((a, b) => b.adjustedScore - a.adjustedScore);
}
