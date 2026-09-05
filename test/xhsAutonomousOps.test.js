import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";

import {
  createContentObject,
  getContentObject,
  updateContentObject,
  listContentObjects,
  CONTENT_STATES
} from "../src/xhs/contentObject.js";
import { calculateTopicScore, discoverOpportunities } from "../src/xhs/radar.js";
import { getXhsPolicy, patchXhsPolicy } from "../src/xhs/policy.js";
import { generateDailyPlan } from "../src/xhs/strategist.js";
import { generateContentPackage } from "../src/xhs/studio.js";
import { verifyContent } from "../src/xhs/qc.js";
import { dispatchPublish, getPublishStatus } from "../src/xhs/publisher/service.js";
import { syncMetrics } from "../src/xhs/analyst.js";
import { runXhsReflection } from "../src/xhs/reflection.js";
import { createExperiment, evaluateExperiment, listExperiments } from "../src/xhs/experiments.js";
import { getXhsDashboard } from "../src/xhs/dashboard.js";

function setupIsolatedEnv() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "xhs-ops-test-"));
  const baseDir = path.join(tmpDir, "contents");
  const policyFile = path.join(tmpDir, "policies.json");
  const experimentsFile = path.join(tmpDir, "experiments.json");
  return {
    tmpDir,
    options: {
      baseDir,
      policyFile,
      experimentsFile,
      driver: "mock"
    },
    cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true })
  };
}

test("XHS Ops Pillar 1: Content Object Lifecycle Transitions (IDEA -> LEARNED)", () => {
  const { options, cleanup } = setupIsolatedEnv();

  const note = createContentObject(
    {
      account: "shuzhai",
      topic: "为什么越努力越容易陷入效率陷阱",
      content_type: "观点型",
      source: "book+trend",
      status: CONTENT_STATES.IDEA
    },
    options
  );

  assert.ok(note.id);
  assert.equal(note.status, CONTENT_STATES.IDEA);
  assert.equal(note.metrics.impressions, 0);

  // Transition to PLANNED
  const planned = updateContentObject(note.id, { status: CONTENT_STATES.PLANNED }, options);
  assert.equal(planned.status, CONTENT_STATES.PLANNED);
  assert.equal(planned.history.length, 2);

  // Transition to GENERATING
  const generating = updateContentObject(note.id, { status: CONTENT_STATES.GENERATING }, options);
  assert.equal(generating.status, CONTENT_STATES.GENERATING);

  // Transition to QC
  const qc = updateContentObject(note.id, { status: CONTENT_STATES.QC }, options);
  assert.equal(qc.status, CONTENT_STATES.QC);

  // Transition to APPROVED
  const approved = updateContentObject(note.id, { status: CONTENT_STATES.APPROVED, publish_time: "2026-09-05T20:00:00" }, options);
  assert.equal(approved.status, CONTENT_STATES.APPROVED);

  // Transition to SCHEDULED
  const scheduled = updateContentObject(note.id, { status: CONTENT_STATES.SCHEDULED }, options);
  assert.equal(scheduled.status, CONTENT_STATES.SCHEDULED);

  // Transition to PUBLISHED
  const published = updateContentObject(note.id, { status: CONTENT_STATES.PUBLISHED }, options);
  assert.equal(published.status, CONTENT_STATES.PUBLISHED);

  // Transition to 24H_METRICS
  const m24 = updateContentObject(note.id, { status: CONTENT_STATES.METRICS_24H }, options);
  assert.equal(m24.status, CONTENT_STATES.METRICS_24H);

  // Transition to 72H_METRICS
  const m72 = updateContentObject(note.id, { status: CONTENT_STATES.METRICS_72H }, options);
  assert.equal(m72.status, CONTENT_STATES.METRICS_72H);

  // Transition to LEARNED
  const learned = updateContentObject(note.id, { status: CONTENT_STATES.LEARNED }, options);
  assert.equal(learned.status, CONTENT_STATES.LEARNED);

  // Exceptional states check
  const failed = updateContentObject(note.id, { status: CONTENT_STATES.FAILED }, options);
  assert.equal(failed.status, CONTENT_STATES.FAILED);
  const blocked = updateContentObject(note.id, { status: CONTENT_STATES.BLOCKED }, options);
  assert.equal(blocked.status, CONTENT_STATES.BLOCKED);

  cleanup();
});

test("XHS Ops Pillar 2: Radar 6-Factor Opportunity Scoring & Discovery", () => {
  // Formula test: (Demand × Match × Virality × Commercial × Freshness) ÷ Cost
  const highValue = calculateTopicScore({
    demand: 9,
    accountMatch: 10,
    virality: 9,
    commercialValue: 8,
    freshness: 9,
    productionCost: 3
  });
  assert.ok(highValue.score >= 75);
  assert.equal(highValue.isHighValue, true);

  const lowValue = calculateTopicScore({
    demand: 2,
    accountMatch: 3,
    virality: 2,
    commercialValue: 2,
    freshness: 2,
    productionCost: 9
  });
  assert.ok(lowValue.score < 50);
  assert.equal(lowValue.isHighValue, false);

  // Opportunity discovery for 3 accounts
  const oppsX = discoverOpportunities("x_curation");
  assert.ok(oppsX.length > 0);
  assert.ok(oppsX[0].topic_score >= 70);

  const oppsShuzhai = discoverOpportunities("shuzhai");
  assert.ok(oppsShuzhai.length > 0);

  const oppsIp = discoverOpportunities("personal_ip");
  assert.ok(oppsIp.length > 0);
});

test("XHS Ops Pillar 3: Multi-Account Isolated Policies & Governance Safeguard", () => {
  const { options, cleanup } = setupIsolatedEnv();

  const policies = getXhsPolicy(null, options);
  assert.ok(policies.x_curation);
  assert.ok(policies.shuzhai);
  assert.ok(policies.personal_ip);
  assert.equal(policies.x_curation.name, "Gold chance");
  assert.equal(policies.shuzhai.name, "good try");

  // Patching policy dynamically
  const patched = patchXhsPolicy(
    {
      shuzhai: {
        daily_quota: 3,
        content_mix: { opinion_content: 0.50, book_content: 0.30, experimental_content: 0.20 }
      }
    },
    options
  );
  assert.equal(patched.shuzhai.daily_quota, 3);
  assert.equal(patched.shuzhai.content_mix.opinion_content, 0.50);

  // Governance check: Attempting to bypass founder authorization on major shifts throws error
  assert.throws(() => {
    patchXhsPolicy(
      {
        global: { require_founder_approval_on_major_shift: false }
      },
      options
    );
  }, /Governance guard/);

  cleanup();
});

test("XHS Ops Pillar 4: Strategist Daily Plan Generation", () => {
  const { options, cleanup } = setupIsolatedEnv();

  const plan = generateDailyPlan({ accounts: ["x_curation", "shuzhai"] }, options);
  assert.ok(plan.total_planned >= 2);
  assert.equal(plan.accounts.length, 2);

  const first = plan.items[0];
  assert.equal(first.status, CONTENT_STATES.PLANNED);
  assert.ok(first.publish_time);
  assert.ok(first.topic_score > 0);

  cleanup();
});

test("XHS Ops Pillar 5: Studio Content Factory (Gold chance vs good try vs IP)", () => {
  const { options, cleanup } = setupIsolatedEnv();

  // 1. Shuzhai (good try)
  const n1 = createContentObject({ account: "shuzhai", topic: "为什么越努力越容易陷入效率陷阱" }, options);
  const pkg1 = generateContentPackage(n1.id, options);
  assert.equal(pkg1.status, CONTENT_STATES.QC);
  assert.ok(pkg1.package.body.includes("深度拆解"));
  assert.ok(pkg1.package.hashtags.includes("#深度阅读"));

  // 2. X curation (Gold chance)
  const n2 = createContentObject({ account: "x_curation", topic: "硅谷高管都在用的10个习惯" }, options);
  const pkg2 = generateContentPackage(n2.id, options);
  assert.equal(pkg2.status, CONTENT_STATES.QC);
  assert.ok(pkg2.package.body.includes("基本靠谱"));
  assert.ok(pkg2.package.hashtags.includes("#事实核查"));

  // 3. Personal IP
  const n3 = createContentObject({ account: "personal_ip", topic: "把公司业务交给AI自主跑了3天" }, options);
  const pkg3 = generateContentPackage(n3.id, options);
  assert.equal(pkg3.status, CONTENT_STATES.QC);
  assert.ok(pkg3.package.body.includes("真实的创业实践"));

  cleanup();
});

test("XHS Ops Pillar 6: QC Engine (Anti-AI Filter & Risk Assessment)", () => {
  const { options, cleanup } = setupIsolatedEnv();

  // Clean note
  const goodNote = createContentObject(
    {
      account: "shuzhai",
      topic: "认知心理学决策陷阱",
      package: {
        title: "决策的三大陷阱",
        body: "卡尼曼在思考快与慢中指出，很多人的直觉反应往往存在系统性偏差。首先是幸存者偏差，其次是沉没成本谬误。在做出重大决策前，务必列出证伪清单。",
        images: ["img1.png", "img2.png"]
      }
    },
    options
  );
  const qcGood = verifyContent(goodNote.id, options);
  assert.equal(qcGood.status, CONTENT_STATES.APPROVED);
  assert.ok(qcGood.quality_score >= 0.80);
  assert.ok(qcGood.risk_score < 0.30);

  // AI-cliché infected note
  const badAiNote = createContentObject(
    {
      account: "shuzhai",
      topic: "底层逻辑闭环赋能",
      package: {
        title: "底层逻辑与闭环赋能",
        body: "在这个快节奏的时代，总有一款适合你。让我们通过底层逻辑打造闭环，赋能每一个维度，建议收藏反复阅读颠覆认知！",
        images: ["img1.png"]
      }
    },
    options
  );
  const qcBad = verifyContent(badAiNote.id, options);
  assert.equal(qcBad.status, CONTENT_STATES.FAILED);
  assert.ok(qcBad.quality_score < 0.80);
  assert.ok(qcBad.qc_details.issues.some((i) => i.includes("AI 套话")));

  // Prohibited advertising superlative note
  const adNote = createContentObject(
    {
      account: "shuzhai",
      topic: "全网第一赚钱法",
      package: {
        title: "全网第一包赚技巧",
        body: "这是绝对保真的稳赚不赔方法，赶紧上车。",
        images: ["img1.png"]
      }
    },
    options
  );
  const qcAd = verifyContent(adNote.id, options);
  assert.equal(qcAd.status, CONTENT_STATES.FAILED);
  assert.ok(qcAd.risk_score >= 0.50);

  cleanup();
});

test("XHS Ops Pillar 7: Publisher Adapter & Status Gating", async () => {
  const { options, cleanup } = setupIsolatedEnv();

  const note = createContentObject(
    {
      account: "x_curation",
      topic: "硅谷极简习惯",
      status: CONTENT_STATES.APPROVED,
      package: { title: "硅谷高管习惯", body: "极简核查...", images: ["img.png"] }
    },
    options
  );

  // Success publish with mock driver
  const pubRes = await dispatchPublish({ content_id: note.id, driver: "mock" }, options);
  assert.equal(pubRes.ok, true);
  assert.equal(pubRes.result.status, "published");
  assert.ok(pubRes.result.url.includes("xiaohongshu.com"));

  const statusCheck = getPublishStatus(note.id, options);
  assert.equal(statusCheck.lifecycle_status, CONTENT_STATES.PUBLISHED);
  assert.equal(statusCheck.publish_result.status, "published");

  // Blocked publish (e.g. login required)
  const note2 = createContentObject(
    {
      account: "x_curation",
      topic: "未登录测试",
      status: CONTENT_STATES.APPROVED
    },
    options
  );

  const blockedRes = await dispatchPublish(
    { content_id: note2.id, driver: "mock" },
    { ...options, simulateFailure: true, simulateBlocked: true, failureReason: "login_required", suggestedAction: "human_login" }
  );
  assert.equal(blockedRes.ok, false);
  assert.equal(blockedRes.result.status, "blocked");
  assert.equal(blockedRes.result.action, "human_login");

  cleanup();
});

test("XHS Ops Pillar 8: Analyst Metrics Sync & Lifecycle Progression (24h/72h & RPM)", async () => {
  const { options, cleanup } = setupIsolatedEnv();

  const note = createContentObject(
    {
      account: "shuzhai",
      topic: "认知心理学",
      status: CONTENT_STATES.PUBLISHED,
      publish_result: {
        status: "published",
        published_at: new Date(Date.now() - 30 * 3600 * 1000).toISOString() // 30h ago
      }
    },
    options
  );

  // Sync 24h metrics
  const synced24 = await syncMetrics(
    {
      content_id: note.id,
      metrics: {
        impressions: 12000,
        views: 3200,
        likes: 240,
        favorites: 510,
        comments: 38,
        gmv: 600
      }
    },
    options
  );

  assert.equal(synced24.ok, true);
  assert.equal(synced24.status, CONTENT_STATES.METRICS_24H);
  assert.equal(synced24.metrics.impressions, 12000);
  assert.equal(synced24.metrics.revenue_per_thousand, 50); // 600 / 12000 * 1000 = 50

  // Advance to 72h
  const synced72 = await syncMetrics(
    {
      content_id: note.id,
      stage: "72h",
      metrics: {
        impressions: 25000,
        views: 6500,
        likes: 480,
        favorites: 920,
        comments: 72,
        gmv: 1500
      }
    },
    options
  );
  assert.equal(synced72.status, CONTENT_STATES.METRICS_72H);
  assert.equal(synced72.metrics.revenue_per_thousand, 60);

  cleanup();
});

test("XHS Ops Pillar 9: Single-Variable Experiments", () => {
  const { options, cleanup } = setupIsolatedEnv();

  const exp = createExperiment(
    {
      account: "shuzhai",
      hypothesis: "冲突型标题较常规标题提升40%以上收藏率",
      variable: "title_style",
      variant_a: { name: "常规", value: "努力提升效率的3个建议" },
      variant_b: { name: "冲突", value: "为什么越努力的人越容易陷入效率陷阱？" }
    },
    options
  );

  assert.ok(exp.id);
  assert.equal(exp.status, "active");

  const exps = listExperiments({ account: "shuzhai" }, options);
  assert.equal(exps.length, 1);

  cleanup();
});

test("XHS Ops Pillar 10: Autonomous Reflection, Policy Evolution & Learned State", async () => {
  const { options, cleanup } = setupIsolatedEnv();

  // Create two published notes with 24h/72h metrics: one opinion (high performance), one book summary (low performance)
  const n1 = createContentObject(
    {
      account: "shuzhai",
      content_type: "观点型",
      topic: "观点型爆款",
      status: CONTENT_STATES.METRICS_24H,
      metrics: { views: 10000, favorites: 1200, likes: 600 } // 18% engage
    },
    options
  );

  const n2 = createContentObject(
    {
      account: "shuzhai",
      content_type: "知识型",
      topic: "书籍生硬总结",
      status: CONTENT_STATES.METRICS_24H,
      metrics: { views: 8000, favorites: 160, likes: 80 } // 3% engage
    },
    options
  );

  // Run Reflection
  const reflection = await runXhsReflection({ account: "shuzhai" }, options);

  assert.equal(reflection.ok, true);
  assert.ok(reflection.findings.length > 0);
  assert.ok(reflection.hypotheses.length > 0);
  assert.ok(reflection.lessons.length > 0);
  assert.ok(reflection.policy_changes.length > 0);
  assert.ok(reflection.next_experiments.length > 0);

  // Verify that policy was ACTUALLY modified (learning altered future behavior)
  const currentPolicy = getXhsPolicy("shuzhai", options);
  assert.ok(currentPolicy.content_mix.opinion_content > 0.40);

  // Verify analyzed notes transitioned to LEARNED
  const updatedN1 = getContentObject(n1.id, options);
  const updatedN2 = getContentObject(n2.id, options);
  assert.equal(updatedN1.status, CONTENT_STATES.LEARNED);
  assert.equal(updatedN2.status, CONTENT_STATES.LEARNED);

  cleanup();
});

test("XHS Ops Pillar 11: Executive Dashboard Aggregation", async () => {
  const { options, cleanup } = setupIsolatedEnv();

  createContentObject({ account: "shuzhai", topic: "今日计划1", status: CONTENT_STATES.PLANNED }, options);
  createContentObject({ account: "shuzhai", topic: "已通过QC", status: CONTENT_STATES.APPROVED }, options);
  createContentObject(
    {
      account: "shuzhai",
      topic: "已发布内容",
      status: CONTENT_STATES.PUBLISHED,
      metrics: { impressions: 10000, views: 2000, favorites: 400, likes: 300, gmv: 500 }
    },
    options
  );

  const dashboard = await getXhsDashboard(options);
  assert.equal(dashboard.operational_status, "RUNNING");
  assert.equal(dashboard.summary.planned_today, 1);
  assert.equal(dashboard.summary.qc_passed, 1);
  assert.equal(dashboard.summary.published_today, 1);
  assert.equal(dashboard.performance.total_impressions, 10000);
  assert.equal(dashboard.performance.overall_rpm, 50);
  assert.equal(dashboard.founder_touches_needed, 0);

  cleanup();
});
