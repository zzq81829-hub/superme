/**
 * Test Suite: Autonomous Content Unified Facade & Pipeline Engine
 *
 * Validates:
 * - Re-exports of all 5 submodules (namespaces and named functions)
 * - runAutonomousContentPipeline end-to-end execution
 * - Compliance interception and quarantined package handling
 * - Fact-checking mode integration with ratings and checklists
 * - Monetization CTA injection across types (book, toolkit, consultation)
 * - Circadian scheduling with BioJitter and hashtag assignment
 * - Dual gate modes (auto vs manual_buffer)
 * - recordPostPublicationFeedback closed-loop learning integration
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";

import facade, {
  runAutonomousContentPipeline,
  recordPostPublicationFeedback,
  culturalAdaptation,
  complianceFirewall,
  circadianScheduler,
  learningLedger,
  ipDiscovery,
  adaptOverseasTopic,
  evaluateCompliance,
  calculateBioJitter,
  selectVerticalHashtags,
  getLatestStrategyVector,
  generateIPProposals,
  injectMonetizationCTA
} from "../src/autonomous_content/index.js";

function createIsolatedTestDir(prefix = "facade-test-") {
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

test("Facade: Re-exports all submodule namespaces and core functions", () => {
  assert.ok(facade);
  assert.ok(culturalAdaptation);
  assert.ok(complianceFirewall);
  assert.ok(circadianScheduler);
  assert.ok(learningLedger);
  assert.ok(ipDiscovery);

  assert.equal(typeof adaptOverseasTopic, "function");
  assert.equal(typeof evaluateCompliance, "function");
  assert.equal(typeof calculateBioJitter, "function");
  assert.equal(typeof selectVerticalHashtags, "function");
  assert.equal(typeof getLatestStrategyVector, "function");
  assert.equal(typeof generateIPProposals, "function");
  assert.equal(typeof injectMonetizationCTA, "function");
  assert.equal(typeof runAutonomousContentPipeline, "function");
  assert.equal(typeof recordPostPublicationFeedback, "function");
});

test("Facade: runAutonomousContentPipeline executes end-to-end compliant flow", async (t) => {
  const { dir, cleanup } = createIsolatedTestDir("facade-pipe-");
  t.after(cleanup);

  const queuePath = path.join(dir, "queue.json");
  const auditPath = path.join(dir, "audit_log.jsonl");
  const ledgerPath = path.join(dir, "ledger.jsonl");

  const result = await runAutonomousContentPipeline({
    rawTopic: "The Spotlight Effect: Why nobody is watching you in modern life",
    sourceUrl: "https://x.com/naval/status/123456",
    metrics: { likes: 10000, retweets: 2000 },
    ctaType: "book",
    ctaConfig: { bookTitle: "《纳瓦尔宝典》", corePitch: "学会用专长和杠杆创造财富。" },
    gateMode: "manual_buffer",
    now: new Date("2026-09-04T12:00:00+08:00"), // Active lunch window
    queuePath,
    auditPath,
    ledgerPath
  });

  assert.equal(result.success, true);
  assert.equal(result.pipelineStep, "completed");

  // Adapted note assertions
  assert.ok(result.adaptedNote);
  assert.ok(result.adaptedNote.title);
  assert.ok(result.adaptedNote.title.length <= 20);
  assert.ok(result.adaptedNote.zeroMtScore >= 0.85);
  assert.ok(result.adaptedNote.body.includes("《纳瓦尔宝典》"));
  assert.ok(Array.isArray(result.adaptedNote.tags));
  assert.ok(result.adaptedNote.tags.length >= 3 && result.adaptedNote.tags.length <= 5);

  // Compliance assertions
  assert.ok(result.complianceResult);
  assert.equal(result.complianceResult.passed, true);
  assert.equal(result.complianceResult.riskLevel, "clean");

  // Audit log assertions
  assert.ok(result.auditLog);
  assert.ok(fs.existsSync(auditPath));

  // Schedule assertions
  assert.ok(result.scheduleResult);
  assert.ok(result.scheduleResult.scheduledTime);
  assert.ok(Math.abs(result.scheduleResult.jitterMinutes) >= 15);
  assert.ok(fs.existsSync(queuePath));
});

test("Facade: runAutonomousContentPipeline quarantines compliant-failing or high-risk content", async (t) => {
  const { dir, cleanup } = createIsolatedTestDir("facade-quarantine-");
  t.after(cleanup);

  const queuePath = path.join(dir, "queue.json");
  const auditPath = path.join(dir, "audit_log.jsonl");

  const result = await runAutonomousContentPipeline({
    rawTopic: "全网第一保本稳赚神器，加微领特大机密",
    ctaType: "book",
    queuePath,
    auditPath
  });

  assert.equal(result.success, false);
  assert.equal(result.pipelineStep, "compliance_firewall");
  assert.ok(result.quarantinedPackage);
  assert.equal(result.quarantinedPackage.status, "quarantined");
  assert.ok(result.complianceResult);
  assert.equal(result.complianceResult.passed, false);

  // Audit log must be persisted
  assert.ok(fs.existsSync(auditPath));
  const logContent = fs.readFileSync(auditPath, "utf8");
  assert.ok(logContent.includes("blocked") || logContent.includes("quarantine"));

  // Must not be scheduled in queue
  if (fs.existsSync(queuePath)) {
    const queueData = JSON.parse(fs.readFileSync(queuePath, "utf8"));
    assert.equal(queueData.length, 0);
  }
});

test("Facade: runAutonomousContentPipeline fact-check mode produces 3-tier ratings and pinned checklist", async (t) => {
  const { dir, cleanup } = createIsolatedTestDir("facade-factcheck-");
  t.after(cleanup);

  const queuePath = path.join(dir, "queue.json");
  const auditPath = path.join(dir, "audit_log.jsonl");

  const rawClaims = [
    "坚持早起5点打卡能让你收入翻倍",
    "番茄工作法单核冲刺可大幅提升专注度",
    "普通人每天喝特制排毒果汁能年轻10岁"
  ];

  const result = await runAutonomousContentPipeline({
    rawTopic: "外网疯传的3条效率与健康建议求证打假",
    rawClaims,
    factCheck: true,
    gateMode: "manual_buffer",
    now: new Date("2026-09-04T19:00:00+08:00"),
    queuePath,
    auditPath
  });

  assert.equal(result.success, true);
  assert.ok(result.adaptedNote.body.includes("作者置顶自查清单"));
  assert.ok(result.adaptedNote.body.includes("✅") || result.adaptedNote.body.includes("❌"));
});

test("Facade: recordPostPublicationFeedback persists cycle metrics to ledger and updates strategy", (t) => {
  const { dir, cleanup } = createIsolatedTestDir("facade-feedback-");
  t.after(cleanup);

  const ledgerPath = path.join(dir, "ledger.jsonl");
  const strategyPath = path.join(dir, "strategy.json");

  const feedbackRes = recordPostPublicationFeedback({
    cycleId: "cycle-feedback-999",
    noteId: "note-live-123",
    variables: {
      topicHook: "paradox",
      coverLayout: "bold_contrast"
    },
    metrics: {
      impressions: 25000,
      views: 3500, // CTR = 14% (strong click!)
      dwell_time: 48,
      likes: 520,
      collects: 680,
      comments: 65,
      follows: 110,
      dms: 18,
      conversions_gmv: 450
    },
    options: {
      ledgerPath,
      strategyPath
    }
  });

  assert.equal(feedbackRes.persisted, true);
  assert.ok(fs.existsSync(ledgerPath));

  const updatedStrategy = getLatestStrategyVector({ ledgerPath });
  assert.ok(updatedStrategy);
  assert.ok(Array.isArray(updatedStrategy.preferredHookFormulas));
});

test("Facade: runAutonomousContentPipeline validates invalid inputs", async () => {
  await assert.rejects(
    async () => runAutonomousContentPipeline(null),
    /requires an options object/
  );

  await assert.rejects(
    async () => runAutonomousContentPipeline({}),
    /rawTopic must be a non-empty string/
  );

  await assert.rejects(
    async () => runAutonomousContentPipeline({ rawTopic: "   " }),
    /rawTopic must be a non-empty string/
  );
});

test("Facade: runAutonomousContentPipeline supports toolkit and consultation monetization CTAs", async (t) => {
  const { dir, cleanup } = createIsolatedTestDir("facade-cta-");
  t.after(cleanup);

  // Toolkit CTA
  const toolkitRes = await runAutonomousContentPipeline({
    rawTopic: "Deep Work: How to focus without distraction",
    ctaType: "toolkit",
    ctaConfig: { toolkitName: "深度专注系统SOP", actionPrompt: "领取高能工作流清单" },
    gateMode: "manual_buffer",
    now: new Date("2026-09-04T12:00:00+08:00"),
    queuePath: path.join(dir, "queue_toolkit.json"),
    auditPath: path.join(dir, "audit_toolkit.jsonl")
  });
  assert.equal(toolkitRes.success, true);
  assert.ok(toolkitRes.adaptedNote.body.includes("深度专注系统SOP"));
  assert.equal(toolkitRes.adaptedNote.ctaSlide?.badge, "效率工具");

  // Consultation CTA
  const consultRes = await runAutonomousContentPipeline({
    rawTopic: "Solo Founder: Building high-margin leverage",
    ctaType: "consultation",
    ctaConfig: { serviceName: "商业模式梳理", spotsLimit: "本月仅限3席" },
    gateMode: "manual_buffer",
    now: new Date("2026-09-04T19:00:00+08:00"),
    queuePath: path.join(dir, "queue_consult.json"),
    auditPath: path.join(dir, "audit_consult.jsonl")
  });
  assert.equal(consultRes.success, true);
  assert.ok(consultRes.adaptedNote.body.includes("商业模式梳理"));
  assert.ok(consultRes.adaptedNote.body.includes("本月仅限3席"));
});

test("Facade: runAutonomousContentPipeline processes queue in auto gate mode during active window", async (t) => {
  const { dir, cleanup } = createIsolatedTestDir("facade-auto-");
  t.after(cleanup);

  const queuePath = path.join(dir, "queue_auto.json");
  const auditPath = path.join(dir, "audit_auto.jsonl");

  let publishedItem = null;
  const autoRes = await runAutonomousContentPipeline({
    rawTopic: "Mental Models: Inversion and First Principles Thinking",
    gateMode: "auto",
    now: new Date("2026-09-04T18:30:00+08:00"), // Active evening window
    targetTime: new Date("2026-09-04T18:30:00+08:00"),
    jitterOptions: { clampToActiveWindow: true },
    forcePublish: true, // Force publish to trigger immediate release
    onPublishCallback: async (item) => {
      publishedItem = item;
    },
    queuePath,
    auditPath
  });

  assert.equal(autoRes.success, true);
  assert.ok(autoRes.scheduleResult.publishResult);
  assert.equal(autoRes.scheduleResult.publishResult.released.length, 1);
  assert.ok(publishedItem);
  assert.equal(publishedItem.title, autoRes.adaptedNote.title);
});

