export function applyMigrations(db) {
  // Schema version table
  db.exec(`
    CREATE TABLE IF NOT EXISTS xhs_schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const currentVersionRow = db.prepare("SELECT MAX(version) as ver FROM xhs_schema_migrations").get();
  const currentVersion = currentVersionRow && currentVersionRow.ver ? currentVersionRow.ver : 0;

  if (currentVersion < 1) {
    db.exec(`
      -- 1. My Accounts (自有账号)
      CREATE TABLE IF NOT EXISTS xhs_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_key TEXT UNIQUE NOT NULL,
        label TEXT NOT NULL,
        profile_dir TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        login_status TEXT DEFAULT 'unknown',
        last_success_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- 2. My Notes (自有账号笔记元数据)
      CREATE TABLE IF NOT EXISTS xhs_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_key TEXT NOT NULL,
        note_id TEXT NOT NULL,
        title TEXT,
        publish_time TEXT,
        note_type TEXT,
        url TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(account_key, note_id)
      );

      -- 3. My Note Snapshots (自有笔记时间序列快照，严禁覆盖更新)
      CREATE TABLE IF NOT EXISTS xhs_note_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_key TEXT NOT NULL,
        note_id TEXT NOT NULL,
        snapshot_at TEXT NOT NULL,
        data_date TEXT,
        impressions INTEGER,
        views INTEGER,
        likes INTEGER,
        favorites INTEGER,
        comments INTEGER,
        shares INTEGER,
        followers_gained INTEGER,
        two_second_exit_rate REAL,
        completion_rate REAL,
        average_watch_time REAL,
        source TEXT,
        raw_payload_hash TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_xhs_note_snapshots_key_id 
        ON xhs_note_snapshots (account_key, note_id, snapshot_at);

      -- 4. Public Creators (对标账号)
      CREATE TABLE IF NOT EXISTS xhs_public_creators (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        creator_id TEXT UNIQUE NOT NULL,
        nickname TEXT,
        profile_url TEXT,
        followers INTEGER,
        notes_count INTEGER,
        tracked INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- 5. Public Notes (公开/竞品笔记)
      CREATE TABLE IF NOT EXISTS xhs_public_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id TEXT UNIQUE NOT NULL,
        creator_id TEXT,
        title TEXT,
        text TEXT,
        publish_time TEXT,
        url TEXT,
        tags TEXT,
        note_type TEXT,
        discovered_from TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- 6. Public Note Snapshots (公开笔记时间序列快照，严禁覆盖更新)
      CREATE TABLE IF NOT EXISTS xhs_public_note_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id TEXT NOT NULL,
        snapshot_at TEXT NOT NULL,
        likes INTEGER,
        favorites INTEGER,
        comments INTEGER,
        shares INTEGER,
        creator_followers INTEGER,
        source TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_xhs_public_snapshots_id 
        ON xhs_public_note_snapshots (note_id, snapshot_at);

      -- 7. Search Keywords (竞品关键词)
      CREATE TABLE IF NOT EXISTS xhs_keywords (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword TEXT UNIQUE NOT NULL,
        enabled INTEGER DEFAULT 1,
        last_scanned_at TEXT,
        created_at TEXT NOT NULL
      );

      -- 8. Content Candidates (学习候选选题)
      CREATE TABLE IF NOT EXISTS content_candidates (
        candidate_id TEXT PRIMARY KEY,
        source_note_id TEXT,
        topic TEXT,
        reason TEXT,
        predicted_score REAL,
        predicted_tags TEXT,
        created_at TEXT NOT NULL
      );

      -- 9. Content Performance (未来自主学习表现跟踪)
      CREATE TABLE IF NOT EXISTS content_performance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        candidate_id TEXT,
        predicted_score REAL,
        actual_performance REAL,
        account_key TEXT,
        topic TEXT,
        style TEXT,
        result TEXT,
        created_at TEXT NOT NULL
      );

      INSERT INTO xhs_schema_migrations (version, applied_at) 
      VALUES (1, datetime('now'));
    `);

    // Pre-populate default 3 accounts if empty
    const countRow = db.prepare("SELECT COUNT(*) as count FROM xhs_accounts").get();
    if (countRow.count === 0) {
      const insertAcc = db.prepare(`
        INSERT INTO xhs_accounts (account_key, label, profile_dir, enabled, login_status, created_at, updated_at)
        VALUES (?, ?, ?, 1, 'unknown', datetime('now'), datetime('now'))
      `);
      insertAcc.run("xhs_account_1", "书斋 (社科/哲学/认知书籍)", "data/profiles/xhs_account_1");
      insertAcc.run("xhs_account_2", "X搬运 (前沿推文编译与深度思考)", "data/profiles/xhs_account_2");
      insertAcc.run("xhs_account_3", "个人IP (创始人主理)", "data/profiles/xhs_account_3");
    }

    // Pre-populate default tracking keywords if empty
    const kwCountRow = db.prepare("SELECT COUNT(*) as count FROM xhs_keywords").get();
    if (kwCountRow.count === 0) {
      const insertKw = db.prepare(`
        INSERT INTO xhs_keywords (keyword, enabled, created_at) VALUES (?, 1, datetime('now'))
      `);
      const defaultKws = ["AI", "Agent", "个人成长", "心理学", "人性", "哲学", "认知", "财富"];
      for (const kw of defaultKws) {
        insertKw.run(kw);
      }
    }
  }
}
