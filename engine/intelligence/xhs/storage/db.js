import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyMigrations } from "./schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.resolve(__dirname, "../../../../data/intelligence/xhs.sqlite");

let activeDb = null;
let currentDbPath = null;

export function getDb(customPath = null) {
  const targetPath = customPath || process.env.XHS_INTELLIGENCE_DB_PATH || DEFAULT_DB_PATH;

  if (activeDb && currentDbPath === targetPath) {
    return activeDb;
  }

  if (targetPath !== ":memory:") {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(targetPath);
  // Enable WAL mode for high concurrency and performance (skip for in-memory)
  if (targetPath !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA synchronous = NORMAL;");
  }
  db.exec("PRAGMA foreign_keys = ON;");

  applyMigrations(db);

  activeDb = db;
  currentDbPath = targetPath;
  return activeDb;
}

export function closeDb() {
  if (activeDb) {
    try {
      activeDb.close();
    } catch {}
    activeDb = null;
    currentDbPath = null;
  }
}
