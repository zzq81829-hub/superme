import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultLessonsDir = path.resolve(__dirname, "../../data/memory/lessons");

export function getLessonsDir(options = {}) {
  const dir = options.lessonsDir || process.env.LESSONS_BASE_DIR || defaultLessonsDir;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function saveLesson(input = {}, options = {}) {
  if (!input || typeof input !== "object") {
    throw new Error("Lesson input must be an object");
  }

  const lessonText = String(input.lesson || "").trim();
  if (!lessonText) throw new Error("Field 'lesson' is required");

  const domain = String(input.domain || "general").trim();
  const dir = getLessonsDir(options);

  // Generate deterministic slug key to allow accumulating evidence on repeating lessons
  const slug = crypto.createHash("sha256").update(`${domain}:${lessonText.toLowerCase()}`).digest("hex").slice(0, 16);
  const file = path.join(dir, `lesson-${slug}.json`);

  let existing = null;
  if (fs.existsSync(file)) {
    try {
      existing = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      // ignore
    }
  }

  const now = new Date().toISOString();
  const evidenceCount = existing ? (existing.evidence_count || 1) + 1 : Number(input.evidence_count || 1);
  const initialConfidence = Number(input.confidence || 0.6);
  const confidence = existing
    ? Math.min(0.98, Math.round(((existing.confidence || 0.6) + 0.05) * 100) / 100)
    : Math.min(0.98, Math.max(0.1, initialConfidence));

  const lessonRecord = {
    id: existing?.id || `lsn-${slug}`,
    lesson: lessonText,
    domain,
    confidence,
    evidence_count: evidenceCount,
    recommended_action: String(input.recommended_action || existing?.recommended_action || "Refine execution parameter").trim(),
    status: evidenceCount >= 3 && confidence >= 0.7 ? "active" : "testing",
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  const tmpFile = path.join(dir, `lesson-${slug}.json.tmp.${crypto.randomBytes(4).toString("hex")}`);
  fs.writeFileSync(tmpFile, JSON.stringify(lessonRecord, null, 2), "utf8");
  fs.renameSync(tmpFile, file);

  return lessonRecord;
}

export function listLessons(filter = {}, options = {}) {
  const dir = getLessonsDir(options);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter(f => f.endsWith(".json") && !f.includes(".tmp"));
  const lessons = [];

  for (const f of files) {
    try {
      lessons.push(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
    } catch {
      // ignore
    }
  }

  lessons.sort((a, b) => (b.evidence_count || 0) - (a.evidence_count || 0));

  return lessons.filter(l => {
    if (filter.domain && l.domain !== filter.domain) return false;
    if (filter.activeOnly && l.status !== "active") return false;
    if (filter.minConfidence && l.confidence < Number(filter.minConfidence)) return false;
    return true;
  });
}

export function getLesson(id, options = {}) {
  const dir = getLessonsDir(options);
  const directPath = path.join(dir, `${id}.json`);
  if (fs.existsSync(directPath)) {
    return JSON.parse(fs.readFileSync(directPath, "utf8"));
  }
  const lessons = listLessons({}, options);
  return lessons.find(l => l.id === id) || null;
}
