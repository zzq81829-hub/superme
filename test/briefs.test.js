import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { getBrief, updateBrief, updateHermesBrief } from "../src/briefs/store.js";
import { addReview } from "../src/reviews/store.js";
import { buildPrompt } from "../src/router.js";

function tempBriefEnv() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "brief-test-"));
  const prevBrief = process.env.BRIEF_FILE;
  const prevReviews = process.env.REVIEWS_BASE_DIR;
  process.env.BRIEF_FILE = path.join(tmp, "BRIEF.md");
  process.env.REVIEWS_BASE_DIR = path.join(tmp, "reviews");
  return {
    tmp,
    restore() {
      process.env.BRIEF_FILE = prevBrief;
      process.env.REVIEWS_BASE_DIR = prevReviews;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  };
}

test("brief defaults to empty content when no file exists", () => {
  const env = tempBriefEnv();
  try {
    const brief = getBrief();
    assert.equal(brief.content, "");
    assert.equal(brief.exists, false);
  } finally {
    env.restore();
  }
});

test("updateBrief writes and reads back content", () => {
  const env = tempBriefEnv();
  try {
    updateBrief("视觉一律暗黑奢华质感\n文案要有观点");
    const brief = getBrief();
    assert.equal(brief.exists, true);
    assert.ok(brief.content.includes("暗黑奢华"));
    assert.ok(brief.updatedAt);
  } finally {
    env.restore();
  }
});

test("Hermes brief handoff rejects empty text and stores the approved snapshot", () => {
  const env = tempBriefEnv();
  try {
    assert.throws(() => updateHermesBrief("  "), /cannot be empty/);
    const brief = updateHermesBrief("核心目标：先完成一条可验证的内容闭环");
    assert.equal(brief.exists, true);
    assert.match(brief.content, /可验证的内容闭环/);
  } finally {
    env.restore();
  }
});

test("buildPrompt injects founder brief and review feedback", () => {
  const env = tempBriefEnv();
  try {
    updateBrief("所有页面必须暗黑奢华质感");
    addReview("task-9", { text: "封面钩子不够强", kind: "issue", author: "founder" });

    const prompt = buildPrompt({ id: "task-9", title: "X", description: "Y" }, "C:/p");
    assert.match(prompt, /FOUNDER BRIEF/);
    assert.match(prompt, /暗黑奢华/);
    assert.match(prompt, /FOUNDER REVIEW FEEDBACK/);
    assert.match(prompt, /封面钩子不够强/);
  } finally {
    env.restore();
  }
});

test("buildPrompt tolerates a task without an id", () => {
  const env = tempBriefEnv();
  try {
    const prompt = buildPrompt({ title: "X", description: "Y" }, "C:/p");
    assert.match(prompt, /USER INTENT/);
    assert.doesNotMatch(prompt, /FOUNDER REVIEW FEEDBACK/);
  } finally {
    env.restore();
  }
});
