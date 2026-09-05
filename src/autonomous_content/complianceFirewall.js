import crypto from "crypto";
import fs from "fs";
import path from "path";

/**
 * Two-Tier Compliance Firewall for Autonomous Content Operating Company
 *
 * Exclusively implements Milestone 2 (R2):
 * - Tier 1: Chinese Legal, Sensitive, Political, Vulgar, and Advertising Law absolute superlatives (100% Intercept)
 * - Tier 2: Xiaohongshu Platform Community Rules & Unauthorized Off-Platform Traffic Diversion (100% Intercept)
 * - Contextual Safe-Pass Filter: Preserves legitimate colloquial, math, and factual phrases (>=98% Safe Pass)
 * - Structured Audit Logger: Generates immutable audit records saved to data/compliance/audit_log.jsonl
 */

// Punctuation and evasion separators commonly inserted by spammers (e.g., "第.一", "加_v", "微·信", "稳 赚")
const SEPARATOR_CHARS = `[\\s\\.\\-_·*~^/|\\\\，。、！？!?：:,;；@#\\$%+=&【】()《》\\[\\]{}➕\u200B-\u200F\u2060-\u206F\uFEFF\u00A0]`;

/**
 * Normalizes input text by converting fullwidth characters and removing zero-width markers.
 * @param {string} text
 * @returns {string}
 */
export function normalizeText(text = "") {
  if (!text || typeof text !== "string") return "";
  let norm = text.replace(/[\uff01-\uff5e]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  norm = norm.replace(/\u3000/g, " ");
  norm = norm.replace(/[\u200B-\u200F\u2060-\u206F\uFEFF\u00A0]/g, "");
  return norm;
}

/**
 * Constructs an evasion-resistant regex that matches characters separated by arbitrary punctuation or whitespace.
 * @param {string} keyword
 * @param {string} flags
 * @returns {RegExp}
 */
function buildEvasionRegex(keyword, flags = "gi") {
  const escapedChars = [...keyword].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(escapedChars.join(`${SEPARATOR_CHARS}*`), flags);
}

// ---------------------------------------------------------------------------
// TIER 1 RULE DEFINITIONS (Chinese Law, Sensitive, Vulgar, Ad Law Absolutes)
// ---------------------------------------------------------------------------

export const TIER1_RULES = [
  // 1. Political, state authority, sensitive, national emblem / integrity violations
  {
    id: "T1_POLITICAL_SENSITIVE",
    category: "涉政涉敏红线",
    description: "涉及涉政、分裂国家、颠覆政权、邪教或诋毁国家形象与英雄烈士内容",
    patterns: [
      /涉政/g,
      /颠覆政权/g,
      /台独/g,
      /港独/g,
      /分裂国家/g,
      /邪教/g,
      /法轮功/g,
      /反党/g,
      /反政府/g,
      /暴恐/g,
      /恐袭/g,
      /国家机关专供/g,
      /中南海特供/g,
      /军工特供/g,
      /军工专供/g,
      /特供酒/g,
      /钓鱼岛属于日本/g
    ]
  },

  // 2. Severe illegal, crime, black market, vulgar, gambling, drugs
  {
    id: "T1_ILLEGAL_CRIME_VULGAR",
    category: "违法黑产低俗",
    description: "涉及色情低俗、赌博、高利贷、毒品枪支、洗钱或买卖违禁品",
    patterns: [
      /约炮/g,
      /色情/g,
      /黄色网站/g,
      /成人交友/g,
      /裸聊/g,
      /买春/g,
      /卖淫/g,
      /嫖娼/g,
      /代孕/g,
      /赌博/g,
      /六合彩/g,
      /百家乐/g,
      /高利贷/g,
      /地下钱庄/g,
      /洗钱/g,
      /毒品/g,
      /冰毒/g,
      /大麻/g,
      /海洛因/g,
      /枪支/g,
      /弹药/g,
      /迷药/g,
      /自杀指南/g,
      /暗网/g
    ]
  },

  // 3. Advertising Law Absolute Superlatives (广告法极限词/绝对化用语)
  {
    id: "T1_AD_SUPERLATIVES",
    category: "广告法绝对化极限词",
    description: "违反中国《广告法》第九条，使用绝对化禁用词汇（如绝对、第一、国家级、最高、顶级、极品等）",
    patterns: [
      buildEvasionRegex("绝对"),
      buildEvasionRegex("第一"),
      buildEvasionRegex("最高"),
      buildEvasionRegex("顶级"),
      buildEvasionRegex("极品"),
      buildEvasionRegex("国家级"),
      buildEvasionRegex("世界级"),
      buildEvasionRegex("宇宙级"),
      buildEvasionRegex("全网首发"),
      buildEvasionRegex("独家首发"),
      buildEvasionRegex("全网第一"),
      buildEvasionRegex("天下第一"),
      buildEvasionRegex("史上最"),
      buildEvasionRegex("最强"),
      buildEvasionRegex("最高级"),
      buildEvasionRegex("最佳"),
      buildEvasionRegex("首选"),
      buildEvasionRegex("唯一"),
      buildEvasionRegex("最先"),
      buildEvasionRegex("首个"),
      buildEvasionRegex("终极"),
      buildEvasionRegex("最顶"),
      buildEvasionRegex("最权威"),
      buildEvasionRegex("最先进"),
      buildEvasionRegex("史无前例"),
      buildEvasionRegex("前无古人"),
      buildEvasionRegex("万能"),
      buildEvasionRegex("极佳"),
      buildEvasionRegex("绝佳"),
      buildEvasionRegex("极致"),
      buildEvasionRegex("永久免费")
    ]
  },

  // 4. Exaggerated Medical / Health claims (虚假夸大医疗健康宣称)
  {
    id: "T1_HEALTH_EXAGGERATION",
    category: "虚假夸大医疗健康",
    description: "虚假医疗宣称，如包治百病、100%有效、根治、特效药等违法夸大",
    patterns: [
      buildEvasionRegex("包治百病"),
      buildEvasionRegex("彻底根治"),
      buildEvasionRegex("永不复发"),
      buildEvasionRegex("神药"),
      buildEvasionRegex("特效药"),
      buildEvasionRegex("一针见效"),
      buildEvasionRegex("立竿见影"),
      buildEvasionRegex("消灭癌细胞"),
      buildEvasionRegex("不反弹"),
      /(?:100%|100％|百分之百)[\s\.\-_·*~^/|\\，。、！？!?：:,;；]*(?:有效|治愈|见效|根治|消除)/gi
    ]
  },

  // 5. Exaggerated Financial / Wealth / Exam promises (虚假暴富金融宣称与保过承诺)
  {
    id: "T1_FINANCIAL_PROMISES",
    category: "虚假暴富金融承诺",
    description: "金融投资保本承诺、零风险高收益或考试保过承诺",
    patterns: [
      buildEvasionRegex("稳赚不赔"),
      buildEvasionRegex("零风险"),
      buildEvasionRegex("保本保息"),
      buildEvasionRegex("保本高收益"),
      buildEvasionRegex("一夜暴富"),
      buildEvasionRegex("暴富秘籍"),
      buildEvasionRegex("无风险套利"),
      buildEvasionRegex("包赚不赔"),
      /(?:100%|100％|百分之百)[\s\.\-_·*~^/|\\，。、！？!?：:,;；]*(?:保过|包过|稳赚|回本|盈利)/gi,
      buildEvasionRegex("包过退费"),
      buildEvasionRegex("押题必中")
    ]
  }
];

// ---------------------------------------------------------------------------
// TIER 2 RULE DEFINITIONS (Platform Rules & Off-Platform Traffic Diversion)
// ---------------------------------------------------------------------------

export const TIER2_RULES = [
  // 1. Off-Platform Private Traffic Diversion to WeChat / Contacts (私域引流)
  {
    id: "T2_WECHAT_DIVERSION",
    category: "违规私域导流",
    description: "引导用户离开小红书添加微信、企鹅号、公众号或站外联系方式",
    patterns: [
      // 加V, 加v, 加微, 加薇, 加威, 加维
      new RegExp(`加${SEPARATOR_CHARS}*(?:[vV]|微|薇|威|维|芯|星)`, "gi"),
      // 微信, v信, V信, 薇信, 威信, vx, wx
      new RegExp(`(?:^|[^a-zA-Z0-9])([vV]${SEPARATOR_CHARS}*[xX]|[wW]${SEPARATOR_CHARS}*[xX]|[qQ]${SEPARATOR_CHARS}*[qQ]|微${SEPARATOR_CHARS}*信|薇${SEPARATOR_CHARS}*信|威${SEPARATOR_CHARS}*信|[vV]${SEPARATOR_CHARS}*信)(?:$|[^a-zA-Z0-9])`, "gi"),
      buildEvasionRegex("vx号"),
      buildEvasionRegex("wx号"),
      buildEvasionRegex("微信号"),
      buildEvasionRegex("企鹅号"),
      buildEvasionRegex("扣扣"),
      buildEvasionRegex("公众号"),
      buildEvasionRegex("关注公众号"),
      buildEvasionRegex("看我主页背景"),
      buildEvasionRegex("看简介加"),
      buildEvasionRegex("主页有微"),
      buildEvasionRegex("主页有v"),
      buildEvasionRegex("主页置顶有")
    ]
  },

  // 2. Private Chat Diversion / Group Invites (私聊/进群导流)
  {
    id: "T2_PRIVATE_CHAT_DIVERSION",
    category: "私聊索要联系方式",
    description: "诱导私聊、私信发资料或进群引流",
    patterns: [
      new RegExp(`私${SEPARATOR_CHARS}*(?:聊|[lL][iI][aA][oO]|我|信|信领|我领|信发你|信回复)`, "gi"),
      new RegExp(`(?:进|入|加)${SEPARATOR_CHARS}*(?:群|裙)`, "gi"),
      buildEvasionRegex("进群领取"),
      buildEvasionRegex("滴滴我"),
      buildEvasionRegex("dd我"),
      buildEvasionRegex("留邮箱"),
      buildEvasionRegex("留扣扣")
    ]
  },

  // 3. Unauthorized Third-Party E-Commerce & Off-Platform Payment (第三方电商与转账)
  {
    id: "T2_COMMERCE_PAYMENT_DIVERSION",
    category: "第三方电商与私下交易",
    description: "诱导至淘宝、闲鱼、拼多多或私下转账支付",
    patterns: [
      new RegExp(`(?:淘|某)${SEPARATOR_CHARS}*[宝bB]`, "gi"),
      new RegExp(`(?:闲|某|黄)${SEPARATOR_CHARS}*鱼`, "gi"),
      buildEvasionRegex("拼多多"),
      buildEvasionRegex("某多多"),
      buildEvasionRegex("私下转账"),
      buildEvasionRegex("转账"),
      buildEvasionRegex("走私单"),
      buildEvasionRegex("支付宝转账"),
      buildEvasionRegex("微信转账"),
      buildEvasionRegex("扫码支付")
    ]
  },

  // 4. Blackhat Part-time jobs, Brush orders, Spam (兼职刷单、躺赚引流)
  {
    id: "T2_SPAM_BLACKHAT_JOB",
    category: "黑产刷单与网络兼职",
    description: "虚假网络兼职、刷单兼职、日赚千元等黑灰产套路",
    patterns: [
      buildEvasionRegex("兼职刷单"),
      buildEvasionRegex("刷单"),
      buildEvasionRegex("刷信誉"),
      new RegExp(`日${SEPARATOR_CHARS}*赚${SEPARATOR_CHARS}*(?:千|百|几百|[0-9]+)`, "gi"),
      buildEvasionRegex("日赚千元"),
      buildEvasionRegex("日赚百元"),
      buildEvasionRegex("打字兼职"),
      new RegExp(`(?:躺|挂机)${SEPARATOR_CHARS}*赚`, "gi"),
      buildEvasionRegex("代实名"),
      buildEvasionRegex("引流脚本")
    ]
  },

  // 5. QR Code & Scan-to-Add Platform Diversion (二维码与扫码导流)
  {
    id: "T2_QR_CODE_DIVERSION",
    category: "二维码与扫码导流",
    description: "诱导用户扫描二维码、保存图片扫码或长按识别二维码添加引流",
    patterns: [
      buildEvasionRegex("二维码"),
      buildEvasionRegex("长按识别"),
      buildEvasionRegex("长按图片识别"),
      buildEvasionRegex("扫描二维码"),
      buildEvasionRegex("扫描下方二维码"),
      buildEvasionRegex("扫下方二维码"),
      buildEvasionRegex("扫描文末二维码"),
      buildEvasionRegex("保存图片扫"),
      buildEvasionRegex("保存图片扫描二维码"),
      buildEvasionRegex("扫码添加"),
      buildEvasionRegex("扫码领"),
      buildEvasionRegex("扫码进群"),
      buildEvasionRegex("扫码直接进"),
      buildEvasionRegex("扫一扫"),
      new RegExp(`扫${SEPARATOR_CHARS}*码`, "gi"),
      new RegExp(`识别${SEPARATOR_CHARS}*二维码`, "gi")
    ]
  }
];

// ---------------------------------------------------------------------------
// CONTEXTUAL SAFE-PASS CONFIGURATION
// Legitimate phrases that contain sensitive substring tokens (e.g. "第一", "绝对")
// but are non-promotional, mathematical, historical, idiomatic, or standard steps.
// ---------------------------------------------------------------------------

export const SAFE_PASS_PATTERNS = [
  // 1. Ordinal steps, time, chapters, academic and natural step phrasing for "第一"
  {
    token: "第一",
    regexes: [
      /第一步(?:要|是|：|:|需要|先|做好|找准|明确)?/g,
      /第一次(?:尝试|做|去|听说|写|发|见|接触|分享)?/g,
      /第一天(?:打卡|记录|学习|工作|开始|复习)?/g,
      /第一时间(?:通知|处理|响应|反馈|知道)?/g,
      /第一反应/g,
      /第一阶段/g,
      /第一期/g,
      /第一章/g,
      /第一节/g,
      /第一卷/g,
      /第一条(?:原则|铁律|建议|规定)?/g,
      /第一款/g,
      /第一项/g,
      /第一册/g,
      /第一课(?:[：:，,。\s]|我们|先|开始|主要|堂)/g,
      /第一周/g,
      /第一季/g,
      /第一轮/g,
      /第一眼/g,
      /第一位(?:读者|嘉宾|观众|用户|朋友)?/g,
      /第一视角/g,
      /第一人称/g,
      /第一代/g,
      /第一现场/g,
      /第一手(?:资料|数据|信息)?/g,
      /第一性原理/g,
      /第一原则/g,
      /第一志愿/g,
      /第一学历/g,
      /第一作者/g,
      /第一印象/g,
      /第一桶金/g,
      /第一篇/g,
      /第一大/g,
      /第一组/g,
      /第一部(?:作品|小说|电影)?/g,
      /第一类/g,
      /第一张/g,
      /第一条/g,
      /第一行/g,
      /第一点/g,
      // Historical, cultural & tourism landmark names
      /天下第一泉/g,
      /天下第一关/g,
      /天下第一山/g,
      /天下第一奇山/g,
      /天下第一峰/g,
      /天下第一楼/g,
      /天下第一庄/g,
      /天下第一城/g,
      // Economic & sociological terms
      /第一产业/g,
      /第一书记/g,
      /第一夫人/g,
      /第一宇宙速度/g,
      // Ordinal unit counting (e.g., "第一个", "第一页", "第一名" in benign context)
      /第[一1][个只本幅座辆架首户天次步周季章页条段点轮局套把场栋件度代册卷回集分克]/g
    ],
    // If the surrounding text matches promotional advertising boast words, safe-pass is revoked!
    disqualifierRegex: /(?:全网|全国|全球|行业|销量|质量|业内|首选|公认|稳居|堪称|当之无愧|做到了?|排名第一|排第一|稳坐第一)/
  },

  // 2. Scientific, mathematical, technical and philosophical terms for "绝对"
  {
    token: "绝对",
    regexes: [
      /绝对值/g,
      /绝对路径/g,
      /绝对坐标/g,
      /绝对引用/g,
      /绝对音感/g,
      /绝对零度/g,
      /绝对真空/g,
      /绝对优势/g,
      /绝对真理/g,
      /绝对权力/g,
      /绝对误差/g,
      /绝对重力/g,
      /绝对定位/g,
      /绝对压强/g,
      /绝对标高/g,
      // Colloquial negations (non-promotional)
      /绝对不[\u4e00-\u9fa5]{1,4}/g,
      /绝对没(?:有|错|关系)/g,
      /绝对别/g,
      /并非绝对/g,
      /不是绝对/g,
      /无绝对/g
    ],
    disqualifierRegex: /(?:绝对(?:有效|正品|保真|安全|可靠|超值|第一|稳赚|暴富|根治|极品|神药))/
  },

  // 3. Meteorological, judicial, and geographical terms for "最高"
  {
    token: "最高",
    regexes: [
      /最高气温/g,
      /最高温/g,
      /最高峰/g,
      /最高海拔/g,
      /海拔最高/g,
      /最高点/g,
      /最高人民法院/g,
      /最高人民检察院/g,
      /最高法/g,
      /最高检/g,
      /最高上限/g,
      /最高限额/g,
      /最高分/g,
      /最高值/g,
      /最高楼/g,
      /最高处/g
    ],
    disqualifierRegex: /(?:最高(?:级|端|品质|性价比|配置|水准)|全网最高)/
  },

  // 4. Statutory heritage / environmental designations for "国家级"
  {
    token: "国家级",
    regexes: [
      /国家级非物质文化遗产/g,
      /国家级非遗/g,
      /国家级自然保护区/g,
      /国家级文物保护单位/g,
      /国家级高新技术产业开发区/g,
      /国家级高新区/g,
      /国家级森林公园/g,
      /国家级地质公园/g,
      /国家级风景名胜区/g,
      /国家级生态示范区/g,
      /国家级新区/g
    ],
    disqualifierRegex: /(?:国家级(?:产品|技术|品质|认证|专利|大师|配方|大奖))/
  },

  // 5. Technical computing terms for "顶级" and "最顶"
  {
    token: "顶级",
    regexes: [
      /顶级域名/g,
      /顶级域/g,
      /通用顶级域/g,
      /顶级域名（TLD）/g,
      /最顶层/g,
      /最顶端/g
    ],
    disqualifierRegex: /(?:顶级(?:配置|画质|服务|红利|盛宴|专家|待遇|大厨|流量))/
  },
  {
    token: "最顶",
    regexes: [
      /最顶层/g,
      /最顶端/g
    ],
    disqualifierRegex: /(?:最顶(?:级|配置|画质|品质|技术|服务|红利|盛宴|专家|待遇|大厨|流量))/
  },

  // 6. Mathematical uniqueness for "唯一"
  {
    token: "唯一",
    regexes: [
      /唯一解/g,
      /唯一性/g,
      /唯一标识/g,
      /唯一索引/g,
      /唯一凭证/g,
      /唯一答案/g
    ],
    disqualifierRegex: /(?:全网唯一|业内唯一|唯一指定|唯一官方|行业唯一)/
  },

  // 7. Effort / dedication phrasing for "100%"
  {
    token: "100%",
    regexes: [
      /100%的努力/g,
      /付出100%/g,
      /100%精力/g,
      /100%投入/g,
      /100%专注/g
    ],
    disqualifierRegex: /(?:100%[\s\.\-_·*~^/|\\，。、！？!?：:,;；]*(?:有效|真实|成功|保过|包过|正品|回本|稳赚))/
  },

  // 8. Official tech ecosystem & reader tools for "微信"
  {
    token: "微信",
    regexes: [
      /微信读书/g,
      /微信小程序开发/g,
      /微信开发者工具/g,
      /微信开放平台/g,
      /微信公开课/g
    ],
    // If nearby context contains diversion triggers, safe pass is strictly revoked!
    disqualifierRegex: /(?:加|私聊|私信|扫码|好友|联系|购买|咨询|领取|发你|进群|裙|转账|免费领|戳我|看简介|看主页|背景|主页有)/
  }
];

// ---------------------------------------------------------------------------
// CORE DETECTION FUNCTIONS
// ---------------------------------------------------------------------------

/**
 * Executes a list of rules against a normalized string and returns all raw matches.
 * @param {string} text
 * @param {Array} rules
 * @param {number} tier
 * @returns {Array}
 */
function scanRules(text, rules, tier) {
  const norm = normalizeText(text);
  const matches = [];

  for (const rule of rules) {
    for (const pattern of rule.patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(norm)) !== null) {
        // If the pattern has capturing groups (e.g. for boundaries), use the group
        const matchedText = (match[1] || match[0]).trim();
        if (!matchedText) continue;

        const matchIndex = match.index + (match[1] ? match[0].indexOf(match[1]) : 0);
        const matchLength = matchedText.length;

        // Extract surrounding context snippet (up to 20 chars before and after)
        const snippetStart = Math.max(0, matchIndex - 12);
        const snippetEnd = Math.min(norm.length, matchIndex + matchLength + 12);
        const contextSnippet = norm.slice(snippetStart, snippetEnd);

        matches.push({
          ruleId: rule.id,
          category: rule.category,
          tier,
          keyword: matchedText.replace(new RegExp(SEPARATOR_CHARS, "g"), ""),
          rawMatch: matchedText,
          index: matchIndex,
          length: matchLength,
          snippet: contextSnippet,
          description: rule.description
        });

        // Prevent infinite loop on zero-length matches
        if (match[0].length === 0) pattern.lastIndex++;
      }
    }
  }

  return matches;
}

/**
 * Checks Tier 1 Legality & Chinese Advertising Law red lines (100% Intercept).
 * @param {string} text
 * @returns {Array} Array of violations with .passed, .violations, .matches properties
 */
export function checkTier1Legality(text = "") {
  const rawMatches = scanRules(text, TIER1_RULES, 1);
  const remaining = filterContextualSafePass(text, rawMatches);

  const violations = remaining.map((m) => {
    return `[Tier 1 ${m.category}] 触发敏感词【${m.rawMatch}】(上下文: "…${m.snippet}…")`;
  });

  const res = [...violations];
  res.passed = violations.length === 0;
  res.violations = violations;
  res.matches = remaining;
  res.rawMatches = rawMatches;
  return res;
}

/**
 * Checks Tier 2 Xiaohongshu Platform Rules & Unauthorized Off-Platform Traffic Diversion (100% Intercept).
 * @param {string} text
 * @returns {Array} Array of violations with .passed, .violations, .matches properties
 */
export function checkTier2PlatformRules(text = "") {
  const rawMatches = scanRules(text, TIER2_RULES, 2);
  const remaining = filterContextualSafePass(text, rawMatches);

  const violations = remaining.map((m) => {
    return `[Tier 2 ${m.category}] 违规引流/违规用语【${m.rawMatch}】(上下文: "…${m.snippet}…")`;
  });

  const res = [...violations];
  res.passed = violations.length === 0;
  res.violations = violations;
  res.matches = remaining;
  res.rawMatches = rawMatches;
  return res;
}

/**
 * Contextual Safe-Pass Filter (>=98% Safe Pass on legitimate contextual phrases like "第一步", "绝对值").
 * Evaluates whether matched tokens are embedded inside valid mathematical, educational, or cultural phrases.
 *
 * @param {string} text
 * @param {Array} matches Array of match objects or string keywords
 * @returns {Array} Array of remaining violations that did NOT safely pass
 */
export function filterContextualSafePass(text = "", matches = []) {
  if (!text || !matches || !matches.length) {
    const empty = [];
    empty.passed = true;
    empty.safePassed = [];
    empty.safePassRate = 1.0;
    return empty;
  }

  const norm = normalizeText(text);

  // Normalize incoming matches array if caller passed strings
  const formattedMatches = matches.map((m, idx) => {
    if (typeof m === "string") {
      const idxInText = norm.indexOf(m);
      return {
        keyword: m,
        rawMatch: m,
        index: idxInText >= 0 ? idxInText : 0,
        length: m.length,
        snippet: norm.slice(Math.max(0, idxInText - 10), Math.min(norm.length, idxInText + m.length + 10))
      };
    }
    return m;
  });

  const safePassed = [];
  const remaining = [];

  for (const match of formattedMatches) {
    const kw = match.keyword || match.rawMatch || "";
    const start = typeof match.index === "number" && match.index >= 0 ? match.index : norm.indexOf(match.rawMatch);
    const end = start >= 0 ? start + (match.length || match.rawMatch.length) : -1;

    // Look around the match position in the normalized text (window of ±30 characters)
    const windowStart = Math.max(0, (start >= 0 ? start : 0) - 30);
    const windowEnd = Math.min(norm.length, (end >= 0 ? end : 0) + 30);
    const localSnippet = norm.slice(windowStart, windowEnd);

    let isSafe = false;

    // Match against our configured safe pass patterns
    for (const rule of SAFE_PASS_PATTERNS) {
      if (kw.includes(rule.token) || rule.token.includes(kw)) {
        // Check if the local snippet contains a disqualifier (e.g., "销量第一", "绝对有效")
        if (rule.disqualifierRegex && rule.disqualifierRegex.test(localSnippet)) {
          isSafe = false;
          break; // Disqualified from safe-pass!
        }

        // Test each approved safe phrase regex
        for (const safeRegex of rule.regexes) {
          safeRegex.lastIndex = 0;
          let safeMatch;
          while ((safeMatch = safeRegex.exec(norm)) !== null) {
            const sStart = safeMatch.index;
            const sEnd = sStart + safeMatch[0].length;
            // Check if our detected violation token falls strictly inside this legitimate safe phrase
            if (start >= sStart && end <= sEnd) {
              isSafe = true;
              break;
            }
          }
          if (isSafe) break;
        }
      }
      if (isSafe) break;
    }

    if (isSafe) {
      safePassed.push(match);
    } else {
      remaining.push(match);
    }
  }

  const result = [...remaining];
  result.passed = remaining.length === 0;
  result.safePassed = safePassed;
  result.safePassRate = matches.length > 0 ? safePassed.length / matches.length : 1.0;
  return result;
}

// ---------------------------------------------------------------------------
// SUGGESTIONS GENERATOR
// ---------------------------------------------------------------------------

/**
 * Generates actionable suggestions for fixing detected violations.
 * @param {Array} tier1Matches
 * @param {Array} tier2Matches
 * @returns {string[]}
 */
function generateSuggestions(tier1Matches, tier2Matches) {
  const suggestions = [];
  const seenKeywords = new Set();

  for (const m of tier1Matches) {
    if (seenKeywords.has(m.keyword)) continue;
    seenKeywords.add(m.keyword);

    if (m.category === "广告法绝对化极限词") {
      suggestions.push(`广告法合规建议：极限词【${m.rawMatch}】违规。请替换为中性、客观表述（如“深度整理”、“精选清单”、“核心方法”），避免绝对性宣称。`);
    } else if (m.category === "虚假夸大医疗健康") {
      suggestions.push(`医疗合规建议：严禁夸大疗效词【${m.rawMatch}】。请删除“包治百病”、“100%有效”等绝对承诺，严格遵循健康科普规范。`);
    } else if (m.category === "虚假暴富金融承诺") {
      suggestions.push(`金融合规建议：严禁收益保证词【${m.rawMatch}】。平台严厉打击“稳赚不赔”、“零风险”宣称，请提示投资有风险并移除保本承诺。`);
    } else {
      suggestions.push(`法律红线提示：检测到涉政/涉敏/违法违规词【${m.rawMatch}】，触及法律与公序良俗底线，必须全量删除。`);
    }
  }

  for (const m of tier2Matches) {
    if (seenKeywords.has(m.keyword)) continue;
    seenKeywords.add(m.keyword);

    if (m.category === "违规私域导流") {
      suggestions.push(`社区规则建议：严禁私域导流词【${m.rawMatch}】。小红书严禁通过“加V”、“微信”、“私信发你”等方式截流至站外，违者封号，请立即删除联系方式。`);
    } else if (m.category === "第三方电商与私下交易") {
      suggestions.push(`交易规则建议：检测到站外交易/支付词【${m.rawMatch}】。禁止引导用户前往淘宝、闲鱼或私下转账，请使用小红书官方合规带货链路。`);
    } else if (m.category === "黑产刷单与网络兼职") {
      suggestions.push(`安全合规建议：严禁兼职刷单/日赚等虚假引流词【${m.rawMatch}】，此行为涉嫌欺诈黑灰产，必须完全清除。`);
    } else {
      suggestions.push(`社区规则建议：检测到不合规用语【${m.rawMatch}】，请进行文明用语修饰。`);
    }
  }

  return suggestions;
}

// ---------------------------------------------------------------------------
// HIGH-LEVEL COMPLIANCE EVALUATION FACADE
// ---------------------------------------------------------------------------

/**
 * Evaluates the full compliance posture of a publication package across all fields.
 *
 * @param {object} contentPackage
 * @param {string} [contentPackage.title]
 * @param {string} [contentPackage.body]
 * @param {Array<string>|string} [contentPackage.tags]
 * @param {Array} [contentPackage.slides]
 * @param {object} [options]
 * @returns {object} { passed, riskLevel, tier1Violations, tier2Violations, matchedKeywords, suggestions, auditRecord }
 */
export function evaluateCompliance(contentPackage = {}, options = {}) {
  const { title = "", body = "", tags = [], slides = [] } = contentPackage || {};

  const allTier1Violations = [];
  const allTier2Violations = [];
  const allTier1Matches = [];
  const allTier2Matches = [];
  const matchedKeywordsSet = new Set();

  let totalCharsScanned = 0;

  // Helper to inspect a named text chunk
  const scanChunk = (fieldName, text) => {
    if (!text || typeof text !== "string") return;
    totalCharsScanned += text.length;

    const t1 = checkTier1Legality(text);
    if (!t1.passed) {
      for (const m of t1.matches) {
        allTier1Violations.push(`[${fieldName}] ${m.category}: 【${m.rawMatch}】(上下文: "…${m.snippet}…")`);
        allTier1Matches.push(m);
        matchedKeywordsSet.add(m.keyword || m.rawMatch);
      }
    }

    const t2 = checkTier2PlatformRules(text);
    if (!t2.passed) {
      for (const m of t2.matches) {
        allTier2Violations.push(`[${fieldName}] ${m.category}: 【${m.rawMatch}】(上下文: "…${m.snippet}…")`);
        allTier2Matches.push(m);
        matchedKeywordsSet.add(m.keyword || m.rawMatch);
      }
    }
  };

  // 1. Scan title
  scanChunk("标题 (Title)", title);

  // 2. Scan body
  scanChunk("正文 (Body)", body);

  // 3. Scan tags
  const tagsList = Array.isArray(tags) ? tags : String(tags || "").split(/\s+/);
  for (let i = 0; i < tagsList.length; i++) {
    scanChunk(`标签 #${i + 1}`, tagsList[i]);
  }

  // 4. Scan slides
  if (Array.isArray(slides)) {
    slides.forEach((slide, idx) => {
      if (typeof slide === "string") {
        scanChunk(`卡片 Slide #${idx + 1}`, slide);
      } else if (slide && typeof slide === "object") {
        if (slide.title) scanChunk(`卡片 Slide #${idx + 1} 标题`, slide.title);
        if (slide.content) scanChunk(`卡片 Slide #${idx + 1} 内容`, slide.content);
        if (slide.body) scanChunk(`卡片 Slide #${idx + 1} 正文`, slide.body);
        if (Array.isArray(slide.bullets)) {
          slide.bullets.forEach((b, bIdx) => scanChunk(`卡片 Slide #${idx + 1} 要点 #${bIdx + 1}`, b));
        }
        if (slide.note) scanChunk(`卡片 Slide #${idx + 1} 备注`, slide.note);
      }
    });
  }

  const passed = allTier1Violations.length === 0 && allTier2Violations.length === 0;

  // Determine standard riskLevel
  let riskLevel = "clean";
  if (allTier1Violations.length > 0) {
    riskLevel = "blocked";
  } else if (allTier2Violations.length > 0) {
    riskLevel = "high";
  }

  const matchedKeywords = Array.from(matchedKeywordsSet);
  const suggestions = generateSuggestions(allTier1Matches, allTier2Matches);

  // Compute immutable content hash (SHA-256)
  const contentDigestSource = [
    title,
    body,
    tagsList.join(","),
    JSON.stringify(slides)
  ].join("::");
  const contentHash = crypto.createHash("sha256").update(contentDigestSource, "utf8").digest("hex");

  // Construct structured audit record
  const auditRecord = {
    id: `audit_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
    timestamp: new Date().toISOString(),
    contentHash,
    title: String(title || "").slice(0, 50),
    passed,
    riskLevel,
    tier1Violations: allTier1Violations,
    tier2Violations: allTier2Violations,
    matchedKeywords,
    suggestions,
    stats: {
      charCount: totalCharsScanned,
      tier1Count: allTier1Violations.length,
      tier2Count: allTier2Violations.length,
      totalViolations: allTier1Violations.length + allTier2Violations.length
    }
  };

  // Optionally auto-record audit log if configured
  if (options && (options.recordLog || options.autoRecord)) {
    recordAuditLog(auditRecord, options);
  }

  return {
    passed,
    riskLevel,
    tier1Violations: allTier1Violations,
    tier2Violations: allTier2Violations,
    matchedKeywords,
    suggestions,
    auditRecord
  };
}

// ---------------------------------------------------------------------------
// AUDIT LOG PERSISTENCE
// ---------------------------------------------------------------------------

/**
 * Appends a structured audit record into data/compliance/audit_log.jsonl.
 *
 * @param {object} auditRecord
 * @param {object} [options]
 * @param {string} [options.auditPath] Custom path to audit_log.jsonl
 * @param {string} [options.rootDir] Project root directory
 * @returns {{ logged: boolean, auditPath: string, error?: string }}
 */
export function recordAuditLog(auditRecord, options = {}) {
  if (!auditRecord || typeof auditRecord !== "object") {
    return { logged: false, error: "Invalid audit record: must be a non-null object" };
  }

  const rootDir = options.rootDir || process.cwd();
  const defaultPath = path.resolve(rootDir, "data", "compliance", "audit_log.jsonl");
  const targetPath = options.auditPath || options.logPath || process.env.COMPLIANCE_AUDIT_LOG_PATH || defaultPath;

  try {
    const parentDir = path.dirname(targetPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const line = JSON.stringify(auditRecord) + "\n";
    fs.appendFileSync(targetPath, line, "utf8");

    return { logged: true, auditPath: targetPath };
  } catch (err) {
    return { logged: false, auditPath: targetPath, error: err.message };
  }
}
