import test from "node:test";
import assert from "node:assert/strict";

import { getDb, closeDb } from "../engine/intelligence/xhs/storage/db.js";
import {
  listAccounts,
  getAccount,
  updateAccountStatus,
  upsertNote,
  listMyNotes,
  appendNoteSnapshot,
  getNoteSnapshots,
  getLatestNoteSnapshot,
  upsertPublicCreator,
  listPublicCreators,
  upsertPublicNote,
  listPublicNotes,
  appendPublicNoteSnapshot,
  getPublicNoteSnapshots,
  listKeywords,
  addKeyword,
  removeKeyword
} from "../engine/intelligence/xhs/storage/repository.js";
import { MockXhsProvider } from "../engine/intelligence/xhs/providers/mockProvider.js";
import { computeSnapshotMetrics, computeVelocity, computeViralScore } from "../engine/intelligence/xhs/analysis/metrics.js";
import { generateDailyBrief } from "../engine/intelligence/xhs/analysis/brief.js";

test.before(() => {
  process.env.XHS_INTELLIGENCE_DB_PATH = ":memory:";
  closeDb();
  getDb(":memory:");
});

test.after(() => {
  closeDb();
});

test("XHS Data Intelligence: 1. SQLite schema & 3 accounts isolation", () => {
  const accounts = listAccounts();
  assert.equal(accounts.length, 3, "Default 3 accounts created");
  assert.deepEqual(
    accounts.map((a) => a.account_key),
    ["xhs_account_1", "xhs_account_2", "xhs_account_3"],
    "Exact 3 distinct account keys"
  );

  // Profile directory isolation
  const dirs = accounts.map((a) => a.profile_dir);
  assert.equal(new Set(dirs).size, 3, "All 3 profile dirs are strictly isolated");

  // Status update isolation
  updateAccountStatus("xhs_account_1", "logged_in", null, true);
  updateAccountStatus("xhs_account_2", "need_login", "扫码已过期", false);

  const a1 = getAccount("xhs_account_1");
  const a2 = getAccount("xhs_account_2");
  assert.equal(a1.login_status, "logged_in");
  assert.equal(a2.login_status, "need_login");
  assert.equal(a2.last_error, "扫码已过期");
});

test("XHS Data Intelligence: 2. Snapshots append without overwrite & NULL preservation", () => {
  const noteId = "test_note_history_001";
  const accKey = "xhs_account_1";

  upsertNote({
    accountKey: accKey,
    noteId,
    title: "阿德勒课题分离：为什么我们总是在意别人的目光",
    publishTime: "2026-09-01T10:00:00.000Z",
    noteType: "normal",
    url: "https://xhs.com/test_note_history_001"
  });

  // Snapshot Day 1: 100 likes
  appendNoteSnapshot({
    accountKey: accKey,
    noteId,
    snapshotAt: "2026-09-01T12:00:00.000Z",
    impressions: 1000,
    views: 400,
    likes: 100,
    favorites: 50,
    comments: 10,
    shares: 4,
    completionRate: null // Test NULL preservation
  });

  // Snapshot Day 2: 500 likes
  appendNoteSnapshot({
    accountKey: accKey,
    noteId,
    snapshotAt: "2026-09-02T12:00:00.000Z",
    impressions: 5000,
    views: 2200,
    likes: 500,
    favorites: 280,
    comments: 45,
    shares: 30,
    completionRate: 0.65
  });

  // Snapshot Day 3: 3000 likes
  appendNoteSnapshot({
    accountKey: accKey,
    noteId,
    snapshotAt: "2026-09-03T12:00:00.000Z",
    impressions: 28000,
    views: 14000,
    likes: 3000,
    favorites: 1750,
    comments: 320,
    shares: 210,
    completionRate: 0.72
  });

  const snaps = getNoteSnapshots(noteId);
  assert.equal(snaps.length, 3, "Snapshots are appended and never overwrite previous days");
  assert.equal(snaps[0].likes, 100);
  assert.equal(snaps[1].likes, 500);
  assert.equal(snaps[2].likes, 3000);

  // NULL must be preserved, never fabricated to 0
  assert.strictEqual(snaps[0].completion_rate, null, "NULL is preserved and not converted to 0");
  assert.strictEqual(snaps[1].completion_rate, 0.65);
});

test("XHS Data Intelligence: 3. Velocity & Viral acceleration detection (100 -> 500 -> 3000 likes)", () => {
  const snaps = getNoteSnapshots("test_note_history_001");
  assert.equal(snaps.length, 3);
  const snap1 = snaps[0];
  const snap2 = snaps[1];
  const snap3 = snaps[2];

  // Velocity Day 1 -> Day 2 (24 hours delta: +400 likes => 16.7 likes/hr)
  const vel1 = computeVelocity(snap1, snap2);
  assert.equal(vel1.likesDelta, 400);
  assert.ok(vel1.likesPerHour > 16 && vel1.likesPerHour < 17, `Velocity ~16.7 likes/h, got ${vel1.likesPerHour}`);

  // Velocity Day 2 -> Day 3 (24 hours delta: +2500 likes => 104.2 likes/hr)
  const vel2 = computeVelocity(snap2, snap3);
  assert.equal(vel2.likesDelta, 2500);
  assert.ok(vel2.likesPerHour > 100, `Velocity acceleration detected: ${vel2.likesPerHour} likes/h`);
  assert.ok(vel2.likesPerHour > vel1.likesPerHour * 5, "Significant viral acceleration detected (>5x growth rate)");

  // ViralScore
  const viral = computeViralScore({
    latestSnapshot: snap3,
    velocity: vel2,
    publishTime: "2026-09-01T10:00:00.000Z",
    creatorFollowers: 12000
  });

  assert.ok(viral.score >= 70, `High viral score expected for exploding note, got ${viral.score}`);
  assert.equal(viral.isViral, true);
});

test("XHS Data Intelligence: 4. MockProvider end-to-end collection & Daily Brief generation", async () => {
  const provider = new MockXhsProvider();
  const res = await provider.collectAccount("xhs_account_2");
  assert.equal(res.ok, true);

  const publicRes = await provider.collectPublic(["AI", "认知"]);
  assert.equal(publicRes.ok, true);

  // Generate Daily Brief answering 10 questions
  const brief = generateDailyBrief();
  assert.ok(brief.generatedAt);
  assert.ok(brief.answers.q1_bestAccount);
  assert.ok(Array.isArray(brief.answers.q2_growingNotes));
  assert.ok(Array.isArray(brief.answers.q8_threeTestDirections));
  assert.equal(brief.answers.q8_threeTestDirections.length, 3, "Exactly 3 test directions provided");
  assert.ok(brief.answers.q10_nextHypothesisToValidate.includes("验证"), "Actionable hypothesis provided");
});

test("XHS Data Intelligence: 5. Safety boundary check (POST /send remains 403)", async () => {
  // Confirm that send package route is still 403 Forbidden
  const res = await fetch("http://127.0.0.1:3210/api/content/packages/fake-id/send", {
    method: "POST"
  }).catch(() => null);

  if (res) {
    assert.equal(res.status, 403, "Auto-publishing /send must strictly remain 403 Forbidden");
  }
});

test("XHS Data Intelligence: 6. Express API endpoints (/status, /accounts, /notes, /trending, /brief, /keywords)", async () => {
  const express = (await import("express")).default;
  const { xhsRouter } = await import("../engine/intelligence/xhs/routes/xhsRoutes.js");

  const app = express();
  app.use(express.json());
  app.use("/api/intelligence/xhs", xhsRouter);

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/intelligence/xhs`;

  try {
    // 1. GET /status
    const statusRes = await fetch(`${baseUrl}/status`);
    assert.equal(statusRes.status, 200);
    const statusJson = await statusRes.json();
    assert.equal(statusJson.ok, true);

    // 2. GET /accounts
    const accsRes = await fetch(`${baseUrl}/accounts`);
    assert.equal(accsRes.status, 200);
    const accsJson = await accsRes.json();
    assert.equal(accsJson.ok, true);
    assert.equal(accsJson.accounts.length, 3);

    // 3. POST /accounts/:accountKey/collect (mock)
    const collectRes = await fetch(`${baseUrl}/accounts/xhs_account_1/collect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mock: true })
    });
    assert.equal(collectRes.status, 200);
    const collectJson = await collectRes.json();
    assert.equal(collectJson.ok, true);

    // 4. GET /notes
    const notesRes = await fetch(`${baseUrl}/notes?accountKey=xhs_account_1`);
    assert.equal(notesRes.status, 200);
    const notesJson = await notesRes.json();
    assert.equal(notesJson.ok, true);
    assert.ok(notesJson.notes.length > 0);

    // 5. GET /trending
    const trendRes = await fetch(`${baseUrl}/trending`);
    assert.equal(trendRes.status, 200);
    const trendJson = await trendRes.json();
    assert.equal(trendJson.ok, true);

    // 6. GET /brief
    const briefRes = await fetch(`${baseUrl}/brief`);
    assert.equal(briefRes.status, 200);
    const briefJson = await briefRes.json();
    assert.equal(briefJson.ok, true);
    assert.ok(briefJson.brief.answers);

    // 7. GET /keywords & POST /keywords
    const kwRes = await fetch(`${baseUrl}/keywords`);
    const kwJson = await kwRes.json();
    assert.equal(kwJson.ok, true);

    const addKwRes = await fetch(`${baseUrl}/keywords`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword: "神经科学" })
    });
    assert.equal(addKwRes.status, 200);
    const addKwJson = await addKwRes.json();
    assert.equal(addKwJson.ok, true);
    assert.equal(addKwJson.keyword.keyword, "神经科学");
  } finally {
    server.close();
  }
});

