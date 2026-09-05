import fs from "fs";
import path from "path";

/**
 * Milestone 5 (R5): Personal IP Discovery & Monetization Link
 *
 * Implements:
 * 1. generateIPProposals(founderProfile, marketSignals):
 *    - Generates >= 3 distinct, complete, viable personal IP positioning schemes:
 *      1. "认知思维破局者" (Cognitive Thinking & Anti-Consensus Books)
 *      2. "权威信息质检官/避坑指南" (Hardcore Fact-Checker / Mythbuster per Founder Breakthrough Directive ## 2026-09-03T18:39:32Z)
 *      3. "搞钱实操教练/一人公司极客" (Solopreneur / AI Workflow & Toolkits)
 *    - Each proposal includes personaTitle, personaTags, targetAudience, hookAngle, contentPillars,
 *      benchmarkAccounts, monetizationPaths, monetizationModels, score, estimatedTimeCommitment, and competitiveMoat.
 *
 * 2. injectMonetizationCTA(noteContent, ctaType, ctaConfig):
 *    - Injects pluggable conversion hooks into Xiaohongshu card layouts (ending CTA slide) and body copy.
 *    - Supported types: 'book' / 'book_recommendation', 'toolkit' / 'digital_toolkit',
 *      'consultation' / 'consulting' / 'consulting_service', 'checklist' / 'checklist_card', and fallback.
 *    - Strict bounds: callToAction <= 32 chars, ctaSlide.text <= 120 chars, compliance-safe language.
 *    - Idempotent: injecting twice does not duplicate CTA text or slides.
 *    - Preserves Unicode emojis and special quotes without corruption.
 *
 * 3. generatePinnedChecklist(topic, claims):
 *    - Generates author-pinned self-check checklist for comment or note footer (Founder Directive).
 *
 * 4. rankIPProposals(proposals, historicalMetrics):
 *    - Dynamically ranks proposals using historical conversion and revenue data from Learning Ledger.
 *
 * 5. saveIPProposals(proposals, filePath) / loadIPProposals(filePath):
 *    - Persistence helpers for data/monetization/ip_proposals.json.
 */

const MAX_CTA_ACTION_LENGTH = 32;
const MAX_CTA_SLIDE_TEXT_LENGTH = 120;
const DEFAULT_PROPOSALS_PATH = path.resolve(process.cwd(), "data", "monetization", "ip_proposals.json");

/**
 * Compacts whitespace into single space.
 * @param {any} value
 * @returns {string}
 */
function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Clips text to maximum length, adding ellipsis if truncated.
 * Preserves unicode characters and emojis.
 * @param {string} text
 * @param {number} max
 * @returns {string}
 */
function clip(text, max) {
  const str = compact(text);
  if (!str) return "";
  if (str.length <= max) return str;
  return `${str.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/**
 * Normalizes CTA type string into canonical identifier.
 * @param {string} ctaType
 * @returns {'book'|'toolkit'|'consultation'|'checklist'|'engagement'}
 */
export function normalizeCtaType(ctaType) {
  const type = String(ctaType || "").toLowerCase().trim();
  if (type === "book" || type === "book_recommendation" || type === "book_commerce") {
    return "book";
  }
  if (type === "toolkit" || type === "digital_toolkit" || type === "notion_template" || type === "lead_magnet") {
    return "toolkit";
  }
  if (type === "consulting" || type === "consultation" || type === "consulting_service" || type === "1on1") {
    return "consultation";
  }
  if (type === "checklist" || type === "checklist_card" || type === "fact_check_list") {
    return "checklist";
  }
  return "engagement";
}

/**
 * Core Archetypes for Personal IP Discovery
 */
export const DEFAULT_IP_ARCHETYPES = [
  {
    id: "ip-cognition-breakthrough",
    personaTitle: "认知思维破局者：反常识认知书斋主理人",
    personaTags: ["认知思维", "反常识", "心智重构", "深度阅读", "底层逻辑"],
    targetAudience: "20-35岁高内耗职场人、追求底层心智重塑与认知破局的求知青年",
    hookAngle: "反常识颠覆认知：'你以为的自律其实在毁掉你'，用经典认知书籍重构心智模型",
    contentPillars: [
      "反直觉认知颠覆（批判伪成长、击碎低效努力假象）",
      "大师经典著作深度重构（把大部头读薄，提炼思维脚手架）",
      "心智底层模型拆解（决策树、复利飞轮、情绪防御机制）",
      "反脆弱认知清单（直面职场不确定性的个人认知防御）"
    ],
    benchmarkAccounts: [
      "@罗振宇 (得到创始人，认知交付与通俗转译标杆)",
      "@闪光少女斯斯 (青年认知、时代访谈与反内耗思考)",
      "@古典谈成长 (《拆掉思维里的墙》作者，心智模型与生涯跃迁)"
    ],
    monetizationModels: [
      "深度认知与心理学纸质好书带货（图书高佣金+书斋定制书单）",
      "认知破局共读社群（年度会员、共读打卡与思维训练）",
      "高客单心智模型与决策复盘实战营"
    ],
    estimatedTimeCommitment: "每周5-8小时（深度读书与提炼笔记）",
    competitiveMoat: "立足经典理论与批判性审视，拒绝流水线鸡汤，提供高密度认知交付",
    baseScore: 88
  },
  {
    id: "ip-fact-checker-mythbuster",
    personaTitle: "权威信息质检官：全网爆款求真与避坑指南",
    personaTags: ["权威质检官", "信息打假", "求真求证", "避坑指南", "防营销忽悠"],
    targetAudience: "对全网快餐信息与夸大营销噱头感到疲惫、渴望客观严谨'防忽悠防火墙'的求真人群",
    hookAngle: "外网爆款真伪质检：'外网疯传8条，我查了资料：只有4条是真的！'以硬核打假建立信任护城河",
    contentPillars: [
      "外网X爆款推文求真打标（保留原文黑底推特截图 + ✅靠谱 / ⚠️证据弱 / ❌伪科学 逐条评级）",
      "营销噱头与因果倒置深度拆解（扒皮商业智商税、神化自律与伪科学套路）",
      "硬核循证文献与多源事实交叉核验（提供可复现依据与学术验证）",
      "作者置顶防坑自查清单（文末/评论区嵌入实操避坑排雷步骤）"
    ],
    benchmarkAccounts: [
      "@毕导THU (清华工科硬核较真、科学求证与反忽悠标杆)",
      "@老爸评测 (魏老爸，专注产品成分与硬核检测避坑)",
      "@硬核看板 (网易硬核科普、数据求真与消费智商税粉碎机)"
    ],
    monetizationModels: [
      "测评严选真好物与品质工具带货（凭借'严苛不掺水质检'建立的高转化信任闭环）",
      "行业避坑研报与深度评测知识库付费专栏",
      "高净值人群信息真实性把关与决策咨询服务"
    ],
    estimatedTimeCommitment: "每周6-10小时（多源核验、循证检索与打标制作）",
    competitiveMoat: "立足客观事实与红绿评级标签，具备强信任壁垒，天然杜绝公关软文嫌疑",
    baseScore: 92
  },
  {
    id: "ip-solopreneur-geek",
    personaTitle: "搞钱实操教练：一人公司极客与AI商业化工作流",
    personaTags: ["一人公司", "AI效率工具", "搞钱实操", "商业模式", "轻资产创业"],
    targetAudience: "渴望摆脱螺丝钉身份、利用AI与轻资产模式跑通副业变现与一人公司的超级个体",
    hookAngle: "极简搞钱实操：'不用团队，一个人如何用AI工作流跑通首个商业闭环'，交付即刻可用的效率工具",
    contentPillars: [
      "一人公司（Solopreneur）商业模型与极简增长飞轮",
      "AI实战工作流与落地工具箱（提示词工程、自动化流水线、Notion模版）",
      "小红书/全网副业搞钱真实案例与投产比复盘",
      "轻资产数字资产搭建（模板、提示词库、自动化脚本交付）"
    ],
    benchmarkAccounts: [
      "@生财有术 (亦仁，商业机会、轻创业与搞钱实操第一社区)",
      "@粥左罗 (个人商业化、写作变现与一人公司布道者)",
      "@AI进化论-花生 (头部AI工具测评与实操生产力交付博主)"
    ],
    monetizationModels: [
      "一人公司自动化工具包、Notion模版与提示词库（数字资产被动收入）",
      "AI工具链商业实战训练营与陪跑营",
      "1对1超级个体商业模式诊断与副业定位咨询"
    ],
    estimatedTimeCommitment: "每周5-7小时（工具包打磨与实操拆解）",
    competitiveMoat: "重交付可落地的工具模板与清晰投入产出比，用户获得即时正向反馈",
    baseScore: 90
  }
];

/**
 * Generates at least 3 distinct, complete, viable personal IP positioning schemes.
 *
 * @param {object} [founderProfile={}] - Background, interests, strengths
 * @param {object} [marketSignals={}] - Market trends, competitors, category growth
 * @returns {Array<object>} Array of structured IP proposals (length >= 3)
 */
export function generateIPProposals(founderProfile = {}, marketSignals = {}) {
  const profile = founderProfile || {};
  const signals = marketSignals || {};

  const interests = Array.isArray(profile.interests) ? profile.interests : [];
  const strengths = Array.isArray(profile.strengths) ? profile.strengths : [];
  const background = String(profile.founderBackground || profile.background || "").trim();

  // Combine background and keywords for intelligent profile adaptation
  const profileKeywords = [
    ...interests.map((s) => String(s).toLowerCase()),
    ...strengths.map((s) => String(s).toLowerCase()),
    background.toLowerCase()
  ].filter(Boolean);

  const proposals = DEFAULT_IP_ARCHETYPES.map((archetype, index) => {
    let score = archetype.baseScore || (85 + index * 2);
    let customizedTitle = archetype.personaTitle;
    let customizedAudience = archetype.targetAudience;
    let customizedTags = [...archetype.personaTags];
    let customizedPillars = [...archetype.contentPillars];

    // Check if founder profile has strong resonance with this archetype
    if (archetype.id === "ip-cognition-breakthrough") {
      if (profileKeywords.some((k) => /cognitive|thought|thinking|philosophy|认知|思维|心理/i.test(k))) {
        score += 5;
        customizedTags.unshift("心智模型");
      }
      if (profileKeywords.some((k) => /product|founder|tech|产品|技术/i.test(k))) {
        customizedAudience = "20-35岁科技从业者、产品人与追求底层心智重塑的终身学习者";
      }
    } else if (archetype.id === "ip-fact-checker-mythbuster") {
      if (profileKeywords.some((k) => /fact|myth|check|science|engineering|求真|质检|避坑|严谨/i.test(k))) {
        score += 6;
      }
      if (background) {
        customizedPillars.push(`结合${clip(background, 16)}视角的权威质检`);
      }
    } else if (archetype.id === "ip-solopreneur-geek") {
      if (profileKeywords.some((k) => /solopreneur|ai|tools|workflow|business|搞钱|一人公司|自动化/i.test(k))) {
        score += 7;
        customizedTags.unshift("商业闭环");
      }
      if (strengths.length > 0) {
        customizedPillars.push(`依托${clip(strengths.join("、"), 20)}的轻资产变现实战`);
      }
    }

    // Factor in market signals if provided
    if (signals.highGrowthCategories && Array.isArray(signals.highGrowthCategories)) {
      if (signals.highGrowthCategories.some((c) => customizedTags.some((t) => c.includes(t)))) {
        score += 3;
      }
    }

    return {
      id: archetype.id,
      personaTitle: customizedTitle,
      personaTags: Array.from(new Set(customizedTags)),
      targetAudience: customizedAudience,
      hookAngle: archetype.hookAngle,
      contentPillars: customizedPillars,
      benchmarkAccounts: [...archetype.benchmarkAccounts],
      monetizationPaths: [...archetype.monetizationModels],
      monetizationModels: [...archetype.monetizationModels],
      score,
      estimatedTimeCommitment: archetype.estimatedTimeCommitment,
      competitiveMoat: archetype.competitiveMoat,
      createdAt: new Date().toISOString()
    };
  });

  // Ensure proposals is strictly >= 3
  if (proposals.length < 3) {
    while (proposals.length < 3) {
      const idx = proposals.length;
      proposals.push({
        ...DEFAULT_IP_ARCHETYPES[idx % DEFAULT_IP_ARCHETYPES.length],
        id: `ip-extended-${idx + 1}`,
        score: 80 + idx,
        monetizationPaths: [...DEFAULT_IP_ARCHETYPES[idx % DEFAULT_IP_ARCHETYPES.length].monetizationModels]
      });
    }
  }

  return proposals;
}

/**
 * Regex to cleanly identify and strip previously injected CTA blocks for idempotency.
 */
const INJECTED_CTA_BLOCK_REGEX = /(?:\r?\n){2,}(?:---(?:\r?\n)+)?(?:(?:📖|🛠️|🤝|🛡️|💡)\s*)?【(?:好书推荐|精选好书|效率工具|数字工具|1对1咨询|个人咨询|避坑自查|作者置顶|思考与互动|好物推荐)】[\s\S]*$/u;

/**
 * Extracts clean base body text without redundant CTA blocks.
 * @param {any} note
 * @returns {string}
 */
function extractCleanBaseBody(note) {
  if (typeof note === "string") {
    return note.replace(INJECTED_CTA_BLOCK_REGEX, "").trim();
  }
  if (!note || typeof note !== "object") return "";

  if (typeof note.originalBody === "string" && note.originalBody.trim()) {
    return note.originalBody.replace(INJECTED_CTA_BLOCK_REGEX, "").trim();
  }
  const body = String(note.body || "").trim();
  return body.replace(INJECTED_CTA_BLOCK_REGEX, "").trim();
}

/**
 * Injects pluggable conversion hooks into Xiaohongshu card layouts (ending CTA slide) and body copy.
 *
 * Requirements & Invariants:
 * - ctaSlide.role === "monetization_cta"
 * - ctaSlide.callToAction <= 32 chars (Xiaohongshu layout limit)
 * - ctaSlide.text <= 120 chars (fits inside card dimensions)
 * - Idempotent: injecting twice does not duplicate slides or body text
 * - Preserves emojis and quotes without corruption
 * - Safe compliant language
 *
 * @param {object|string} noteContent - Note object or body string
 * @param {string} ctaType - CTA type ('book', 'toolkit', 'consultation', 'checklist', etc.)
 * @param {object} [ctaConfig={}] - Detailed parameters for the CTA
 * @returns {object} Enhanced note with enhancedBody, ctaSlide, and ctaSlides
 */
export function injectMonetizationCTA(noteContent, ctaType, ctaConfig = {}) {
  const config = ctaConfig || {};
  const normalizedType = normalizeCtaType(ctaType);

  // Extract base note attributes
  const isObject = noteContent && typeof noteContent === "object" && !Array.isArray(noteContent);
  const baseTitle = isObject ? (noteContent.title || "") : "";
  const baseBody = extractCleanBaseBody(noteContent);

  let ctaBodyParagraph = "";
  let slideEyebrow = "KEEP READING";
  let slideTitle = "行动号召";
  let slideText = "";
  let slideCta = "收藏这一页，留给下一次重读。";
  let slideBadge = "精选推荐";

  if (normalizedType === "book") {
    const bookTitle = String(config.bookTitle || config.title || "《认知破局经典》");
    const pitch = String(config.corePitch || config.pitch || "沉淀底层认知，重构个人心智模型。");
    ctaBodyParagraph = `📖 【精选好书推荐】\n本篇深度内容提炼自${bookTitle}。${pitch}\n👉 如果你想进一步系统升级思维框架，可在笔记下方好物卡片中开启沉浸阅读。`;

    slideEyebrow = "RECOMMENDED READING";
    slideTitle = "同款好书推荐";
    slideBadge = "好物好书";
    slideText = clip(`${bookTitle}：${pitch}`, MAX_CTA_SLIDE_TEXT_LENGTH);
    slideCta = clip(config.callToAction || "点击下方卡片获取同款好书", MAX_CTA_ACTION_LENGTH);
  } else if (normalizedType === "toolkit") {
    const toolkitName = String(config.toolkitName || config.name || "一人公司效率工具包");
    const actionPrompt = String(config.actionPrompt || config.prompt || "已将完整实操模板与SOP整理至工具包");
    ctaBodyParagraph = `🛠️ 【效率工具包领取】\n${actionPrompt}：${toolkitName}。\n👉 欢迎在评论区留下你的思考，查看作者置顶说明查阅完整工作流模版。`;

    slideEyebrow = "DIGITAL TOOLKIT";
    slideTitle = "实操效率工具包";
    slideBadge = "效率工具";
    slideText = clip(`${toolkitName}：${actionPrompt}`, MAX_CTA_SLIDE_TEXT_LENGTH);
    slideCta = clip(config.callToAction || "翻至文末查阅置顶说明", MAX_CTA_ACTION_LENGTH);
  } else if (normalizedType === "consultation") {
    const serviceName = String(config.serviceName || config.name || "个人IP与商业模式深度咨询");
    const spotsLimit = String(config.spotsLimit || config.limit || "本月限量预约");
    ctaBodyParagraph = `🤝 【1对1深度咨询】\n针对个人商业闭环搭建与定位破局，开放${serviceName}（${spotsLimit}）。\n👉 欢迎在主页查看咨询详情与预约流程，开启深度共创。`;

    slideEyebrow = "1-ON-1 CONSULTING";
    slideTitle = "深度商业咨询";
    slideBadge = "商业破局";
    slideText = clip(`${serviceName}（${spotsLimit}）：针对超级个体商业闭环与定位突破深度诊断。`, MAX_CTA_SLIDE_TEXT_LENGTH);
    slideCta = clip(config.callToAction || "主页查看咨询详情与预约", MAX_CTA_ACTION_LENGTH);
  } else if (normalizedType === "checklist") {
    const checklistTitle = String(config.checklistTitle || config.title || "客观避坑自查清单");
    const itemsSummary = Array.isArray(config.items) ? config.items.join("；") : (config.summary || "查来源、辨因果、防忽悠");
    ctaBodyParagraph = `🛡️ 【作者置顶自查清单】\n${checklistTitle}：拒绝盲目跟风，逐项核验事实依据（${itemsSummary}）。\n👉 完整防坑要点见文末排版与评论区置顶自查清单。`;

    slideEyebrow = "SELF-CHECK CHECKLIST";
    slideTitle = "客观避坑自查清单";
    slideBadge = "求真避坑";
    slideText = clip(`${checklistTitle}：${itemsSummary}`, MAX_CTA_SLIDE_TEXT_LENGTH);
    slideCta = clip(config.callToAction || "对照清单逐项核查避坑", MAX_CTA_ACTION_LENGTH);
  } else {
    // Fallback: Safe engagement hook
    const prompt = String(config.prompt || config.corePitch || "收藏这一页，留给下一次重读。欢迎在评论区聊聊你的思考。");
    ctaBodyParagraph = `💡 【思考与互动】\n${prompt}`;

    slideEyebrow = "KEEP READING";
    slideTitle = "互动与收藏";
    slideBadge = "深度互动";
    slideText = clip(prompt, MAX_CTA_SLIDE_TEXT_LENGTH);
    slideCta = clip(config.callToAction || "收藏这一页留给下一次重读", MAX_CTA_ACTION_LENGTH);
  }

  // Construct enhanced body
  const enhancedBody = baseBody ? `${baseBody}\n\n${ctaBodyParagraph}` : ctaBodyParagraph;

  // Ensure ctaSlide text strictly <= MAX_CTA_SLIDE_TEXT_LENGTH
  slideText = clip(slideText, MAX_CTA_SLIDE_TEXT_LENGTH);
  slideCta = clip(slideCta, MAX_CTA_ACTION_LENGTH);

  const ctaSlide = {
    role: "monetization_cta",
    type: normalizedType,
    eyebrow: slideEyebrow,
    title: slideTitle,
    text: slideText,
    callToAction: slideCta,
    badge: slideBadge,
    accent: "CTA"
  };

  // Build existing slides array without older monetization_cta slides
  let existingSlides = [];
  if (isObject && Array.isArray(noteContent.slides)) {
    existingSlides = noteContent.slides.filter((s) => s.role !== "monetization_cta");
  }

  const enhancedSlides = [...existingSlides, ctaSlide];

  return {
    ...(isObject ? noteContent : {}),
    title: baseTitle,
    body: enhancedBody,
    enhancedBody,
    originalBody: baseBody,
    ctaSlide,
    ctaSlides: [ctaSlide],
    slides: enhancedSlides,
    isMonetized: true,
    monetizationType: normalizedType,
    monetizationConfig: config
  };
}

/**
 * Generates an author-pinned self-check checklist for comment or note footer.
 * Strictly adheres to the Founder Breakthrough Directive (2026-09-03T18:39:32Z).
 *
 * @param {string} [topic=""] - Topic or theme being fact-checked
 * @param {Array<string>|string} [claims=[]] - Claims or points to verify
 * @returns {object} Pinned checklist object
 */
export function generatePinnedChecklist(topic = "", claims = []) {
  const cleanTopic = String(topic || "全网爆款求真避坑").trim();
  const inputClaims = Array.isArray(claims)
    ? claims
    : typeof claims === "string"
    ? claims.split(/\n+/).map((s) => s.trim()).filter(Boolean)
    : [];

  const defaultChecklistItems = [
    "1. 查样本来源：警惕样本量极小、偶发特例或纯属个人吹嘘的孤证经验",
    "2. 辨因果倒置：区分先后相关与因果必然，切忌将结果倒因为果",
    "3. 防利益绑架：凡宣称一招逆袭或立竿见影的，末尾必定是付费割韭菜课程",
    "4. 验边界条件：脱离特定资源禀赋与环境约束的方法不可盲目全盘生搬硬套",
    "5. 设行动止损：小步低成本试错，设立客观量化检验周期，不盲目投入"
  ];

  const checklistItems = inputClaims.length > 0
    ? inputClaims.slice(0, 5).map((c, i) => `${i + 1}. 核验点【${clip(c, 18)}】：交叉对照文献与实践边界，排查夸大噱头`)
    : defaultChecklistItems;

  const title = `【作者置顶·${cleanTopic}·客观避坑自查清单】`;
  const formattedComment = `${title}\n\n` +
    checklistItems.join("\n") +
    "\n\n📌 求真声明：不盲从外网神话，不消费认知焦虑。理性核验，欢迎在评论区探讨交流。";

  return {
    title,
    topic: cleanTopic,
    checklistItems,
    formattedComment,
    pinnedChecklist: formattedComment,
    complianceStatus: "passed",
    toString() {
      return formattedComment;
    }
  };
}

/**
 * Dynamically ranks IP proposals using historical conversion and revenue metrics from Learning Ledger.
 *
 * @param {Array<object>} proposals - List of IP proposals from generateIPProposals
 * @param {object} historicalMetrics - Performance metrics keyed by topic/category or array of metric entries
 * @returns {Array<object>} Ranked proposals sorted descending by calculated score
 */
export function rankIPProposals(proposals = [], historicalMetrics = {}) {
  if (!Array.isArray(proposals) || proposals.length === 0) {
    return [];
  }

  const metricsObj = historicalMetrics || {};

  const scoredProposals = proposals.map((proposal) => {
    let score = typeof proposal.score === "number" ? proposal.score : 80;
    let metricBonus = 0;
    let matchedKey = null;

    const searchableText = [
      proposal.personaTitle,
      ...(proposal.personaTags || []),
      proposal.targetAudience,
      proposal.hookAngle,
      ...(proposal.monetizationPaths || [])
    ].join(" ").toLowerCase();

    for (const [key, metric] of Object.entries(metricsObj)) {
      if (!metric || typeof metric !== "object") continue;
      const cleanKey = String(key).toLowerCase();

      // Check if keyword matches proposal
      const isMatch = cleanKey.split(/\s+/).some((token) => token && searchableText.includes(token)) ||
        searchableText.includes(cleanKey);

      if (isMatch) {
        matchedKey = key;
        const conversionRate = Number(metric.conversionRate || metric.conversion_rate || 0);
        const revenue = Number(metric.revenue || metric.gmv || metric.conversions_gmv || 0);
        const likes = Number(metric.likes || 0);
        const collects = Number(metric.collects || 0);

        // Conversion rate weighting (e.g. 0.08 -> +80 points)
        metricBonus += conversionRate * 1000;
        // Revenue weighting (scaled)
        if (revenue > 0) {
          metricBonus += Math.min(50, Math.log10(revenue + 1) * 10);
        }
        // Engagement bonus
        if (likes > 0 || collects > 0) {
          metricBonus += Math.min(20, (likes + collects * 2) * 0.01);
        }
      }
    }

    const totalScore = Math.round((score + metricBonus) * 10) / 10;

    return {
      ...proposal,
      score: totalScore,
      metricAttribution: {
        matchedKey,
        metricBonus: Math.round(metricBonus * 10) / 10
      }
    };
  });

  return scoredProposals.sort((a, b) => (b.score || 0) - (a.score || 0));
}

/**
 * Saves IP proposals to disk.
 *
 * @param {Array<object>} proposals
 * @param {string} [filePath=DEFAULT_PROPOSALS_PATH]
 * @returns {boolean}
 */
export function saveIPProposals(proposals, filePath = DEFAULT_PROPOSALS_PATH) {
  try {
    const targetPath = path.resolve(filePath);
    const parentDir = path.dirname(targetPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(targetPath, JSON.stringify(proposals, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error(`[ipDiscovery] Failed to save IP proposals to ${filePath}:`, err);
    return false;
  }
}

/**
 * Loads IP proposals from disk.
 *
 * @param {string} [filePath=DEFAULT_PROPOSALS_PATH]
 * @returns {Array<object>|null}
 */
export function loadIPProposals(filePath = DEFAULT_PROPOSALS_PATH) {
  try {
    const targetPath = path.resolve(filePath);
    if (!fs.existsSync(targetPath)) return null;
    const content = fs.readFileSync(targetPath, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    console.error(`[ipDiscovery] Failed to load IP proposals from ${filePath}:`, err);
    return null;
  }
}
