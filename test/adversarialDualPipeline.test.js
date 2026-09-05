/**
 * Comprehensive Adversarial Stress & Verification Test Suite
 *
 * MISSION:
 * Adversarially challenge the complete dual-pipeline content engine and publishing lifecycle.
 *
 * ATTACK SUITES:
 * 1. Cross-pipeline bleed injection:
 *    - Inbound creation bleed (X curation -> xhs_account_1, Shuzhai -> xhs_account_2)
 *    - Update mutation bleed (patching cross-pipeline assets into existing drafts)
 *    - Deep trojan property injection (badges, dark cards, pinned comment, book citations, kickers)
 *    - Publisher gate cross-bleed rejection (explicitAccount spoofing & routing re-verification)
 *    - Staging and SQLite ledger physical directory & record isolation
 * 2. Anti-AI tone penetration:
 *    - Zero-width character evasions (\u200B, \u200C, \u200D, \uFEFF)
 *    - Symbol & delimiter interleaving (*, _, ., -, ~, /, \, |, #, space)
 *    - Extended corporate buzzwords interception
 *    - Paragraph length boundary evasion (> 3 lines, CRLF/LF)
 *    - Hashtag buzzword smuggling purge
 *    - Cleanser idempotency (humanizeText -> lintAntiAITone passes 100%)
 *    - Title clickbait & AI buzzword stripping
 * 3. High-concurrency dual-pipeline stress:
 *    - 40 simultaneous multi-pipeline package lifecycles (create -> freeze -> approve -> publish)
 *    - Interleaved concurrent attack storm (15 attacks vs 15 valid packages concurrently)
 *    - Concurrent payload tamper detection & hash integrity guard
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";

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
  updatePackage,
  freezePackage,
  approvePackage,
  getPackage,
  listPackages,
  validateAccountPipelineIsolation,
  PipelineRoutingError,
  computeContentPackageHash,
  markReadyManual
} from "../src/content/store.js";

import {
  resolvePublisherAccount,
  publishApprovedPackage,
  buildXhsNote
} from "../src/publish/xhs.js";

import {
  buildXiaohongshuLayoutPlan,
  CARD_LAYOUT_STANDARD
} from "../src/content/xiaohongshuLayout.js";

import { getDb, closeDb } from "../engine/intelligence/xhs/storage/db.js";
import { listMyNotes } from "../engine/intelligence/xhs/storage/repository.js";

// Helper: isolated directory generator
function createTestEnv(prefix = "adv-test-") {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const packagesDir = path.join(tmp, "packages");
  const mediaDir = path.join(tmp, "media");
  const stagingDir = path.join(tmp, "staging");
  fs.mkdirSync(packagesDir, { recursive: true });
  fs.mkdirSync(mediaDir, { recursive: true });
  fs.mkdirSync(stagingDir, { recursive: true });
  return {
    root: tmp,
    packagesDir,
    mediaDir,
    stagingDir,
    options: { baseDir: packagesDir, stagingDir }
  };
}

// Helper: complete experiment metadata
function makeExperiment(accountId = "shuzhai", overrides = {}) {
  return {
    accountId,
    source: "测试来源",
    insight: "测试洞察",
    audience: "目标受众",
    painOrDesire: "核心痛点",
    objective: "save",
    topic: "测试主题",
    title: "测试标题",
    hookType: "fact_check",
    emotion: "relief",
    contentStructure: "pain-insight-action",
    cta: "立即行动",
    predictionScores: {
      traffic: 8, click: 8, read: 8, save: 8,
      discussion: 8, share: 7, follow: 8, fit: 8, evidence: 8
    },
    recommendation: "推荐发布",
    risks: [],
    strategyVersion: "adv-v1",
    hypothesisIds: ["H-ADV-01"],
    ...overrides
  };
}

// Mock MCP request handler
function mockMcpRequest(recorder = {}) {
  return async (method, url, body) => {
    recorder.lastCall = { method, url, body };
    recorder.callCount = (recorder.callCount || 0) + 1;
    return {
      status: 200,
      json: {
        success: true,
        message: "发布成功",
        data: {
          note_id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          url: "https://www.xiaohongshu.com/explore/test"
        }
      },
      raw: ""
    };
  };
}

// ===========================================================================
// ATTACK SUITE 1: CROSS-PIPELINE BLEED INJECTION & DEFENSE-IN-DEPTH
// ===========================================================================

test("Attack 1.1: Direct Inbound Creation Bleed (Account-Project Mismatch)", () => {
  const env = createTestEnv("bleed-1-");

  // Attack: Create X curation targeting xhs_account_1
  assert.throws(() => {
    createPackage({
      title: "变富的小技巧",
      platform: "xiaohongshu",
      project: "x_curation",
      accountId: "xhs_account_1",
      body: "测试正文",
      experiment: makeExperiment("xhs_account_1")
    }, env.options);
  }, (err) => {
    assert.ok(err instanceof PipelineRoutingError);
    assert.ok(/strictly rejects X curation/i.test(err.message));
    return true;
  });

  // Attack: Create Shuzhai targeting xhs_account_2
  assert.throws(() => {
    createPackage({
      title: "思考快与慢",
      platform: "xiaohongshu",
      project: "shuzhai",
      accountId: "xhs_account_2",
      body: "测试正文",
      experiment: makeExperiment("xhs_account_2")
    }, env.options);
  }, (err) => {
    assert.ok(err instanceof PipelineRoutingError);
    assert.ok(/strictly rejects Shuzhai/i.test(err.message));
    return true;
  });
});

test("Attack 1.2: Update Mutation Gate (Attempting to patch cross-pipeline markers into existing drafts)", () => {
  const env = createTestEnv("bleed-2-");
  const dummyImg = path.join(env.mediaDir, "cover.png");
  fs.writeFileSync(dummyImg, "fake-png");

  // Start with clean Shuzhai package on xhs_account_1
  const shuzhaiPkg = createPackage({
    id: "pkg-shuzhai-base",
    title: "阿德勒心理学",
    platform: "xiaohongshu",
    project: "shuzhai",
    accountId: "xhs_account_1",
    body: "# 标题\n\n课题分离\n\n# 正文\n\n把别人的课题还回去。",
    layout: { templateId: "shuzhai-editorial-v1" },
    media: [{ kind: "image", path: dummyImg }],
    experiment: makeExperiment("shuzhai")
  }, env.options);

  // Attack 1.2a: Mutate Shuzhai package by injecting feasibilityRatings
  assert.throws(() => {
    updatePackage(shuzhaiPkg.id, {
      feasibilityRatings: [{ index: 1, claim: "测试", badge: "✅ 基本靠谱", critique: "评论" }]
    }, env.options);
  }, (err) => {
    assert.ok(err instanceof PipelineRoutingError);
    assert.ok(/feasibilityRatings/i.test(err.message));
    return true;
  });

  // Attack 1.2b: Mutate Shuzhai package by injecting dark visualCard
  assert.throws(() => {
    updatePackage(shuzhaiPkg.id, {
      visualCard: { path: "tweet.png", theme: "dark" }
    }, env.options);
  }, (err) => {
    assert.ok(err instanceof PipelineRoutingError);
    assert.ok(/dark visualCard|X curation/i.test(err.message));
    return true;
  });

  // Start with clean Gold chance package on xhs_account_2
  const goldPkg = createPackage({
    id: "pkg-gold-base",
    title: "变富的小技巧",
    platform: "xiaohongshu",
    project: "x_curation",
    accountId: "xhs_account_2",
    body: "① 习惯 ✅ 基本靠谱",
    layout: { templateId: "x-curation-dark-v1" },
    feasibilityRatings: [{ index: 1, claim: "习惯", badge: "✅ 基本靠谱", critique: "实证" }],
    media: [{ kind: "image", path: dummyImg, theme: "dark" }],
    experiment: makeExperiment("x_curation")
  }, env.options);

  // Attack 1.2c: Mutate Gold chance package by injecting Shuzhai template
  assert.throws(() => {
    updatePackage(goldPkg.id, {
      layout: { templateId: "shuzhai-editorial-v1" }
    }, env.options);
  }, (err) => {
    assert.ok(err instanceof PipelineRoutingError);
    assert.ok(/strictly rejects Shuzhai book card layouts/i.test(err.message));
    return true;
  });
});

test("Attack 1.3: Deep Trojan Asset Injection Across All Package Properties for xhs_account_1", () => {
  const env = createTestEnv("bleed-3-");
  const dummyImg = path.join(env.mediaDir, "cover.png");
  fs.writeFileSync(dummyImg, "fake-png");

  const baseShuzhai = {
    platform: "xiaohongshu",
    project: "shuzhai",
    accountId: "xhs_account_1",
    layout: { templateId: "shuzhai-editorial-v1" },
    media: [{ kind: "image", path: dummyImg }],
    experiment: makeExperiment("shuzhai")
  };

  // Trojan in Title
  assert.throws(() => {
    createPackage({ ...baseShuzhai, title: "【⚠️ 因果夸大】这10个习惯", body: "正常正文" }, env.options);
  }, PipelineRoutingError);

  // Trojan in Body
  assert.throws(() => {
    createPackage({ ...baseShuzhai, title: "正常标题", body: "① 习惯 ✅ 基本靠谱 / 科学依据充分" }, env.options);
  }, PipelineRoutingError);

  // Trojan in Facts
  assert.throws(() => {
    createPackage({
      ...baseShuzhai,
      title: "正常标题",
      body: "正常正文",
      layers: { facts: [{ id: "f1", text: "哈佛大学研究 ❌ 纯属营销噱头" }] }
    }, env.options);
  }, PipelineRoutingError);

  // Trojan in Expressions
  assert.throws(() => {
    createPackage({
      ...baseShuzhai,
      title: "正常标题",
      body: "正常正文",
      layers: { expressions: [{ id: "e1", text: "这一条被包装过头了" }] }
    }, env.options);
  }, PipelineRoutingError);

  // Trojan in Links
  assert.throws(() => {
    createPackage({
      ...baseShuzhai,
      title: "正常标题",
      body: "正常正文",
      links: ["https://twitter.com/naval/status/123456"]
    }, env.options);
  }, PipelineRoutingError);

  // Trojan in Media path
  assert.throws(() => {
    createPackage({
      ...baseShuzhai,
      title: "正常标题",
      body: "正常正文",
      media: [{ kind: "image", path: "data/content/media/tweet_screenshot.png" }]
    }, env.options);
  }, PipelineRoutingError);

  // Trojan originalTweet metadata tested directly on validateAccountPipelineIsolation
  assert.throws(() => {
    validateAccountPipelineIsolation({
      ...baseShuzhai,
      title: "正常标题",
      body: "正常正文",
      originalTweet: { id: "123", text: "tweet content" }
    }, "xhs_account_1");
  }, PipelineRoutingError);
});

test("Attack 1.4: Deep Trojan Asset Injection for xhs_account_2 (Gold chance)", () => {
  const env = createTestEnv("bleed-4-");
  const dummyImg = path.join(env.mediaDir, "card.png");
  fs.writeFileSync(dummyImg, "fake-png");

  const baseGold = {
    platform: "xiaohongshu",
    project: "x_curation",
    accountId: "xhs_account_2",
    title: "变富的小技巧",
    body: "① 习惯 ✅ 基本靠谱\n实证说明。",
    feasibilityRatings: [{ index: 1, claim: "习惯", badge: "✅ 基本靠谱", critique: "实证" }],
    media: [{ kind: "image", path: dummyImg, theme: "dark" }],
    experiment: makeExperiment("x_curation")
  };

  // Trojan layout template
  assert.throws(() => {
    createPackage({ ...baseGold, layout: { templateId: "shuzhai-card-standard-v1" } }, env.options);
  }, PipelineRoutingError);

  // Trojan kicker in layout
  assert.throws(() => {
    createPackage({ ...baseGold, layout: { templateId: "x-curation-dark-v1", kicker: "SHUZHAI READING NOTES · NO. 08" } }, env.options);
  }, PipelineRoutingError);

  // Trojan book citation in facts
  assert.throws(() => {
    createPackage({
      ...baseGold,
      layers: { facts: [{ id: "f1", text: "引自《思考，快与慢》第3章" }] }
    }, env.options);
  }, PipelineRoutingError);

  // Trojan media path
  assert.throws(() => {
    createPackage({
      ...baseGold,
      media: [{ kind: "image", path: "data/shuzhai/book_card_01.png" }]
    }, env.options);
  }, PipelineRoutingError);
});

test("Attack 1.5: Publisher Gate Cross-Bleed Rejection & Profile Routing Verification", async () => {
  const env = createTestEnv("bleed-5-");
  const dummyImg = path.join(env.mediaDir, "img.png");
  fs.writeFileSync(dummyImg, "fake-png-payload");

  // Create & Approve valid Gold chance package
  const goldPkg = createPackage({
    id: "pkg-gold-publish-test",
    title: "变富的小技巧",
    platform: "xiaohongshu",
    project: "x_curation",
    accountId: "xhs_account_2",
    body: "① 习惯 ✅ 基本靠谱\n实证分析。\n\n#搞钱思维",
    layout: { templateId: "x-curation-dark-v1" },
    feasibilityRatings: [{ index: 1, claim: "习惯", badge: "✅ 基本靠谱", critique: "实证" }],
    media: [{ kind: "image", path: dummyImg, theme: "dark" }],
    experiment: makeExperiment("x_curation")
  }, env.options);

  freezePackage(goldPkg.id, env.options);
  approvePackage(goldPkg.id, env.options);

  // Create & Approve valid Shuzhai package
  const shuzhaiPkg = createPackage({
    id: "pkg-shuzhai-publish-test",
    title: "课题分离法则",
    platform: "xiaohongshu",
    project: "shuzhai",
    accountId: "xhs_account_1",
    body: "# 标题\n\n课题分离\n\n# 正文\n\n课题分离实践。\n\n#认知思维",
    layout: { templateId: "shuzhai-editorial-v1" },
    media: [{ kind: "image", path: dummyImg }],
    experiment: makeExperiment("shuzhai")
  }, env.options);

  freezePackage(shuzhaiPkg.id, env.options);
  approvePackage(shuzhaiPkg.id, env.options);

  const recorder = {};
  const mockMcp = mockMcpRequest(recorder);

  // Attack 1.5a: Attempt to publish Gold chance note using xhs_account_1 profile
  const crossBleedRes1 = await publishApprovedPackage(goldPkg.id, {
    ...env.options,
    explicitAccount: "xhs_account_1",
    loginStatus: { loggedIn: true },
    request: mockMcp
  });

  assert.equal(crossBleedRes1.ok, false);
  assert.equal(crossBleedRes1.error, "pipeline_routing_error");
  assert.ok(/strictly rejects X curation/i.test(crossBleedRes1.message));
  assert.equal(recorder.callCount || 0, 0, "MCP publish request must NOT be invoked");

  // Attack 1.5b: Attempt to publish Shuzhai note using xhs_account_2 profile
  const crossBleedRes2 = await publishApprovedPackage(shuzhaiPkg.id, {
    ...env.options,
    explicitAccount: "xhs_account_2",
    loginStatus: { loggedIn: true },
    request: mockMcp
  });

  assert.equal(crossBleedRes2.ok, false);
  assert.equal(crossBleedRes2.error, "pipeline_routing_error");
  assert.ok(/strictly rejects Shuzhai/i.test(crossBleedRes2.message));
  assert.equal(recorder.callCount || 0, 0, "MCP publish request must NOT be invoked");

  // Attack 1.5c: Attempt to publish with unknown custom account (xhs_account_99)
  // Hardened behavior: resolvePublisherAccount rejects unknown accounts explicitly instead of silent fallback.
  assert.throws(
    () => resolvePublisherAccount(null, { explicitAccount: "xhs_account_99" }),
    (err) => {
      assert.ok(err instanceof PipelineRoutingError);
      assert.equal(err.code, "PIPELINE_ROUTING_ERROR");
      assert.match(err.message, /Unknown or unconfigured account:\s*xhs_account_99/i);
      return true;
    }
  );

  const unknownAccRes = await publishApprovedPackage(goldPkg.id, {
    ...env.options,
    explicitAccount: "xhs_account_99",
    loginStatus: { loggedIn: true },
    request: mockMcp
  });

  assert.equal(unknownAccRes.ok, false);
  assert.equal(unknownAccRes.error, "pipeline_routing_error");
  assert.match(unknownAccRes.message, /Unknown or unconfigured account:\s*xhs_account_99/i);
});

test("Attack 1.6: Staging Manifest and SQLite Ledger Multi-Account Partitioning", async () => {
  const env = createTestEnv("bleed-6-");
  const dummyImg = path.join(env.mediaDir, "img.png");
  fs.writeFileSync(dummyImg, "fake-png-payload");

  process.env.XHS_INTELLIGENCE_DB_PATH = ":memory:";
  closeDb();
  const db = getDb(":memory:");

  // Publish Shuzhai package
  const shuzhaiPkg = createPackage({
    id: "pkg-shuzhai-stage-test",
    title: "课题分离法则",
    platform: "xiaohongshu",
    project: "shuzhai",
    accountId: "xhs_account_1",
    body: "# 标题\n\n课题分离\n\n# 正文\n\n正文描述。\n\n#认知思维",
    layout: { templateId: "shuzhai-editorial-v1" },
    media: [{ kind: "image", path: dummyImg }],
    experiment: makeExperiment("shuzhai")
  }, env.options);

  freezePackage(shuzhaiPkg.id, env.options);
  approvePackage(shuzhaiPkg.id, env.options);

  await publishApprovedPackage(shuzhaiPkg.id, {
    ...env.options,
    loginStatus: { loggedIn: true },
    request: mockMcpRequest()
  });

  // Publish Gold chance package
  const goldPkg = createPackage({
    id: "pkg-gold-stage-test",
    title: "变富的小技巧",
    platform: "xiaohongshu",
    project: "x_curation",
    accountId: "xhs_account_2",
    body: "① 习惯 ✅ 基本靠谱\n正文。\n\n#搞钱思维",
    layout: { templateId: "x-curation-dark-v1" },
    feasibilityRatings: [{ index: 1, claim: "习惯", badge: "✅ 基本靠谱", critique: "实证" }],
    media: [{ kind: "image", path: dummyImg, theme: "dark" }],
    experiment: makeExperiment("x_curation")
  }, env.options);

  freezePackage(goldPkg.id, env.options);
  approvePackage(goldPkg.id, env.options);

  await publishApprovedPackage(goldPkg.id, {
    ...env.options,
    loginStatus: { loggedIn: true },
    request: mockMcpRequest()
  });

  // Inspect staging manifests
  const shuzhaiManifest = JSON.parse(fs.readFileSync(path.join(env.stagingDir, shuzhaiPkg.id, "staging.json"), "utf8"));
  assert.equal(shuzhaiManifest.account_id, "shuzhai");
  assert.equal(shuzhaiManifest.profile_dir, "xhs_account_1");

  const goldManifest = JSON.parse(fs.readFileSync(path.join(env.stagingDir, goldPkg.id, "staging.json"), "utf8"));
  assert.equal(goldManifest.account_id, "x_curation");
  assert.equal(goldManifest.profile_dir, "xhs_account_2");

  // Query SQLite ledger
  const acc1Notes = listMyNotes("xhs_account_1");
  const acc2Notes = listMyNotes("xhs_account_2");

  assert.equal(acc1Notes.length, 1);
  assert.equal(acc1Notes[0].note_id, shuzhaiPkg.id);
  assert.equal(acc1Notes[0].account_key, "xhs_account_1");

  assert.equal(acc2Notes.length, 1);
  assert.equal(acc2Notes[0].note_id, goldPkg.id);
  assert.equal(acc2Notes[0].account_key, "xhs_account_2");

  closeDb();
});

// ===========================================================================
// ATTACK SUITE 2: ANTI-AI TONE PENETRATION & EVASION ATTEMPTS
// ===========================================================================

test("Attack 2.1: Interstitial Unicode & Zero-Width Evasions", () => {
  // Test zero-width character injection across all mandatory banned clichés
  const zeroWidthEvasions = [
    "在\u200B这\u200B个\u200B快\u200B节\u200B奏\u200B的\u200B时\u200B代，我们要放慢节奏",
    "总\uFEFF有\uFEFF一\uFEFF款\uFEFF适\uFEFF合\uFEFF你",
    "建\u200C议\u200C收\u200C藏反复阅读",
    "掌握这个底\u200D层\u200D逻\u200D辑",
    "为团队深度赋\u200B能",
    "打造完整的自闭\uFEFF环",
    "从多个维\u200C度分析",
    "彻底颠\u200D覆\u200D认\u200D知"
  ];

  for (const evasion of zeroWidthEvasions) {
    const res = lintAntiAITone(evasion);
    assert.equal(res.ok, false, `Failed to catch zero-width evasion: "${evasion}"`);
    assert.ok(res.violations.length > 0);
  }
});

test("Attack 2.2: Interstitial Symbol, Delimiter & Whitespace Stacking", () => {
  const symbolEvasions = [
    "底*层*逻*辑非常关键",
    "底_层_逻_辑是核心",
    "底.层.逻.辑决定成败",
    "底-层-逻-辑要搞懂",
    "底~层~逻~辑必须看",
    "底/层/逻/辑很深奥",
    "底\\层\\逻\\辑在这里",
    "底|层|逻|辑是基石",
    "底#层#逻#辑解析",
    "底·层·逻·辑一览",
    "底 层 逻 辑 很 简 单",
    "全面 赋~能 你的成长",
    "业务 闭_环 机制",
    "多 维/度 剖析",
    "颠.覆.认.知 的发现",
    "建 议 收 藏 慢慢看"
  ];

  for (const evasion of symbolEvasions) {
    const res = lintAntiAITone(evasion);
    assert.equal(res.ok, false, `Failed to catch symbol evasion: "${evasion}"`);
  }
});

test("Attack 2.3: Extended Corporate AI Buzzwords Interception", () => {
  for (const buzz of EXTENDED_AI_BUZZWORDS) {
    const sample = `我们通过${buzz}来推动项目进展。`;
    const res = lintAntiAITone(sample);
    assert.equal(res.ok, false, `Failed to catch corporate buzzword: "${buzz}"`);
    assert.ok(res.violations.some(v => v.includes(buzz)));
  }
});

test("Attack 2.4: Paragraph Line Length Defense (Boundary Clamping)", () => {
  // Exactly 3 lines: PASS
  const p3 = "第一行文本。\n第二行文本。\n第三行文本。";
  assert.equal(lintAntiAITone(p3).ok, true);

  // 4 lines: FAIL
  const p4 = "第一行文本。\n第二行文本。\n第三行文本。\n第四行偷渡。";
  const res4 = lintAntiAITone(p4);
  assert.equal(res4.ok, false);
  assert.ok(res4.violations.some(v => /paragraph|line|行/i.test(v)));

  // Mixed CRLF with 4 lines: FAIL
  const p4crlf = "第一行\r\n第二行\r\n第三行\r\n第四行";
  assert.equal(lintAntiAITone(p4crlf).ok, false);

  // Multi-paragraph: Para 1 has 2 lines, Para 2 has 4 lines: FAIL
  const multiPara = "段落一第一行\n段落一第二行\n\n段落二第一行\n段落二第二行\n段落二第三行\n段落二第四行";
  assert.equal(lintAntiAITone(multiPara).ok, false);
});

test("Attack 2.5: Hashtag AI Cliché Smuggling Purge", () => {
  // Contaminated extra tags passed to recommendXiaohongshuTags
  const dirtyTags = [
    "#底层逻辑",
    "#赋能",
    "#业务闭环",
    "#多维度",
    "#颠覆认知",
    "#在这个快节奏的时代",
    "#对齐颗粒度",
    "#沉淀方法论",
    "#抓手",
    "#财富思维",
    "#搞钱女孩"
  ];

  const resultTags = recommendXiaohongshuTags("搞钱", "wealth", { extraTags: dirtyTags });
  
  assert.ok(resultTags.length >= 4 && resultTags.length <= 6, `Tag count must be 4-6, got ${resultTags.length}`);
  
  // Verify 0 banned keywords in returned tags
  for (const tag of resultTags) {
    for (const banned of MANDATORY_BANNED_CLICHES) {
      assert.ok(!tag.includes(banned), `Tag '${tag}' smuggled banned cliché '${banned}'`);
    }
    for (const buzz of EXTENDED_AI_BUZZWORDS) {
      assert.ok(!tag.includes(buzz), `Tag '${tag}' smuggled buzzword '${buzz}'`);
    }
  }
});

test("Attack 2.6: Cleanser Idempotency & Grounded Transformation", () => {
  const dirtyDraft = [
    "在这个快节奏的时代，很多博主都在大肆宣传底层逻辑。",
    "今天我来全面赋能你，手把手打造商业自闭环，多维度颠覆认知！",
    "干货满满，建议收藏反复阅读，总有一款适合你。",
    "我们要沉淀方法论，对齐颗粒度，打通底层链路。"
  ].join("\n"); // Note: 4 lines continuous paragraph + heavy buzzwords

  // Step 1: Must fail linting
  const preLint = lintAntiAITone(dirtyDraft);
  assert.equal(preLint.ok, false);
  assert.ok(preLint.violations.length >= 6);

  // Step 2: Humanize / cleanse
  const cleaned = humanizeText(dirtyDraft, { maxLinesPerParagraph: 3 });
  
  // Verify buzzwords are gone
  for (const banned of MANDATORY_BANNED_CLICHES) {
    assert.ok(!cleaned.includes(banned), `Cleaned text still contains: ${banned}`);
  }

  // Step 3: Re-lint cleansed text - MUST BE 100% CLEAN
  const postLint = lintAntiAITone(cleaned, { maxLinesPerParagraph: 3 });
  assert.equal(postLint.ok, true, `Cleaned text failed linting: ${postLint.violations.join(", ")}`);
  assert.equal(postLint.violations.length, 0);

  // Step 4: Verify all paragraphs are <= 3 lines
  const paragraphs = cleaned.split(/\n\s*\n+/);
  for (const p of paragraphs) {
    const lines = p.split("\n").map(l => l.trim()).filter(Boolean);
    assert.ok(lines.length <= 3, `Paragraph exceeded 3 lines: ${lines.length}`);
  }
});

test("Attack 2.7: Title Clickbait Punctuation & Basic Sensation Stripping", () => {
  const samples = [
    { raw: "【震惊】外网疯传变富技巧！", expected: "变富技巧" },
    { raw: "建议收藏！极简生活的10个误区？", expected: "极简生活误区" },
    { raw: "外网疯传的8个习惯⚠️", expected: "8个习惯" }
  ];

  for (const item of samples) {
    const cleaned = generateGroundedTitle(item.raw);
    assert.ok(cleaned.length >= 4 && cleaned.length <= 10, `Title '${cleaned}' not in 4-10 char range`);
    assert.ok(!/[✅⚠️❌！!？?【】\[\]～~""“”‘’'()（）—\-_#*《》`·]/.test(cleaned), `Title '${cleaned}' has clickbait punctuation`);
    assert.ok(!/颠覆认知|建议收藏|震惊|外网疯传/i.test(cleaned), `Title '${cleaned}' contains clickbait words`);
  }
});

test("Attack 2.8: Grounded Title Hardening (Purges Banned AI Clichés & Buzzwords)", () => {
  // Adversarial input: overseas headline combining stripped buzzwords with unstripped banned clichés
  const rawInput = "【震惊】颠覆认知的外网疯传变富底层逻辑！";
  const sanitizedTitle = generateGroundedTitle(rawInput);

  // Hardening verification 1: generateGroundedTitle cleanses sensationalism, buzzwords, and banned clichés
  assert.ok(
    ["变富技巧", "变富的小技巧"].includes(sanitizedTitle),
    `Expected '变富技巧' or '变富的小技巧', got: '${sanitizedTitle}'`
  );
  assert.ok(!sanitizedTitle.includes("底层逻辑"), "Banned cliché '底层逻辑' must NOT penetrate title generator");
  assert.ok(!sanitizedTitle.includes("颠覆认知"), "Banned cliché '颠覆认知' must NOT penetrate title generator");
  assert.ok(!sanitizedTitle.startsWith("的"), "Leading orphan particles must be stripped");

  // Hardening verification 2: when passed to the tone linter, lintAntiAITone must pass cleanly with 0 violations
  const toneResult = lintAntiAITone(sanitizedTitle);
  assert.equal(toneResult.ok, true, "Grounded title must pass anti-AI tone check");
  assert.equal(toneResult.violations.length, 0, "Grounded title must have 0 tone violations");
});

// ===========================================================================
// ATTACK SUITE 3: HIGH-CONCURRENCY DUAL-PIPELINE STRESS & INTEGRITY
// ===========================================================================

test("Attack 3.1: 40 Simultaneous Multi-Pipeline Package Lifecycles (Concurrency Stress)", async () => {
  const env = createTestEnv("stress-1-");
  const dummyImg = path.join(env.mediaDir, "common.png");
  fs.writeFileSync(dummyImg, "common-png-payload");

  process.env.XHS_INTELLIGENCE_DB_PATH = ":memory:";
  closeDb();
  const db = getDb(":memory:");

  const TOTAL_PACKAGES = 40;
  const HALF = TOTAL_PACKAGES / 2;
  const packageTasks = [];

  for (let i = 0; i < TOTAL_PACKAGES; i++) {
    const isShuzhai = i < HALF;
    const pkgId = `pkg-concurrent-${isShuzhai ? "shuzhai" : "gold"}-${String(i).padStart(2, "0")}`;
    
    packageTasks.push((async () => {
      let pkg;
      if (isShuzhai) {
        pkg = createPackage({
          id: pkgId,
          title: `课题分离第${i + 1}讲`,
          platform: "xiaohongshu",
          project: "shuzhai",
          accountId: "xhs_account_1",
          body: `# 标题\n\n课题分离第${i + 1}讲\n\n# 正文\n\n把别人的课题还回去。\n\n#认知思维`,
          layout: { templateId: "shuzhai-editorial-v1" },
          media: [{ kind: "image", path: dummyImg }],
          experiment: makeExperiment("shuzhai", { title: `课题分离第${i + 1}讲` })
        }, env.options);
      } else {
        pkg = createPackage({
          id: pkgId,
          title: `变富技巧第${i - HALF + 1}讲`,
          platform: "xiaohongshu",
          project: "x_curation",
          accountId: "xhs_account_2",
          body: `① 习惯${i} ✅ 基本靠谱\n实证分析。\n\n#搞钱思维`,
          layout: { templateId: "x-curation-dark-v1" },
          feasibilityRatings: [{ index: 1, claim: `习惯${i}`, badge: "✅ 基本靠谱", critique: "实证" }],
          media: [{ kind: "image", path: dummyImg, theme: "dark" }],
          experiment: makeExperiment("x_curation", { title: `变富技巧第${i - HALF + 1}讲` })
        }, env.options);
      }

      // Freeze concurrently
      const frozen = freezePackage(pkg.id, env.options);
      assert.equal(frozen.status, "awaiting_approval");

      // Approve concurrently
      const approved = approvePackage(frozen.id, env.options);
      assert.equal(approved.status, "approved");

      // Publish concurrently
      const pubRes = await publishApprovedPackage(approved.id, {
        ...env.options,
        loginStatus: { loggedIn: true },
        request: mockMcpRequest()
      });
      assert.equal(pubRes.ok, true);

      return { id: pkg.id, isShuzhai };
    })());
  }

  // Execute all 40 simultaneously
  const results = await Promise.all(packageTasks);
  assert.equal(results.length, TOTAL_PACKAGES);

  // Assert all 40 packages exist on disk and have valid hashes
  const packagesOnDisk = listPackages(env.options);
  assert.equal(packagesOnDisk.length, TOTAL_PACKAGES);

  for (const pkg of packagesOnDisk) {
    assert.equal(pkg.status, "published");
    assert.equal(pkg.approvalStatus, "approved");
    assert.equal(pkg.approvedHash, computeContentPackageHash(pkg));
  }

  // Verify staging directory integrity: 40 distinct directories
  const stagingDirs = fs.readdirSync(env.stagingDir);
  assert.equal(stagingDirs.length, TOTAL_PACKAGES);

  // Verify SQLite ledger: exactly 20 for xhs_account_1 and 20 for xhs_account_2
  const notesAcc1 = listMyNotes("xhs_account_1");
  const notesAcc2 = listMyNotes("xhs_account_2");

  assert.equal(notesAcc1.length, HALF, `Expected ${HALF} notes for xhs_account_1, got ${notesAcc1.length}`);
  assert.equal(notesAcc2.length, HALF, `Expected ${HALF} notes for xhs_account_2, got ${notesAcc2.length}`);

  closeDb();
});

test("Attack 3.2: Concurrent Adversarial Race Storm (15 Valid vs 15 Attack Packages)", async () => {
  const env = createTestEnv("stress-2-");
  const dummyImg = path.join(env.mediaDir, "common.png");
  fs.writeFileSync(dummyImg, "common-payload");

  const tasks = [];

  for (let i = 0; i < 30; i++) {
    const isAttack = i % 2 === 1; // Odd indices are attacks
    const pkgId = `pkg-race-${isAttack ? "attack" : "valid"}-${i}`;

    tasks.push((async () => {
      if (isAttack) {
        // Construct varied attack packages
        const attackType = i % 3;
        if (attackType === 0) {
          // Account-project bleed
          return createPackage({
            id: pkgId,
            title: "越界攻击",
            platform: "xiaohongshu",
            project: "x_curation",
            accountId: "xhs_account_1",
            body: "越界文案",
            experiment: makeExperiment("xhs_account_1")
          }, env.options);
        } else if (attackType === 1) {
          // Trojan badge into Shuzhai
          return createPackage({
            id: pkgId,
            title: "木马打标",
            platform: "xiaohongshu",
            project: "shuzhai",
            accountId: "xhs_account_1",
            body: "正文包含 ❌ 纯属营销噱头",
            layout: { templateId: "shuzhai-editorial-v1" },
            media: [{ kind: "image", path: dummyImg }],
            experiment: makeExperiment("shuzhai")
          }, env.options);
        } else {
          // Trojan Shuzhai template into Gold chance
          return createPackage({
            id: pkgId,
            title: "木马模板",
            platform: "xiaohongshu",
            project: "x_curation",
            accountId: "xhs_account_2",
            body: "① 习惯 ✅ 基本靠谱",
            layout: { templateId: "shuzhai-editorial-v1" },
            feasibilityRatings: [{ index: 1, claim: "习惯", badge: "✅ 基本靠谱", critique: "实证" }],
            media: [{ kind: "image", path: dummyImg, theme: "dark" }],
            experiment: makeExperiment("x_curation")
          }, env.options);
        }
      } else {
        // Valid package (alternating Shuzhai and Gold chance)
        const isShuzhai = i % 4 === 0;
        if (isShuzhai) {
          const pkg = createPackage({
            id: pkgId,
            title: `正常书斋${i}`,
            platform: "xiaohongshu",
            project: "shuzhai",
            accountId: "xhs_account_1",
            body: `# 标题\n\n正常书斋${i}\n\n# 正文\n\n正文描述。\n\n#认知思维`,
            layout: { templateId: "shuzhai-editorial-v1" },
            media: [{ kind: "image", path: dummyImg }],
            experiment: makeExperiment("shuzhai")
          }, env.options);
          freezePackage(pkg.id, env.options);
          return pkg;
        } else {
          const pkg = createPackage({
            id: pkgId,
            title: `正常推特${i}`,
            platform: "xiaohongshu",
            project: "x_curation",
            accountId: "xhs_account_2",
            body: `① 习惯 ✅ 基本靠谱\n评论。\n\n#搞钱思维`,
            layout: { templateId: "x-curation-dark-v1" },
            feasibilityRatings: [{ index: 1, claim: "习惯", badge: "✅ 基本靠谱", critique: "实证" }],
            media: [{ kind: "image", path: dummyImg, theme: "dark" }],
            experiment: makeExperiment("x_curation")
          }, env.options);
          freezePackage(pkg.id, env.options);
          return pkg;
        }
      }
    })());
  }

  // Settle all promises concurrently
  const settled = await Promise.allSettled(tasks);

  let successCount = 0;
  let rejectedCount = 0;

  for (let i = 0; i < settled.length; i++) {
    const isAttack = i % 2 === 1;
    const res = settled[i];
    if (isAttack) {
      assert.equal(res.status, "rejected", `Attack ${i} was unexpectedly fulfilled!`);
      assert.ok(res.reason instanceof PipelineRoutingError, `Attack ${i} threw non-routing error: ${res.reason?.message}`);
      rejectedCount++;
    } else {
      assert.equal(res.status, "fulfilled", `Valid task ${i} was unexpectedly rejected: ${res.reason?.message}`);
      successCount++;
    }
  }

  assert.equal(rejectedCount, 15, "100% of attack packages must be rejected");
  assert.equal(successCount, 15, "100% of valid packages must succeed");
});

test("Attack 3.3: In-Flight Hash Tampering & Desynchronization Detection", () => {
  const env = createTestEnv("stress-3-");
  const dummyImg = path.join(env.mediaDir, "cover.png");
  fs.writeFileSync(dummyImg, "fake-cover");

  const pkg = createPackage({
    id: "pkg-tamper-target",
    title: "阿德勒心理学",
    platform: "xiaohongshu",
    project: "shuzhai",
    accountId: "xhs_account_1",
    body: "# 标题\n\n课题分离\n\n# 正文\n\n原版正文内容。",
    layout: { templateId: "shuzhai-editorial-v1" },
    media: [{ kind: "image", path: dummyImg }],
    experiment: makeExperiment("shuzhai")
  }, env.options);

  // Freeze package
  const frozen = freezePackage(pkg.id, env.options);
  assert.equal(frozen.status, "awaiting_approval");
  const originalHash = frozen.payloadHash;

  // Tamper with package file directly on disk behind the back of the store API
  const diskPath = path.join(env.packagesDir, `${pkg.id}.json`);
  const rawDiskJson = JSON.parse(fs.readFileSync(diskPath, "utf8"));
  rawDiskJson.body = "# 标题\n\n课题分离\n\n# 正文\n\n篡改后的未经验证正文！";
  fs.writeFileSync(diskPath, JSON.stringify(rawDiskJson, null, 2), "utf8");

  // Attempt to approve without re-freezing -> must throw payload hash mismatch error
  assert.throws(() => {
    approvePackage(pkg.id, env.options);
  }, (err) => {
    assert.ok(/Package payload hash mismatch/i.test(err.message));
    return true;
  });

  // Attempt to markReadyManual -> must throw error
  assert.throws(() => {
    markReadyManual(pkg.id, env.options);
  }, (err) => {
    assert.ok(/package must be approved first/i.test(err.message));
    return true;
  });
});
