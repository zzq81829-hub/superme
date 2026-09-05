/**
 * End-to-End (E2E) Test Suite: Autonomous Content Operating Company (一人内容公司)
 *
 * Architecture & Requirements:
 * - R1: Trend Sniffer & Cultural Adaptation Engine (zero-MT, <=20 char hooks, netizen psychology, fact-checking)
 * - R2: Two-tier Compliance & Legality Firewall (100% intercept, >=98% safe pass, immutable audit log)
 * - R3: Circadian Anti-Ban Scheduler & Hashtag Pipeline (11:30~13:30, 18:00~20:30, quiet hours, ±15~35m BioJitter)
 * - R4: 9-Metric Learning Ledger & Peer Adaptation (9 hard metrics, funnel diagnosis, closed-loop strategy update)
 * - R5: Personal IP Discovery & Monetization Hooks (>=3 IP proposals, pluggable book/toolkit/consultation CTAs)
 * - R6: Full Regression & Compatibility (CostGuard, VerifyTask, Reasoning Escalation Policy)
 *
 * Tiers:
 * - Tier 1: Feature Coverage (>=5 tests per feature area R1-R6)
 * - Tier 2: Boundary & Corner Cases (>=5 tests per feature area R1-R6)
 * - Tier 3: Cross-Feature Combinations (Pairwise interaction tests)
 * - Tier 4: Real-World Application Scenarios (Realistic end-to-end workflows including Fact-Checking Model)
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

// Existing system modules for R6 regression & compatibility testing
import { applyCostGuard } from "../src/workers/costGuard.js";
import { verifyTask } from "../src/verify/verifyTask.js";
import { parseAcceptanceText, normalizeAcceptanceCriteria } from "../src/verify/criteria.js";
import {
  evaluateReasoningMode,
  assessTaskRisk,
  runBoostVerification,
  createFailureAuditReport
} from "../src/policy/reasoningEscalation.js";

// Helper for dynamic loading across progressive milestones
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

// Module imports from specification contracts
const culturalAdaptation = await tryImport("../src/autonomous_content/culturalAdaptation.js");
const complianceFirewall = await tryImport("../src/autonomous_content/complianceFirewall.js");
const circadianScheduler = await tryImport("../src/autonomous_content/circadianScheduler.js");
const learningLedger = await tryImport("../src/autonomous_content/learningLedger.js");
const ipDiscovery = await tryImport("../src/autonomous_content/ipDiscovery.js");
const autonomousContentFacade = await tryImport("../src/autonomous_content/index.js");

// Fallback resolver: direct submodule or facade export
const mCultural = culturalAdaptation || autonomousContentFacade?.culturalAdaptation || autonomousContentFacade;
const mCompliance = complianceFirewall || autonomousContentFacade?.complianceFirewall || autonomousContentFacade;
const mScheduler = circadianScheduler || autonomousContentFacade?.circadianScheduler || autonomousContentFacade;
const mLedger = learningLedger || autonomousContentFacade?.learningLedger || autonomousContentFacade;
const mIp = ipDiscovery || autonomousContentFacade?.ipDiscovery || autonomousContentFacade;
const mFacade = autonomousContentFacade;

// Helper to isolate file operations for tests
function createIsolatedTestDir(prefix = "founder-os-e2e-") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return {
    dir,
    cleanup: () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {}
    }
  };
}

// ============================================================================
// TIER 1: FEATURE COVERAGE (R1 - R6)
// ============================================================================

// ----------------------------------------------------------------------------
// Suite 1.1: R1 Trend Sniffing & Cultural Adaptation Engine
// ----------------------------------------------------------------------------

test("Tier 1 - R1.1: adaptOverseasTopic ingests overseas topic and returns structured note package", {
  skip: !mCultural ? "Awaiting M1 culturalAdaptation implementation" : false
}, async () => {
  const result = await mCultural.adaptOverseasTopic({
    rawTopic: "The Spotlight Effect: Why Nobody Is Actually Watching You",
    sourceUrl: "https://x.com/naval/status/123456789",
    metrics: { likes: 15400, retweets: 3200 }
  });

  assert.equal(result.success, true);
  assert.ok(result.adaptedNote);
  assert.ok(result.adaptedNote.title);
  assert.ok(result.adaptedNote.title.length <= 20, `Title "${result.adaptedNote.title}" must be <= 20 chars`);
  assert.ok(result.adaptedNote.body.length > 30);
  assert.ok(result.adaptedNote.zeroMtScore >= 0.85, `zeroMtScore ${result.adaptedNote.zeroMtScore} should be >= 0.85`);
  assert.ok(Array.isArray(result.adaptedNote.tags));
  assert.ok(result.adaptedNote.tags.length >= 3 && result.adaptedNote.tags.length <= 5);
  assert.ok(result.adaptedNote.slidePlan.length >= 3);
});

test("Tier 1 - R1.2: detectMachineTranslation identifies translationese markers and scores zero-MT", {
  skip: !mCultural ? "Awaiting M1 culturalAdaptation implementation" : false
}, () => {
  const translationeseText = "这被广泛认为在很大程度上是一个具有重要意义的发现。正如我们所知，就其本身而言，其导致了变化的产生。";
  const mtResult = mCultural.detectMachineTranslation(translationeseText);

  assert.equal(mtResult.isMachineTranslation, true);
  assert.ok(mtResult.zeroMtScore < 0.85);
  assert.ok(mtResult.markersDetected.length >= 2);

  const cleanChineseText = "生活里没有那么多观众。别人其实只关心他们自己，放下假想舞台，才是自由的开始。";
  const cleanResult = mCultural.detectMachineTranslation(cleanChineseText);
  assert.equal(cleanResult.isMachineTranslation, false);
  assert.ok(cleanResult.zeroMtScore >= 0.85);
});

test("Tier 1 - R1.3: generate3SecondHooks produces candidates <= 20 chars across multiple angles", {
  skip: !mCultural ? "Awaiting M1 culturalAdaptation implementation" : false
}, () => {
  const hooks = mCultural.generate3SecondHooks("procrastination and self esteem", 5);
  assert.ok(Array.isArray(hooks));
  assert.ok(hooks.length >= 5);

  for (const hook of hooks) {
    const title = String(hook.title || hook);
    assert.ok(title.length <= 20, `Hook "${title}" exceeds 20 characters`);
    assert.ok(title.length > 4, `Hook "${title}" is too short`);
  }
});

test("Tier 1 - R1.4: breakdownPainPoint extracts persona, hidden anxiety, reframing and checklist", {
  skip: !mCultural ? "Awaiting M1 culturalAdaptation implementation" : false
}, () => {
  const breakdown = mCultural.breakdownPainPoint("people pleasing and boundaries");
  assert.ok(breakdown.persona);
  assert.ok(breakdown.hiddenAnxiety);
  assert.ok(breakdown.reframing);
  assert.ok(Array.isArray(breakdown.executionChecklist));
  assert.ok(breakdown.executionChecklist.length >= 2);
});

test("Tier 1 - R1.5: trimExplainingPulp cuts lecturing filler and moralizing fluff (CARD 07)", {
  skip: !mCultural ? "Awaiting M1 culturalAdaptation implementation" : false
}, () => {
  const preachyText = "生活里没有那么多观众。\n\n所以大家一定要学会勇敢做自己！我们要明白一个道理，不要过于在乎别人的目光。只有这样，我们才能成为更好的自己。";
  const trimmed = mCultural.trimExplainingPulp(preachyText);

  assert.ok(!trimmed.includes("所以大家一定要学会"));
  assert.ok(!trimmed.includes("我们要明白一个道理"));
  assert.ok(!trimmed.includes("成为更好的自己"));
  assert.ok(trimmed.includes("生活里没有那么多观众"));
});

test("Tier 1 - R1.6: packageContentMetadata formats note into standard Xiaohongshu layout", {
  skip: !mCultural ? "Awaiting M1 culturalAdaptation implementation" : false
}, () => {
  const pkg = mCultural.packageContentMetadata({
    title: "生活里没有那么多观众",
    body: "核心内容阐述与拆解",
    tags: ["认知思维", "自我提升", "停止内耗"]
  });

  assert.equal(pkg.title, "生活里没有那么多观众");
  assert.ok(pkg.formattedCaption.includes("# 标题\n生活里没有那么多观众"));
  assert.ok(pkg.formattedCaption.includes("# 正文\n核心内容阐述与拆解"));
  assert.ok(pkg.tags.every((t) => t.startsWith("#")));
  assert.ok(pkg.tags.length >= 3 && pkg.tags.length <= 5);
});

test("Tier 1 - R1.7 (Founder Directive): Fact-Checking & Mythbusting Engine evaluates 3-tier ratings", {
  skip: !mCultural?.factCheckAndAnnotate ? "Awaiting M1 factCheckAndAnnotate implementation" : false
}, async () => {
  const claims = [
    "坚持早起5点打卡能让你收入翻倍",
    "番茄工作法单核冲刺可大幅提升专注度",
    "只要开启多任务并行就能节省50%工作时间"
  ];

  const fc = mCultural.factCheckAndAnnotate({ rawClaims: claims });
  assert.ok(fc.summary);
  assert.equal(fc.summary.total, 3);
  assert.ok(fc.annotatedClaims.length === 3);

  // Assert 3-tier rating taxonomy
  const ratings = fc.annotatedClaims.map((c) => c.rating);
  assert.ok(ratings.includes("debunked") || ratings.includes("questionable") || ratings.includes("valid"));

  const badges = fc.annotatedClaims.map((c) => c.badge);
  assert.ok(badges.some((b) => b.includes("❌") || b.includes("⚠️") || b.includes("✅")));

  // Assert Fact-Check hook title generation <= 20 chars
  const hooks = mCultural.generateFactCheckingHooks ? mCultural.generateFactCheckingHooks({ total: 8, validCount: 4 }) : [];
  if (hooks.length > 0) {
    assert.ok(hooks[0].title.length <= 20);
    assert.ok(hooks[0].title.includes("外网") || hooks[0].title.includes("仅") || hooks[0].title.includes("查"));
  }

  // Assert author-pinned self-check checklist exists
  assert.ok(Array.isArray(fc.pinnedSelfCheckChecklist));
  assert.ok(fc.pinnedSelfCheckChecklist.length >= 2);
});

// ----------------------------------------------------------------------------
// Suite 1.2: R2 Two-Tier Compliance Firewall
// ----------------------------------------------------------------------------

test("Tier 1 - R2.1: checkTier1Legality intercepts Chinese advertising law superlatives (100% intercept)", {
  skip: !mCompliance ? "Awaiting M2 complianceFirewall implementation" : false
}, () => {
  const violations = [
    "全网第一爆款AI助手",
    "国家级独家首发配方",
    "本产品绝对有效，包治百病，永不复发",
    "零风险高收益，稳赚不赔，一夜暴富秘籍",
    "100%包过退费，押题必中"
  ];

  for (const text of violations) {
    const res = mCompliance.checkTier1Legality(text);
    assert.equal(res.passed, false, `Text "${text}" must be intercepted by Tier 1`);
    assert.ok(res.violations.length > 0);
  }
});

test("Tier 1 - R2.2: checkTier2PlatformRules intercepts off-platform diversion and spam (100% intercept)", {
  skip: !mCompliance ? "Awaiting M2 complianceFirewall implementation" : false
}, () => {
  const diversionTexts = [
    "加微信领取完整版思维导图",
    "私聊我领无水印工具包",
    "进群领取专属大礼包",
    "淘宝店铺搜索同名好物",
    "兼职刷单日赚千元，轻松躺赚"
  ];

  for (const text of diversionTexts) {
    const res = mCompliance.checkTier2PlatformRules(text);
    assert.equal(res.passed, false, `Text "${text}" must be intercepted by Tier 2`);
    assert.ok(res.violations.length > 0);
  }
});

test("Tier 1 - R2.3: filterContextualSafePass allows legitimate contextual phrases without false positives", {
  skip: !mCompliance ? "Awaiting M2 complianceFirewall implementation" : false
}, () => {
  const safePhrases = [
    "做自媒体的第一步是找准对标账号",
    "数学中的绝对值概念解析",
    "第一宇宙速度是多少？",
    "济南天下第一泉趵突泉游记",
    "最高人民法院发布新规定",
    "在微信读书上读完了这本书"
  ];

  for (const phrase of safePhrases) {
    const t1 = mCompliance.checkTier1Legality(phrase);
    assert.equal(t1.passed, true, `Legitimate phrase "${phrase}" should pass Tier 1 safely`);
  }
});

test("Tier 1 - R2.4: evaluateCompliance produces structured assessment with riskLevel and suggestions", {
  skip: !mCompliance ? "Awaiting M2 complianceFirewall implementation" : false
}, () => {
  const cleanPackage = {
    title: "生活里没有那么多观众",
    body: "放下假想舞台，从第一步开始行动。",
    tags: ["#认知思维", "#自我提升"]
  };
  const cleanEval = mCompliance.evaluateCompliance(cleanPackage);
  assert.equal(cleanEval.passed, true);
  assert.equal(cleanEval.riskLevel, "clean");

  const dirtyPackage = {
    title: "全网第一搞钱秘籍",
    body: "加微信免费领资料，稳赚不赔！",
    tags: ["#搞钱"]
  };
  const dirtyEval = mCompliance.evaluateCompliance(dirtyPackage);
  assert.equal(dirtyEval.passed, false);
  assert.ok(dirtyEval.riskLevel === "blocked" || dirtyEval.riskLevel === "high");
  assert.ok(dirtyEval.tier1Violations.length > 0);
  assert.ok(dirtyEval.tier2Violations.length > 0);
  assert.ok(dirtyEval.suggestions.length > 0);
  assert.ok(dirtyEval.auditRecord);
});

test("Tier 1 - R2.5: recordAuditLog appends immutable audit records with contentHash", {
  skip: !mCompliance ? "Awaiting M2 complianceFirewall implementation" : false
}, (t) => {
  const { dir, cleanup } = createIsolatedTestDir("compliance-audit-");
  t.after(cleanup);

  const logPath = path.join(dir, "audit_log.jsonl");
  const auditRecord = {
    auditId: "audit-001",
    timestamp: new Date().toISOString(),
    contentHash: crypto.createHash("sha256").update("test content").digest("hex"),
    riskLevel: "blocked",
    tier1Count: 1,
    tier2Count: 1
  };

  const res = mCompliance.recordAuditLog(auditRecord, { auditPath: logPath });
  assert.equal(res.logged, true);
  assert.ok(fs.existsSync(logPath));

  const content = fs.readFileSync(logPath, "utf8").trim();
  const parsed = JSON.parse(content);
  assert.equal(parsed.auditId, "audit-001");
  assert.equal(parsed.riskLevel, "blocked");
});

// ----------------------------------------------------------------------------
// Suite 1.3: R3 Circadian Anti-Ban Scheduler & Hashtag Pipeline
// ----------------------------------------------------------------------------

test("Tier 1 - R3.1: evaluateCircadianWindow permits publishing in active traffic windows", {
  skip: !mScheduler ? "Awaiting M3 circadianScheduler implementation" : false
}, () => {
  // Lunch window: 12:00
  const lunchTime = new Date("2026-09-04T12:00:00+08:00");
  const lunchCheck = mScheduler.evaluateCircadianWindow(lunchTime);
  assert.equal(lunchCheck.allowed, true);
  assert.equal(lunchCheck.isQuietHours, false);

  // Evening window: 19:30
  const eveningTime = new Date("2026-09-04T19:30:00+08:00");
  const eveningCheck = mScheduler.evaluateCircadianWindow(eveningTime);
  assert.equal(eveningCheck.allowed, true);
  assert.equal(eveningCheck.isQuietHours, false);
});

test("Tier 1 - R3.2: evaluateCircadianWindow strictly suspends publishing in night quiet hours", {
  skip: !mScheduler ? "Awaiting M3 circadianScheduler implementation" : false
}, () => {
  // Night silence: 02:30
  const nightTime = new Date("2026-09-04T02:30:00+08:00");
  const nightCheck = mScheduler.evaluateCircadianWindow(nightTime);
  assert.equal(nightCheck.allowed, false);
  assert.equal(nightCheck.isQuietHours, true);
  assert.ok(nightCheck.suspended === true || nightCheck.reason?.includes("quiet") || nightCheck.reason?.includes("night"));
});

test("Tier 1 - R3.3: calculateBioJitter generates randomized ±15~35 min offset within window", {
  skip: !mScheduler ? "Awaiting M3 circadianScheduler implementation" : false
}, () => {
  const target = new Date("2026-09-04T19:00:00+08:00");
  const jitterResult = mScheduler.calculateBioJitter(target);

  assert.ok(jitterResult.scheduledTime instanceof Date);
  const diffMinutes = Math.round(Math.abs(jitterResult.scheduledTime.getTime() - target.getTime()) / 60000);
  assert.ok(diffMinutes >= 15 && diffMinutes <= 35, `Jitter ${diffMinutes}m should be between 15 and 35 minutes`);
});

test("Tier 1 - R3.4: selectVerticalHashtags returns 3~5 high-weight vertical tags", {
  skip: !mScheduler ? "Awaiting M3 circadianScheduler implementation" : false
}, () => {
  const tags = mScheduler.selectVerticalHashtags({
    category: "cognitive_growth",
    keywords: ["思维", "搞钱", "读书", "认知"],
    contentText: "普通人逆袭的底层认知逻辑与执行力拆解"
  });

  assert.ok(Array.isArray(tags));
  assert.ok(tags.length >= 3 && tags.length <= 5);
  assert.ok(tags.every((t) => t.startsWith("#")));
});

test("Tier 1 - R3.5: processPublishQueue supports auto release and manual_buffer gate modes", {
  skip: !mScheduler ? "Awaiting M3 circadianScheduler implementation" : false
}, async (t) => {
  const { dir, cleanup } = createIsolatedTestDir("circadian-queue-");
  t.after(cleanup);

  const queueFile = path.join(dir, "queue.json");
  const mockItems = [
    { id: "note-1", title: "测试合规笔记1", status: "ready", compliancePassed: true },
    { id: "note-2", title: "测试合规笔记2", status: "ready", compliancePassed: true }
  ];
  fs.writeFileSync(queueFile, JSON.stringify(mockItems));

  const fn = mScheduler.processPublishQueue || mScheduler.processQueue;
  assert.ok(typeof fn === "function");

  // Manual buffer gate should buffer items, not auto-release
  const bufferResult = await fn({
    queuePath: queueFile,
    gateMode: "manual_buffer"
  });
  assert.ok(bufferResult.buffered?.length > 0 || bufferResult.held?.length > 0 || bufferResult.released?.length === 0);
});

// ----------------------------------------------------------------------------
// Suite 1.4: R4 Metric-Driven Learning Ledger & Peer Adaptation
// ----------------------------------------------------------------------------

test("Tier 1 - R4.1: recordCycleExperiment ingests and validates all 9 objective metrics", {
  skip: !mLedger ? "Awaiting M4 learningLedger implementation" : false
}, (t) => {
  const { dir, cleanup } = createIsolatedTestDir("ledger-test-");
  t.after(cleanup);

  const ledgerFile = path.join(dir, "ledger.jsonl");
  const cycleData = {
    cycleId: "cycle-20260904-01",
    noteId: "note-101",
    variables: {
      topicHook: "contrarian",
      coverLayout: "minimalist_black",
      ctaHook: "book_recommendation",
      publishSlot: "19:30"
    },
    metrics: {
      impressions: 12000,
      views: 1800,
      dwell_time: 42,
      likes: 320,
      collects: 410,
      comments: 65,
      follows: 48,
      dms: 12,
      conversions_gmv: 680
    }
  };

  const res = mLedger.recordCycleExperiment(cycleData, { ledgerPath: ledgerFile });
  assert.equal(res.persisted, true);
  assert.ok(res.ledgerEntry);
  assert.equal(res.ledgerEntry.metrics.impressions, 12000);
  assert.equal(res.ledgerEntry.metrics.conversions_gmv, 680);
});

test("Tier 1 - R4.2: deterministic funnel diagnosis pinpoints dropoff stage accurately", {
  skip: !mLedger ? "Awaiting M4 learningLedger implementation" : false
}, () => {
  const diagnose = mLedger.diagnoseFunnel || mLedger.diagnosePerformance;
  assert.ok(typeof diagnose === "function");

  // High impressions but low clicks -> Title / Cover issue
  const diag1 = diagnose({ impressions: 50000, views: 500, dwell_time: 40, likes: 50, collects: 50 });
  assert.ok(diag1.bottleneck.includes("click") || diag1.bottleneck.includes("cover") || diag1.stage === "low_click");

  // High clicks but low dwell/reads -> Content / Hook mismatch
  const diag2 = diagnose({ impressions: 10000, views: 2500, dwell_time: 5, likes: 20, collects: 10 });
  assert.ok(diag2.bottleneck.includes("read") || diag2.bottleneck.includes("dwell") || diag2.stage === "low_read");

  // High reads but low collects -> Lack of long-term utility
  const diag3 = diagnose({ impressions: 10000, views: 2500, dwell_time: 50, likes: 300, collects: 5 });
  assert.ok(diag3.bottleneck.includes("collect") || diag3.bottleneck.includes("save") || diag3.stage === "low_save");
});

test("Tier 1 - R4.3: deconstructPeerNote extracts hook formula and layout structure", {
  skip: !mLedger ? "Awaiting M4 learningLedger implementation" : false
}, () => {
  const peerNote = {
    title: "为什么越聪明的人反而越拖延？",
    body: "很多人以为拖延是懒，底层其实是对自尊的过度防御。这里提供3步破局法...",
    metrics: { likes: 35000, collects: 42000 }
  };

  const deconstructed = mLedger.deconstructPeerNote(peerNote);
  assert.ok(deconstructed.hookFormula);
  assert.ok(deconstructed.hookFormula.includes("paradox") || deconstructed.hookFormula.includes("反常识"));
  assert.ok(deconstructed.structure);
});

test("Tier 1 - R4.4: recordCycleExperiment persists conclusions and next_strategy vector", {
  skip: !mLedger ? "Awaiting M4 learningLedger implementation" : false
}, (t) => {
  const { dir, cleanup } = createIsolatedTestDir("ledger-strategy-");
  t.after(cleanup);

  const ledgerFile = path.join(dir, "ledger.jsonl");
  const res = mLedger.recordCycleExperiment({
    cycleId: "cycle-002",
    variables: { topicHook: "paradox" },
    metrics: { impressions: 20000, views: 3000, dwell_time: 45, likes: 500, collects: 600, follows: 80, dms: 10, conversions_gmv: 300 }
  }, { ledgerPath: ledgerFile });

  assert.ok(res.ledgerEntry.conclusions);
  assert.ok(res.ledgerEntry.next_strategy);
});

test("Tier 1 - R4.5: getLatestStrategyVector returns active weights for closed-loop consumption", {
  skip: !mLedger ? "Awaiting M4 learningLedger implementation" : false
}, () => {
  const strategy = mLedger.getLatestStrategyVector();
  assert.ok(strategy);
  assert.ok(strategy.preferredHookFormulas || strategy.topicWeights);
});

// ----------------------------------------------------------------------------
// Suite 1.5: R5 Personal IP Discovery & Monetization Hooks
// ----------------------------------------------------------------------------

test("Tier 1 - R5.1: generateIPProposals produces at least 3 distinct structured IP schemes", {
  skip: !mIp ? "Awaiting M5 ipDiscovery implementation" : false
}, () => {
  const proposals = mIp.generateIPProposals({
    founderBackground: "Tech Founder / Product Thinker",
    interests: ["Cognitive Science", "Solopreneurship", "AI Tools"]
  });

  assert.ok(Array.isArray(proposals));
  assert.ok(proposals.length >= 3, "Must generate at least 3 distinct IP proposals");

  for (const p of proposals) {
    assert.ok(p.personaTitle);
    assert.ok(p.targetAudience);
    assert.ok(p.hookAngle);
    assert.ok(p.benchmarkAccounts);
    assert.ok(p.monetizationPaths);
  }
});

test("Tier 1 - R5.2: injectMonetizationCTA injects pluggable Book recommendation CTA", {
  skip: !mIp ? "Awaiting M5 ipDiscovery implementation" : false
}, () => {
  const baseNote = {
    title: "为什么你越努力越焦虑",
    body: "改变认知的关键在于停止无效内耗，建立行动秩序。"
  };

  const enhanced = mIp.injectMonetizationCTA(baseNote, "book", {
    bookTitle: "《被讨厌的勇气》",
    corePitch: "如果只想读一本让你彻底松弛的书，我推荐这一本。"
  });

  assert.ok(enhanced.enhancedBody.includes("《被讨厌的勇气》"));
  assert.ok(enhanced.ctaSlide);
  assert.equal(enhanced.ctaSlide.role, "monetization_cta");
});

test("Tier 1 - R5.3: injectMonetizationCTA injects Digital Toolkit / Lead Magnet CTA", {
  skip: !mIp ? "Awaiting M5 ipDiscovery implementation" : false
}, () => {
  const baseNote = { title: "时间管理45分钟模型", body: "单核工作法操作指南。" };
  const enhanced = mIp.injectMonetizationCTA(baseNote, "toolkit", {
    toolkitName: "一人公司日计划模板",
    actionPrompt: "已将完整 Notion 模板整理在工具包中"
  });

  assert.ok(enhanced.enhancedBody.includes("Notion"));
  assert.ok(enhanced.ctaSlide);
});

test("Tier 1 - R5.4: injectMonetizationCTA injects 1-on-1 Consultation CTA", {
  skip: !mIp ? "Awaiting M5 ipDiscovery implementation" : false
}, () => {
  const baseNote = { title: "个人商业定位分析", body: "如何找到自己的商业闭环。" };
  const enhanced = mIp.injectMonetizationCTA(baseNote, "consultation", {
    serviceName: "个人IP深度定位咨询",
    spotsLimit: "本月仅余3席"
  });

  assert.ok(enhanced.enhancedBody.includes("咨询"));
  assert.ok(enhanced.ctaSlide);
});

test("Tier 1 - R5.5: Monetization CTA layout preserves Xiaohongshu card dimensions", {
  skip: !mIp ? "Awaiting M5 ipDiscovery implementation" : false
}, () => {
  const baseNote = { title: "测试卡片排版", body: "正文内容" };
  const enhanced = mIp.injectMonetizationCTA(baseNote, "book", {
    bookTitle: "《纳瓦尔宝典》",
    corePitch: "财富与幸福的指南。"
  });

  assert.ok(enhanced.ctaSlide.text.length <= 120, "CTA slide text must fit inside card boundaries");
});

// ----------------------------------------------------------------------------
// Suite 1.6: R6 Regression & Compatibility
// ----------------------------------------------------------------------------

test("Tier 1 - R6.1: CostGuard worker guardrail prioritizes subscription and blocks unapproved paid fallback", () => {
  const online = (id) => ({ id, status: "ONLINE", available: true, billingMode: "subscription", apiAllowed: false });
  const health = {
    codex: { id: "codex", status: "OFFLINE", available: false, billingMode: "subscription" },
    claude: online("claude"),
    antigravity: online("antigravity"),
    "grok-build": online("grok-build"),
    "grok-bot": { available: false, status: "UNAVAILABLE" }
  };

  const guard = applyCostGuard("codex", health);
  assert.equal(guard.ok, true);
  assert.equal(guard.worker, "claude");
  assert.equal(guard.reason.includes("OpenAI"), false);
});

test("Tier 1 - R6.2: VerifyTask criteria validator enforces file existence and command allowlisting", async (t) => {
  const { dir, cleanup } = createIsolatedTestDir("verifier-reg-");
  t.after(cleanup);

  fs.writeFileSync(path.join(dir, "artifact.json"), JSON.stringify({ status: "ok" }));

  const res = await verifyTask({
    projectPath: dir,
    result: { ok: true, message: "complete" },
    config: { dryRun: false, execution: { verificationTimeoutMs: 5000, maxOutputBytes: 1024 } },
    task: {
      acceptanceCriteria: [
        { type: "file-exists", path: "artifact.json" },
        { type: "command", command: "node", args: ["--version"] }
      ]
    }
  });

  assert.equal(res.ok, true);
  assert.ok(res.checks.every((c) => c.ok));
});

test("Tier 1 - R6.3: Reasoning Escalation Policy accurately classifies low-risk vs boost mode", () => {
  const lowTask = { title: "微调文案", description: "单文件文案修改", risk_level: "low" };
  const lowEval = evaluateReasoningMode(lowTask);
  assert.equal(lowEval.reasoning_mode, "normal");

  const boostTask = {
    title: "重构数据库状态模块",
    description: "涉及 API 架构、数据库状态管理与多文件迁移"
  };
  const boostEval = evaluateReasoningMode(boostTask);
  assert.equal(boostEval.reasoning_mode, "boost");
  assert.ok(boostEval.boost_reason);
});

test("Tier 1 - R6.4: Reasoning Escalation triggers circuit breaking on 3 consecutive failures", () => {
  const task = { title: "自动化流程调整", risk_level: "medium" };
  const evalRetry3 = evaluateReasoningMode(task, { retry_count: 3 });

  assert.equal(evalRetry3.reasoning_mode, "boost");
  assert.equal(evalRetry3.stop_for_review, true);
  assert.ok(evalRetry3.boost_reason.includes("熔断"));

  const auditReport = createFailureAuditReport(
    { id: "task-fail-3", title: "测试连续失败" },
    { error: "Assertion failure" },
    { reason: "circuit breaker tripped" }
  );
  assert.equal(auditReport.taskId, "task-fail-3");
  assert.ok(auditReport.audit_recommendations.length >= 3);
});

test("Tier 1 - R6.5: VerifyTask blocks access outside project root boundary", async () => {
  const res = await verifyTask({
    projectPath: process.cwd(),
    result: { ok: true, message: "done" },
    config: { dryRun: false, execution: { verificationTimeoutMs: 5000, maxOutputBytes: 1024 } },
    task: {
      acceptanceCriteria: [{ type: "file-exists", path: "../outside-boundary.key" }]
    }
  });

  assert.equal(res.ok, false);
  assert.match(res.checks.at(-1).error, /escapes project/);
});

// ============================================================================
// TIER 2: BOUNDARY & CORNER CASES (R1 - R6)
// ============================================================================

// ----------------------------------------------------------------------------
// Suite 2.1: R1 Boundaries
// ----------------------------------------------------------------------------

test("Tier 2 - R1.1: 3-Second hook title length strictly <= 20 characters across all edge cases", {
  skip: !mCultural ? "Awaiting M1 culturalAdaptation implementation" : false
}, () => {
  const longInsight = "Supercalifragilisticexpialidocious extremely complicated cognitive psychological concept about human existential dread";
  const hooks = mCultural.generate3SecondHooks(longInsight, 10);

  for (const h of hooks) {
    const t = String(h.title || h);
    assert.ok(t.length <= 20, `Title "${t}" has length ${t.length}, exceeding 20`);
  }
});

test("Tier 2 - R1.2: Empty or whitespace rawTopic throws descriptive validation error", {
  skip: !mCultural ? "Awaiting M1 culturalAdaptation implementation" : false
}, async () => {
  await assert.rejects(
    async () => mCultural.adaptOverseasTopic({ rawTopic: "" }),
    /non-empty/i
  );
  await assert.rejects(
    async () => mCultural.adaptOverseasTopic({ rawTopic: "   \n\t  " }),
    /non-empty/i
  );
});

test("Tier 2 - R1.3: Super long rawTopic input (10,000+ chars) processed without memory exhaustion", {
  skip: !mCultural ? "Awaiting M1 culturalAdaptation implementation" : false
}, async () => {
  const hugeText = "Why focus is the superpower of the 21st century. ".repeat(300);
  const result = await mCultural.adaptOverseasTopic({ rawTopic: hugeText });

  assert.equal(result.success, true);
  assert.ok(result.adaptedNote.title.length <= 20);
});

test("Tier 2 - R1.4: Extreme translationese input scored zeroMtScore < 0.50", {
  skip: !mCultural ? "Awaiting M1 culturalAdaptation implementation" : false
}, () => {
  const heavyCalques = "这被广泛认为是基于一个有着重要意义的背景上所进行的研究，在很大程度上使其能够作出决定，正如我们所知，显而易见的是这具有极其重要的意义。";
  const scoreResult = mCultural.detectMachineTranslation(heavyCalques);

  assert.equal(scoreResult.isMachineTranslation, true);
  assert.ok(scoreResult.zeroMtScore < 0.5, `Score ${scoreResult.zeroMtScore} should be heavily penalized`);
});

test("Tier 2 - R1.5: Non-English/multilingual raw inputs with emojis handled cleanly", {
  skip: !mCultural ? "Awaiting M1 culturalAdaptation implementation" : false
}, async () => {
  const multilingualTopic = "🚀 深度仕事 (Deep Work) と時間管理の極意: Multi-tasking is a myth! 💻";
  const result = await mCultural.adaptOverseasTopic({ rawTopic: multilingualTopic });

  assert.equal(result.success, true);
  assert.ok(result.adaptedNote.title.length <= 20);
  assert.ok(result.adaptedNote.body.length > 20);
});

// ----------------------------------------------------------------------------
// Suite 2.2: R2 Boundaries
// ----------------------------------------------------------------------------

test("Tier 2 - R2.1: Disguised evasion words with symbols/homophones intercepted 100%", {
  skip: !mCompliance ? "Awaiting M2 complianceFirewall implementation" : false
}, () => {
  const evasivePatterns = [
    "全.网.第.一",
    "全_网_第_一",
    "全 网 第 一",
    "绝*对*保*证",
    "稳·赚·不·赔",
    "加_v_领_资_料",
    "微.信.私.聊",
    "加薇信领取",
    "日.赚.千.元"
  ];

  for (const text of evasivePatterns) {
    const evalRes = mCompliance.evaluateCompliance({ body: text });
    assert.equal(evalRes.passed, false, `Evasive text "${text}" must be caught`);
  }
});

test("Tier 2 - R2.2: Contextual false-positive stress test: 50 legitimate sentences achieve >= 98% safe pass rate", {
  skip: !mCompliance ? "Awaiting M2 complianceFirewall implementation" : false
}, () => {
  const legitimateSentences = [
    "做自媒体的第一步是找准受众痛点",
    "第一次做自媒体，不要害怕没人看",
    "第一天打卡复利成长计划",
    "第一时间回复读者的有效反馈",
    "遇到困难时的第一反应很重要",
    "成长分为三个阶段，这是第一阶段",
    "读书笔记第一期：搞钱思维",
    "翻开第一章，重新审视目标",
    "第一条原则：诚实面对自己的局限",
    "第一课：如何搭建个人知识库",
    "第一周复盘：执行力提升明显",
    "第一眼看到的往往只是表面",
    "感谢第一位给我点赞的读者",
    "第一人称叙事能增强真实感",
    "掌握一手信息的第一现场",
    "坚持第一性原理思考问题",
    "高考第一志愿的选择策略",
    "论文第一作者的学术态度",
    "给别人留下靠谱的第一印象",
    "赚到人生的第一桶金不是靠运气",
    "第一产业与现代服务业的结合",
    "天下第一泉趵突泉泉水清澈",
    "天下第一关山海关历史悠久",
    "天下第一奇山黄山归来不看岳",
    "天下第一楼的建筑艺术",
    "绝对值的几何意义是距离",
    "在代码中尽量使用绝对路径",
    "相对坐标与绝对坐标的转换",
    "拥有绝对音感是怎样的体验",
    "物理学中的绝对零度无法达到",
    "世界上没有绝对真理，只有不断逼近",
    "绝对误差与相对误差的计算方法",
    "CSS 中的绝对定位使用技巧",
    "绝对不能盲目跟风投资",
    "绝对不会轻易放弃长期目标",
    "这绝对不是简单的巧合",
    "今天最高气温达到32度",
    "珠穆朗玛峰是世界最高峰",
    "最高海拔处的植被变化",
    "最高人民法院发布指导性案例",
    "最高人民检察院工作报告解读",
    "设定每日工作时间的最高上限",
    "黄山国家级风景名胜区导览",
    "国家级自然保护区的生态价值",
    "顶级域名（TLD）的分类与注册",
    "方程存在唯一解的判定条件",
    "分布式系统中的唯一标识设计",
    "数据库中的唯一索引优化",
    "付出100%的努力去达成目标",
    "在微信读书上做深度划线与笔记"
  ];

  let passedCount = 0;
  const failedSentences = [];

  for (const sentence of legitimateSentences) {
    const res = mCompliance.evaluateCompliance({ body: sentence });
    if (res.passed) {
      passedCount++;
    } else {
      failedSentences.push({ sentence, violations: res.tier1Violations.concat(res.tier2Violations) });
    }
  }

  const passRate = passedCount / legitimateSentences.length;
  assert.ok(
    passRate >= 0.98,
    `Contextual safe pass rate was ${(passRate * 100).toFixed(1)}% (${passedCount}/${legitimateSentences.length}). Failed: ${JSON.stringify(failedSentences)}`
  );
});

test("Tier 2 - R2.3: Zero-length or null content evaluated safely without exceptions", {
  skip: !mCompliance ? "Awaiting M2 complianceFirewall implementation" : false
}, () => {
  assert.doesNotThrow(() => {
    const res = mCompliance.evaluateCompliance({});
    assert.equal(res.passed, true);
    assert.equal(res.riskLevel, "clean");
  });
  assert.doesNotThrow(() => {
    const res = mCompliance.evaluateCompliance(null);
    assert.equal(res.passed, true);
  });
});

test("Tier 2 - R2.4: Massive text payload (50,000+ chars) scanned efficiently within timeout limits", {
  skip: !mCompliance ? "Awaiting M2 complianceFirewall implementation" : false
}, () => {
  const cleanChunk = "认知思维的提升需要刻意练习与真实世界反馈。".repeat(1000);
  const start = Date.now();
  const res = mCompliance.evaluateCompliance({ body: cleanChunk });
  const duration = Date.now() - start;

  assert.equal(res.passed, true);
  assert.ok(duration < 2000, `Scanning 50,000 chars took ${duration}ms, must be < 2000ms`);
});

test("Tier 2 - R2.5: Mixed payload with clean body but subtle Tier 1 violation in slide note escalates to blocked", {
  skip: !mCompliance ? "Awaiting M2 complianceFirewall implementation" : false
}, () => {
  const pkg = {
    title: "自媒体成长心得",
    body: "坚持写作能够带来复利积累。",
    slides: [
      { role: "cover", title: "正常标题" },
      { role: "content", body: "正常内容" },
      { role: "note", note: "附录备注：本方法稳赚不赔！" }
    ]
  };

  const evalRes = mCompliance.evaluateCompliance(pkg);
  assert.equal(evalRes.passed, false);
  assert.equal(evalRes.riskLevel, "blocked");
  assert.ok(evalRes.tier1Violations.some((v) => v.includes("稳赚不赔")));
});

// ----------------------------------------------------------------------------
// Suite 2.3: R3 Boundaries
// ----------------------------------------------------------------------------

test("Tier 2 - R3.1: Active window boundaries (11:30, 13:30, 18:00, 20:30) evaluated precisely", {
  skip: !mScheduler ? "Awaiting M3 circadianScheduler implementation" : false
}, () => {
  // Exact active bounds
  const t1130 = new Date("2026-09-04T11:30:00+08:00");
  const t1330 = new Date("2026-09-04T13:30:00+08:00");
  const t1800 = new Date("2026-09-04T18:00:00+08:00");
  const t2030 = new Date("2026-09-04T20:30:00+08:00");

  assert.equal(mScheduler.evaluateCircadianWindow(t1130).allowed, true);
  assert.equal(mScheduler.evaluateCircadianWindow(t1330).allowed, true);
  assert.equal(mScheduler.evaluateCircadianWindow(t1800).allowed, true);
  assert.equal(mScheduler.evaluateCircadianWindow(t2030).allowed, true);

  // 1 minute outside bounds
  const t1129 = new Date("2026-09-04T11:29:00+08:00");
  const t1331 = new Date("2026-09-04T13:31:00+08:00");
  assert.equal(mScheduler.evaluateCircadianWindow(t1129).allowed, false);
  assert.equal(mScheduler.evaluateCircadianWindow(t1331).allowed, false);
});

test("Tier 2 - R3.2: Quiet hours boundary minutes (23:30, 02:00, 08:30, 09:00) evaluated precisely", {
  skip: !mScheduler ? "Awaiting M3 circadianScheduler implementation" : false
}, () => {
  const t2330 = new Date("2026-09-04T23:30:00+08:00");
  const t0200 = new Date("2026-09-04T02:00:00+08:00");
  const t0830 = new Date("2026-09-04T08:30:00+08:00");
  const t0900 = new Date("2026-09-04T09:00:00+08:00");

  assert.equal(mScheduler.evaluateCircadianWindow(t2330).isQuietHours, true);
  assert.equal(mScheduler.evaluateCircadianWindow(t0200).isQuietHours, true);
  assert.equal(mScheduler.evaluateCircadianWindow(t0830).isQuietHours, true);
  assert.equal(mScheduler.evaluateCircadianWindow(t0900).isQuietHours, false);
});

test("Tier 2 - R3.3: BioJitter boundary clamping prevents jittered time from escaping active window", {
  skip: !mScheduler ? "Awaiting M3 circadianScheduler implementation" : false
}, () => {
  // Near end of window: 20:25 (window ends at 20:30)
  const nearEnd = new Date("2026-09-04T20:25:00+08:00");
  const jitterRes = mScheduler.calculateBioJitter(nearEnd, { clampToActiveWindow: true });

  const windowEnd = new Date("2026-09-04T20:30:00+08:00");
  assert.ok(jitterRes.scheduledTime.getTime() <= windowEnd.getTime() + 60000, "Jittered time must not escape active window");
});

test("Tier 2 - R3.4: Vertical hashtag selection strictly clamped between 3 and 5", {
  skip: !mScheduler ? "Awaiting M3 circadianScheduler implementation" : false
}, () => {
  // 0 keywords supplied -> fallback to at least 3
  const tagsFew = mScheduler.selectVerticalHashtags({ keywords: [] });
  assert.ok(tagsFew.length >= 3 && tagsFew.length <= 5);

  // 20 keywords supplied -> clamped to maximum 5
  const tagsMany = mScheduler.selectVerticalHashtags({
    keywords: Array.from({ length: 20 }, (_, i) => `标签${i}`)
  });
  assert.ok(tagsMany.length >= 3 && tagsMany.length <= 5);
});

test("Tier 2 - R3.5: Empty or corrupted queue JSON file handled gracefully without crash", {
  skip: !mScheduler ? "Awaiting M3 circadianScheduler implementation" : false
}, async (t) => {
  const { dir, cleanup } = createIsolatedTestDir("queue-corrupt-");
  t.after(cleanup);

  const corruptFile = path.join(dir, "corrupt_queue.json");
  fs.writeFileSync(corruptFile, "{ invalid json content");

  const fn = mScheduler.processPublishQueue || mScheduler.processQueue;
  await assert.doesNotReject(async () => {
    await fn({ queuePath: corruptFile, gateMode: "manual_buffer" });
  });
});

// ----------------------------------------------------------------------------
// Suite 2.4: R4 Boundaries
// ----------------------------------------------------------------------------

test("Tier 2 - R4.1: Zero division safety handles 0 impressions / 0 views without NaN", {
  skip: !mLedger ? "Awaiting M4 learningLedger implementation" : false
}, () => {
  const diagnose = mLedger.diagnoseFunnel || mLedger.diagnosePerformance;
  const zeroRes = diagnose({ impressions: 0, views: 0, dwell_time: 0, likes: 0, collects: 0 });

  assert.ok(zeroRes);
  assert.equal(Number.isNaN(zeroRes.ctr), false);
  assert.equal(Number.isFinite(zeroRes.ctr || 0), true);
});

test("Tier 2 - R4.2: Negative or non-numeric metrics sanitized or rejected safely", {
  skip: !mLedger ? "Awaiting M4 learningLedger implementation" : false
}, () => {
  assert.throws(
    () => mLedger.recordCycleExperiment({
      cycleId: "test-neg",
      metrics: { impressions: -500, views: "invalid" }
    }),
    /metric|number|invalid/i
  );
});

test("Tier 2 - R4.3: Missing Learning Ledger directory auto-creates parent folders", {
  skip: !mLedger ? "Awaiting M4 learningLedger implementation" : false
}, (t) => {
  const { dir, cleanup } = createIsolatedTestDir("ledger-nested-");
  t.after(cleanup);

  const nestedLedger = path.join(dir, "deep", "nested", "ledger.jsonl");
  const res = mLedger.recordCycleExperiment({
    cycleId: "cycle-nested-01",
    variables: { topicHook: "contrarian" },
    metrics: { impressions: 1000, views: 100, dwell_time: 10, likes: 10, collects: 10, comments: 1, follows: 1, dms: 0, conversions_gmv: 0 }
  }, { ledgerPath: nestedLedger });

  assert.equal(res.persisted, true);
  assert.ok(fs.existsSync(nestedLedger));
});

test("Tier 2 - R4.4: Corrupted JSONL lines tolerated during ledger reading", {
  skip: !mLedger ? "Awaiting M4 learningLedger implementation" : false
}, (t) => {
  const { dir, cleanup } = createIsolatedTestDir("ledger-corrupt-");
  t.after(cleanup);

  const ledgerPath = path.join(dir, "ledger.jsonl");
  const validEntry = JSON.stringify({ cycleId: "c1", version: 1, next_strategy: { preferredHookFormulas: ["paradox"] } });
  fs.writeFileSync(ledgerPath, `not a valid json\n${validEntry}\n{ broken json\n`);

  const strategy = mLedger.getLatestStrategyVector({ ledgerPath });
  assert.ok(strategy);
});

test("Tier 2 - R4.5: Extreme metric outliers handled with robust funnel attribution", {
  skip: !mLedger ? "Awaiting M4 learningLedger implementation" : false
}, () => {
  const diagnose = mLedger.diagnoseFunnel || mLedger.diagnosePerformance;
  const extremeRes = diagnose({
    impressions: 10000000,
    views: 10,
    dwell_time: 2,
    likes: 0,
    collects: 0
  });

  assert.ok(extremeRes.bottleneck);
});

// ----------------------------------------------------------------------------
// Suite 2.5: R5 Boundaries
// ----------------------------------------------------------------------------

test("Tier 2 - R5.1: Minimal/empty founder profile generates at least 3 baseline valid IP proposals", {
  skip: !mIp ? "Awaiting M5 ipDiscovery implementation" : false
}, () => {
  const proposals = mIp.generateIPProposals({});
  assert.ok(Array.isArray(proposals));
  assert.ok(proposals.length >= 3);
});

test("Tier 2 - R5.2: Maximum length CTA text strictly prevented from overflowing slide card limits", {
  skip: !mIp ? "Awaiting M5 ipDiscovery implementation" : false
}, () => {
  const superLongPitch = "Very long book pitch description. ".repeat(50);
  const enhanced = mIp.injectMonetizationCTA({ title: "标题", body: "正文" }, "book", {
    bookTitle: "《长书名》",
    corePitch: superLongPitch
  });

  assert.ok(enhanced.ctaSlide.text.length <= 150);
});

test("Tier 2 - R5.3: Unknown or null CTA type falls back safely to default engagement hook", {
  skip: !mIp ? "Awaiting M5 ipDiscovery implementation" : false
}, () => {
  const enhanced = mIp.injectMonetizationCTA({ title: "标题", body: "正文" }, "unknown_type", {});
  assert.ok(enhanced.enhancedBody);
  assert.ok(enhanced.ctaSlide);
});

test("Tier 2 - R5.4: Idempotent CTA injection: injecting twice does not duplicate CTA slides", {
  skip: !mIp ? "Awaiting M5 ipDiscovery implementation" : false
}, () => {
  const first = mIp.injectMonetizationCTA({ title: "标题", body: "正文" }, "book", { bookTitle: "书1" });
  const second = mIp.injectMonetizationCTA(first, "book", { bookTitle: "书1" });

  assert.equal(second.ctaSlides?.length || 1, 1);
});

test("Tier 2 - R5.5: Special characters and emojis in monetization config preserved without escaping corruption", {
  skip: !mIp ? "Awaiting M5 ipDiscovery implementation" : false
}, () => {
  const config = {
    bookTitle: "《纳瓦尔宝典：财富与幸福指南》✨",
    corePitch: '“不要用时间换钱——用杠杆。”'
  };
  const enhanced = mIp.injectMonetizationCTA({ title: "标题", body: "正文" }, "book", config);
  assert.ok(enhanced.enhancedBody.includes("✨"));
  assert.ok(enhanced.enhancedBody.includes("杠杆"));
});

// ----------------------------------------------------------------------------
// Suite 2.6: R6 Boundaries
// ----------------------------------------------------------------------------

test("Tier 2 - R6.1: CostGuard when all coding workers are down requires human action cleanly", () => {
  const down = { status: "OFFLINE", available: false, billingMode: "subscription" };
  const r = applyCostGuard("auto", {
    codex: down, claude: down, antigravity: down, "grok-build": down, "grok-bot": down
  });
  assert.equal(r.ok, false);
  assert.equal(r.action, "HUMAN_ACTION_REQUIRED");
});

test("Tier 2 - R6.2: VerifyTask blocks deliverable paths outside project root (../outside.txt)", async () => {
  const r = await verifyTask({
    projectPath: process.cwd(),
    result: { ok: true, message: "done" },
    config: { dryRun: false, execution: { verificationTimeoutMs: 5000, maxOutputBytes: 1024 } },
    task: { acceptanceCriteria: [{ type: "file-exists", path: "../outside.txt" }] }
  });
  assert.equal(r.ok, false);
  assert.match(r.checks.at(-1).error, /escapes project/);
});

test("Tier 2 - R6.3: Reasoning Escalation handles missing task properties safely with default normal mode", () => {
  const evalEmpty = evaluateReasoningMode({});
  assert.equal(evalEmpty.reasoning_mode, "normal");
  assert.equal(evalEmpty.stop_for_review, false);
});

test("Tier 2 - R6.4: Boost verification strictly fails when deliverables touch sensitive config paths", async () => {
  const task = { id: "task-sens", title: "修改配置", risk_level: "medium" };
  const badResult = { ok: true, deliverables: ["src/store.js", "config/auth.json"] };
  const standardVerification = { ok: true, checks: [{ name: "file-exists:src/store.js", ok: true }] };

  const audit = await runBoostVerification({
    projectPath: process.cwd(),
    result: badResult,
    config: {},
    task,
    standardVerification
  });

  assert.equal(audit.ok, false);
  const scopeCheck = audit.boost_checks.find((c) => c.name === "scope_boundary");
  assert.equal(scopeCheck.ok, false);
});

test("Tier 2 - R6.5: VerifyTask command allowlist blocks commands with shell metacharacters", () => {
  assert.throws(
    () => normalizeAcceptanceCriteria([{ type: "command", command: "npm", args: ["test", "&", "whoami"] }]),
    /shell metacharacters/i
  );
  assert.throws(
    () => normalizeAcceptanceCriteria([{ type: "command", command: "powershell", args: [] }]),
    /not allowed/i
  );
});

// ============================================================================
// TIER 3: CROSS-FEATURE COMBINATIONS (Pairwise Interaction Tests)
// ============================================================================

test("Tier 3 - Combination 1 (R1 + R2): Adapted overseas topic automatically passes compliance firewall before packaging", {
  skip: (!mCultural || !mCompliance) ? "Awaiting M1 & M2 implementations" : false
}, async () => {
  const adapted = await mCultural.adaptOverseasTopic({
    rawTopic: "The Spotlight Effect: Why Nobody Is Actually Watching You"
  });

  assert.equal(adapted.success, true);
  const compliance = mCompliance.evaluateCompliance({
    title: adapted.adaptedNote.title,
    body: adapted.adaptedNote.body,
    tags: adapted.adaptedNote.tags,
    slides: adapted.adaptedNote.slidePlan
  });

  assert.equal(compliance.passed, true, "Culturally adapted output must be 100% compliant");
  assert.equal(compliance.riskLevel, "clean");
});

test("Tier 3 - Combination 2 (R1 + R3): Adapted note receives vertical hashtags and scheduled slot with BioJitter", {
  skip: (!mCultural || !mScheduler) ? "Awaiting M1 & M3 implementations" : false
}, async () => {
  const adapted = await mCultural.adaptOverseasTopic({
    rawTopic: "Dopamine Detox: How to reclaim your attention span"
  });

  const tags = mScheduler.selectVerticalHashtags({
    keywords: ["多巴胺", "自律", "注意力", "认知"],
    contentText: adapted.adaptedNote.body
  });
  assert.ok(tags.length >= 3 && tags.length <= 5);

  const eveningWindow = new Date("2026-09-04T19:30:00+08:00");
  const jittered = mScheduler.calculateBioJitter(eveningWindow);
  assert.ok(jittered.scheduledTime instanceof Date);
});

test("Tier 3 - Combination 3 (R1 + R5): Culturally adapted content seamlessly integrates personal IP framing and CTA", {
  skip: (!mCultural || !mIp) ? "Awaiting M1 & M5 implementations" : false
}, async () => {
  const adapted = await mCultural.adaptOverseasTopic({
    rawTopic: "Compounding: The hidden force behind solopreneur success"
  });

  const monetized = mIp.injectMonetizationCTA(adapted.adaptedNote, "book", {
    bookTitle: "《纳瓦尔宝典》",
    corePitch: "建立属于你自己的认知复利飞轮。"
  });

  assert.ok(monetized.enhancedBody.includes("《纳瓦尔宝典》"));
  assert.ok(monetized.ctaSlide);
});

test("Tier 3 - Combination 4 (R4 + R1): Strategy vector updated by Learning Ledger directly shapes subsequent R1 hook selection", {
  skip: (!mCultural || !mLedger) ? "Awaiting M1 & M4 implementations" : false
}, async () => {
  // Strategy vector specifies preference for 'paradox' hook formula
  const strategyOverrides = {
    preferredHookFormulas: ["paradox"],
    targetPersona: "20-30岁高内耗年轻人"
  };

  const adapted = await mCultural.adaptOverseasTopic({
    rawTopic: "Procrastination and fear of failure",
    strategyOverrides
  });

  assert.equal(adapted.adaptedNote.hookType, "paradox");
});

test("Tier 3 - Combination 5 (R2 + R3): Only notes with 100% compliance pass certification can be released by Circadian Scheduler", {
  skip: (!mCompliance || !mScheduler) ? "Awaiting M2 & M3 implementations" : false
}, async (t) => {
  const { dir, cleanup } = createIsolatedTestDir("sched-compliance-");
  t.after(cleanup);

  const cleanNote = { id: "clean-1", title: "合规笔记", body: "合规内容" };
  const dirtyNote = { id: "dirty-1", title: "违规笔记", body: "加微信免费领资料，全网第一稳赚不赔！" };

  const cleanEval = mCompliance.evaluateCompliance(cleanNote);
  const dirtyEval = mCompliance.evaluateCompliance(dirtyNote);

  assert.equal(cleanEval.passed, true);
  assert.equal(dirtyEval.passed, false);

  const queueFile = path.join(dir, "queue.json");
  fs.writeFileSync(queueFile, JSON.stringify([
    { ...cleanNote, compliancePassed: cleanEval.passed },
    { ...dirtyNote, compliancePassed: dirtyEval.passed }
  ]));

  const fn = mScheduler.processPublishQueue || mScheduler.processQueue;
  const result = await fn({ queuePath: queueFile, gateMode: "auto" });

  // Dirty note must be skipped or rejected, never released
  const releasedIds = (result.released || []).map((i) => i.id);
  assert.ok(!releasedIds.includes("dirty-1"), "Dirty note must never be released to publish");
});

test("Tier 3 - Combination 6 (R4 + R5): Conversion feedback metrics from Learning Ledger dynamically rank IP proposals", {
  skip: (!mLedger || !mIp) ? "Awaiting M4 & M5 implementations" : false
}, () => {
  const proposals = mIp.generateIPProposals({ founderBackground: "Knowledge creator" });
  assert.ok(proposals.length >= 3);

  // When rankIPProposals exists, verify metric ranking
  if (typeof mIp.rankIPProposals === "function") {
    const historicalMetrics = {
      "认知搞钱": { conversionRate: 0.08, revenue: 15000 },
      "职场自救": { conversionRate: 0.03, revenue: 3000 }
    };
    const ranked = mIp.rankIPProposals(proposals, historicalMetrics);
    assert.ok(ranked[0].personaTitle.includes("搞钱") || ranked[0].score > ranked[1].score);
  }
});

// ============================================================================
// TIER 4: REAL-WORLD APPLICATION SCENARIOS (End-to-End Realistic Workflows)
// ============================================================================

test("Tier 4 - Scenario 1: Overseas Viral Post -> Netizen Translation -> Hook -> Compliance -> 20:00 Schedule -> Package", {
  skip: (!mCultural || !mCompliance || !mScheduler) ? "Awaiting M1, M2 & M3 implementations" : false
}, async () => {
  // 1. Ingestion of viral post
  const rawTopic = "The Spotlight Effect: Why Nobody Is Actually Watching You In Modern Life";
  const adaptation = await mCultural.adaptOverseasTopic({
    rawTopic,
    sourceUrl: "https://x.com/naval/status/987654321",
    metrics: { likes: 32000, retweets: 8500 }
  });

  assert.equal(adaptation.success, true);
  const note = adaptation.adaptedNote;
  assert.ok(note.title.length <= 20);
  assert.ok(note.zeroMtScore >= 0.85);

  // 2. Compliance Evaluation
  const compliance = mCompliance.evaluateCompliance({
    title: note.title,
    body: note.body,
    tags: note.tags,
    slides: note.slidePlan
  });
  assert.equal(compliance.passed, true);
  assert.equal(compliance.riskLevel, "clean");

  // 3. 20:00 Scheduling with BioJitter
  const primeTime = new Date("2026-09-04T20:00:00+08:00");
  const jittered = mScheduler.calculateBioJitter(primeTime);
  const windowCheck = mScheduler.evaluateCircadianWindow(jittered.scheduledTime);
  assert.equal(windowCheck.allowed, true);

  // 4. Vertical Hashtags
  const tags = mScheduler.selectVerticalHashtags({
    keywords: ["认知思维", "自我提升", "停止内耗"],
    contentText: note.body
  });
  assert.ok(tags.length >= 3 && tags.length <= 5);

  // 5. Package Content Metadata
  const finalPkg = mCultural.packageContentMetadata({
    title: note.title,
    body: note.body,
    tags,
    slidePlan: note.slidePlan
  });
  assert.ok(finalPkg.formattedCaption.includes("# 标题"));
  assert.ok(finalPkg.formattedCaption.includes("# 正文"));
});

test("Tier 4 - Scenario 2: Personal IP Exploration -> Select Positioning -> Pluggable Book CTA -> Manual Buffer Gate", {
  skip: (!mCultural || !mCompliance || !mScheduler || !mIp) ? "Awaiting M1, M2, M3 & M5 implementations" : false
}, async (t) => {
  const { dir, cleanup } = createIsolatedTestDir("scenario-2-");
  t.after(cleanup);

  // 1. Generate 3 IP proposals
  const proposals = mIp.generateIPProposals({
    founderBackground: "Tech Founder exploring solopreneurship",
    strengths: ["systems thinking", "business models"]
  });
  assert.ok(proposals.length >= 3);
  const selectedProposal = proposals[0];

  // 2. Produce note matching selected IP
  const adaptation = await mCultural.adaptOverseasTopic({
    rawTopic: "Compounding: The hidden force of long-term leverage",
    strategyOverrides: { targetPersona: selectedProposal.targetAudience }
  });

  // 3. Inject Book CTA
  const monetized = mIp.injectMonetizationCTA(adaptation.adaptedNote, "book", {
    bookTitle: "《纳瓦尔宝典》",
    corePitch: "构建属于你自己的专长与杠杆。"
  });

  // 4. Compliance check
  const compliance = mCompliance.evaluateCompliance({
    title: monetized.title || adaptation.adaptedNote.title,
    body: monetized.enhancedBody,
    slides: [monetized.ctaSlide]
  });
  assert.equal(compliance.passed, true);

  // 5. Hold in Manual Buffer Gate pending founder approval
  const queueFile = path.join(dir, "queue.json");
  fs.writeFileSync(queueFile, JSON.stringify([
    { id: "ip-note-1", title: adaptation.adaptedNote.title, body: monetized.enhancedBody, status: "ready" }
  ]));

  const fn = mScheduler.processPublishQueue || mScheduler.processQueue;
  const queueResult = await fn({ queuePath: queueFile, gateMode: "manual_buffer" });
  assert.ok(queueResult.buffered?.length > 0 || queueResult.held?.length > 0);
});

test("Tier 4 - Scenario 3: Real 9-Metric Performance Feedback -> Funnel Diagnosis -> Strategy Vector -> Next Content Run", {
  skip: (!mCultural || !mLedger) ? "Awaiting M1 & M4 implementations" : false
}, async (t) => {
  const { dir, cleanup } = createIsolatedTestDir("scenario-3-");
  t.after(cleanup);

  const ledgerPath = path.join(dir, "ledger.jsonl");

  // 1. Record completed cycle with low click bottleneck (CTR < 3%)
  const cycleRecord = mLedger.recordCycleExperiment({
    cycleId: "cycle-live-101",
    variables: { topicHook: "confession", coverLayout: "simple_text" },
    metrics: {
      impressions: 45000,
      views: 900, // CTR = 2% (low click!)
      dwell_time: 45,
      likes: 210,
      collects: 300,
      comments: 40,
      follows: 35,
      dms: 5,
      conversions_gmv: 120
    }
  }, { ledgerPath });

  assert.equal(cycleRecord.persisted, true);

  // 2. Verify funnel diagnosis and strategy update
  const updatedStrategy = mLedger.getLatestStrategyVector({ ledgerPath });
  assert.ok(updatedStrategy);

  // 3. Next content generation consumes updated strategy vector
  const nextNote = await mCultural.adaptOverseasTopic({
    rawTopic: "The Spotlight Effect: Why nobody is watching you",
    strategyOverrides: updatedStrategy
  });

  assert.equal(nextNote.success, true);
  assert.ok(nextNote.adaptedNote.title.length <= 20);
});

test("Tier 4 - Scenario 4: Adversarial Input with Disguised Ad Law & WeChat Diversion -> 100% Intercept -> Zero Leakage", {
  skip: (!mCompliance || !mScheduler) ? "Awaiting M2 & M3 implementations" : false
}, async (t) => {
  const { dir, cleanup } = createIsolatedTestDir("scenario-4-");
  t.after(cleanup);

  const adversarialPost = {
    title: "全.网.第.一保·本稳赚神器",
    body: "独家首发！100%包过退费！加_v领取极品资料，扫码转账即可享受国家级服务！",
    tags: ["#搞钱", "#加微"]
  };

  // 1. Evaluate compliance
  const auditPath = path.join(dir, "audit_log.jsonl");
  const compEval = mCompliance.evaluateCompliance(adversarialPost, { recordLog: true, auditPath });

  assert.equal(compEval.passed, false);
  assert.equal(compEval.riskLevel, "blocked");
  assert.ok(compEval.tier1Violations.length >= 2);
  assert.ok(compEval.tier2Violations.length >= 2);

  // 2. Verify audit trail persisted
  assert.ok(fs.existsSync(auditPath));
  const logContent = fs.readFileSync(auditPath, "utf8");
  assert.ok(logContent.includes("blocked"));

  // 3. Verify queue refusal
  const queueFile = path.join(dir, "queue.json");
  fs.writeFileSync(queueFile, JSON.stringify([
    { id: "adv-1", compliancePassed: false, title: adversarialPost.title }
  ]));

  const fn = mScheduler.processPublishQueue || mScheduler.processQueue;
  const queueResult = await fn({ queuePath: queueFile, gateMode: "auto" });
  assert.ok(!queueResult.released?.some((r) => r.id === "adv-1"), "Adversarial post must never be released");
});

test("Tier 4 - Scenario 5 (Founder Directive): Fact-Checking & Mythbusting Workflow with Tweet Screenshot & Badges", {
  skip: (!mCultural?.factCheckAndAnnotate || !mCompliance) ? "Awaiting M1 factCheckAndAnnotate implementation" : false
}, async () => {
  // 1. Ingest overseas tweet with 8 claims
  const rawClaims = [
    "坚持早起5点打卡能让你收入翻倍",
    "番茄工作法单核冲刺可大幅提升专注度",
    "冷水澡可以彻底根治抑郁与焦虑",
    "缩短任务截止时间倒逼帕金森效率爆发",
    "普通人每天喝特制排毒果汁能年轻10岁",
    "建立个人知识库可复利沉淀认知资产",
    "只要开启多任务并行就能节省50%工作时间",
    "深呼吸冥想能有效抑制社交聚光灯效应"
  ];

  const fc = mCultural.factCheckAndAnnotate({
    rawClaims,
    originalTweetMedia: { type: "tweet_screenshot", path: "assets/x_original_tweet.png" }
  });

  // 2. Validate 3-tier rating distribution
  assert.equal(fc.summary.total, 8);
  assert.ok(fc.summary.validCount > 0);
  assert.ok(fc.summary.questionableCount > 0);
  assert.ok(fc.summary.debunkedCount > 0);

  // 3. Generate Fact-Check Note package
  const note = await mCultural.adaptOverseasTopic({
    rawTopic: "8 Viral Life Hacks from X Examined",
    rawClaims,
    factCheck: true
  });

  assert.equal(note.success, true);
  assert.ok(note.adaptedNote.title.length <= 20);
  assert.ok(note.adaptedNote.body.includes("❌ 伪科学") || note.adaptedNote.body.includes("评级总结"));
  assert.ok(note.adaptedNote.body.includes("作者置顶自查清单"));

  // 4. Slide Plan contains preserved tweet screenshot and debunking cards
  const slideRoles = note.adaptedNote.slidePlan.map((s) => s.role);
  assert.ok(slideRoles.includes("original_tweet"));
  assert.ok(slideRoles.includes("debunk_card") || slideRoles.includes("valid_card"));

  // 5. Compliance evaluation
  const compliance = mCompliance.evaluateCompliance({
    title: note.adaptedNote.title,
    body: note.adaptedNote.body,
    slides: note.adaptedNote.slidePlan
  });
  assert.equal(compliance.passed, true);
});
