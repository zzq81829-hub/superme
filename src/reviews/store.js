import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

// Per-task founder review thread. Each finished product can accumulate a
// thread of "what's good / what's bad" feedback from the founder; the thread is
// injected back into the task prompt on refinement so the worker iterates on
// the same product instead of starting over.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultBaseDir = path.resolve(__dirname, "../../data/reviews");

export function getReviewsDir(options = {}) {
  const dir = options.baseDir || process.env.REVIEWS_BASE_DIR || defaultBaseDir;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function validateTaskId(id) {
  if (!/^[a-zA-Z0-9_-]+$/.test(String(id))) {
    throw new Error("Invalid task id");
  }
}

function reviewFile(taskId, options = {}) {
  validateTaskId(taskId);
  return path.join(getReviewsDir(options), `${taskId}.json`);
}

export function listReviews(taskId, options = {}) {
  const file = reviewFile(taskId, options);
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addReview(taskId, input = {}, options = {}) {
  validateTaskId(taskId);
  const text = String(input.text || "").trim();
  if (!text) {
    throw new Error("Review text cannot be empty");
  }

  const kind = ["praise", "issue", "note"].includes(input.kind) ? input.kind : "note";
  const author = input.author === "system" ? "system" : "founder";

  const review = {
    id: `rev-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    taskId,
    author,
    kind,
    text,
    createdAt: new Date().toISOString()
  };

  const reviews = [...listReviews(taskId, options), review];
  const file = reviewFile(taskId, options);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(reviews, null, 2), "utf8");
  return review;
}
