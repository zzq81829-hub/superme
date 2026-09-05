/**
 * Autonomous Content Company Daemon (一人内容公司 - 24小时自主运转守护引擎)
 *
 * Runs the self-operating loop:
 * 1. Bio-Circadian Check (11:30~13:30, 18:00~20:30, night sleep 23:30~08:30)
 * 2. Trend & X-Seed Discovery -> Fact-Checking & Mythbusting (Gold chance model)
 * 3. 2-Tier Compliance Firewall -> Zero-Tolerance Interception
 * 4. Queue Scheduling with BioJitter (±15~35m)
 * 5. Publish Execution / Manual Buffer Gate
 * 6. 9-Metric Learning Ledger Review -> Strategy Vector Adaptation
 * 7. Personal IP Evolution & Pluggable Monetization CTAs
 */

import path from "path";
import fs from "fs";
import {
  runAutonomousContentPipeline,
  recordPostPublicationFeedback,
  circadianScheduler,
  learningLedger,
  ipDiscovery
} from "../src/autonomous_content/index.js";

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // Check every 15 minutes

const SAMPLE_X_SEEDS = [
  {
    topic: "The 8 skincare habits that actually reverse aging vs pure marketing hype",
    claims: [
      "Cooked tomatoes with lycopene boost pro-collagen",
      "Wild salmon omega-3 repairs lipid barriers",
      "Bone broth pills completely rebuild facial elasticity overnight",
      "Green tea cleanses toxins from your pores"
    ],
    ctaType: "book",
    ctaConfig: { bookTitle: "《逆龄真相：循证皮肤学认知指南》", corePitch: "避开90%的智商税，用科学守护年轻。" }
  },
  {
    topic: "Mental models used by billionaires to make asymmetric decisions under extreme uncertainty",
    claims: [
      "Inversion thinking eliminates 80% of catastrophic downside risks",
      "Second-order thinking predicts unintended consequences before scaling",
      "Circle of competence prevents emotional FOMO in bull markets",
      "First principles thinking reconstructs value from foundational truths"
    ],
    ctaType: "toolkit",
    ctaConfig: { toolkitName: "深度决策卡片库", corePitch: "10套高阶心智模型拆解清单与实操模板。" }
  },
  {
    topic: "How solopreneurs scale one-person digital businesses to 10k monthly recurring revenue",
    claims: [
      "Audience-first validation eliminates 90% of product failure risk",
      "Digital leverage compounds value without proportional time investment",
      "Micro-SaaS and automated workflows replace expensive employee overhead",
      "Asynchronous customer support unlocks 24/7 global monetization"
    ],
    ctaType: "consultation",
    ctaConfig: { offerTitle: "一人公司商业闭环推演咨询", corePitch: "梳理属于你的专长杠杆与变现路径。" }
  }
];

export async function runOneCycle(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const windowStatus = circadianScheduler.evaluateCircadianWindow(now);

  console.log(`\n[${now.toISOString()}] ════════ 一人内容公司自主巡检 ════════`);
  console.log(`• 当前生理状态: ${windowStatus.isQuietHours ? "🌙 夜间生理静默期 (休眠中)" : `☀️ ${windowStatus.windowName || "日间窗口"}`}`);

  if (windowStatus.isQuietHours && !options.force) {
    console.log("• 防封号守护机制生效：夜间静默期（23:30 ~ 08:30）自动暂停外发操作，严防小红书风控机器识别。");
    return { status: "sleeping", windowStatus };
  }

  // 1. Process existing publish queue
  console.log("• 检查发布就绪队列...");
  const queueResult = await circadianScheduler.processPublishQueue({
    gateMode: options.gateMode || "manual_buffer",
    now
  });
  console.log(`  - 已释放/发布: ${queueResult.released.length} 篇`);
  console.log(`  - 缓冲待放行: ${queueResult.buffered.length} 篇`);

  // 2. Consume Learning Ledger & adjust strategy
  const latestStrategy = learningLedger.getLatestStrategyVector();
  console.log("• 读取最新自适应策略向量 (闭环经验反哺):");
  console.log(`  - 选题偏好: 认知(${latestStrategy.topicWeights?.cognitive || 1.0}), 商业(${latestStrategy.topicWeights?.business || 1.0}), 成长(${latestStrategy.topicWeights?.growth || 1.0})`);
  console.log(`  - 优先 Hook: ${latestStrategy.preferredHookType || "paradox"}`);

  // 3. Autonomous Seed Pipeline execution if queue is low
  if (queueResult.buffered.length === 0 && queueResult.released.length === 0) {
    console.log("• 队列储备不足，自主触发 X 爆款嗅探与求真转译流水线...");
    const seedIndex = Math.floor(Math.random() * SAMPLE_X_SEEDS.length);
    const selectedSeed = SAMPLE_X_SEEDS[seedIndex];

    const pipelineResult = await runAutonomousContentPipeline({
      rawTopic: selectedSeed.topic,
      rawClaims: selectedSeed.claims,
      factCheck: true,
      ctaType: selectedSeed.ctaType,
      ctaConfig: selectedSeed.ctaConfig,
      gateMode: options.gateMode || "manual_buffer",
      now
    });

    if (pipelineResult.success) {
      console.log(`  ✅ 成功生成并质检新图文: 《${pipelineResult.adaptedNote.title}》`);
      console.log(`  - 合规质检: ${pipelineResult.complianceResult.passed ? "100% 通过 (零违规)" : "已拦截"}`);
      console.log(`  - 排期时段: ${pipelineResult.scheduleResult.queueItem.targetWindow}`);
      console.log(`  - 拟真生物抖动: ${pipelineResult.scheduleResult.jitterMinutes} 分钟`);
      console.log(`  - 状态: ${pipelineResult.scheduleResult.queueItem.status}`);
    }
  }

  return { status: "active", windowStatus, queueResult };
}

// If run directly
if (process.argv[1] && process.argv[1].includes("autonomous_company_daemon.js")) {
  console.log("🚀 一人内容公司 (Autonomous Content Company) 守护引擎已启动...");
  runOneCycle({ force: process.argv.includes("--now") }).catch(console.error);

  if (process.argv.includes("--daemon")) {
    console.log(`⏰ 进入周期性守护模式，每 ${CHECK_INTERVAL_MS / 60000} 分钟自主轮巡一次...`);
    setInterval(() => {
      runOneCycle().catch(console.error);
    }, CHECK_INTERVAL_MS);
  }
}
