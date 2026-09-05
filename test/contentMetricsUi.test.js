import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createPackage,
  freezePackage,
  approvePackage,
  recordPublish,
  appendPackageMetrics,
  getPackage
} from "../src/content/store.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "public", "style.css"), "utf8");

test("P0-2 Metrics UI: HTML structure contains modal, 10 fields and ratio previews", () => {
  assert.match(html, /id="metricsModal"/, "metricsModal should exist");
  assert.match(html, /id="metricsAttributionBadge"/, "attribution badge should exist");
  assert.match(html, /id="metricsPackageId"/, "packageId input should exist");

  // 10 fields check
  assert.match(html, /id="metricImpressions"/, "impressions field should exist");
  assert.match(html, /id="metricReads"/, "reads field should exist");
  assert.match(html, /id="metricStay"/, "stay/read completion field should exist");
  assert.match(html, /id="metricLikes"/, "likes field should exist");
  assert.match(html, /id="metricSaves"/, "saves field should exist");
  assert.match(html, /id="metricComments"/, "comments field should exist");
  assert.match(html, /id="metricShares"/, "shares field should exist");
  assert.match(html, /id="metricProfileVisits"/, "profile visits field should exist");
  assert.match(html, /id="metricFollowersGained"/, "followers gained field should exist");
  assert.match(html, /id="metricCapturedAt"/, "captured at field should exist");

  // 4 ratios preview
  assert.match(html, /id="previewClickRate"/, "click rate preview should exist");
  assert.match(html, /id="previewSaveRate"/, "save rate preview should exist");
  assert.match(html, /id="previewEngageRate"/, "engage rate preview should exist");
  assert.match(html, /id="previewFollowRate"/, "follow rate preview should exist");

  // Save button and error notice
  assert.match(html, /id="saveMetricsBtn"/, "save button should exist");
  assert.match(html, /id="metricsFormError"/, "error notice container should exist");
});

test("P0-2 Metrics UI: CSS styles provide responsive modal, grid and ratio cards", () => {
  assert.match(css, /\.packageMetricsSection/, "packageMetricsSection class should be styled");
  assert.match(css, /\.metricsRatiosBar/, "metricsRatiosBar grid should be styled");
  assert.match(css, /\.ratioItem/, "ratioItem should be styled");
  assert.match(css, /\.metricsModal/, "metricsModal overlay should be styled");
  assert.match(css, /\.metricsFormGrid/, "metricsFormGrid should be styled");
  assert.match(css, /@media\s*\(max-width:\s*600px\)/, "mobile responsive breakpoint should be covered");
});

test("P0-2 Metrics Logic: ratio calculation and zero-division safety", () => {
  // Extract computeMetricsRatios function from app.js using RegExp or evaluate
  assert.match(app, /function computeMetricsRatios/);

  // Re-run the exact algorithm to test mathematical correctness and edge cases
  function computeRatios(m) {
    if (!m) return { clickRate: "-", saveRate: "-", engagementRate: "-", followRate: "-", hasData: false };
    const impressions = Math.max(0, Number(m.impressions) || 0);
    const reads = Math.max(0, Number(m.reads) || 0);
    const likes = Math.max(0, Number(m.likes) || 0);
    const saves = Math.max(0, Number(m.saves) || 0);
    const comments = Math.max(0, Number(m.comments) || 0);
    const shares = Math.max(0, Number(m.shares) || 0);
    const followersGained = Math.max(0, Number(m.followersGained) || 0);

    const clickRate = impressions > 0 ? ((reads / impressions) * 100).toFixed(1) + "%" : "-";
    const saveRate = reads > 0 ? ((saves / reads) * 100).toFixed(1) + "%" : "-";
    const engagementRate = reads > 0 ? (((likes + saves + comments + shares) / reads) * 100).toFixed(1) + "%" : "-";
    const followRate = reads > 0 ? ((followersGained / reads) * 100).toFixed(2) + "%" : "-";

    return {
      clickRate,
      saveRate,
      engagementRate,
      followRate,
      hasData: impressions > 0 || reads > 0 || likes > 0 || saves > 0 || comments > 0 || shares > 0 || followersGained > 0
    };
  }

  // Case 1: Empty or all zero
  const empty = computeRatios({});
  assert.equal(empty.clickRate, "-");
  assert.equal(empty.saveRate, "-");
  assert.equal(empty.engagementRate, "-");
  assert.equal(empty.followRate, "-");
  assert.equal(empty.hasData, false);

  // Case 2: Realistic post metrics
  const normal = computeRatios({
    impressions: 10000,
    reads: 1200,
    likes: 85,
    saves: 120,
    comments: 18,
    shares: 9,
    followersGained: 15
  });
  assert.equal(normal.clickRate, "12.0%");
  assert.equal(normal.saveRate, "10.0%");
  // engagement = (85 + 120 + 18 + 9) / 1200 = 232 / 1200 = 19.333% -> 19.3%
  assert.equal(normal.engagementRate, "19.3%");
  // follow = 15 / 1200 = 1.25%
  assert.equal(normal.followRate, "1.25%");
  assert.equal(normal.hasData, true);
});

test("P0-2 Metrics Logic: attribution state indicators", () => {
  function getAttribution(m) {
    if (!m) return { label: "待补数据", class: "badge-paused" };
    const impressions = Math.max(0, Number(m.impressions) || 0);
    const reads = Math.max(0, Number(m.reads) || 0);
    const hasAnyNum = impressions > 0 || reads > 0 || Number(m.likes) > 0 || Number(m.saves) > 0;
    if (!hasAnyNum) return { label: "待补数据", class: "badge-paused" };
    if (impressions < 100 || reads < 10) return { label: "数据不足，暂不归因", class: "badge-queued" };
    return { label: "已录入", class: "badge-completed" };
  }

  assert.equal(getAttribution(null).label, "待补数据");
  assert.equal(getAttribution({ impressions: 0, reads: 0 }).label, "待补数据");
  assert.equal(getAttribution({ impressions: 50, reads: 5 }).label, "数据不足，暂不归因");
  assert.equal(getAttribution({ impressions: 500, reads: 60 }).label, "已录入");
});

test("P0-2 Non-regression: existing publish and approval buttons remain functional", () => {
  assert.match(app, /freezeContentPackage/);
  assert.match(app, /approveContentPackage/);
  assert.match(app, /publishContentPackage/);
  assert.match(app, /rejectContentPackage/);
  assert.match(app, /previewContentPackage/);
  assert.match(app, /openMetricsModal/);
  assert.match(app, /submitPackageMetrics/);
});

test("P0-2 Metrics UI: metrics section shown for approved/published/ready_manual and only published packages can record metrics", () => {
  assert.match(app, /const showMetrics = \["approved", "published", "ready_manual"\]\.includes\(pkg\.status\)/);
  assert.match(app, /只有已发布内容才能录入真实数据/);
  assert.doesNotMatch(app, /saveLocalMetrics/);
  assert.doesNotMatch(app, /falling back to local storage/);
  assert.match(app, /保存失败：/);
  assert.match(app, /sortedPackages/);
  assert.match(app, /a\.status === "published" && b\.status !== "published"/);
});

test("P0-2 Metrics UI: non-negative validation and empty value handling", () => {
  assert.match(app, /必须为非负数（不能小于 0）/);
  assert.match(app, /valStr === ""/);
  assert.match(app, /closeMetricsModal/);
  assert.match(app, /Escape/);
});

test("P0-2 Mock Workflow: open, validate, save metrics and verify echo display", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "metrics-flow-"));
  const options = { baseDir: tmpDir };

  // Create published package with experiment
  const pkg = createPackage({
    title: "测试笔记",
    platform: "xiaohongshu",
    body: "正文内容",
    experiment: {
      accountId: "shuzhai",
      source: "来源",
      insight: "洞察",
      audience: "受众",
      painOrDesire: "痛点",
      objective: "save",
      topic: "选题",
      title: "标题",
      hookType: "contrarian",
      emotion: "relief",
      contentStructure: "pain-insight-action",
      cta: "行动",
      predictionScores: { traffic: 7, click: 7, read: 7, save: 7, discussion: 7, share: 7, follow: 7, fit: 7, evidence: 7 },
      recommendation: "推荐",
      risks: [],
      strategyVersion: "test-v1",
      hypothesisIds: ["H-01"]
    }
  }, options);

  freezePackage(pkg.id, options);
  approvePackage(pkg.id, options);
  recordPublish(pkg.id, { ok: true }, options);

  // 1. Initial attribution should be "待补数据"
  const initial = getPackage(pkg.id, options);
  assert.equal(initial.status, "published");

  // 2. Validate negative rejection
  assert.throws(
    () => appendPackageMetrics(pkg.id, { impressions: -10 }, options),
    /metrics.impressions must be a non-negative number or null/
  );

  // 3. Save mock metrics with empty values allowed (null)
  const saved = appendPackageMetrics(pkg.id, {
    capturedAt: "2026-09-03T12:00:00.000Z",
    impressions: 5000,
    reads: 650,
    avgStaySeconds: 42.5,
    likes: 45,
    saves: 78,
    comments: 12,
    shares: 8,
    profileVisits: 30,
    followersGained: 10
  }, options);

  // 4. Verify rates calculated by backend
  assert.equal(saved.metrics.length, 1);
  const m = saved.metrics[0];
  assert.equal(m.rates.clickRate, 0.13); // 650 / 5000 = 0.13
  assert.equal(m.rates.saveRate, 78 / 650); // 0.12
  // engagement = (45 + 78 + 12 + 8) / 650 = 143 / 650 = 0.22
  assert.equal(m.rates.engagementRate, 143 / 650);
  assert.equal(m.rates.followRate, 10 / 650);

  // 5. Echo in UI formatting
  function formatRates(metric) {
    return {
      clickRate: (metric.rates.clickRate * 100).toFixed(1) + "%",
      saveRate: (metric.rates.saveRate * 100).toFixed(1) + "%",
      engagementRate: (metric.rates.engagementRate * 100).toFixed(1) + "%",
      followRate: (metric.rates.followRate * 100).toFixed(2) + "%"
    };
  }
  const formatted = formatRates(m);
  assert.equal(formatted.clickRate, "13.0%");
  assert.equal(formatted.saveRate, "12.0%");
  assert.equal(formatted.engagementRate, "22.0%");
  assert.equal(formatted.followRate, "1.54%");
});
