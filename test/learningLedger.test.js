import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";

import {
  METRIC_NAMES,
  DEFAULT_BASELINES,
  FUNNEL_STAGES,
  DEFAULT_STRATEGY_VECTOR,
  validateAndNormalizeMetrics,
  diagnoseFunnel,
  diagnosePerformance,
  deconstructPeerNote,
  dissectPeerHitNotes,
  recordCycleExperiment,
  getLatestStrategyVector,
  getCurrentStrategy,
  applyFeedbackToTopicSelection
} from "../src/autonomous_content/learningLedger.js";

function createTempDir(prefix = "ledger-unit-") {
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
// 1. Metric Validation & Normalization
// ============================================================================

test("validateAndNormalizeMetrics normalizes all 9 metrics with aliases and zero-division protection", () => {
  const input = {
    impressions: 10000,
    clicks: 800,
    avgStaySeconds: 35,
    likes: 120,
    saves: 90,
    comments: 25,
    followersGained: 15,
    dms: 5,
    gmv: 450
  };

  const norm = validateAndNormalizeMetrics(input);

  assert.equal(norm.impressions, 10000);
  assert.equal(norm.views, 800);
  assert.equal(norm.clicks, 800);
  assert.equal(norm.dwell_time, 35);
  assert.equal(norm.avgStaySeconds, 35);
  assert.equal(norm.likes, 120);
  assert.equal(norm.collects, 90);
  assert.equal(norm.saves, 90);
  assert.equal(norm.comments, 25);
  assert.equal(norm.follows, 15);
  assert.equal(norm.followersGained, 15);
  assert.equal(norm.dms, 5);
  assert.equal(norm.conversions_gmv, 450);
  assert.equal(norm.conversions, 450);

  // Ratios
  assert.equal(norm.ctr, 800 / 10000); // 0.08
  assert.equal(norm.saveRate, 90 / 800); // 0.1125
  assert.equal(norm.engagementRate, (120 + 90 + 25) / 800);
  assert.equal(norm.followRate, 15 / 800);
  assert.equal(norm.conversionRate, 450 / 800);
});

test("validateAndNormalizeMetrics handles 0 impressions and 0 views without NaN or Infinity", () => {
  const norm = validateAndNormalizeMetrics({
    impressions: 0,
    views: 0,
    dwell_time: 0,
    likes: 0,
    collects: 0,
    comments: 0,
    follows: 0,
    dms: 0,
    conversions_gmv: 0
  });

  assert.equal(norm.impressions, 0);
  assert.equal(Number.isNaN(norm.ctr), false);
  assert.equal(Number.isFinite(norm.ctr), true);
  assert.equal(norm.ctr, 0);
  assert.equal(norm.saveRate, 0);
  assert.equal(norm.engagementRate, 0);
  assert.equal(norm.followRate, 0);
  assert.equal(norm.conversionRate, 0);
});

test("validateAndNormalizeMetrics strictly rejects negative, NaN, non-finite, and string metrics", () => {
  assert.throws(() => validateAndNormalizeMetrics({ impressions: -100 }), /metric|number|invalid/i);
  assert.throws(() => validateAndNormalizeMetrics({ views: "invalid" }), /metric|number|invalid/i);
  assert.throws(() => validateAndNormalizeMetrics({ likes: NaN }), /metric|number|invalid/i);
  assert.throws(() => validateAndNormalizeMetrics({ collects: Infinity }), /metric|number|invalid/i);
  assert.throws(() => validateAndNormalizeMetrics(null), /object/i);
  assert.throws(() => validateAndNormalizeMetrics("not an object"), /object/i);
});

// ============================================================================
// 2. Deterministic Funnel Diagnosis (CARD 14)
// ============================================================================

test("diagnoseFunnel: accurately diagnoses low_exposure stage", () => {
  const diag = diagnoseFunnel({ impressions: 500, views: 50, dwell_time: 20 });
  assert.equal(diag.stage, FUNNEL_STAGES.LOW_EXPOSURE);
  assert.ok(diag.bottleneck.includes("low_exposure"));
  assert.ok(diag.card14Rule.includes("曝光低"));
  assert.ok(diag.checks.includes("选题吸引力"));
});

test("diagnoseFunnel: accurately diagnoses low_click stage (high impressions + low clicks)", () => {
  const diag = diagnoseFunnel({ impressions: 50000, views: 500, dwell_time: 40, likes: 50, collects: 50 });
  assert.equal(diag.stage, FUNNEL_STAGES.LOW_CLICK);
  assert.ok(diag.bottleneck.includes("click") || diag.bottleneck.includes("cover"));
  assert.ok(diag.checks.includes("前3秒Hook标题"));
  assert.equal(diag.verdict, "underperformed");
});

test("diagnoseFunnel: accurately diagnoses low_read stage (high clicks + low dwell)", () => {
  const diag = diagnoseFunnel({ impressions: 10000, views: 2500, dwell_time: 5, likes: 20, collects: 10 });
  assert.equal(diag.stage, FUNNEL_STAGES.LOW_READ);
  assert.ok(diag.bottleneck.includes("read") || diag.bottleneck.includes("dwell"));
  assert.ok(diag.checks.some((c) => c.includes("CARD 07")));
  assert.equal(diag.verdict, "underperformed");
});

test("diagnoseFunnel: accurately diagnoses low_save stage (high reads + low collects)", () => {
  const diag = diagnoseFunnel({ impressions: 10000, views: 2500, dwell_time: 50, likes: 300, collects: 5 });
  assert.equal(diag.stage, FUNNEL_STAGES.LOW_SAVE);
  assert.ok(diag.bottleneck.includes("collect") || diag.bottleneck.includes("save"));
  assert.ok(diag.checks.some((c) => c.includes("清单")));
  assert.equal(diag.verdict, "underperformed");
});

test("diagnoseFunnel: accurately diagnoses low_follow stage (good engagement + low follow)", () => {
  const diag = diagnoseFunnel({
    impressions: 10000,
    views: 1200,
    dwell_time: 30,
    likes: 150,
    collects: 180,
    follows: 2
  });
  assert.equal(diag.stage, FUNNEL_STAGES.LOW_FOLLOW);
  assert.ok(diag.bottleneck.includes("follow"));
  assert.ok(diag.checks.some((c) => c.includes("主页定位")));
});

test("diagnoseFunnel: accurately diagnoses healthy stage when all thresholds are met", () => {
  const diag = diagnoseFunnel({
    impressions: 20000,
    views: 2000, // CTR: 10%
    dwell_time: 45, // 45s
    likes: 300,
    collects: 250, // Save rate: 12.5%
    comments: 50,
    follows: 40, // Follow rate: 2%
    dms: 10,
    conversions_gmv: 350
  });

  assert.equal(diag.stage, FUNNEL_STAGES.HEALTHY);
  assert.equal(diag.verdict, "outperformed");
  assert.ok(diag.bottleneck.includes("healthy"));
});

// ============================================================================
// 3. Competitor Note Deconstruction (Peer Learning)
// ============================================================================

test("deconstructPeerNote extracts paradox / anti-common-sense hook formula", () => {
  const note = {
    title: "为什么越聪明的人反而越容易精神内耗？",
    body: "很多人以为内耗是因为想太多，底层其实是对不确定性的过度防御。提供3个行动方案：第一步设定止损线...",
    metrics: { likes: 25000, collects: 38000 }
  };

  const dec = deconstructPeerNote(note);
  assert.equal(dec.hookType, "paradox");
  assert.ok(dec.hookFormula.includes("paradox") || dec.hookFormula.includes("反常识"));
  assert.ok(dec.structure.openingHook);
  assert.ok(dec.structure.actionSteps.length > 0);
  assert.ok(dec.visualHighlights.length >= 3);
});

test("deconstructPeerNote identifies fact-checking mythbusting formula", () => {
  const note = {
    title: "外网疯传的8条高效习惯，我查了资料：只有4条是真的！",
    body: "最近这篇推文爆火。我逐条查证了论文：第一条早起5点是噱头，第二条番茄工作法确实有效...",
    metrics: { likes: 45000, collects: 52000 }
  };

  const dec = deconstructPeerNote(note);
  assert.equal(dec.hookType, "fact_check");
  assert.ok(dec.hookFormula.includes("fact_check"));
});

test("dissectPeerHitNotes handles array of peer notes", () => {
  const notes = [
    { title: "为什么努力没有结果？", body: "底层认知逻辑..." },
    { title: "普通人逆袭的3张认知清单", body: "第一张清单..." }
  ];

  const results = dissectPeerHitNotes(notes);
  assert.equal(results.length, 2);
  assert.ok(results[0].hookFormula);
  assert.ok(results[1].hookFormula);
});

// ============================================================================
// 4. Learning Ledger Persistence & Strategy Retrieval
// ============================================================================

test("recordCycleExperiment appends structured entry to ledger and updates strategy file", (t) => {
  const { dir, cleanup } = createTempDir("exp-");
  t.after(cleanup);

  const ledgerPath = path.join(dir, "sub", "ledger.jsonl");
  const strategyPath = path.join(dir, "sub", "current_strategy.json");

  const cycleData = {
    cycleId: "test-cycle-001",
    noteId: "note-abc",
    variables: {
      topicHook: "paradox",
      coverLayout: "minimalist_black",
      ctaHook: "book_recommendation"
    },
    metrics: {
      impressions: 15000,
      views: 1500, // CTR: 10%
      dwell_time: 40,
      likes: 200,
      collects: 300,
      comments: 40,
      follows: 30,
      dms: 8,
      conversions_gmv: 500
    }
  };

  const result = recordCycleExperiment(cycleData, { ledgerPath, strategyPath });

  assert.equal(result.persisted, true);
  assert.ok(result.ledgerEntry);
  assert.equal(result.ledgerEntry.cycleId, "test-cycle-001");
  assert.equal(result.ledgerEntry.metrics.impressions, 15000);
  assert.equal(result.ledgerEntry.metrics.conversions_gmv, 500);
  assert.ok(result.ledgerEntry.conclusions);
  assert.ok(result.ledgerEntry.next_strategy);

  // File assertions
  assert.ok(fs.existsSync(ledgerPath));
  assert.ok(fs.existsSync(strategyPath));

  const ledgerContent = fs.readFileSync(ledgerPath, "utf8").trim();
  const parsed = JSON.parse(ledgerContent);
  assert.equal(parsed.cycleId, "test-cycle-001");

  const strategyContent = JSON.parse(fs.readFileSync(strategyPath, "utf8"));
  assert.ok(strategyContent.preferredHookFormulas.includes("paradox"));
});

test("getLatestStrategyVector gracefully tolerates corrupted lines in ledger", (t) => {
  const { dir, cleanup } = createTempDir("corrupt-");
  t.after(cleanup);

  const ledgerPath = path.join(dir, "ledger.jsonl");
  const corrupted = [
    "invalid json line",
    JSON.stringify({
      cycleId: "c-old",
      next_strategy: { version: 2, preferredHookFormulas: ["actionable_list"] }
    }),
    "{ broken { json line",
    JSON.stringify({
      cycleId: "c-latest",
      next_strategy: { version: 3, preferredHookFormulas: ["paradox", "fact_check"] }
    })
  ].join("\n");

  fs.writeFileSync(ledgerPath, corrupted);

  const strategy = getLatestStrategyVector({ ledgerPath });
  assert.ok(strategy);
  assert.equal(strategy.version, 3);
  assert.deepEqual(strategy.preferredHookFormulas, ["paradox", "fact_check"]);
});

// ============================================================================
// 5. Closed-Loop Consumption: Topic Selection Feedback
// ============================================================================

test("applyFeedbackToTopicSelection prioritizes topics matching active strategy vector", () => {
  const candidates = [
    { title: "普通提问型选题", hookType: "curiosity", topic: "general", score: 1.0 },
    { title: "反常识认知选题", hookType: "paradox", topic: "cognitive_growth", score: 1.0 },
    { title: "实操清单型选题", hookType: "actionable_list", topic: "solopreneur", score: 1.0 }
  ];

  const strategyVector = {
    version: 4,
    preferredHookFormulas: ["paradox", "actionable_list"],
    topicWeights: { cognitive_growth: 1.3, solopreneur: 1.1 }
  };

  const ranked = applyFeedbackToTopicSelection(candidates, strategyVector);

  assert.equal(ranked.length, 3);
  // The paradox + cognitive_growth candidate should rank first
  assert.equal(ranked[0].hookType, "paradox");
  assert.ok(ranked[0].adjustedScore > ranked[1].adjustedScore);
  assert.ok(ranked[0].adjustedScore > ranked[2].adjustedScore);
  assert.ok(ranked[0].feedbackApplied);
  assert.ok(ranked[0].attributionNotes.includes("paradox"));
});
