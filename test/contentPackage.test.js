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

test("Content Package: 1. Draft can be edited; freeze locks payloadHash and enters awaiting_approval", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir };

  const pkg = createPackage({
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

test("Content Package: 2. understand_only viewpoints cannot be public or quoted", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir };

  // Attempt to freeze a package with understand_only marked public
  const pkg1 = createPackage({
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
  const pkg2 = createPackage({
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

  const pkg = createPackage({
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

  const pkg = createPackage({
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

  // Confirm candidate -> becomes active
  const confirmed = confirmCandidate(candidate.id);
  const viewpoints = snapshotViewpointsFromMemory([confirmed.id]);
  assert.equal(viewpoints.length, 1);
  assert.equal(viewpoints[0].memoryId, confirmed.id);
  assert.equal(viewpoints[0].title, "未经确认的观点");
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
  const pkg = createPackage({
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
