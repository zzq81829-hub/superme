import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { recordEvent, listEvents } from "../src/learning/events.js";
import { emitLearningEvent } from "../src/learning/router.js";
import { createCandidate, confirmCandidate, getMemory, addEvidence, listActive } from "../src/memory/store.js";
import { buildChatPrompt } from "../src/secretary/chat.js";
import { probeDesktopBot } from "../src/secretary/desktopBot.js";

function isolate() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "learn-"));
  process.env.LEARNING_EVENTS_DIR = path.join(dir, "events");
  process.env.MEMORY_BASE_DIR = path.join(dir, "memory");
  process.env.SECRETARY_BASE_DIR = path.join(dir, "secretary");
  return dir;
}

test("Learning event persists without calling a model", () => {
  isolate();
  const event = recordEvent({
    type: "FOUNDER_SELECTED",
    domain: "visual",
    actor: "founder",
    winner: "B",
    losers: ["A", "C"],
    subject: { kind: "artifact", id: "cover-b" }
  });
  assert.equal(event.type, "FOUNDER_SELECTED");
  assert.equal(listEvents({ type: "FOUNDER_SELECTED" }).length, 1);
});

test("Memory confirm enters testing; third positive evidence promotes to active", () => {
  isolate();
  const cand = createCandidate({
    title: "低字密度封面",
    content: "封面文字少、主视觉大。",
    type: "aesthetic",
    domain: "visual"
  });
  const testing = confirmCandidate(cand.id);
  assert.equal(testing.status, "testing");
  assert.equal(listActive().some((m) => m.id === testing.id), false);

  emitLearningEvent({
    type: "FOUNDER_APPROVED",
    domain: "visual",
    subject: { kind: "memory", id: testing.id }
  });
  emitLearningEvent({
    type: "FOUNDER_SELECTED",
    domain: "visual",
    subject: { kind: "memory", id: testing.id },
    winner: testing.id
  });

  const promoted = getMemory(testing.id);
  assert.equal(promoted.status, "active");
  assert.ok(promoted.evidenceCount >= 3);
  assert.ok(promoted.confidence >= 0.7);
});

test("Secretary prompt includes OS snapshot block", () => {
  const prompt = buildChatPrompt({
    text: "现在有什么要我批的？",
    turns: [],
    persona: "你是秘书。",
    snapshot: "{\"approvals\":[\"pkg-1\"]}"
  });
  assert.match(prompt, /OS SNAPSHOT/);
  assert.match(prompt, /pkg-1/);
  assert.match(prompt, /现在有什么要我批的/);
});

test("Desktop Grok Bot probe never grants dispatch", () => {
  const probe = probeDesktopBot();
  assert.equal(probe.canDispatch, false);
  assert.equal(probe.canSubmit, false);
  assert.ok(probe.inbound.includes("/api/secretary/grok-bot/inbound"));
});
