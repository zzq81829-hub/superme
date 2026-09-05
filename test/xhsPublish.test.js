import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import {
  createPackage,
  freezePackage,
  approvePackage,
  getPackage,
  computeContentPackageHash
} from "../src/content/store.js";
import {
  parseXhsCaption,
  clipXhsTitle,
  buildXhsNote,
  publishApprovedPackage
} from "../src/publish/xhs.js";

function tmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xhs-pub-"));
  fs.mkdirSync(path.join(dir, "img"), { recursive: true });
  return dir;
}

function writePng(file) {
  fs.writeFileSync(file, "fake-image");
}

function completeExperiment() {
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
    hypothesisIds: ["H-TEST"]
  };
}

test("parseXhsCaption splits title, body and tags", () => {
  const parsed = parseXhsCaption(
    "# 标题\n\n课题分离这一招\n\n# 正文\n\n别人的评价是别人的课题。\n\n#课题分离 #自我成长",
    "fallback"
  );
  assert.equal(parsed.title, "课题分离这一招");
  assert.match(parsed.content, /别人的评价是别人的课题/);
  assert.equal(parsed.content.includes("#课题分离"), false);
  assert.deepEqual(parsed.tags, ["课题分离", "自我成长"]);
});

test("clipXhsTitle stays within 20 characters", () => {
  assert.equal([...clipXhsTitle("《被讨厌的勇气》：别人怎么看你，真的跟你没关系")].length, 20);
});

test("buildXhsNote only keeps existing image files", () => {
  const rootDir = tmpDir();
  writePng(path.join(rootDir, "img", "cover.png"));
  const note = buildXhsNote({
    title: "课题分离这一招真的有用",
    body: "# 标题\n\n课题分离这一招真的有用\n\n# 正文\n\n先把别人的课题还回去。\n\n#课题分离",
    media: [
      { kind: "image", path: "img/cover.png" },
      { kind: "image", path: "img/missing.png" },
      { kind: "document", path: "readme.md" }
    ]
  }, rootDir);
  assert.equal(note.images.length, 1);
  assert.equal(note.tags[0], "课题分离");
  assert.ok(note.title.length > 0);
});

test("publishApprovedPackage refuses unapproved packages", async () => {
  const baseDir = tmpDir();
  const pkg = createPackage({
    title: "未审批",
    platform: "xiaohongshu",
    body: "正文"
  }, { baseDir });
  const result = await publishApprovedPackage(pkg.id, { baseDir });
  assert.equal(result.ok, false);
  assert.equal(result.error, "not_approved");
});

test("approve then publish: not logged in stays approved with error", async () => {
  const rootDir = tmpDir();
  writePng(path.join(rootDir, "cover.png"));
  const pkg = createPackage({
    title: "课题分离这一招",
    platform: "xiaohongshu",
    body: "# 标题\n\n课题分离这一招\n\n# 正文\n\n别人的评价是别人的课题。\n\n#课题分离",
    experiment: completeExperiment(),
    media: [{ kind: "image", path: path.join(rootDir, "cover.png") }]
  }, { baseDir: rootDir });
  freezePackage(pkg.id, { baseDir: rootDir });
  approvePackage(pkg.id, { baseDir: rootDir });

  const result = await publishApprovedPackage(pkg.id, {
    baseDir: rootDir,
    rootDir,
    loginStatus: { loggedIn: false }
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "xiaohongshu_not_logged_in");
  const stored = getPackage(pkg.id, { baseDir: rootDir });
  assert.equal(stored.status, "approved");
  assert.match(stored.lastPublishError, /未上号/);
});

test("approve then publish: mock MCP marks published", async () => {
  const rootDir = tmpDir();
  writePng(path.join(rootDir, "cover.png"));
  const pkg = createPackage({
    title: "课题分离这一招",
    platform: "xiaohongshu",
    body: "# 标题\n\n课题分离这一招\n\n# 正文\n\n别人的评价是别人的课题。\n\n#课题分离",
    experiment: completeExperiment(),
    media: [{ kind: "image", path: path.join(rootDir, "cover.png") }]
  }, { baseDir: rootDir });
  freezePackage(pkg.id, { baseDir: rootDir });
  approvePackage(pkg.id, { baseDir: rootDir });
  const hashBefore = computeContentPackageHash(getPackage(pkg.id, { baseDir: rootDir }));

  let posted = null;
  const result = await publishApprovedPackage(pkg.id, {
    baseDir: rootDir,
    rootDir,
    stagingDir: path.join(rootDir, "staging"),
    loginStatus: { loggedIn: true },
    baseUrl: "http://127.0.0.1:18060",
    request: async (_method, url, body) => {
      posted = { url, body };
      return { status: 200, json: { success: true, message: "发布成功", data: { status: "发布完成" } }, raw: "" };
    }
  });

  assert.equal(result.ok, true);
  assert.equal(posted.url, "http://127.0.0.1:18060/api/v1/publish");
  assert.equal(posted.body.tags[0], "课题分离");
  assert.equal(posted.body.images.length, 1);
  assert.match(posted.body.images[0], /img-01\.png$/);
  const stored = getPackage(pkg.id, { baseDir: rootDir });
  assert.equal(stored.status, "published");
  assert.equal(computeContentPackageHash(stored), hashBefore);
});
