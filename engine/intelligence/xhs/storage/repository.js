import { getDb } from "./db.js";

// ===== 1. Accounts =====
export function listAccounts() {
  const db = getDb();
  return db.prepare("SELECT * FROM xhs_accounts ORDER BY id ASC").all();
}

export function getAccount(accountKey) {
  const db = getDb();
  return db.prepare("SELECT * FROM xhs_accounts WHERE account_key = ?").get(accountKey);
}

export function updateAccountStatus(accountKey, status, errorMsg = null, success = false) {
  const db = getDb();
  const now = new Date().toISOString();
  if (success) {
    db.prepare(`
      UPDATE xhs_accounts 
      SET login_status = ?, last_success_at = ?, last_error = NULL, updated_at = ?
      WHERE account_key = ?
    `).run(status, now, now, accountKey);
  } else {
    db.prepare(`
      UPDATE xhs_accounts 
      SET login_status = ?, last_error = ?, updated_at = ?
      WHERE account_key = ?
    `).run(status, errorMsg, now, accountKey);
  }
}

// ===== 2. My Notes & Snapshots =====
export function upsertNote({ accountKey, noteId, title, publishTime, noteType, url }) {
  const db = getDb();
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT id FROM xhs_notes WHERE account_key = ? AND note_id = ?").get(accountKey, noteId);
  if (existing) {
    db.prepare(`
      UPDATE xhs_notes 
      SET title = COALESCE(?, title),
          publish_time = COALESCE(?, publish_time),
          note_type = COALESCE(?, note_type),
          url = COALESCE(?, url),
          updated_at = ?
      WHERE account_key = ? AND note_id = ?
    `).run(title, publishTime, noteType, url, now, accountKey, noteId);
    return existing.id;
  } else {
    const res = db.prepare(`
      INSERT INTO xhs_notes (account_key, note_id, title, publish_time, note_type, url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(accountKey, noteId, title, publishTime, noteType, url, now, now);
    return Number(res.lastInsertRowid);
  }
}

export function listMyNotes(accountKey = null, limit = 50) {
  const db = getDb();
  if (accountKey) {
    return db.prepare("SELECT * FROM xhs_notes WHERE account_key = ? ORDER BY publish_time DESC, id DESC LIMIT ?").all(accountKey, limit);
  }
  return db.prepare("SELECT * FROM xhs_notes ORDER BY publish_time DESC, id DESC LIMIT ?").all(limit);
}

export function appendNoteSnapshot({
  accountKey,
  noteId,
  snapshotAt,
  dataDate,
  impressions,
  views,
  likes,
  favorites,
  comments,
  shares,
  followersGained,
  twoSecondExitRate,
  completionRate,
  averageWatchTime,
  source = "creator_center",
  rawPayloadHash = null
}) {
  const db = getDb();
  const time = snapshotAt || new Date().toISOString();
  const res = db.prepare(`
    INSERT INTO xhs_note_snapshots (
      account_key, note_id, snapshot_at, data_date,
      impressions, views, likes, favorites, comments, shares,
      followers_gained, two_second_exit_rate, completion_rate, average_watch_time,
      source, raw_payload_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    accountKey, noteId, time, dataDate || null,
    impressions ?? null, views ?? null, likes ?? null, favorites ?? null, comments ?? null, shares ?? null,
    followersGained ?? null, twoSecondExitRate ?? null, completionRate ?? null, averageWatchTime ?? null,
    source, rawPayloadHash
  );
  return Number(res.lastInsertRowid);
}

export function getNoteSnapshots(noteId, limit = 30) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM xhs_note_snapshots 
    WHERE note_id = ? 
    ORDER BY snapshot_at ASC
    LIMIT ?
  `).all(noteId, limit);
}

export function getLatestNoteSnapshot(noteId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM xhs_note_snapshots 
    WHERE note_id = ? 
    ORDER BY snapshot_at DESC, id DESC 
    LIMIT 1
  `).get(noteId);
}

// ===== 3. Public Creators, Notes & Snapshots =====
export function upsertPublicCreator({ creatorId, nickname, profileUrl, followers, notesCount, tracked = 1 }) {
  const db = getDb();
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT id FROM xhs_public_creators WHERE creator_id = ?").get(creatorId);
  if (existing) {
    db.prepare(`
      UPDATE xhs_public_creators 
      SET nickname = COALESCE(?, nickname),
          profile_url = COALESCE(?, profile_url),
          followers = COALESCE(?, followers),
          notes_count = COALESCE(?, notes_count),
          tracked = COALESCE(?, tracked),
          updated_at = ?
      WHERE creator_id = ?
    `).run(nickname, profileUrl, followers, notesCount, tracked, now, creatorId);
    return existing.id;
  } else {
    const res = db.prepare(`
      INSERT INTO xhs_public_creators (creator_id, nickname, profile_url, followers, notes_count, tracked, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(creatorId, nickname, profileUrl, followers ?? null, notesCount ?? null, tracked, now, now);
    return Number(res.lastInsertRowid);
  }
}

export function listPublicCreators() {
  const db = getDb();
  return db.prepare("SELECT * FROM xhs_public_creators ORDER BY followers DESC, id DESC").all();
}

export function upsertPublicNote({ noteId, creatorId, title, text, publishTime, url, tags, noteType, discoveredFrom }) {
  const db = getDb();
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT id FROM xhs_public_notes WHERE note_id = ?").get(noteId);
  if (existing) {
    db.prepare(`
      UPDATE xhs_public_notes 
      SET title = COALESCE(?, title),
          text = COALESCE(?, text),
          publish_time = COALESCE(?, publish_time),
          url = COALESCE(?, url),
          tags = COALESCE(?, tags),
          note_type = COALESCE(?, note_type),
          discovered_from = COALESCE(?, discovered_from),
          updated_at = ?
      WHERE note_id = ?
    `).run(title, text, publishTime, url, tags, noteType, discoveredFrom, now, noteId);
    return existing.id;
  } else {
    const res = db.prepare(`
      INSERT INTO xhs_public_notes (note_id, creator_id, title, text, publish_time, url, tags, note_type, discovered_from, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(noteId, creatorId, title, text, publishTime, url, tags, noteType, discoveredFrom, now, now);
    return Number(res.lastInsertRowid);
  }
}

export function listPublicNotes(limit = 100) {
  const db = getDb();
  return db.prepare("SELECT * FROM xhs_public_notes ORDER BY publish_time DESC, id DESC LIMIT ?").all(limit);
}

export function appendPublicNoteSnapshot({ noteId, snapshotAt, likes, favorites, comments, shares, creatorFollowers, source = "public_search" }) {
  const db = getDb();
  const time = snapshotAt || new Date().toISOString();
  const res = db.prepare(`
    INSERT INTO xhs_public_note_snapshots (note_id, snapshot_at, likes, favorites, comments, shares, creator_followers, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(noteId, time, likes ?? null, favorites ?? null, comments ?? null, shares ?? null, creatorFollowers ?? null, source);
  return Number(res.lastInsertRowid);
}

export function getPublicNoteSnapshots(noteId, limit = 30) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM xhs_public_note_snapshots 
    WHERE note_id = ? 
    ORDER BY snapshot_at ASC 
    LIMIT ?
  `).all(noteId, limit);
}

export function getLatestPublicSnapshot(noteId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM xhs_public_note_snapshots 
    WHERE note_id = ? 
    ORDER BY snapshot_at DESC, id DESC 
    LIMIT 1
  `).get(noteId);
}

// ===== 4. Keywords =====
export function listKeywords() {
  const db = getDb();
  return db.prepare("SELECT * FROM xhs_keywords ORDER BY id ASC").all();
}

export function addKeyword(keyword) {
  const db = getDb();
  const clean = String(keyword || "").trim();
  if (!clean) throw new Error("关键词不能为空");
  db.prepare("INSERT OR IGNORE INTO xhs_keywords (keyword, enabled, created_at) VALUES (?, 1, datetime('now'))").run(clean);
  return db.prepare("SELECT * FROM xhs_keywords WHERE keyword = ?").get(clean);
}

export function removeKeyword(id) {
  const db = getDb();
  db.prepare("DELETE FROM xhs_keywords WHERE id = ?").run(id);
  return true;
}

export function toggleKeyword(id, enabled) {
  const db = getDb();
  db.prepare("UPDATE xhs_keywords SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
  return db.prepare("SELECT * FROM xhs_keywords WHERE id = ?").get(id);
}

export function markKeywordScanned(keyword) {
  const db = getDb();
  db.prepare("UPDATE xhs_keywords SET last_scanned_at = datetime('now') WHERE keyword = ?").run(keyword);
}

// ===== 5. Content Candidates & Performance =====
export function saveCandidate({ candidateId, sourceNoteId, topic, reason, predictedScore, predictedTags }) {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR REPLACE INTO content_candidates (candidate_id, source_note_id, topic, reason, predicted_score, predicted_tags, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(candidateId, sourceNoteId, topic, reason, predictedScore, predictedTags, now);
}

export function listCandidates(limit = 20) {
  const db = getDb();
  return db.prepare("SELECT * FROM content_candidates ORDER BY created_at DESC LIMIT ?").all(limit);
}
