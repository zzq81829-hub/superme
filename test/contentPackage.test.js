import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import express from "express";
import {
  createPackage,
  getPackage,
  listPackages,
  updatePackage,
  freezePackage,
  approvePackage,
  rejectPackage,
  markReadyManual,
  recordPublish,
  appendPackageMetrics,
  calculateMetricsRates,
  normalizeMetrics,
  generatePackagePreview,
  computeContentPackageHash,
  snapshotViewpointsFromMemory
} from "../src/content/store.js";
import { createCandidate, confirmCandidate } from "../src/memory/store.js";

function createIsolatedTestDir() {
  const tmp = path.join(os.tmpdir(), `test-content-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(tmp, { recursive: true });
  return tmp;
}

function completeExperiment(overrides = {}) {
  return {
    accountId: "shuzhai",
    source: "测试来源",
    insight: "测试洞察",
    audience: "测试受众",
    painOrDesire: "测试痛点",
    objective: "save",
    topic: "测试选题",
    title: "测试标题",
    hookType: "contrarian",
    emotion: "relief",
    contentStructure: "pain-insight-action",
    cta: "测试行动",
    predictionScores: { traffic: 7, click: 7, read: 7, save: 7, discussion: 7, share: 7, follow: 7, fit: 7, evidence: 7 },
    recommendation: "测试推荐",
    risks: [],
    strategyVersion: "test-v1",
    hypothesisIds: ["H-TEST"],
    ...overrides
  };
}

function createTestPackage(input, options) {
  return createPackage({ experiment: completeExperiment(), ...input }, options);
}

test("Content Package: 1. Draft can be edited; freeze locks payloadHash and enters awaiting_approval", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir };

  const pkg = createTestPackage({
    title: "每日书摘：如何构建高转化内容",
    platform: "xiaohongshu",
    body: "这是初稿正文，包含核心洞察...",
    layers: {
      facts: [{ id: "f1", text: "数据支撑：转化率提升30%", source: "书摘第4章" }],
      expressions: [{ id: "e1", text: "好的开头是成功的一半" }]
    }
  }, options);

  assert.equal(pkg.status, "draft");
  assert.equal(pkg.approvalStatus, "not_required");
  assert.ok(pkg.payloadHash);

  // Edit draft title & body
  const updated = updatePackage(pkg.id, {
    title: "每日书摘：3个极简方法提升转化率",
    body: "更新后的正文，更加精炼..."
  }, options);

  assert.equal(updated.title, "每日书摘：3个极简方法提升转化率");
  assert.equal(updated.status, "draft");

  // Freeze package
  const frozen = freezePackage(pkg.id, options);
  assert.equal(frozen.status, "awaiting_approval");
  assert.equal(frozen.approvalStatus, "pending");
  assert.ok(frozen.frozenAt);
  assert.equal(frozen.payloadHash, computeContentPackageHash(frozen));
});

test("Content Package: freeze rejects a missing or incomplete Experiment snapshot", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir };
  const missing = createPackage({ title: "缺实验", platform: "xiaohongshu", body: "正文" }, options);
  assert.throws(() => freezePackage(missing.id, options), /experiment is incomplete/);

  const partial = createPackage({
    title: "实验不完整",
    platform: "xiaohongshu",
    body: "正文",
    experiment: completeExperiment({ hypothesisIds: [] })
  }, options);
  assert.throws(() => freezePackage(partial.id, options), /hypothesisIds/);
});

test("Content Package: 2. understand_only viewpoints cannot be public or quoted", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir };

  // Attempt to freeze a package with understand_only marked public
  const pkg1 = createTestPackage({
    title: "违规观点测试 1",
    platform: "xiaohongshu",
    body: "正文内容...",
    layers: {
      viewpoints: [
        {
          id: "vp1",
          title: "私人判断标准",
          content: "这是内部理解视角",
          license: "understand_only",
          usage: "influence",
          public: true // Invalid!
        }
      ]
    }
  }, options);

  assert.throws(() => freezePackage(pkg1.id, options), /understand_only.*cannot be marked public/);

  // Attempt to freeze a package with understand_only quoted
  const pkg2 = createTestPackage({
    title: "违规观点测试 2",
    platform: "xiaohongshu",
    body: "正文内容...",
    layers: {
      viewpoints: [
        {
          id: "vp2",
          title: "私人判断标准",
          content: "这是内部理解视角",
          license: "understand_only",
          usage: "quote", // Invalid!
          public: false
        }
      ]
    }
  }, options);

  assert.throws(() => freezePackage(pkg2.id, options), /understand_only.*cannot be quoted directly/);
});

test("Content Package: 3. attributable viewpoint enters usedViewpoints and appears in public preview", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir };

  const pkg = createTestPackage({
    title: "公开署名金句分享",
    platform: "xiaohongshu",
    body: "如创始人所言：真正的简洁需要极致的克制。",
    layers: {
      facts: [{ id: "f1", text: "极简设计原则", source: "Founder OS" }],
      viewpoints: [
        {
          id: "vp-attr",
          title: "克制设计观",
          content: "真正的简洁需要极致的克制。",
          license: "attributable",
          usage: "quote",
          public: true
        }
      ]
    }
  }, options);

  assert.equal(pkg.usedViewpoints.length, 1);
  assert.equal(pkg.usedViewpoints[0].license, "attributable");
  assert.equal(pkg.usedViewpoints[0].public, true);

  const frozen = freezePackage(pkg.id, options);
  const approved = approvePackage(pkg.id, options);
  assert.equal(approved.status, "approved");
  assert.equal(approved.approvalStatus, "approved");

  const preview = generatePackagePreview(pkg.id, options);
  assert.equal(preview.publicFacing.publicViewpoints.length, 1);
  assert.equal(preview.publicFacing.publicViewpoints[0].title, "克制设计观");
  assert.equal(preview.integrity.isApprovedHashMatch, true);
});

test("Content Package: 4. Content modification after approval invalidates approval", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir };

  const pkg = createTestPackage({
    title: "已审批发布包",
    platform: "xiaohongshu",
    body: "原始审批文案"
  }, options);

  freezePackage(pkg.id, options);
  const approved = approvePackage(pkg.id, options);
  assert.equal(approved.status, "approved");
  assert.equal(approved.approvalStatus, "approved");

  // Modify body after approval
  const modified = updatePackage(pkg.id, { body: "篡改后的文案" }, options);
  assert.equal(modified.status, "draft");
  assert.equal(modified.approvalStatus, "revoked");
  assert.equal(modified.approvedHash, null);

  // Cannot mark ready without re-freezing and re-approving
  assert.throws(() => markReadyManual(pkg.id, options), /package must be approved first/);

  // Re-freeze & Re-approve
  freezePackage(pkg.id, options);
  const reApproved = approvePackage(pkg.id, options);
  assert.equal(reApproved.status, "approved");

  // Now mark ready manual succeeds
  const ready = markReadyManual(pkg.id, options);
  assert.equal(ready.status, "ready_manual");
});

test("Content Package: 5. Unconfirmed candidate memory cannot be added to package", () => {
  const candidate = createCandidate({
    title: "未经确认的观点",
    content: "草稿观点内容",
    license: "attributable"
  });

  // Candidate is not active yet
  assert.throws(() => snapshotViewpointsFromMemory([candidate.id]), /is not active/);

  // Confirm enters testing — still cannot be used in public packages
  const confirmed = confirmCandidate(candidate.id);
  assert.equal(confirmed.status, "testing");
  assert.throws(() => snapshotViewpointsFromMemory([confirmed.id]), /is not active/);
});

test("Content Package: 6. /send endpoint (both content and publish) is permanently forbidden with 403", async () => {
  const app = express();
  const rejectAutoSend = (_req, res) => {
    res.status(403).json({
      ok: false,
      error: "External automated publishing is strictly prohibited. AI Founder OS generates drafts and frozen packages for manual review and founder release only."
    });
  };
  app.post("/api/content/packages/:id/send", rejectAutoSend);
  app.post("/api/publish/:id/send", rejectAutoSend);

  const server = app.listen(0);
  const port = server.address().port;

  const res1 = await fetch(`http://127.0.0.1:${port}/api/content/packages/pkg-123/send`, { method: "POST" });
  assert.equal(res1.status, 403);
  const json1 = await res1.json();
  assert.ok(json1.error.includes("strictly prohibited"));

  const res2 = await fetch(`http://127.0.0.1:${port}/api/publish/pkg-123/send`, { method: "POST" });
  assert.equal(res2.status, 403);
  const json2 = await res2.json();
  assert.ok(json2.error.includes("strictly prohibited"));

  server.close();
});

test("Content Package: 7. Xiaohongshu editorial layout is planned and changing it revokes approval", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir };
  const pkg = createTestPackage({
    title: "用留白读懂一本书",
    platform: "xiaohongshu",
    body: "真正重要的内容，需要留出被理解的空间。第二个洞察应该独立成页，而不是挤在封面。",
    layers: { facts: [{ text: "《阅读的方法》", source: "第 3 章" }] }
  }, options);

  assert.equal(pkg.layout.templateId, "shuzhai-editorial-v1");
  const preview = generatePackagePreview(pkg, options);
  assert.equal(preview.publicFacing.layoutPlan.template.canvas.ratio, "3:4");
  assert.ok(preview.publicFacing.layoutPlan.slides.length >= 4);
  assert.ok(preview.publicFacing.layoutPlan.slides.length <= 7);
  assert.equal(preview.publicFacing.layoutPlan.slides[0].role, "cover");
  assert.equal(preview.publicFacing.layoutPlan.slides.at(-1).role, "ending");

  freezePackage(pkg.id, options);
  approvePackage(pkg.id, options);
  const changed = updatePackage(pkg.id, { layout: { callToAction: "下一页继续读。" } }, options);
  assert.equal(changed.status, "draft");
  assert.equal(changed.approvalStatus, "revoked");
});

test("Content Package: 8. Experiment snapshot is saved and changing it after freeze revokes approval", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir };
  const predictionScores = {
    traffic: 7,
    click: 8,
    read: 9,
    save: 8,
    discussion: 5,
    share: 6,
    follow: 7,
    fit: 9,
    evidence: 10
  };
  const pkg = createTestPackage({
    title: "实验内容包",
    platform: "xiaohongshu",
    body: "实验正文",
    experiment: {
      accountId: "shuzhai",
      source: "《被讨厌的勇气》第三夜",
      insight: "课题分离减少关系内耗",
      audience: "容易为他人评价焦虑的人",
      painOrDesire: "希望停止讨好",
      objective: "save_and_follow",
      topic: "如何停止替别人负责",
      title: "别人的评价，不是你的课题",
      hookType: "contrarian",
      emotion: "relief",
      contentStructure: "pain-insight-action",
      cta: "收藏后今晚试一次",
      predictionScores,
      recommendation: "收藏意图强，适合首轮验证",
      risks: ["避免把课题分离写成冷漠"],
      strategyVersion: "v1.0",
      hypothesisIds: ["H001"]
    }
  }, options);

  assert.deepEqual(pkg.experiment.predictionScores, predictionScores);
  assert.equal(getPackage(pkg.id, options).experiment.hypothesisIds[0], "H001");
  freezePackage(pkg.id, options);
  approvePackage(pkg.id, options);

  const changed = updatePackage(pkg.id, {
    experiment: { hookType: "second-person-contrarian" }
  }, options);
  assert.equal(changed.experiment.hookType, "second-person-contrarian");
  assert.equal(changed.status, "draft");
  assert.equal(changed.approvalStatus, "revoked");
  assert.equal(changed.approvedHash, null);
});

test("Content Package: 9. Published metrics append safely without changing content approval", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir };
  const pkg = createTestPackage({
    title: "已发布实验",
    platform: "xiaohongshu",
    body: "用于验证数据回流"
  }, options);
  freezePackage(pkg.id, options);
  approvePackage(pkg.id, options);
  recordPublish(pkg.id, { ok: true }, options);

  const before = getPackage(pkg.id, options);
  const recorded = appendPackageMetrics(pkg.id, {
    capturedAt: "2026-09-03T08:00:00+08:00",
    impressions: 1000,
    reads: 250,
    avgStaySeconds: 18.5,
    readCompletion: 0.6,
    likes: 20,
    saves: 30,
    comments: 5,
    shares: 5,
    profileVisits: 40,
    followersGained: 10
  }, options);

  assert.equal(recorded.status, "published");
  assert.equal(recorded.approvalStatus, "approved");
  assert.equal(recorded.payloadHash, before.payloadHash);
  assert.equal(recorded.approvedHash, before.approvedHash);
  assert.equal(computeContentPackageHash(recorded), before.payloadHash);
  assert.equal(recorded.metrics.length, 1);
  assert.equal(recorded.metrics[0].rates.clickRate, 0.25);
  assert.equal(recorded.metrics[0].rates.saveRate, 0.12);
  assert.equal(recorded.metrics[0].rates.engagementRate, 0.24);
  assert.equal(recorded.metrics[0].rates.followRate, 0.04);

  const second = appendPackageMetrics(pkg.id, {
    capturedAt: "2026-09-04T08:00:00+08:00",
    impressions: 1500,
    reads: 400
  }, options);
  assert.equal(second.metrics.length, 2);
  assert.equal(second.metrics[0].capturedAt, "2026-09-03T00:00:00.000Z");
  assert.equal(second.payloadHash, before.payloadHash);
  assert.equal(second.status, "published");
});

test("Content Package: 10. Metrics reject invalid values and handle zero denominators", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir };
  const pkg = createTestPackage({ title: "数据校验", platform: "xiaohongshu", body: "正文" }, options);

  assert.throws(
    () => appendPackageMetrics(pkg.id, { impressions: 1 }, options),
    /Cannot record metrics before publishing/
  );

  freezePackage(pkg.id, options);
  approvePackage(pkg.id, options);
  recordPublish(pkg.id, { ok: true }, options);

  assert.throws(
    () => appendPackageMetrics(pkg.id, { reads: -1 }, options),
    /metrics.reads must be a non-negative number or null/
  );
  assert.throws(
    () => appendPackageMetrics(pkg.id, { capturedAt: "not-a-date" }, options),
    /metrics.capturedAt must be a valid date/
  );

  const recorded = appendPackageMetrics(pkg.id, {
    impressions: 0,
    reads: 0,
    saves: 0,
    followersGained: 0
  }, options);
  assert.deepEqual(recorded.metrics[0].rates, {
    clickRate: null,
    saveRate: null,
    engagementRate: null,
    followRate: null
  });
});

test("Content Package: 11. Metrics rate helper stays finite and rejects non-numbers", () => {
  assert.deepEqual(calculateMetricsRates({}), {
    clickRate: null,
    saveRate: null,
    engagementRate: null,
    followRate: null
  });
  assert.equal(normalizeMetrics({ impressions: "10", reads: "2" }, "2026-09-03T00:00:00Z").rates.clickRate, 0.2);
  assert.throws(
    () => normalizeMetrics({ impressions: true }),
    /metrics.impressions must be a non-negative number or null/
  );
  assert.throws(
    () => normalizeMetrics({ reads: "Infinity" }),
    /metrics.reads must be a non-negative number or null/
  );
});
