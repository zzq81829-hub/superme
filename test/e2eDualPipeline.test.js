/**
 * Test Suite: Milestone 6 - E2E Dual-Track Verification & Sample Run Validation
 *
 * Requirements Source:
 * - ORIGINAL_REQUEST.md (2026-09-04T18:14:38Z)
 * - PROJECT.md: Features 1-12, Milestones M1-M6
 * - TEST_INFRA.md: Tier 4 Real-World Application Scenarios 1-6
 * - Reference Assets:
 *   - assets/gold_chance_ref/ref_card_layout.jpg
 *   - assets/gold_chance_ref/ref_copy_feasibility.jpg
 *   - media_1788545202334.jpg
 *
 * Scenarios Tested (Tier 4):
 * - Scenario 1: Reference "10 Habits of Poverty" complete pipeline run (xhs_account_2).
 * - Scenario 2: Naval Ravikant leverage tweet end-to-end package (xhs_account_2).
 * - Scenario 3: Shuzhai 6-page illustrated book card package (xhs_account_1).
 * - Scenario 4: Cross-bleed rejection attack: submitting X curation to xhs_account_1 and Shuzhai to xhs_account_2 throws PipelineRoutingError.
 * - Scenario 5: Anti-AI tone filter integration: linting and cleansing AI clichés.
 * - Scenario 6: Full dual-track publisher preparation, staging, and ledger recording.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

import {
  REFERENCE_TWEET_10_HABITS,
  REFERENCE_TWEET_NAVAL,
  BADGE_TAXONOMY,
  CIRCLED_NUMBERS,
  fetchTweetSource,
  generateGroundedTitle,
  screenFeasibility,
  generateAuthorPinnedComment,
  buildGoldChancePackage,
  renderDarkTweetCard
} from "../src/autonomous_content/goldChance.js";

import {
  MANDATORY_BANNED_CLICHES,
  EXTENDED_AI_BUZZWORDS,
  lintAntiAITone,
  humanizeText,
  recommendXiaohongshuTags
} from "../src/autonomous_content/humanizedCopy.js";

import {
  createPackage,
  freezePackage,
  approvePackage,
  getPackage,
  validateAccountPipelineIsolation,
  PipelineRoutingError,
  normalizeAccountIdentifier,
  computeContentPackageHash
} from "../src/content/store.js";

import {
  resolvePublisherAccount,
  publishApprovedPackage,
  buildXhsNote
} from "../src/publish/xhs.js";

import {
  buildXiaohongshuLayoutPlan,
  CARD_LAYOUT_STANDARD,
  XIAOHONGSHU_LAYOUT_TEMPLATES
} from "../src/content/xiaohongshuLayout.js";

import { readCardLayoutStandardDirective } from "../src/skills/cardLayoutStandard.js";
import { getDb, closeDb } from "../engine/intelligence/xhs/storage/db.js";
import { listMyNotes } from "../engine/intelligence/xhs/storage/repository.js";
import { allowPackageDelivery, enqueueDelivery, loadOutbox } from "../src/delivery/outbox.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// Helper: isolated directory for each test run to ensure zero side-effects
function createIsolatedTestDir(prefix = "m6-e2e-") {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(tmp, "media"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "staging"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "packages"), { recursive: true });
  return tmp;
}

// Helper: fully compliant experiment metadata required for freezePackage
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
    hookType: "fact_check",
    emotion: "relief",
    contentStructure: "pain-insight-action",
    cta: "理性行动，避免掉坑",
    predictionScores: {
      traffic: 8,
      click: 8,
      read: 8,
      save: 8,
      discussion: 8,
      share: 7,
      follow: 8,
      fit: 8,
      evidence: 8
    },
    recommendation: "推荐发布",
    risks: [],
    strategyVersion: "m6-e2e-v1",
    hypothesisIds: ["H-E2E-01"],
    ...overrides
  };
}

// Helper: mock MCP publisher request handler
function createMockMcpPublisher(logBox = {}) {
  return async (method, url, body) => {
    logBox.lastCall = { method, url, body };
    return {
      status: 200,
      json: {
        success: true,
        message: "发布成功",
        data: {
          note_id: `note-e2e-${Date.now()}`,
          url: `https://www.xiaohongshu.com/explore/note-e2e-${Date.now()}`
        }
      },
      raw: ""
    };
  };
}

// ===========================================================================
// SCENARIO 1: REFERENCE "10 HABITS OF POVERTY" COMPLETE PIPELINE RUN (xhs_account_2)
// ===========================================================================

test("Scenario 1: Reference '10 Habits of Poverty' complete pipeline run (xhs_account_2)", async () => {
  const baseDir = createIsolatedTestDir("scenario-1-");
  const options = { baseDir: path.join(baseDir, "packages") };

  // 1. Ingestion: Ingest reference tweet
  const tweet = await fetchTweetSource(REFERENCE_TWEET_10_HABITS, { offline: true });
  assert.equal(tweet.author, "James Kim");
  assert.equal(tweet.handle, "@King_James_Kim");
  assert.equal(tweet.items.length, 10);
  assert.equal(tweet.sourceLanguage, "ko");

  // 2. Grounded Title Generation: Must be 4-10 characters, 0 clickbait punctuation
  const rawTitleSource = tweet.translatedTitle || "✅ 您贫穷的原因";
  const title = generateGroundedTitle(rawTitleSource);
  assert.equal(title, "变富的小技巧");
  assert.ok(title.length >= 4 && title.length <= 10, "Title length must be strictly 4-10 chars");
  assert.ok(!/[✅⚠️❌！!？?【】\[\]～~""“”‘’'()（）—\-_#*《》`·]/.test(title), "Title must have 0 clickbait punctuation");

  // 3. Feasibility Screening: Item-by-item reality check with 3-tier badges & critiques
  const ratings = screenFeasibility(tweet.claims);
  assert.equal(ratings.length, 10);
  
  // Verify circled numbers and matching critiques for 10 habits
  for (let i = 0; i < 10; i++) {
    assert.equal(ratings[i].index, i + 1);
    assert.equal(ratings[i].circledIndex, CIRCLED_NUMBERS[i]);
    assert.ok(ratings[i].critique.length > 0, `Critique for item ${i + 1} must not be empty`);
    assert.ok(
      ratings[i].badge.includes("✅") || ratings[i].badge.includes("⚠️") || ratings[i].badge.includes("❌"),
      `Badge must be canonical 3-tier badge: ${ratings[i].badge}`
    );
  }

  // Check specific reference mappings (from ref_copy_feasibility.jpg)
  assert.equal(ratings[0].claim, "起床刷手机");
  assert.ok(ratings[0].badge.includes("⚠️"));
  assert.ok(ratings[0].critique.includes("注意力被手机打断"));

  assert.equal(ratings[1].claim, "睡眠不规律");
  assert.ok(ratings[1].badge.includes("✅"));
  assert.ok(ratings[1].critique.includes("长期睡眠不规律确实会影响精力"));

  assert.equal(ratings[5].claim, "拖延金钱管理");
  assert.ok(ratings[5].badge.includes("✅"));
  assert.ok(ratings[5].critique.includes("忽视现金流"));

  // 4. Author Pinned Comment Engine: Priority ranking + gimmick dismissal
  const pinnedComment = generateAuthorPinnedComment(ratings);
  assert.ok(pinnedComment.includes("优先级："), "Pinned comment must start with priority statement");
  assert.ok(pinnedComment.includes(">"), "Pinned comment must contain hierarchy '>' comparator");
  assert.ok(pinnedComment.includes("⑥"), "Priority ranking must prioritize financial habit ⑥");
  assert.ok(pinnedComment.includes("②"), "Priority ranking must include sleep habit ②");
  assert.ok(/吓唬人|包装过头|营销噱头/i.test(pinnedComment), "Pinned comment must dismiss scare tactics / gimmicks");

  // 5. Xiaohongshu Tag Recommendation: 4-6 curated tags, domain-matched, no buzzwords
  const tags = recommendXiaohongshuTags(title, "wealth");
  assert.ok(tags.length >= 4 && tags.length <= 6, `Tag count must be between 4 and 6 (got ${tags.length})`);
  for (const t of tags) {
    assert.ok(t.startsWith("#"), `Tag must start with #: ${t}`);
    assert.ok(!t.includes(" "), `Tag must not contain spaces: ${t}`);
    for (const banned of MANDATORY_BANNED_CLICHES) {
      assert.ok(!t.includes(banned), `Tag must not contain banned cliché: ${banned}`);
    }
  }

  // 6. Visual Card Rendering: 1080x1440 dark-mode card matching reference layout
  const cardPath = path.join(baseDir, "media", "scenario1_dark_card.png");
  const cardResult = await renderDarkTweetCard(tweet, cardPath, {
    width: 1080,
    height: 1440,
    mock: false // test headless browser rasterization
  });
  assert.equal(cardResult.width, 1080);
  assert.equal(cardResult.height, 1440);
  assert.equal(cardResult.theme, "dark");
  assert.equal(cardResult.author, "James Kim");
  assert.equal(cardResult.handle, "@King_James_Kim");
  assert.equal(cardResult.verified, true);
  assert.equal(cardResult.translationAttribution, "翻译自韩语");
  assert.ok(fs.existsSync(cardPath), "Card PNG must exist on disk");
  assert.ok(fs.statSync(cardPath).size > 1000, "Rendered card PNG must be a genuine non-empty file");

  // 7. Full Package Assembly & Freezing
  const pkg = buildGoldChancePackage(tweet, {
    packageId: "pkg-gold-10habits-e2e",
    visualCardPath: cardPath,
    tags
  });
  pkg.media = [{ kind: "image", path: cardPath, theme: "dark", source: "x_tweet" }];

  const storedPkg = createPackage(pkg, options);
  assert.equal(storedPkg.status, "draft");
  assert.equal(storedPkg.accountId, "xhs_account_2");
  assert.equal(storedPkg.project, "x_curation");

  // Freeze package
  const frozenPkg = freezePackage(storedPkg.id, options);
  assert.equal(frozenPkg.status, "awaiting_approval");
  assert.equal(frozenPkg.approvalStatus, "pending");
  assert.ok(frozenPkg.frozenAt, "frozenAt timestamp must be recorded");

  // Approve package
  const approvedPkg = approvePackage(frozenPkg.id, options);
  assert.equal(approvedPkg.status, "approved");
  assert.equal(approvedPkg.approvalStatus, "approved");
  assert.equal(approvedPkg.approvedHash, approvedPkg.payloadHash);
});

// ===========================================================================
// SCENARIO 2: NAVAL RAVIKANT LEVERAGE TWEET END-TO-END PACKAGE (xhs_account_2)
// ===========================================================================

test("Scenario 2: Naval Ravikant leverage tweet end-to-end package (xhs_account_2)", async () => {
  const baseDir = createIsolatedTestDir("scenario-2-");
  const options = { baseDir: path.join(baseDir, "packages") };

  // 1. Ingestion: Ingest Naval tweet fixture
  const tweet = await fetchTweetSource(REFERENCE_TWEET_NAVAL, { offline: true });
  assert.equal(tweet.author, "Naval");
  assert.equal(tweet.handle, "@naval");
  assert.equal(tweet.sourceLanguage, "en");

  // 2. Grounded Title Generation
  const title = generateGroundedTitle(tweet.translatedTitle);
  assert.ok(title.length >= 4 && title.length <= 10, `Naval title "${title}" must be 4-10 chars`);
  assert.ok(!/[！!？?【】]/.test(title));

  // 3. Feasibility Screening of Naval Claims
  const ratings = screenFeasibility(tweet.claims);
  assert.equal(ratings.length, 3);
  
  // Claim 1 (Permissionless leverage) -> Valid
  assert.equal(ratings[0].index, 1);
  assert.ok(ratings[0].badge.includes("✅"));
  assert.ok(ratings[0].critique.includes("边际成本递减") || ratings[0].critique.includes("生产力"));

  // Claim 3 (Luck pseudoscience) -> Debunked
  assert.equal(ratings[2].index, 3);
  assert.ok(ratings[2].badge.includes("❌"));
  assert.ok(ratings[2].critique.includes("噱头") || ratings[2].critique.includes("伪科学"));

  // 4. Author Pinned Comment
  const pinned = generateAuthorPinnedComment(ratings);
  assert.ok(pinned.includes("优先级："));
  assert.ok(pinned.includes("①"));
  assert.ok(/避坑|纯属|营销噱头/i.test(pinned));

  // 5. Visual Card Rendering with English Attribution
  const cardPath = path.join(baseDir, "media", "naval_dark_card.png");
  const cardResult = await renderDarkTweetCard(tweet, cardPath, {
    width: 1080,
    height: 1440,
    mock: false
  });
  assert.equal(cardResult.translationAttribution, "翻译自英语");
  assert.equal(cardResult.handle, "@naval");

  // 6. Build package and verify store lifecycle on xhs_account_2
  const pkg = buildGoldChancePackage(tweet, {
    packageId: "pkg-gold-naval-e2e",
    visualCardPath: cardPath
  });
  pkg.media = [{ kind: "image", path: cardPath, theme: "dark", source: "x_tweet" }];

  const stored = createPackage(pkg, options);
  assert.equal(stored.accountId, "xhs_account_2");

  const frozen = freezePackage(stored.id, options);
  assert.equal(frozen.status, "awaiting_approval");

  const approved = approvePackage(frozen.id, options);
  assert.equal(approved.status, "approved");
});

// ===========================================================================
// SCENARIO 3: SHUZHAI 6-PAGE ILLUSTRATED BOOK CARD PACKAGE (xhs_account_1)
// ===========================================================================

test("Scenario 3: Shuzhai 6-page illustrated book card package (xhs_account_1)", () => {
  const baseDir = createIsolatedTestDir("scenario-3-");
  const options = { baseDir: path.join(baseDir, "packages") };

  // 1. Authoritative Shuzhai Card Layout Directive Verification
  const directive = readCardLayoutStandardDirective();
  assert.ok(directive.includes("card-layout-standard"), "Must include card-layout-standard header");
  assert.ok(directive.includes("36px ~ 52px") || directive.includes("36~52px"), "Must specify art banner bridge");
  assert.ok(directive.includes("88px ~ 96px") || directive.includes("88~96px"), "Must specify title spacing");
  assert.ok(directive.includes("26px ~ 32px") || directive.includes("26~32px"), "Must specify breathing gaps");
  assert.ok(directive.includes("rgba(255, 255, 255, 0.68 ~ 0.72)") || directive.includes("微卡片材质规范"), "Must specify translucent micro-cards");
  assert.ok(directive.includes("118px ~ 128px") || directive.includes("118px"), "Must specify anchor bottom takeaway card >= 118px");

  // 2. Prepare 6-page illustrated book card package (Kahneman Loss Aversion)
  const coverImg = path.join(baseDir, "media", "kahneman_p01_cover.png");
  fs.writeFileSync(coverImg, "fake-png-shuzhai-cover");

  const shuzhaiPkgData = {
    id: "pkg-shuzhai-kahneman-loss-e2e",
    project: "shuzhai",
    accountId: "xhs_account_1",
    platform: "xiaohongshu",
    title: "你在躲认输",
    body: "# 标题\n\n你在躲认输\n\n# 正文\n\n亏一块的疼，大约要赚两块才能补回来。\n你舍不得割的，是怕认输。\n\n#思考快与慢 #卡尼曼 #认知思维 #搞钱思维",
    layout: {
      templateId: "shuzhai-editorial-v1",
      kicker: "SHUZHAI READING NOTES · NO. 08",
      callToAction: "给死磕的事写一条线：过线就停"
    },
    layers: {
      facts: [
        { id: "f1", text: "前景理论：损失厌恶约2倍。", source: "《思考，快与慢》金钱实验" },
        { id: "f2", text: "亚洲疾病框架演示表达框架翻转风险偏好。", source: "《思考，快与慢》" }
      ],
      expressions: [
        { id: "e1", text: "你舍不得割的，是怕认输。" },
        { id: "e2", text: "亏一块的疼，大约要赚两块。" }
      ]
    },
    media: [{ kind: "image", path: coverImg }],
    experiment: completeExperiment({
      accountId: "shuzhai",
      topic: "止损 / 损失厌恶",
      title: "你在躲认输",
      source: "《思考，快与慢》",
      hookType: "处境 + 恐惧"
    })
  };

  // 3. Multi-slide Layout Plan Generation
  const layoutPlan = buildXiaohongshuLayoutPlan(shuzhaiPkgData);
  assert.ok(layoutPlan, "Layout plan must be generated");
  assert.ok(layoutPlan.slides.length >= 4 && layoutPlan.slides.length <= 7, `Slide count must be 4-7 (got ${layoutPlan.slides.length})`);
  
  // Check slide roles
  const slideRoles = layoutPlan.slides.map((s) => s.role);
  assert.ok(slideRoles.includes("cover"), "Must include cover slide");
  assert.ok(slideRoles.includes("hook") || slideRoles.includes("insight"), "Must include hook or insight slide");
  assert.ok(slideRoles.includes("ending"), "Must include ending slide");

  // Check card-layout-standard dimensional invariants
  assert.ok(CARD_LAYOUT_STANDARD.artBannerBridge.min >= 36 && CARD_LAYOUT_STANDARD.artBannerBridge.max <= 52);
  assert.ok(CARD_LAYOUT_STANDARD.titleSpacing.min >= 88 && CARD_LAYOUT_STANDARD.titleSpacing.max <= 96);
  assert.ok(CARD_LAYOUT_STANDARD.breathingGap.min >= 26 && CARD_LAYOUT_STANDARD.breathingGap.max <= 32);
  assert.ok(CARD_LAYOUT_STANDARD.anchorCard.minHeight >= 118);
  assert.equal(CARD_LAYOUT_STANDARD.microCard.opacity, 0.70);

  // 4. Store and freeze Shuzhai package
  const pkg = createPackage(shuzhaiPkgData, options);
  assert.equal(pkg.accountId, "xhs_account_1");
  assert.equal(pkg.project, "shuzhai");

  const frozen = freezePackage(pkg.id, options);
  assert.equal(frozen.status, "awaiting_approval");

  const approved = approvePackage(frozen.id, options);
  assert.equal(approved.status, "approved");
  assert.equal(approved.approvalStatus, "approved");

  // 5. Verify zero cross-bleed for Shuzhai package
  assert.doesNotThrow(() => validateAccountPipelineIsolation(approved, "xhs_account_1"));
});

// ===========================================================================
// SCENARIO 4: CROSS-BLEED REJECTION ATTACK (PIPELINEROUTINGERROR ENFORCEMENT)
// ===========================================================================

test("Scenario 4: Cross-bleed rejection attack: submitting X curation to xhs_account_1 and Shuzhai to xhs_account_2 must throw PipelineRoutingError", () => {
  const baseDir = createIsolatedTestDir("scenario-4-");
  const options = { baseDir: path.join(baseDir, "packages") };

  const validMediaShuzhai = path.join(baseDir, "media", "shuzhai.png");
  fs.writeFileSync(validMediaShuzhai, "fake-shuzhai");

  const validMediaTweet = path.join(baseDir, "media", "tweet.png");
  fs.writeFileSync(validMediaTweet, "fake-tweet");

  // Attack 4.1: Direct account-project mismatch at creation (X curation targeting xhs_account_1)
  assert.throws(() => {
    createPackage({
      title: "变富的小技巧",
      platform: "xiaohongshu",
      project: "x_curation",
      accountId: "xhs_account_1",
      body: "测试正文",
      experiment: completeExperiment({ accountId: "xhs_account_1" })
    }, options);
  }, (err) => {
    assert.ok(err instanceof PipelineRoutingError);
    assert.ok(/strictly rejects X curation/i.test(err.message));
    return true;
  });

  // Attack 4.2: Direct account-project mismatch at creation (Shuzhai targeting xhs_account_2)
  assert.throws(() => {
    createPackage({
      title: "被讨厌的勇气",
      platform: "xiaohongshu",
      project: "shuzhai",
      accountId: "xhs_account_2",
      body: "测试正文",
      experiment: completeExperiment({ accountId: "xhs_account_2" })
    }, options);
  }, (err) => {
    assert.ok(err instanceof PipelineRoutingError);
    assert.ok(/strictly rejects Shuzhai/i.test(err.message));
    return true;
  });

  // Attack 4.3: Trojan Feasibility Badges injected into xhs_account_1
  assert.throws(() => {
    createPackage({
      title: "伪装成书斋的推特打标",
      platform: "xiaohongshu",
      project: "shuzhai",
      accountId: "xhs_account_1",
      body: "① 这条习惯 ✅ 基本靠谱 / 科学依据充分\n② 另外一条 ❌ 纯属营销噱头 / 伪科学",
      layout: { templateId: "shuzhai-editorial-v1" },
      media: [{ kind: "image", path: validMediaShuzhai }],
      experiment: completeExperiment({ accountId: "shuzhai" })
    }, options);
  }, (err) => {
    assert.ok(err instanceof PipelineRoutingError);
    assert.ok(/feasibility badge/i.test(err.message));
    return true;
  });

  // Attack 4.4: Trojan Dark Tweet Visual Card injected into xhs_account_1
  assert.throws(() => {
    createPackage({
      title: "伪装成书斋的推特卡片",
      platform: "xiaohongshu",
      project: "shuzhai",
      accountId: "xhs_account_1",
      body: "普通书斋内容",
      layout: { templateId: "shuzhai-editorial-v1" },
      visualCard: { path: "data/content/media/x_curation/tweet.png", theme: "dark" },
      media: [{ kind: "image", path: validMediaShuzhai }],
      experiment: completeExperiment({ accountId: "shuzhai" })
    }, options);
  }, (err) => {
    assert.ok(err instanceof PipelineRoutingError);
    assert.ok(/dark visualCard|X curation/i.test(err.message));
    return true;
  });

  // Attack 4.5: Trojan Shuzhai Template injected into xhs_account_2
  assert.throws(() => {
    createPackage({
      title: "变富的小技巧",
      platform: "xiaohongshu",
      project: "x_curation",
      accountId: "xhs_account_2",
      body: "① 习惯1 ✅ 基本靠谱\n② 习惯2 ⚠️ 因果夸大",
      layout: { templateId: "shuzhai-editorial-v1" },
      feasibilityRatings: [{ index: 1, claim: "习惯1", badge: "✅ 基本靠谱", critique: "测试" }],
      media: [{ kind: "image", path: validMediaTweet, theme: "dark" }],
      experiment: completeExperiment({ accountId: "x_curation" })
    }, options);
  }, (err) => {
    assert.ok(err instanceof PipelineRoutingError);
    assert.ok(/strictly rejects Shuzhai book card layouts/i.test(err.message));
    return true;
  });

  // Attack 4.6: Trojan Book Citations in Facts injected into xhs_account_2
  assert.throws(() => {
    createPackage({
      title: "变富的小技巧",
      platform: "xiaohongshu",
      project: "x_curation",
      accountId: "xhs_account_2",
      body: "① 习惯1 ✅ 基本靠谱",
      layout: { templateId: "x-curation-dark-v1" },
      layers: {
        facts: [{ id: "f1", text: "引自《思考，快与慢》第3章", source: "卡尼曼" }]
      },
      feasibilityRatings: [{ index: 1, claim: "习惯1", badge: "✅ 基本靠谱", critique: "测试" }],
      media: [{ kind: "image", path: validMediaTweet, theme: "dark" }],
      experiment: completeExperiment({ accountId: "x_curation" })
    }, options);
  }, (err) => {
    assert.ok(err instanceof PipelineRoutingError);
    assert.ok(/book citations in facts/i.test(err.message));
    return true;
  });

  // Attack 4.7: Freezing xhs_account_2 without required X curation visual/feasibility assets
  const bareDraft = createPackage({
    title: "变富的小技巧",
    platform: "xiaohongshu",
    project: "x_curation",
    accountId: "xhs_account_2",
    body: "普通文案，未附带任何评级与视觉卡片",
    layout: { templateId: "x-curation-dark-v1" },
    experiment: completeExperiment({ accountId: "x_curation" })
  }, options);

  assert.throws(() => {
    freezePackage(bareDraft.id, options);
  }, (err) => {
    assert.ok(err instanceof PipelineRoutingError);
    assert.ok(/requires X curation visual or feasibility assets/i.test(err.message));
    return true;
  });
});

// ===========================================================================
// SCENARIO 5: ANTI-AI TONE FILTER INTEGRATION (LINTING AND CLEANSING)
// ===========================================================================

test("Scenario 5: Anti-AI tone filter integration: linting and cleansing AI clichés", () => {
  // 1. Attack text heavily infected with mandatory clichés, buzzwords, and long paragraph
  const contaminatedText = [
    "在这个快节奏的时代，我们需要搞清楚底层逻辑。",
    "本文将全面赋能你的成长，打造完整的业务闭环，从多维度颠覆认知！",
    "建议收藏反复阅读，总有一款适合你。",
    "我们还要沉淀方法论，对齐颗粒度，打通底层链路。"
  ].join("\n");

  // 2. Linting: Verify 100% interception of clichés and paragraph length
  const lintResult = lintAntiAITone(contaminatedText, { maxLinesPerParagraph: 3 });
  assert.equal(lintResult.ok, false);
  assert.ok(lintResult.violations.length >= 7, `Expected >= 7 violations, got ${lintResult.violations.length}`);

  const violationsStr = lintResult.violations.join("\n");
  assert.ok(violationsStr.includes("在这个快节奏的时代"));
  assert.ok(violationsStr.includes("底层逻辑"));
  assert.ok(violationsStr.includes("赋能"));
  assert.ok(violationsStr.includes("闭环"));
  assert.ok(violationsStr.includes("维度"));
  assert.ok(violationsStr.includes("颠覆认知"));
  assert.ok(violationsStr.includes("建议收藏反复阅读") || violationsStr.includes("建议收藏"));
  assert.ok(violationsStr.includes("总有一款适合你"));
  assert.ok(violationsStr.includes("对齐颗粒度") || violationsStr.includes("对齐"));
  assert.ok(violationsStr.includes("paragraph line count exceeds limit"));

  // 3. Cleansing: Verify humanizeText cleanses buzzwords and chunks paragraphs
  const cleaned = humanizeText(contaminatedText, { maxLinesPerParagraph: 3 });
  assert.ok(!cleaned.includes("在这个快节奏的时代"));
  assert.ok(!cleaned.includes("底层逻辑"));
  assert.ok(!cleaned.includes("赋能"));
  assert.ok(!cleaned.includes("闭环"));
  assert.ok(!cleaned.includes("颠覆认知"));
  assert.ok(!cleaned.includes("建议收藏"));
  assert.ok(!cleaned.includes("总有一款适合你"));

  // Check grounded human replacements
  assert.ok(cleaned.includes("核心规律") || cleaned.includes("思路"));
  assert.ok(cleaned.includes("助力"));
  assert.ok(cleaned.includes("完整流程"));
  assert.ok(cleaned.includes("刷新认识"));

  // 4. Re-lint cleansed text: must pass with 0 violations
  const recheck = lintAntiAITone(cleaned, { maxLinesPerParagraph: 3 });
  assert.equal(recheck.ok, true, `Cleaned text must pass tone linting cleanly: ${recheck.violations.join(", ")}`);
  assert.equal(recheck.violations.length, 0);

  // 5. Paragraph chunking verification: each paragraph must have <= 3 lines
  const paragraphs = cleaned.split(/\n\s*\n+/);
  for (const p of paragraphs) {
    const lines = p.split("\n").map(l => l.trim()).filter(Boolean);
    assert.ok(lines.length <= 3, `Cleaned paragraph lines must be <= 3 (got ${lines.length})`);
  }

  // 6. Tag Recommender Anti-AI Filter
  const dirtyTagsInput = ["#底层逻辑", "#对齐颗粒度", "#变富思维", "#日常理财", "#赋能闭环", "#搞钱女孩"];
  const tags = recommendXiaohongshuTags("搞钱", "wealth", { extraTags: dirtyTagsInput });
  assert.ok(tags.length >= 4 && tags.length <= 6);
  assert.ok(!tags.includes("#底层逻辑"));
  assert.ok(!tags.includes("#对齐颗粒度"));
  assert.ok(!tags.includes("#赋能闭环"));
  assert.ok(tags.includes("#搞钱女孩") || tags.includes("#搞钱思维") || tags.includes("#怎样变得富有"));
});

// ===========================================================================
// SCENARIO 6: FULL DUAL-TRACK PUBLISHER PREPARATION, STAGING, AND LEDGER RECORDING
// ===========================================================================

test("Scenario 6: Full dual-track publisher preparation, staging, and ledger recording", async () => {
  const baseDir = createIsolatedTestDir("scenario-6-");
  const options = {
    baseDir: path.join(baseDir, "packages"),
    stagingDir: path.join(baseDir, "staging")
  };

  // Use isolated in-memory database for SQLite intelligence ledger assertions
  process.env.XHS_INTELLIGENCE_DB_PATH = ":memory:";
  closeDb();
  const db = getDb(":memory:");

  // 1. Shuzhai Package Preparation & Staging
  const shuzhaiCover = path.join(baseDir, "media", "shuzhai_cover.png");
  fs.writeFileSync(shuzhaiCover, "image-payload-shuzhai");

  const shuzhaiPkg = createPackage({
    id: "pkg-dual-shuzhai-e2e",
    project: "shuzhai",
    accountId: "xhs_account_1",
    platform: "xiaohongshu",
    title: "越会讲道理越会找理由",
    body: "# 标题\n\n越会讲道理越会找理由\n\n# 正文\n\n你不是在思考，你在给直觉找律师。\n\n#思考快与慢 #认知思维",
    layout: { templateId: "shuzhai-editorial-v1" },
    media: [{ kind: "image", path: shuzhaiCover }],
    experiment: completeExperiment({
      accountId: "shuzhai",
      title: "越会讲道理越会找理由",
      topic: "认知自欺"
    })
  }, options);

  freezePackage(shuzhaiPkg.id, options);
  approvePackage(shuzhaiPkg.id, options);

  // Shuzhai Publisher Account Resolution
  const shuzhaiPublisherAcc = resolvePublisherAccount(shuzhaiPkg);
  assert.equal(shuzhaiPublisherAcc.id, "shuzhai");
  assert.equal(shuzhaiPublisherAcc.profileDir, "xhs_account_1");
  assert.equal(shuzhaiPublisherAcc.accountKey, "xhs_account_1");

  // Execute Shuzhai publishing
  const shuzhaiMcpLog = {};
  const shuzhaiPublishRes = await publishApprovedPackage(shuzhaiPkg.id, {
    ...options,
    loginStatus: { loggedIn: true },
    request: createMockMcpPublisher(shuzhaiMcpLog)
  });

  assert.equal(shuzhaiPublishRes.ok, true);
  assert.equal(shuzhaiPublishRes.message, "发布成功");

  // Verify staging manifest for Shuzhai
  const shuzhaiStagingManifestPath = path.join(options.stagingDir, shuzhaiPkg.id, "staging.json");
  assert.ok(fs.existsSync(shuzhaiStagingManifestPath), "Staging manifest must be created");
  const shuzhaiManifest = JSON.parse(fs.readFileSync(shuzhaiStagingManifestPath, "utf8"));
  assert.equal(shuzhaiManifest.account_id, "shuzhai");
  assert.equal(shuzhaiManifest.profile_dir, "xhs_account_1");
  assert.equal(shuzhaiManifest.images.length, 1);

  // Verify SQLite ledger for Shuzhai note
  const shuzhaiDbRow = db.prepare("SELECT * FROM xhs_notes WHERE note_id = ?").get(shuzhaiPkg.id);
  assert.ok(shuzhaiDbRow, "Shuzhai note must be persisted in SQLite xhs_notes table");
  assert.equal(shuzhaiDbRow.account_key, "xhs_account_1");
  assert.equal(shuzhaiDbRow.account_id, "shuzhai");
  assert.equal(shuzhaiDbRow.profile_dir, "xhs_account_1");

  // 2. Gold chance Package Preparation & Staging
  const goldCard = path.join(baseDir, "media", "gold_card.png");
  fs.writeFileSync(goldCard, "image-payload-gold-tweet");

  const goldPkg = createPackage({
    id: "pkg-dual-gold-e2e",
    project: "x_curation",
    accountId: "xhs_account_2",
    platform: "xiaohongshu",
    title: "变富的小技巧",
    body: "① 保持规律睡眠 ✅ 基本靠谱 / 科学依据充分\n长期睡眠不规律确实会影响精力状态。\n\n#搞钱思维 #财富思维",
    layout: { templateId: "x-curation-dark-v1" },
    authorPinnedComment: "优先级：①",
    feasibilityRatings: [
      { index: 1, claim: "保持规律睡眠", badge: "✅ 基本靠谱 / 科学依据充分", critique: "科学实证支持" }
    ],
    media: [{ kind: "image", path: goldCard, theme: "dark", source: "x_tweet" }],
    experiment: completeExperiment({
      accountId: "x_curation",
      title: "变富的小技巧",
      topic: "变富小技巧"
    })
  }, options);

  freezePackage(goldPkg.id, options);
  approvePackage(goldPkg.id, options);

  // Gold chance Publisher Account Resolution
  const goldPublisherAcc = resolvePublisherAccount(goldPkg);
  assert.equal(goldPublisherAcc.id, "x_curation");
  assert.equal(goldPublisherAcc.profileDir, "xhs_account_2");
  assert.equal(goldPublisherAcc.accountKey, "xhs_account_2");

  // Execute Gold chance publishing
  const goldMcpLog = {};
  const goldPublishRes = await publishApprovedPackage(goldPkg.id, {
    ...options,
    loginStatus: { loggedIn: true },
    request: createMockMcpPublisher(goldMcpLog)
  });

  assert.equal(goldPublishRes.ok, true);
  assert.equal(goldPublishRes.message, "发布成功");

  // Verify staging manifest for Gold chance
  const goldStagingManifestPath = path.join(options.stagingDir, goldPkg.id, "staging.json");
  assert.ok(fs.existsSync(goldStagingManifestPath), "Gold staging manifest must be created");
  const goldManifest = JSON.parse(fs.readFileSync(goldStagingManifestPath, "utf8"));
  assert.equal(goldManifest.account_id, "x_curation");
  assert.equal(goldManifest.profile_dir, "xhs_account_2");
  assert.equal(goldManifest.images.length, 1);

  // Verify SQLite ledger for Gold chance note
  const goldDbRow = db.prepare("SELECT * FROM xhs_notes WHERE note_id = ?").get(goldPkg.id);
  assert.ok(goldDbRow, "Gold chance note must be persisted in SQLite xhs_notes table");
  assert.equal(goldDbRow.account_key, "xhs_account_2");
  assert.equal(goldDbRow.account_id, "x_curation");
  assert.equal(goldDbRow.profile_dir, "xhs_account_2");

  // 3. Query Partitioning via listMyNotes guarantees 0 cross-account contamination
  const notesAcc1 = listMyNotes("xhs_account_1");
  const notesAcc2 = listMyNotes("xhs_account_2");
  
  assert.equal(notesAcc1.length, 1);
  assert.equal(notesAcc1[0].note_id, shuzhaiPkg.id);
  assert.equal(notesAcc1[0].account_key, "xhs_account_1");
  assert.equal(notesAcc1[0].account_id, "shuzhai");

  assert.equal(notesAcc2.length, 1);
  assert.equal(notesAcc2[0].note_id, goldPkg.id);
  assert.equal(notesAcc2[0].account_key, "xhs_account_2");
  assert.equal(notesAcc2[0].account_id, "x_curation");

  // 4. Publisher Cross-Bleed Interception: Attempting to publish Gold chance note using xhs_account_1 profile
  const crossBleedRes = await publishApprovedPackage(goldPkg.id, {
    ...options,
    force: true,
    explicitAccount: "xhs_account_1",
    loginStatus: { loggedIn: true },
    request: createMockMcpPublisher()
  });

  assert.equal(crossBleedRes.ok, false);
  assert.equal(crossBleedRes.error, "pipeline_routing_error");
  assert.ok(/strictly rejects X curation packages/i.test(crossBleedRes.message));

  closeDb();
});
