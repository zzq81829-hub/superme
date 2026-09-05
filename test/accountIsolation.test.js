import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import {
  createPackage,
  updatePackage,
  freezePackage,
  approvePackage,
  getPackage,
  validateAccountPipelineIsolation,
  PipelineRoutingError,
  normalizeAccountIdentifier
} from "../src/content/store.js";
import {
  resolvePublisherAccount,
  publishApprovedPackage
} from "../src/publish/xhs.js";
import { getDb, closeDb } from "../engine/intelligence/xhs/storage/db.js";
import { listMyNotes, appendNoteSnapshot, getNoteSnapshots } from "../engine/intelligence/xhs/storage/repository.js";
import { loadOutbox, enqueueDelivery, allowPackageDelivery } from "../src/delivery/outbox.js";

// Helper: isolated directory for packages and media
function createIsolatedTestDir() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "m1-isolation-test-"));
  fs.mkdirSync(path.join(tmp, "media"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "staging"), { recursive: true });
  return tmp;
}

// Helper: complete experiment fixture supporting account override
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

// Helper: mock MCP request handler
function createMockMcpRequest(recordBox = {}) {
  return async (method, url, body) => {
    recordBox.lastCall = { method, url, body };
    return {
      status: 200,
      json: { success: true, message: "发布成功", data: { note_id: `note-${Date.now()}` } },
      raw: ""
    };
  };
}

// ==========================================
// TIER 1: HAPPY PATH VALID PACKAGING & PUBLISHING
// ==========================================

test("Tier 1 - Happy Path: Valid Shuzhai (good try / xhs_account_1) package creates, freezes and approves cleanly", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir };
  const coverPath = path.join(baseDir, "media", "book_cover.png");
  fs.writeFileSync(coverPath, "fake-png-shuzhai");

  const pkg = createPackage({
    title: "阿德勒心理学：课题分离实践",
    platform: "xiaohongshu",
    project: "shuzhai",
    accountId: "xhs_account_1",
    body: "# 标题\n\n课题分离这一招真的有用\n\n# 正文\n\n先把别人的课题还回去。\n\n#课题分离 #认知思维",
    layout: { templateId: "shuzhai-editorial-v1" },
    layers: { facts: [{ id: "f1", text: "《被讨厌的勇气》第三夜", source: "阿德勒" }] },
    media: [{ kind: "image", path: coverPath }],
    experiment: completeExperiment({ accountId: "shuzhai" })
  }, options);

  assert.equal(pkg.status, "draft");
  assert.equal(pkg.accountId, "xhs_account_1");
  assert.doesNotThrow(() => validateAccountPipelineIsolation(pkg, "xhs_account_1"));

  const frozen = freezePackage(pkg.id, options);
  assert.equal(frozen.status, "awaiting_approval");

  const approved = approvePackage(pkg.id, options);
  assert.equal(approved.status, "approved");
  assert.equal(approved.approvalStatus, "approved");
});

test("Tier 1 - Happy Path: Valid Gold chance (xhs_account_2) package creates, freezes and approves cleanly", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir };
  const cardPath = path.join(baseDir, "media", "dark_tweet_card.png");
  fs.writeFileSync(cardPath, "fake-png-tweet");

  const pkg = createPackage({
    title: "变富的小技巧",
    platform: "xiaohongshu",
    project: "x_curation",
    accountId: "xhs_account_2",
    body: "① 提升睡后收入 ✅ 基本靠谱 / 科学依据充分\n普通人尽早配置被动收入现金流。\n\n② 盲目加杠杆 ❌ 纯属营销噱头 / 伪科学\n极高破产风险。\n\n#搞钱思维 #财富自由",
    authorPinnedComment: "优先级：① > ②，而 ② 纯属割韭菜",
    feasibilityRatings: [
      { index: 1, claim: "提升睡后收入", badge: "✅ 基本靠谱 / 科学依据充分", critique: "现金流配置" },
      { index: 2, claim: "盲目加杠杆", badge: "❌ 纯属营销噱头 / 伪科学", critique: "极高破产风险" }
    ],
    media: [{ kind: "image", path: cardPath, theme: "dark" }],
    experiment: completeExperiment({ accountId: "x_curation" })
  }, options);

  assert.equal(pkg.status, "draft");
  assert.equal(pkg.accountId, "xhs_account_2");
  assert.doesNotThrow(() => validateAccountPipelineIsolation(pkg, "xhs_account_2"));

  const frozen = freezePackage(pkg.id, options);
  assert.equal(frozen.status, "awaiting_approval");

  const approved = approvePackage(pkg.id, options);
  assert.equal(approved.status, "approved");
  assert.equal(approved.approvalStatus, "approved");
});

test("Tier 1 - Happy Path: Publisher resolves accounts matching data/accounts.json and writes staging.json", async () => {
  const baseDir = createIsolatedTestDir();
  const stagingDir = path.join(baseDir, "staging");
  const options = { baseDir, stagingDir, loginStatus: { loggedIn: true } };

  // Shuzhai resolution
  const resShuzhai = resolvePublisherAccount({ project: "shuzhai" });
  assert.equal(resShuzhai.id, "shuzhai");
  assert.equal(resShuzhai.name, "good try");
  assert.equal(resShuzhai.profileDir, "xhs_account_1");

  // Gold chance resolution
  const resGold = resolvePublisherAccount({ project: "x_curation" });
  assert.equal(resGold.id, "x_curation");
  assert.equal(resGold.name, "Gold chance");
  assert.equal(resGold.profileDir, "xhs_account_2");

  // Staging verification
  const imgPath = path.join(baseDir, "media", "stage_test.png");
  fs.writeFileSync(imgPath, "fake-image");

  const pkg = createPackage({
    title: "测试暂存账本",
    platform: "xiaohongshu",
    project: "shuzhai",
    accountId: "xhs_account_1",
    body: "书斋文案",
    media: [{ kind: "image", path: imgPath }],
    experiment: completeExperiment({ accountId: "shuzhai" })
  }, options);
  freezePackage(pkg.id, options);
  approvePackage(pkg.id, options);

  const mockBox = {};
  const pubRes = await publishApprovedPackage(pkg.id, {
    ...options,
    request: createMockMcpRequest(mockBox)
  });
  assert.equal(pubRes.ok, true);

  const manifestPath = path.join(stagingDir, pkg.id, "staging.json");
  assert.ok(fs.existsSync(manifestPath), "staging.json must be created");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.packageId, pkg.id);
  assert.equal(manifest.account_id, "shuzhai");
  assert.equal(manifest.profileDir, "xhs_account_1");
  assert.ok(Array.isArray(manifest.images) && manifest.images.length > 0);
});

test("Tier 1 - Happy Path: Legacy drafts without explicit accountId default safely to Shuzhai", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir };

  const pkg = createPackage({
    title: "经典遗留包测试",
    platform: "xiaohongshu",
    project: "shuzhai",
    body: "正常读书笔记正文",
    experiment: completeExperiment()
  }, options);

  assert.equal(pkg.accountId, "xhs_account_1");
  assert.doesNotThrow(() => freezePackage(pkg.id, options));
});

// ==========================================
// TIER 2: STRICT REJECTION OF CROSS-PIPELINE BLEED
// ==========================================

test("Tier 2 - Strict Isolation: Shuzhai (xhs_account_1) strictly rejects X curation feasibility badges", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir };

  // Case A: Feasibility badge in body
  assert.throws(
    () => {
      createPackage({
        title: "读书打假",
        platform: "xiaohongshu",
        project: "shuzhai",
        accountId: "xhs_account_1",
        body: "书中观点 ① ✅ 基本靠谱 / 科学依据充分\n验证结论。",
        experiment: completeExperiment({ accountId: "shuzhai" })
      }, options);
    },
    (err) => {
      assert.ok(err instanceof PipelineRoutingError);
      assert.match(err.message, /strictly rejects X curation/i);
      assert.match(err.message, /feasibility badge/i);
      return true;
    }
  );

  // Case B: Feasibility rating structure in input
  assert.throws(
    () => {
      createPackage({
        title: "读书笔记",
        platform: "xiaohongshu",
        project: "shuzhai",
        accountId: "xhs_account_1",
        body: "纯净正文",
        feasibilityRatings: [{ index: 1, claim: "某个论断", badge: "⚠️ 因果夸大", critique: "过于夸张" }],
        experiment: completeExperiment({ accountId: "shuzhai" })
      }, options);
    },
    (err) => {
      assert.ok(err instanceof PipelineRoutingError);
      assert.match(err.message, /feasibilityRatings/i);
      return true;
    }
  );
});

test("Tier 2 - Strict Isolation: Shuzhai (xhs_account_1) strictly rejects dark tweet visual cards and twitter media", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir };

  // Case A: Dark tweet visual card on creation
  assert.throws(
    () => {
      createPackage({
        title: "读书笔记混入推特卡",
        platform: "xiaohongshu",
        project: "shuzhai",
        accountId: "xhs_account_1",
        body: "正文",
        visualCard: { path: "tweet_card.png", theme: "dark" },
        experiment: completeExperiment({ accountId: "shuzhai" })
      }, options);
    },
    (err) => {
      assert.ok(err instanceof PipelineRoutingError);
      assert.match(err.message, /visualCard/i);
      return true;
    }
  );

  // Case B: Media contains tweet asset on freeze
  const pkg = createPackage({
    title: "合规书斋草稿",
    platform: "xiaohongshu",
    project: "shuzhai",
    accountId: "xhs_account_1",
    body: "合规正文",
    experiment: completeExperiment({ accountId: "shuzhai" })
  }, options);

  assert.throws(
    () => updatePackage(pkg.id, {
      media: [{ kind: "image", path: "tweet_screenshot_01.png" }]
    }, options),
    (err) => {
      assert.ok(err instanceof PipelineRoutingError);
      assert.match(err.message, /media contains X tweet asset/i);
      return true;
    }
  );
});

test("Tier 2 - Strict Isolation: Shuzhai (xhs_account_1) strictly rejects author pinned comment ranking", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir };

  assert.throws(
    () => {
      createPackage({
        title: "读书笔记",
        platform: "xiaohongshu",
        project: "shuzhai",
        accountId: "xhs_account_1",
        body: "合规读书正文",
        authorPinnedComment: "优先级：⑥ > ② > ⑦，而其余为营销噱头",
        experiment: completeExperiment({ accountId: "shuzhai" })
      }, options);
    },
    (err) => {
      assert.ok(err instanceof PipelineRoutingError);
      assert.match(err.message, /authorPinnedComment/i);
      return true;
    }
  );
});

test("Tier 2 - Strict Isolation: Gold chance (xhs_account_2) strictly rejects Shuzhai book layout templates", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir };

  assert.throws(
    () => {
      createPackage({
        title: "变富的小技巧",
        platform: "xiaohongshu",
        project: "x_curation",
        accountId: "xhs_account_2",
        body: "推文正文",
        layout: { templateId: "shuzhai-editorial-v1" },
        experiment: completeExperiment({ accountId: "x_curation" })
      }, options);
    },
    (err) => {
      assert.ok(err instanceof PipelineRoutingError);
      assert.match(err.message, /strictly rejects Shuzhai book card layouts/i);
      return true;
    }
  );
});

test("Tier 2 - Strict Isolation: Gold chance (xhs_account_2) strictly rejects book citations in facts", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir };

  assert.throws(
    () => {
      createPackage({
        title: "变富的小技巧",
        platform: "xiaohongshu",
        project: "x_curation",
        accountId: "xhs_account_2",
        body: "推文正文",
        layers: { facts: [{ id: "f1", text: "引用自《金钱心理学》第二章" }] },
        experiment: completeExperiment({ accountId: "x_curation" })
      }, options);
    },
    (err) => {
      assert.ok(err instanceof PipelineRoutingError);
      assert.match(err.message, /book citations in facts/i);
      return true;
    }
  );
});

test("Tier 2 - Strict Isolation: Gold chance (xhs_account_2) requires X curation visual/feasibility assets on freeze", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir };

  const pkg = createPackage({
    title: "变富的小技巧",
    platform: "xiaohongshu",
    project: "x_curation",
    accountId: "xhs_account_2",
    body: "普通正文，无核查无评级无卡片",
    experiment: completeExperiment({ accountId: "x_curation" })
  }, options);

  assert.throws(
    () => freezePackage(pkg.id, options),
    (err) => {
      assert.ok(err instanceof PipelineRoutingError);
      assert.match(err.message, /requires X curation visual or feasibility assets/i);
      return true;
    }
  );
});

test("Tier 2 - Strict Isolation: Mismatched Account ID vs Project at packaging is immediately rejected", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir };

  // Case A: Shuzhai project with xhs_account_2
  assert.throws(
    () => {
      createPackage({
        title: "错配测试1",
        platform: "xiaohongshu",
        project: "shuzhai",
        accountId: "xhs_account_2",
        body: "正文",
        experiment: completeExperiment()
      }, options);
    },
    (err) => {
      assert.ok(err instanceof PipelineRoutingError);
      assert.match(err.message, /Account-project mismatch/i);
      return true;
    }
  );

  // Case B: x_curation project with xhs_account_1
  assert.throws(
    () => {
      createPackage({
        title: "错配测试2",
        platform: "xiaohongshu",
        project: "x_curation",
        accountId: "xhs_account_1",
        body: "正文",
        experiment: completeExperiment({ accountId: "x_curation" })
      }, options);
    },
    (err) => {
      assert.ok(err instanceof PipelineRoutingError);
      assert.match(err.message, /Account-project mismatch/i);
      return true;
    }
  );
});

test("Tier 2 - Strict Isolation: Unknown or arbitrary account ID injection is rejected", () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir };

  assert.throws(
    () => {
      createPackage({
        title: "未知账号注入",
        platform: "xiaohongshu",
        project: "shuzhai",
        accountId: "xhs_account_99",
        body: "正文",
        experiment: completeExperiment()
      }, options);
    },
    (err) => {
      assert.ok(err instanceof PipelineRoutingError);
      assert.match(err.message, /Unknown account: xhs_account_99/i);
      return true;
    }
  );
});

test("Tier 2 - Strict Isolation: Publisher refuses cross-routed account dispatch and catches pipeline routing error", async () => {
  const baseDir = createIsolatedTestDir();
  const options = { baseDir, loginStatus: { loggedIn: true } };
  const imgPath = path.join(baseDir, "media", "valid_shuzhai.png");
  fs.writeFileSync(imgPath, "fake-image");

  const pkg = createPackage({
    title: "阿德勒心理学",
    platform: "xiaohongshu",
    project: "shuzhai",
    accountId: "xhs_account_1",
    body: "书斋笔记正文",
    media: [{ kind: "image", path: imgPath }],
    experiment: completeExperiment({ accountId: "shuzhai" })
  }, options);
  freezePackage(pkg.id, options);
  approvePackage(pkg.id, options);

  // Attempt to publish Shuzhai package to xhs_account_2 (Gold chance)
  const result = await publishApprovedPackage(pkg.id, {
    ...options,
    explicitAccount: "xhs_account_2",
    request: createMockMcpRequest()
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "pipeline_routing_error");
  assert.match(result.message, /Account-project mismatch|strictly rejects/i);
});

// ==========================================
// TIER 2: LEDGER AND DATABASE RECORDING VERIFICATION
// ==========================================

test("Tier 2 - Ledger Verification: SQLite database records account_id and profile_dir matching data/accounts.json", async () => {
  process.env.XHS_INTELLIGENCE_DB_PATH = ":memory:";
  closeDb();
  const db = getDb(":memory:");

  const baseDir = createIsolatedTestDir();
  const stagingDir = path.join(baseDir, "staging");
  const options = { baseDir, stagingDir, loginStatus: { loggedIn: true } };

  // 1. Shuzhai Note Publish
  const img1 = path.join(baseDir, "media", "shuzhai_cover.png");
  fs.writeFileSync(img1, "fake-shuzhai");
  const pkg1 = createPackage({
    title: "自卑与超越读书笔记",
    platform: "xiaohongshu",
    project: "shuzhai",
    accountId: "xhs_account_1",
    body: "# 标题\n\n自卑与超越\n\n# 正文\n\n超越自卑的路径。\n\n#读书",
    media: [{ kind: "image", path: img1 }],
    experiment: completeExperiment({ accountId: "shuzhai" })
  }, options);
  freezePackage(pkg1.id, options);
  approvePackage(pkg1.id, options);

  const mcpBox1 = {};
  const res1 = await publishApprovedPackage(pkg1.id, {
    ...options,
    request: createMockMcpRequest(mcpBox1)
  });
  assert.equal(res1.ok, true);

  // Verify DB entry for Shuzhai
  const noteRow1 = db.prepare("SELECT * FROM xhs_notes WHERE note_id = ?").get(pkg1.id);
  assert.ok(noteRow1, "Shuzhai note must exist in xhs_notes");
  assert.equal(noteRow1.account_key, "xhs_account_1");
  assert.equal(noteRow1.account_id, "shuzhai");
  assert.equal(noteRow1.profile_dir, "xhs_account_1");

  const accRow1 = db.prepare("SELECT * FROM xhs_accounts WHERE account_key = ?").get("xhs_account_1");
  assert.ok(accRow1);
  assert.equal(accRow1.account_id, "shuzhai");

  // 2. Gold chance Note Publish
  const img2 = path.join(baseDir, "media", "gold_tweet.png");
  fs.writeFileSync(img2, "fake-tweet");
  const pkg2 = createPackage({
    title: "变富的小技巧",
    platform: "xiaohongshu",
    project: "x_curation",
    accountId: "xhs_account_2",
    body: "① 提升睡后收入 ✅ 基本靠谱 / 科学依据充分\n普通人尽早配置现金流。\n\n#搞钱思维",
    authorPinnedComment: "优先级：① > ②",
    feasibilityRatings: [{ index: 1, claim: "睡后收入", badge: "✅ 基本靠谱 / 科学依据充分", critique: "现金流" }],
    media: [{ kind: "image", path: img2 }],
    experiment: completeExperiment({ accountId: "x_curation" })
  }, options);
  freezePackage(pkg2.id, options);
  approvePackage(pkg2.id, options);

  const mcpBox2 = {};
  const res2 = await publishApprovedPackage(pkg2.id, {
    ...options,
    request: createMockMcpRequest(mcpBox2)
  });
  assert.equal(res2.ok, true);

  // Verify DB entry for Gold chance
  const noteRow2 = db.prepare("SELECT * FROM xhs_notes WHERE note_id = ?").get(pkg2.id);
  assert.ok(noteRow2, "Gold chance note must exist in xhs_notes");
  assert.equal(noteRow2.account_key, "xhs_account_2");
  assert.equal(noteRow2.account_id, "x_curation");
  assert.equal(noteRow2.profile_dir, "xhs_account_2");

  const accRow2 = db.prepare("SELECT * FROM xhs_accounts WHERE account_key = ?").get("xhs_account_2");
  assert.ok(accRow2);
  assert.equal(accRow2.account_id, "x_curation");

  closeDb();
});

test("Tier 2 - Ledger Verification: Query partitioning via listMyNotes guarantees 0 cross-account contamination", () => {
  process.env.XHS_INTELLIGENCE_DB_PATH = ":memory:";
  closeDb();
  const db = getDb(":memory:");

  const insert = db.prepare(`
    INSERT INTO xhs_notes (account_key, account_id, profile_dir, note_id, title, publish_time, note_type, url, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), 'normal', 'https://xhs.com/test', datetime('now'), datetime('now'))
  `);

  insert.run("xhs_account_1", "shuzhai", "xhs_account_1", "shuzhai-1", "书斋笔记1");
  insert.run("xhs_account_2", "x_curation", "xhs_account_2", "gold-1", "推特编译1");
  insert.run("xhs_account_1", "shuzhai", "xhs_account_1", "shuzhai-2", "书斋笔记2");
  insert.run("xhs_account_2", "x_curation", "xhs_account_2", "gold-2", "推特编译2");
  insert.run("xhs_account_1", "shuzhai", "xhs_account_1", "shuzhai-3", "书斋笔记3");

  const shuzhaiNotes = listMyNotes("xhs_account_1");
  const goldNotes = listMyNotes("xhs_account_2");

  assert.equal(shuzhaiNotes.length, 3);
  assert.ok(shuzhaiNotes.every((n) => n.account_key === "xhs_account_1"));
  assert.ok(shuzhaiNotes.every((n) => n.account_id === "shuzhai"));
  assert.ok(shuzhaiNotes.every((n) => !n.note_id.startsWith("gold-")));

  assert.equal(goldNotes.length, 2);
  assert.ok(goldNotes.every((n) => n.account_key === "xhs_account_2"));
  assert.ok(goldNotes.every((n) => n.account_id === "x_curation"));
  assert.ok(goldNotes.every((n) => !n.note_id.startsWith("shuzhai-")));

  closeDb();
});

test("Tier 2 - Ledger Verification: Note snapshot time-series partitioning preserves account_id and profile_dir", () => {
  process.env.XHS_INTELLIGENCE_DB_PATH = ":memory:";
  closeDb();
  const db = getDb(":memory:");

  appendNoteSnapshot({
    accountKey: "xhs_account_1",
    accountId: "shuzhai",
    profileDir: "xhs_account_1",
    noteId: "note-snap-1",
    impressions: 500,
    likes: 50
  });

  appendNoteSnapshot({
    accountKey: "xhs_account_2",
    accountId: "x_curation",
    profileDir: "xhs_account_2",
    noteId: "note-snap-2",
    impressions: 1200,
    likes: 150
  });

  const row1 = db.prepare("SELECT * FROM xhs_note_snapshots WHERE note_id = ?").get("note-snap-1");
  assert.ok(row1);
  assert.equal(row1.account_key, "xhs_account_1");
  assert.equal(row1.account_id, "shuzhai");
  assert.equal(row1.profile_dir, "xhs_account_1");

  const row2 = db.prepare("SELECT * FROM xhs_note_snapshots WHERE note_id = ?").get("note-snap-2");
  assert.ok(row2);
  assert.equal(row2.account_key, "xhs_account_2");
  assert.equal(row2.account_id, "x_curation");
  assert.equal(row2.profile_dir, "xhs_account_2");

  closeDb();
});

test("Tier 2 - Ledger Verification: Delivery outbox entries record accountId and profileDir", () => {
  const tmpOutbox = path.join(os.tmpdir(), `outbox-${Date.now()}.json`);
  const options = { file: tmpOutbox };

  // Enqueue test
  const enq = enqueueDelivery({
    fileId: "f-123",
    packageId: "shuzhai-pkg-1",
    channel: "xiaohongshu",
    accountId: "shuzhai",
    profileDir: "xhs_account_1"
  }, options);

  assert.equal(enq.accountId, "shuzhai");
  assert.equal(enq.account_id, "shuzhai");
  assert.equal(enq.profileDir, "xhs_account_1");
  assert.equal(enq.profile_dir, "xhs_account_1");

  // Allow delivery test
  const allowed = allowPackageDelivery("shuzhai-pkg-1", options);
  assert.ok(allowed.length > 0);
  assert.equal(allowed[0].accountId, "shuzhai");
  assert.equal(allowed[0].profileDir, "xhs_account_1");

  try { fs.unlinkSync(tmpOutbox); } catch {}
});
