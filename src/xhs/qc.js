import { getContentObject, updateContentObject, CONTENT_STATES } from "./contentObject.js";
import { getXhsPolicy } from "./policy.js";

const BANNED_AI_CLICHES = [
  "底层逻辑",
  "赋能",
  "闭环",
  "维度",
  "颠覆认知",
  "在这个快节奏的时代",
  "总有一款适合你",
  "建议收藏反复阅读",
  "干货满满",
  "格局打开"
];

const PROHIBITED_AD_WORDS = [
  "全网第一",
  "绝对保真",
  "包赚",
  "百分百有效",
  "独家首创",
  "稳赚不赔"
];

export function verifyContent(contentId, options = {}) {
  const obj = getContentObject(contentId, options);
  if (!obj) throw new Error(`Content object not found: ${contentId}`);

  const pkg = obj.package || {};
  const text = `${pkg.title || ""} ${pkg.body || ""}`;
  const policy = getXhsPolicy(obj.account, options) || {};
  const minQuality = policy.qc_min_quality ?? 0.80;
  const maxRisk = policy.qc_max_risk ?? 0.30;

  const issues = [];
  const checks = [];

  // 1. Check AI Clichés
  const foundCliches = BANNED_AI_CLICHES.filter((kw) => text.includes(kw));
  if (foundCliches.length > 0) {
    issues.push(`发现典型 AI 套话/废话词汇: ${foundCliches.join(", ")}`);
    checks.push({ name: "anti_ai_tone", passed: false, penalty: foundCliches.length * 0.15 });
  } else {
    checks.push({ name: "anti_ai_tone", passed: true });
  }

  // 2. Check Platform Advertising Risk
  const foundAdWords = PROHIBITED_AD_WORDS.filter((kw) => text.includes(kw));
  if (foundAdWords.length > 0) {
    issues.push(`发现广告法违禁极限词: ${foundAdWords.join(", ")}`);
    checks.push({ name: "ad_compliance", passed: false, risk: 0.50 });
  } else {
    checks.push({ name: "ad_compliance", passed: true, risk: 0.05 });
  }

  // 3. Check Title Length
  const titleLen = (pkg.title || "").length;
  if (titleLen === 0) {
    issues.push("标题为空");
    checks.push({ name: "title_length", passed: false, penalty: 0.30 });
  } else if (titleLen > 20) {
    issues.push(`小红书标题超长（当前 ${titleLen} 字，最大 20 字）`);
    checks.push({ name: "title_length", passed: false, penalty: 0.10 });
  } else {
    checks.push({ name: "title_length", passed: true });
  }

  // 4. Check Content Substance & Visuals
  if (!pkg.body || pkg.body.length < 30) {
    issues.push("正文内容过短，缺乏实质价值");
    checks.push({ name: "content_depth", passed: false, penalty: 0.25 });
  } else {
    checks.push({ name: "content_depth", passed: true });
  }

  if (!pkg.images || pkg.images.length === 0) {
    issues.push("缺少配套图文素材");
    checks.push({ name: "media_presence", passed: false, penalty: 0.20 });
  } else {
    checks.push({ name: "media_presence", passed: true });
  }

  // Calculate scores
  let quality_score = 1.0;
  let risk_score = 0.05;

  for (const c of checks) {
    if (c.penalty) quality_score -= c.penalty;
    if (c.risk) risk_score = Math.max(risk_score, c.risk);
  }

  quality_score = Math.round(Math.max(0, Math.min(1, quality_score)) * 100) / 100;
  risk_score = Math.round(Math.max(0, Math.min(1, risk_score)) * 100) / 100;

  const passed = quality_score >= minQuality && risk_score <= maxRisk;
  const nextStatus = passed ? CONTENT_STATES.APPROVED : CONTENT_STATES.FAILED;

  const qc_details = {
    verifiedAt: new Date().toISOString(),
    passed,
    quality_score,
    risk_score,
    minQuality,
    maxRisk,
    issues,
    checks
  };

  const updated = updateContentObject(
    contentId,
    {
      status: nextStatus,
      quality_score,
      risk_score,
      qc_details,
      historyNote: passed ? `QC passed (${quality_score}) -> APPROVED` : `QC failed: ${issues.join("; ")}`
    },
    options
  );

  // If approved, auto advance to SCHEDULED if publish_time is set
  if (passed && updated.publish_time) {
    return updateContentObject(
      contentId,
      {
        status: CONTENT_STATES.SCHEDULED,
        historyNote: `Scheduled for publication at ${updated.publish_time}`
      },
      options
    );
  }

  return updated;
}
