import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { addReview, listReviews } from "../src/reviews/store.js";

function tempReviewsEnv() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reviews-test-"));
  const prev = process.env.REVIEWS_BASE_DIR;
  process.env.REVIEWS_BASE_DIR = tmp;
  return {
    tmp,
    restore() {
      process.env.REVIEWS_BASE_DIR = prev;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  };
}

test("reviews are persisted per task and listed in order", () => {
  const env = tempReviewsEnv();
  try {
    const taskId = "task-123";
    assert.deepEqual(listReviews(taskId), []);

    const r1 = addReview(taskId, { text: "排版不错", kind: "praise", author: "founder" });
    addReview(taskId, { text: "颜色太暗", kind: "issue", author: "founder" });

    const all = listReviews(taskId);
    assert.equal(all.length, 2);
    assert.equal(all[0].text, "排版不错");
    assert.equal(all[1].kind, "issue");
    assert.equal(r1.author, "founder");
  } finally {
    env.restore();
  }
});

test("empty text is rejected; unknown kinds fall back to note", () => {
  const env = tempReviewsEnv();
  try {
    assert.throws(() => addReview("t-1", { text: "   " }), /empty/);
    const r = addReview("t-1", { text: "hello", kind: "bogus", author: "system" });
    assert.equal(r.kind, "note");
    assert.equal(r.author, "system");
  } finally {
    env.restore();
  }
});

test("addReview rejects invalid task ids", () => {
  const env = tempReviewsEnv();
  try {
    assert.throws(() => addReview("../evil", { text: "x" }), /Invalid task id/);
  } finally {
    env.restore();
  }
});
