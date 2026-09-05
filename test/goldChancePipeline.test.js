/**
 * Test Suite: Gold chance Pipeline (X Curation, Translation Card, Feasibility Screening, Pinned Comment, Title Engine)
 *
 * Requirements Source:
 * - ORIGINAL_REQUEST.md (2026-09-04T18:14:38Z) §R2: Gold chance Curation, Translation & Feasibility Fact-Checker Engine
 * - PROJECT.md: Features 3, 4, 5, 6, 7, 12 (Milestone 2)
 * - TEST_INFRA.md: Tiers 1-4 for Gold chance Pipeline
 * - Reference Assets: assets/gold_chance_ref/ref_copy_feasibility.jpg, assets/gold_chance_ref/ref_card_layout.jpg
 *
 * Architecture & Constraints:
 * 1. Strictly bound to xhs_account_2 (Gold chance / x_curation pipeline).
 * 2. Multi-tier ingestion: agent-reach -> direct tweet URL -> raw tweet data / feed fixture.
 * 3. Dark-mode visual card: #000000 background, 1080x1440 or 3:4 aspect ratio, author header, verified badge, translation attribution.
 * 4. Item-by-item feasibility screening: exact 3-badge taxonomy (✅ 基本靠谱 / 科学依据充分, ⚠️ 因果夸大 / 偷换概念 / 包装过头, ❌ 纯属营销噱头 / 伪科学), 1-2 sentence concise critique, circled numbers (①, ②, ...).
 * 5. Author pinned comment engine: priority ranking string (⑥ > ② > ⑦ > ⑩ > ⑤) and dismissal of gimmicks.
 * 6. Grounded concise title: natural, grounded, strictly 4-10 characters, zero clickbait punctuation.
 * 7. Store & anti-bleed integration: succeeds on xhs_account_2, strictly rejected on xhs_account_1.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import {
  createPackage,
  freezePackage,
  approvePackage,
  getPackage,
  validateAccountPipelineIsolation,
  PipelineRoutingError
} from "../src/content/store.js";

// Dynamic import for progressive milestone implementation
async function tryImport(modulePath) {
  try {
    return await import(modulePath);
  } catch (err) {
    if (err.code === "ERR_MODULE_NOT_FOUND" || err.message?.includes("Cannot find module")) {
      return null;
    }
    throw err;
  }
}

const goldChanceModule = await tryImport("../src/autonomous_content/goldChance.js");
const visualCardModule = await tryImport("../src/autonomous_content/visualCardRenderer.js");

// Resolve function handles with flexible naming
const buildPackageFn = goldChanceModule?.buildGoldChancePackage;
const ingestTweetFn = goldChanceModule?.ingestTweet || goldChanceModule?.fetchTweetData;
const screenFeasibilityFn = goldChanceModule?.screenFeasibility || goldChanceModule?.evaluateFeasibility;
const pinnedCommentFn = goldChanceModule?.generateAuthorPinnedComment || goldChanceModule?.buildAuthorPinnedComment;
const titleFn = goldChanceModule?.generateGroundedTitle || goldChanceModule?.formatGroundedTitle || goldChanceModule?.createGroundedTitle;
const renderCardFn = visualCardModule?.renderDarkTweetCard || goldChanceModule?.renderDarkTweetCard;

// Canonical 3-badge taxonomy regex
const BADGE_PATTERNS = {
  valid: /✅.*(基本靠谱|科学依据)/,
  questionable: /⚠️.*(因果夸大|偷换概念|包装过头)/,
  debunked: /❌.*(营销噱头|伪科学)/
};

// Isolated directory helper
function createIsolatedTestDir() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "m2-gold-test-"));
  fs.mkdirSync(path.join(tmp, "media"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "staging"), { recursive: true });
  return tmp;
}

// Complete experiment fixture for store validation
function completeExperiment(overrides = {}) {
  return {
    accountId: "x_curation",
    source: "X/Twitter",
    insight: "海外热点求真纠偏与认知筛选",
    audience: "关注个人成长与财富认知的年轻人",
    painOrDesire: "信息过载与虚假噱头辨析",
    objective: "save",
    topic: "变富的小技巧",
    title: "变富的小技巧",
    hookType: "contrarian",
    emotion: "relief",
    contentStructure: "pain-insight-action",
    cta: "理性行动，避免掉坑",
    predictionScores: { traffic: 8, click: 8, read: 8, save: 8, discussion: 8, share: 7, follow: 8, fit: 8, evidence: 8 },
    recommendation: "推荐发布",
    risks: [],
    strategyVersion: "m2-v1",
    hypothesisIds: ["H-GOLD-01"],
    ...overrides
  };
}

// Authoritative benchmark reference input matching ref_card_layout.jpg & ref_copy_feasibility.jpg
const REFERENCE_TWEET_10_HABITS = {
  id: "1830000000000000001",
  author: "James Kim",
  handle: "@King_James_Kim",
  verified: true,
  avatar: "https://abs.twimg.com/avatar/james.jpg",
  sourceLanguage: "ko",
  originalTitle: "✅ 당신이 가난한 이유",
  originalSubtitle: "연구가 밝혀낸 가난한 사람들의 습관",
  translatedTitle: "✅ 您贫穷的原因",
  translatedSubtitle: "研究揭示的导致贫穷的人的习惯",
  items: [
    { num: 1, text: "早上醒来后立刻查看智能手机（斯坦福大学）" },
    { num: 2, text: "睡眠时间不规律（哈佛大学）" },
    { num: 3, text: "就餐时间每天不固定（哥伦比亚大学）" },
    { num: 4, text: "房间杂乱无章（普林斯顿大学）" },
    { num: 5, text: "没有运动习惯（斯坦福大学）" },
    { num: 6, text: "倾向于拖延金钱管理（芝加哥大学）" },
    { num: 7, text: "始终保持通知开启状态（麻省理工学院）" },
    { num: 8, text: "“忙碌”成为口头禅（耶鲁大学）" },
    { num: 9, text: "不断与他人比较自己（哥伦比亚大学）" },
    { num: 10, text: "不设定目标度过每一天（麦吉尔大学）" }
  ],
  timestamp: "26年9月1日, 3:47",
  metrics: { views: "17.7K", replies: 7, retweets: 90, likes: 312, bookmarks: 190 }
};

// ===========================================================================
// TIER 1: FEATURE COVERAGE
// ===========================================================================

test("Tier 1 - F3.1: Ingestion Engine: Ingests X tweet via agent-reach query/ID", {
  skip: !ingestTweetFn ? "Awaiting M2 ingestTweet in goldChance.js" : false
}, async () => {
  const result = await ingestTweetFn({
    query: "from:King_James_Kim 1830000000000000001",
    sourceType: "agent-reach"
  });
  assert.ok(result, "Ingestion result must not be empty");
  assert.ok(result.author || result.handle, "Must contain author/handle");
  assert.ok(Array.isArray(result.items) || typeof result.text === "string", "Must contain items or text");
});

test("Tier 1 - F3.2: Ingestion Engine: Ingests X tweet via direct tweet URL fallback", {
  skip: !ingestTweetFn ? "Awaiting M2 ingestTweet in goldChance.js" : false
}, async () => {
  const tweetUrl = "https://x.com/King_James_Kim/status/1830000000000000001";
  const result = await ingestTweetFn({ url: tweetUrl });
  assert.ok(result, "Direct URL ingestion must return tweet data");
  assert.ok(result.url === tweetUrl || result.id === "1830000000000000001", "Must identify tweet by URL or ID");
});

test("Tier 1 - F3.3: Ingestion Engine: Ingests X tweet via local structured feed / fixture fallback", {
  skip: !ingestTweetFn ? "Awaiting M2 ingestTweet in goldChance.js" : false
}, async () => {
  const result = await ingestTweetFn({ fixture: REFERENCE_TWEET_10_HABITS });
  assert.equal(result.id, REFERENCE_TWEET_10_HABITS.id);
  assert.equal(result.author, "James Kim");
  assert.equal(result.items.length, 10);
});

test("Tier 1 - F4.1: Dark-Mode Visual Card: Generates valid file with dark theme and dimensions", {
  skip: !renderCardFn ? "Awaiting M2 renderDarkTweetCard in visualCardRenderer.js" : false
}, async () => {
  const baseDir = createIsolatedTestDir();
  const outputPath = path.join(baseDir, "media", "rendered_tweet_card.png");

  const cardResult = await renderCardFn(REFERENCE_TWEET_10_HABITS, {
    outputPath,
    theme: "dark"
  });

  assert.ok(cardResult, "Card generation result must not be empty");
  assert.equal(cardResult.theme, "dark", "Theme must be dark");
  assert.ok(cardResult.width >= 1000, `Width should be >= 1000px, got: ${cardResult.width}`);
  assert.ok(cardResult.height >= 1300, `Height should be >= 1300px, got: ${cardResult.height}`);

  const targetFile = cardResult.path || outputPath;
  assert.ok(fs.existsSync(targetFile), `Rendered card file must exist at ${targetFile}`);
  const stats = fs.statSync(targetFile);
  assert.ok(stats.size > 0, "Rendered card file must have non-zero size");
});

test("Tier 1 - F4.2: Dark-Mode Visual Card: Preserves author metadata, blue verified badge, and translation header", {
  skip: !renderCardFn ? "Awaiting M2 renderDarkTweetCard in visualCardRenderer.js" : false
}, async () => {
  const baseDir = createIsolatedTestDir();
  const cardResult = await renderCardFn(REFERENCE_TWEET_10_HABITS, {
    outputDir: path.join(baseDir, "media")
  });

  // Verify card metadata payload
  assert.equal(cardResult.author, "James Kim");
  assert.equal(cardResult.handle, "@King_James_Kim");
  assert.equal(cardResult.verified, true);
  assert.ok(
    cardResult.translationAttribution?.includes("韩语") || cardResult.metadata?.translationAttribution?.includes("韩语"),
    "Must record translation attribution (e.g. 翻译自韩语)"
  );
});

test("Tier 1 - F5.1: Feasibility Screening: Classifies claims using exact 3-badge taxonomy", {
  skip: !screenFeasibilityFn ? "Awaiting M2 screenFeasibility in goldChance.js" : false
}, () => {
  const sampleClaims = [
    "长期睡眠不规律确实会影响精力、认知和执行状态", // Valid
    "早上醒来立刻刷智能手机直接导致终生贫穷", // Questionable (exaggerated causality)
    "每天喝特制排毒神药果汁能保证月入十万彻底翻身" // Debunked (gimmick / pseudoscience)
  ];

  const ratings = screenFeasibilityFn(sampleClaims);
  assert.ok(Array.isArray(ratings), "Ratings must be an array");
  assert.equal(ratings.length, 3, "Must produce rating for each claim");

  for (const item of ratings) {
    assert.ok(item.badge, "Each rating must have a badge");
    const isMatched = BADGE_PATTERNS.valid.test(item.badge) ||
                      BADGE_PATTERNS.questionable.test(item.badge) ||
                      BADGE_PATTERNS.debunked.test(item.badge);
    assert.ok(
      isMatched,
      `Badge "${item.badge}" must match one of the 3 canonical badge categories`
    );
  }

  // Exact category matches
  assert.ok(BADGE_PATTERNS.valid.test(ratings[0].badge), `Claim 1 should be valid, got: ${ratings[0].badge}`);
  assert.ok(BADGE_PATTERNS.questionable.test(ratings[1].badge), `Claim 2 should be questionable, got: ${ratings[1].badge}`);
  assert.ok(BADGE_PATTERNS.debunked.test(ratings[2].badge), `Claim 3 should be debunked, got: ${ratings[2].badge}`);
});

test("Tier 1 - F5.2: Feasibility Screening: Produces concise 1-2 sentence real-world critique per claim", {
  skip: !screenFeasibilityFn ? "Awaiting M2 screenFeasibility in goldChance.js" : false
}, () => {
  const sampleClaims = [
    "就餐时间每天不固定",
    "房间杂乱无章",
    "倾向于拖延金钱管理"
  ];

  const ratings = screenFeasibilityFn(sampleClaims);
  for (const item of ratings) {
    assert.ok(item.critique, `Rating for "${item.claim}" must have critique`);
    assert.ok(typeof item.critique === "string", "Critique must be a string");
    assert.ok(item.critique.length >= 10, `Critique should have substantive length (>= 10 chars), got: ${item.critique.length}`);
    assert.ok(item.critique.length <= 250, `Critique must remain concise (<= 250 chars), got: ${item.critique.length}`);
  }
});

test("Tier 1 - F5.3: Feasibility Screening: Formats itemized body using circled numbers (①, ②, ...)", {
  skip: !screenFeasibilityFn && !buildPackageFn ? "Awaiting M2 feasibility/package in goldChance.js" : false
}, () => {
  let bodyText = "";
  if (buildPackageFn) {
    const pkg = buildPackageFn(REFERENCE_TWEET_10_HABITS);
    bodyText = pkg.body;
  } else {
    const ratings = screenFeasibilityFn(REFERENCE_TWEET_10_HABITS.items.map((i) => i.text));
    bodyText = ratings.map((r, i) => `${['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'][i]} ${r.claim} ${r.badge}\n${r.critique}`).join("\n\n");
  }

  assert.ok(bodyText, "Body text must not be empty");
  assert.ok(/①/.test(bodyText), "Body must contain circled number ①");
  assert.ok(/②/.test(bodyText), "Body must contain circled number ②");
  assert.ok(/[①②③④⑤⑥⑦⑧⑨⑩]/.test(bodyText), "Body must format items with circled numbers");
});

test("Tier 1 - F6.1: Author Pinned Comment Engine: Generates priority ranking string with '>'", {
  skip: !pinnedCommentFn ? "Awaiting M2 generateAuthorPinnedComment in goldChance.js" : false
}, () => {
  const ratings = [
    { index: 1, claim: "起床刷手机", badge: "⚠️ 因果夸大", rating: "questionable" },
    { index: 2, claim: "睡眠不规律", badge: "✅ 基本靠谱", rating: "valid" },
    { index: 5, claim: "没有运动习惯", badge: "✅ 基本靠谱", rating: "valid" },
    { index: 6, claim: "拖延金钱管理", badge: "✅ 基本靠谱", rating: "valid" },
    { index: 8, claim: "口头禅总说忙", badge: "❌ 纯属营销噱头", rating: "debunked" }
  ];

  const comment = pinnedCommentFn(ratings);
  assert.ok(typeof comment === "string", "Pinned comment must be a string");
  assert.ok(comment.length > 0, "Pinned comment must not be empty");
  assert.ok(comment.includes(">"), `Pinned comment must contain priority '>' comparator, got: "${comment}"`);
  assert.ok(/[①-⑩]/.test(comment), `Pinned comment must reference circled item numbers, got: "${comment}"`);
});

test("Tier 1 - F6.2: Author Pinned Comment Engine: Dismisses exaggerated and marketing gimmick claims", {
  skip: !pinnedCommentFn ? "Awaiting M2 generateAuthorPinnedComment in goldChance.js" : false
}, () => {
  const ratings = [
    { index: 2, claim: "睡眠不规律", badge: "✅ 基本靠谱", rating: "valid" },
    { index: 3, claim: "就餐时间不固定", badge: "⚠️ 因果夸大", rating: "questionable" },
    { index: 4, claim: "房间杂乱", badge: "⚠️ 因果夸大", rating: "questionable" },
    { index: 6, claim: "金钱管理拖延", badge: "✅ 基本靠谱", rating: "valid" },
    { index: 8, claim: "口头禅总说忙", badge: "❌ 纯属营销噱头", rating: "debunked" }
  ];

  const comment = pinnedCommentFn(ratings);
  assert.ok(
    /吓唬人|营销噱头|包装过头|只是|避坑/i.test(comment),
    `Pinned comment must include dismissal clause for questionable/gimmick items, got: "${comment}"`
  );
});

test("Tier 1 - F7.1: Grounded Title Generator: Produces concise title strictly 4–10 characters", {
  skip: !titleFn ? "Awaiting M2 generateGroundedTitle in goldChance.js" : false
}, () => {
  const inputs = [
    "研究揭示的导致贫穷的人的习惯",
    "变富的十个小技巧与财富思维",
    "Naval Ravikant on Leverage and Judgment",
    "极简主义生活习惯指南"
  ];

  for (const raw of inputs) {
    const title = titleFn(raw);
    assert.ok(typeof title === "string", "Title must be a string");
    assert.ok(
      title.length >= 4 && title.length <= 10,
      `Title "${title}" length must be between 4 and 10 characters, got: ${title.length}`
    );
  }
});

test("Tier 1 - F7.2: Grounded Title Generator: Eliminates clickbait punctuation and sensationalist buzzwords", {
  skip: !titleFn ? "Awaiting M2 generateGroundedTitle in goldChance.js" : false
}, () => {
  const clickbaitInputs = [
    "外网疯传的导致贫穷的10个习惯！",
    "【震惊】看完这8条彻底顿悟？？？",
    "必看！颠覆认知的变富法则！！",
    "全网刷屏～原来我们都做错了！"
  ];

  for (const raw of clickbaitInputs) {
    const title = titleFn(raw);
    assert.ok(!/[！!？?【】～~]/.test(title), `Title "${title}" must not contain clickbait punctuation`);
    assert.ok(!/外网疯传|震惊|必看|彻底顿悟|全网刷屏/.test(title), `Title "${title}" must not contain clickbait buzzwords`);
    assert.ok(title.length >= 4 && title.length <= 10, `Sanitized title "${title}" must be 4-10 chars`);
  }
});

test("Tier 1 - F12.1: Complete Package Generation: buildGoldChancePackage produces valid payload for xhs_account_2", {
  skip: !buildPackageFn ? "Awaiting M2 buildGoldChancePackage in goldChance.js" : false
}, () => {
  const pkg = buildPackageFn(REFERENCE_TWEET_10_HABITS);

  assert.ok(pkg, "Package must be returned");
  assert.equal(pkg.project, "x_curation");
  assert.equal(pkg.accountId, "xhs_account_2");

  // Title verification
  assert.ok(typeof pkg.title === "string");
  assert.ok(pkg.title.length >= 4 && pkg.title.length <= 10, `Title "${pkg.title}" must be 4-10 chars`);
  assert.ok(!/[！!？?【】]/.test(pkg.title), `Title "${pkg.title}" must have 0 clickbait punctuation`);

  // Body verification
  assert.ok(typeof pkg.body === "string");
  assert.ok(/[①-⑩]/.test(pkg.body), "Body must have circled numbers");
  assert.ok(/[✅⚠️❌]/.test(pkg.body), "Body must have feasibility badges");

  // Author pinned comment verification
  assert.ok(typeof pkg.authorPinnedComment === "string");
  assert.ok(pkg.authorPinnedComment.includes(">"), "Pinned comment must contain priority order '>'");

  // Tags verification: strictly 4-6 tags
  assert.ok(Array.isArray(pkg.tags), "Tags must be an array");
  assert.ok(pkg.tags.length >= 4 && pkg.tags.length <= 6, `Tags count must be 4-6, got: ${pkg.tags.length}`);

  // Visual card verification
  assert.ok(pkg.visualCard, "Package must have visualCard");
  assert.equal(pkg.visualCard.theme, "dark", "visualCard must have dark theme");

  // Feasibility ratings array verification
  assert.ok(Array.isArray(pkg.feasibilityRatings), "feasibilityRatings must be an array");
  assert.ok(pkg.feasibilityRatings.length >= 1, "Must have feasibilityRatings items");
  assert.ok(pkg.feasibilityRatings[0].badge, "Each rating must have a badge");
  assert.ok(pkg.feasibilityRatings[0].critique, "Each rating must have a critique");
});

// ===========================================================================
// TIER 2: BOUNDARY & CORNER CASES (ADVERSARIAL VERIFICATION)
// ===========================================================================

test("Tier 2 - B2.1: Title boundary: Exactly 4 characters passes; exactly 10 characters passes", {
  skip: !titleFn ? "Awaiting M2 generateGroundedTitle in goldChance.js" : false
}, () => {
  // Exactly 4 characters
  const t4 = titleFn("变富技巧");
  assert.equal(t4.length, 4, `Expected exactly 4 chars, got "${t4}" (${t4.length})`);

  // Exactly 10 characters
  const t10 = titleFn("极简生活的10个误区");
  assert.equal(t10.length, 10, `Expected exactly 10 chars, got "${t10}" (${t10.length})`);
});

test("Tier 2 - B2.2: Title auto-sanitization: Overlong title with punctuation truncated to <= 10 chars without punctuation", {
  skip: !titleFn ? "Awaiting M2 generateGroundedTitle in goldChance.js" : false
}, () => {
  const overlong = "外网疯传的导致贫穷的10个习惯！你中了几条？？";
  const result = titleFn(overlong);

  assert.ok(result.length >= 4 && result.length <= 10, `Sanitized length must be 4-10, got: ${result.length}`);
  assert.ok(!/[！!？?]/.test(result), `Punctuation must be purged, got: "${result}"`);
});

test("Tier 2 - B2.3: Title underlong boundary: Input < 4 chars padded or falls back safely to >= 4 chars", {
  skip: !titleFn ? "Awaiting M2 generateGroundedTitle in goldChance.js" : false
}, () => {
  const underlongInputs = ["富", "省钱", "  ", ""];
  for (const raw of underlongInputs) {
    const result = titleFn(raw);
    assert.ok(
      result.length >= 4 && result.length <= 10,
      `Underlong fallback title "${result}" must satisfy 4-10 chars constraint`
    );
  }
});

test("Tier 2 - B2.4: Single claim edge case: Pinned comment outputs single statement without invalid 'A > ' syntax", {
  skip: !pinnedCommentFn ? "Awaiting M2 generateAuthorPinnedComment in goldChance.js" : false
}, () => {
  const singleClaim = [
    { index: 1, claim: "专注一件事", badge: "✅ 基本靠谱 / 科学依据充分", rating: "valid" }
  ];

  const comment = pinnedCommentFn(singleClaim);
  assert.ok(typeof comment === "string");
  assert.ok(comment.length > 0);
  // Should NOT produce trailing or leading dangling '>' like "① > " or " > ①"
  assert.ok(!/>\s*$/.test(comment), `Must not end with dangling '>', got: "${comment}"`);
  assert.ok(!/^\s*>/.test(comment), `Must not start with dangling '>', got: "${comment}"`);
});

test("Tier 2 - B2.5: Empty claims edge case: Gracefully handled without crash", {
  skip: !screenFeasibilityFn ? "Awaiting M2 screenFeasibility in goldChance.js" : false
}, () => {
  assert.doesNotThrow(() => {
    const result = screenFeasibilityFn([]);
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 0);
  });
});

test("Tier 2 - B2.6: 100% debunked claims: Flags all as gimmicks with no misleading positive priority ranking", {
  skip: !pinnedCommentFn ? "Awaiting M2 generateAuthorPinnedComment in goldChance.js" : false
}, () => {
  const allDebunked = [
    { index: 1, claim: "喝果汁年轻10岁", badge: "❌ 纯属营销噱头 / 伪科学", rating: "debunked" },
    { index: 2, claim: "早起5点收入翻倍", badge: "❌ 纯属营销噱头 / 伪科学", rating: "debunked" },
    { index: 3, claim: "冷水澡根治抑郁", badge: "❌ 纯属营销噱头 / 伪科学", rating: "debunked" }
  ];

  const comment = pinnedCommentFn(allDebunked);
  assert.ok(
    /全部.*(噱头|伪科学|避坑)|无推荐/i.test(comment),
    `When 100% debunked, comment must state all are gimmicks, got: "${comment}"`
  );
  // Should NOT construct a positive priority ranking recommending debunked habits
  assert.ok(!comment.includes(">"), `Debunked items should not form positive '>' priority ranking, got: "${comment}"`);
});

test("Tier 2 - B2.7: 100% verified claims: Generates full priority ranking across all items without dismissal clause", {
  skip: !pinnedCommentFn ? "Awaiting M2 generateAuthorPinnedComment in goldChance.js" : false
}, () => {
  const allValid = [
    { index: 1, claim: "充足睡眠", badge: "✅ 基本靠谱 / 科学依据充分", rating: "valid" },
    { index: 2, claim: "控制消费", badge: "✅ 基本靠谱 / 科学依据充分", rating: "valid" },
    { index: 3, claim: "坚持复盘", badge: "✅ 基本靠谱 / 科学依据充分", rating: "valid" }
  ];

  const comment = pinnedCommentFn(allValid);
  assert.ok(comment.includes(">"), `Must have priority ranking, got: "${comment}"`);
  // Dismissal clause about gimmicks / scare tactics is unnecessary
  assert.ok(
    !/只是.*吓唬人|全部为营销噱头/.test(comment),
    `When all claims are valid, dismissal clause should not be triggered, got: "${comment}"`
  );
});

test("Tier 2 - B2.8: Malformed input rejection: Null, undefined, and non-object inputs handled safely", {
  skip: !buildPackageFn ? "Awaiting M2 buildGoldChancePackage in goldChance.js" : false
}, () => {
  const malformed = [null, undefined, 12345, "just a string"];
  for (const input of malformed) {
    assert.throws(
      () => buildPackageFn(input),
      (err) => {
        assert.ok(err instanceof Error);
        return true;
      },
      `Malformed input ${JSON.stringify(input)} must throw an Error`
    );
  }
});

// ===========================================================================
// TIER 3: CROSS-FEATURE & ISOLATION (INTEGRATION WITH STORE.JS)
// ===========================================================================

test("Tier 3 - I3.1: Full Store Integration: Valid Gold chance package creates, freezes and approves cleanly for xhs_account_2", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir };
  const cardPath = path.join(baseDir, "media", "dark_tweet_card.png");
  fs.writeFileSync(cardPath, "fake-dark-tweet-card-png");

  // Obtain package either via buildPackageFn or synthetic contract fixture
  let goldPkgInput;
  if (buildPackageFn) {
    goldPkgInput = buildPackageFn(REFERENCE_TWEET_10_HABITS);
    goldPkgInput.media = [{ kind: "image", path: cardPath, theme: "dark" }];
    goldPkgInput.experiment = completeExperiment({ accountId: "x_curation" });
  } else {
    goldPkgInput = {
      title: "变富的小技巧",
      project: "x_curation",
      accountId: "xhs_account_2",
      body: "① 提升睡后收入 ✅ 基本靠谱 / 科学依据充分\n普通人尽早配置被动收入现金流。\n\n② 盲目加杠杆 ❌ 纯属营销噱头 / 伪科学\n极高破产风险。\n\n#搞钱思维 #财富自由",
      authorPinnedComment: "优先级：① > ②，而 ② 纯属割韭菜",
      feasibilityRatings: [
        { index: 1, claim: "提升睡后收入", badge: "✅ 基本靠谱 / 科学依据充分", critique: "现金流配置" },
        { index: 2, claim: "盲目加杠杆", badge: "❌ 纯属营销噱头 / 伪科学", critique: "极高破产风险" }
      ],
      visualCard: { path: cardPath, width: 1080, height: 1440, theme: "dark" },
      media: [{ kind: "image", path: cardPath, theme: "dark" }],
      experiment: completeExperiment({ accountId: "x_curation" })
    };
  }

  const pkg = createPackage({
    ...goldPkgInput,
    platform: "xiaohongshu"
  }, options);

  assert.equal(pkg.status, "draft");
  assert.equal(pkg.accountId, "xhs_account_2");
  assert.doesNotThrow(() => validateAccountPipelineIsolation(pkg, "xhs_account_2"));

  const frozen = freezePackage(pkg.id, options);
  assert.equal(frozen.status, "awaiting_approval");

  const approved = approvePackage(pkg.id, options);
  assert.equal(approved.status, "approved");
  assert.equal(approved.approvalStatus, "approved");
});

test("Tier 3 - I3.2: Account Isolation Anti-Bleed: Shuzhai (xhs_account_1) strictly rejects Gold chance feasibility badges", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir };

  // Attempt to create package for Shuzhai with Gold chance feasibility badge
  assert.throws(
    () => {
      createPackage({
        title: "读书打假测试",
        platform: "xiaohongshu",
        project: "shuzhai",
        accountId: "xhs_account_1",
        body: "书中论断 ① ✅ 基本靠谱 / 科学依据充分\n验证结论。",
        experiment: completeExperiment({ accountId: "shuzhai" })
      }, options);
    },
    (err) => {
      assert.ok(err instanceof PipelineRoutingError);
      assert.match(err.message, /strictly rejects X curation/i);
      return true;
    }
  );
});

test("Tier 3 - I3.3: Account Isolation Anti-Bleed: Shuzhai (xhs_account_1) strictly rejects dark tweet visualCard", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir };

  assert.throws(
    () => {
      createPackage({
        title: "书斋笔记混入卡片",
        platform: "xiaohongshu",
        project: "shuzhai",
        accountId: "xhs_account_1",
        body: "正常读书正文",
        visualCard: { path: "dark_tweet_card.png", theme: "dark" },
        experiment: completeExperiment({ accountId: "shuzhai" })
      }, options);
    },
    (err) => {
      assert.ok(err instanceof PipelineRoutingError);
      assert.match(err.message, /visualCard/i);
      return true;
    }
  );
});

test("Tier 3 - I3.4: Account Isolation Anti-Bleed: Shuzhai (xhs_account_1) strictly rejects authorPinnedComment", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir };

  assert.throws(
    () => {
      createPackage({
        title: "书斋笔记混入置顶",
        platform: "xiaohongshu",
        project: "shuzhai",
        accountId: "xhs_account_1",
        body: "合规读书正文",
        authorPinnedComment: "优先级：⑥ > ② > ⑦，其余为营销噱头",
        experiment: completeExperiment({ accountId: "shuzhai" })
      }, options);
    },
    (err) => {
      assert.ok(err instanceof PipelineRoutingError);
      assert.match(err.message, /authorPinnedComment/i);
      return true;
    }
  );
});

test("Tier 3 - I3.5: Account Isolation Anti-Bleed: Gold chance (xhs_account_2) strictly rejects Shuzhai book layout templates", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir };

  assert.throws(
    () => {
      createPackage({
        title: "推特笔记混入模板",
        platform: "xiaohongshu",
        project: "x_curation",
        accountId: "xhs_account_2",
        body: "推特正文",
        layout: { templateId: "shuzhai-editorial-v1" },
        experiment: completeExperiment({ accountId: "x_curation" })
      }, options);
    },
    (err) => {
      assert.ok(err instanceof PipelineRoutingError);
      assert.match(err.message, /strictly rejects Shuzhai book card layouts/i);
      return true;
    }
  );
});

test("Tier 3 - I3.6: Account Isolation Anti-Bleed: Gold chance (xhs_account_2) strictly rejects book citations in facts", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir };

  assert.throws(
    () => {
      createPackage({
        title: "推特笔记混入书摘",
        platform: "xiaohongshu",
        project: "x_curation",
        accountId: "xhs_account_2",
        body: "推特正文",
        layers: { facts: [{ id: "f1", text: "引用自《金钱心理学》第二章" }] },
        experiment: completeExperiment({ accountId: "x_curation" })
      }, options);
    },
    (err) => {
      assert.ok(err instanceof PipelineRoutingError);
      assert.match(err.message, /book citations in facts/i);
      return true;
    }
  );
});

// ===========================================================================
// TIER 4: REAL-WORLD APPLICATION BENCHMARK
// ===========================================================================

test("Tier 4 - R4.1: Benchmark Scenario 1: Reference '10 Habits of Poverty' full pipeline matches ref_copy_feasibility.jpg", {
  skip: !buildPackageFn ? "Awaiting M2 buildGoldChancePackage in goldChance.js" : false
}, () => {
  const pkg = buildPackageFn(REFERENCE_TWEET_10_HABITS);

  // 1. Title matches concise grounded standard (benchmark uses "变富的小技巧")
  assert.ok(pkg.title.length >= 4 && pkg.title.length <= 10, `Benchmark title "${pkg.title}" must be 4-10 chars`);
  assert.ok(!/[！!？?【】]/.test(pkg.title), `Benchmark title must have no clickbait punctuation`);

  // 2. Body matches 10 items with circled numbers ① through ⑩ and feasibility badges
  for (let i = 1; i <= 10; i++) {
    const circled = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'][i - 1];
    assert.ok(pkg.body.includes(circled), `Body must contain circled item ${circled}`);
  }
  assert.ok(pkg.body.includes("✅"), "Body must contain valid badge (✅)");
  assert.ok(pkg.body.includes("⚠️"), "Body must contain questionable badge (⚠️)");

  // 3. Author pinned comment matches reference structure: priority ordering + gimmick dismissal
  assert.ok(pkg.authorPinnedComment.includes(">"), "Pinned comment must contain '>' priority comparator");
  assert.ok(/[⑥②⑦⑩⑤]/.test(pkg.authorPinnedComment), "Pinned comment should prioritize top actionable habits");
  assert.ok(
    /吓唬人|营销噱头|包装过头|避坑|只是/i.test(pkg.authorPinnedComment),
    "Pinned comment must dismiss questionable habits as scare tactics / marketing gimmicks"
  );

  // 4. Tags: 4-6 curated tags
  assert.ok(pkg.tags.length >= 4 && pkg.tags.length <= 6);
  assert.ok(pkg.tags.some((t) => /富有|搞钱|财富|思维/i.test(t)), "Tags must match wealth/growth topic domain");
});

test("Tier 4 - R4.2: Benchmark Scenario 2: Naval Ravikant leverage tweet end-to-end package generation", {
  skip: !buildPackageFn ? "Awaiting M2 buildGoldChancePackage in goldChance.js" : false
}, () => {
  const navalTweet = {
    id: "1830000000000000002",
    author: "Naval",
    handle: "@naval",
    verified: true,
    items: [
      { num: 1, text: "代码与媒体是无许可杠杆（Permissionless leverage）" },
      { num: 2, text: "盲目增加劳动力杠杆是最糟糕的管理方式" },
      { num: 3, text: "依靠运气暴富是不可持续的伪科学" }
    ],
    timestamp: "26年9月2日, 10:00",
    metrics: { views: "500K", replies: 120, retweets: 3500, likes: 18000 }
  };

  const pkg = buildPackageFn(navalTweet);
  assert.ok(pkg);
  assert.equal(pkg.accountId, "xhs_account_2");
  assert.ok(pkg.title.length >= 4 && pkg.title.length <= 10);
  assert.ok(pkg.body.includes("①") && pkg.body.includes("②") && pkg.body.includes("③"));
  assert.ok(pkg.authorPinnedComment.length > 0);
});

test("Tier 4 - R4.3: Benchmark Scenario 3: Real-world benchmark package integrates seamlessly with Store lifecycle", {
  skip: !buildPackageFn ? "Awaiting M2 buildGoldChancePackage in goldChance.js" : false
}, () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir };
  const cardPath = path.join(baseDir, "media", "benchmark_card.png");
  fs.writeFileSync(cardPath, "fake-benchmark-image");

  const pkgPayload = buildPackageFn(REFERENCE_TWEET_10_HABITS);
  pkgPayload.media = [{ kind: "image", path: cardPath, theme: "dark" }];
  pkgPayload.experiment = completeExperiment({ accountId: "x_curation" });

  const pkg = createPackage({
    ...pkgPayload,
    platform: "xiaohongshu"
  }, options);

  assert.equal(pkg.status, "draft");
  assert.equal(pkg.accountId, "xhs_account_2");

  const frozen = freezePackage(pkg.id, options);
  assert.equal(frozen.status, "awaiting_approval");

  const approved = approvePackage(pkg.id, options);
  assert.equal(approved.status, "approved");
});
