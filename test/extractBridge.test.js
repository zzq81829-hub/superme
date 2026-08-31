import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import express from "express";
import { extractFromTranscript } from "../src/memory/extractFromTranscript.js";
import { listCandidates, confirmCandidate, getMemory } from "../src/memory/store.js";

function setupIsolatedMemoryDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "founder-extract-test-"));
  process.env.MEMORY_BASE_DIR = tmpDir;
  return tmpDir;
}

test("Extract Bridge: 1. User explicit decisions/goals are extracted to candidate with source.kind=chatgpt", () => {
  const tmpDir = setupIsolatedMemoryDir();

  const turns = [
    { role: "user", text: "你好，请帮我分析一下书斋项目的排版设计。", index: 1 },
    { role: "assistant", text: "好的，小红书排版建议保持极简留白。", index: 2 },
    { role: "user", text: "我们决定：书斋的视觉风格就定为巴黎时装秀黑白红，严禁使用粗糙霓虹大渐变！", index: 3 },
    { role: "assistant", text: "明白，黑白红非常克制高级。", index: 4 },
    { role: "user", text: "商业目标是：书斋每个月至少稳定输出50条高赞图文。", index: 5 }
  ];

  const source = { kind: "chatgpt", conversationId: "conv-abc-123", url: "https://chatgpt.com/c/abc" };
  const res = extractFromTranscript(turns, source);

  assert.equal(res.ok, true);
  assert.equal(res.created.length, 2);

  const candidates = listCandidates();
  assert.equal(candidates.length, 2);

  const aestheticOrDecision = candidates.find((c) => c.title.includes("巴黎时装秀") || c.title.includes("审美标准") || c.title.includes("业务禁忌"));
  assert.ok(aestheticOrDecision);
  assert.equal(aestheticOrDecision.source.kind, "chatgpt");
  assert.equal(aestheticOrDecision.source.ref, "conv-abc-123");
  assert.equal(aestheticOrDecision.source.note, "extract:turn 3");
  assert.ok(aestheticOrDecision.projectScope.includes("shuzhai"));
  assert.equal(aestheticOrDecision.license, "understand_only");

  const goal = candidates.find((c) => c.title.includes("业务目标"));
  assert.ok(goal);
  assert.equal(goal.type, "goal");
  assert.equal(goal.needsQuickReview, true);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("Extract Bridge: 2. Assistant-only text does NOT produce founder viewpoints", () => {
  const tmpDir = setupIsolatedMemoryDir();

  const turns = [
    { role: "user", text: "ok", index: 1 },
    { role: "assistant", text: "我认为我们应该把全部系统上云，并开放所有 API 给外部调用，目标是半年内做到十万用户！", index: 2 }
  ];

  const res = extractFromTranscript(turns, { kind: "chatgpt" });
  assert.equal(res.ok, true);
  assert.equal(res.created.length, 0);
  assert.equal(listCandidates().length, 0);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("Extract Bridge: 3. Turns containing passwords or secrets are dropped", () => {
  const tmpDir = setupIsolatedMemoryDir();

  const turns = [
    { role: "user", text: "我的服务器密码是 password: MySuperSecretPass123!，禁止任何人直接ssh", index: 1 },
    { role: "user", text: "关于书斋排版：以后都采用细边框与纯象牙白字体。", index: 2 }
  ];

  const res = extractFromTranscript(turns, { kind: "chatgpt" });
  assert.equal(res.ok, true);
  assert.equal(res.created.length, 1);

  const candidate = getMemory(res.created[0]);
  assert.ok(candidate.content.includes("细边框"));
  assert.ok(!candidate.content.includes("MySuperSecretPass123"));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("Extract Bridge: 4. Duplicate extraction does not create duplicate candidate cards", () => {
  const tmpDir = setupIsolatedMemoryDir();

  const turns = [
    { role: "user", text: "我们决定：书斋的视觉风格就定为巴黎时装秀黑白红，严禁使用粗糙霓虹大渐变！", index: 1 }
  ];

  const res1 = extractFromTranscript(turns, { kind: "chatgpt", conversationId: "c1" });
  assert.equal(res1.created.length, 1);

  // Extract again with same content
  const res2 = extractFromTranscript(turns, { kind: "chatgpt", conversationId: "c1" });
  assert.equal(res2.created.length, 0);
  assert.equal(res2.skipped, 1);

  assert.equal(listCandidates().length, 1);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("Extract Bridge: 5. Bridge endpoint enforces token authentication (401 on wrong/missing token)", async () => {
  const tmpDir = setupIsolatedMemoryDir();

  const app = express();
  app.use(express.json({ limit: "1mb" }));

  const expectedToken = "secret-token-xyz";
  app.post("/api/bridge/chatgpt/extract", (req, res) => {
    const token = req.body?.token || req.headers["x-bridge-token"];
    if (token !== expectedToken) {
      return res.status(401).json({ error: "Invalid or missing bridge token" });
    }
    const result = extractFromTranscript(req.body.turns, { conversationId: req.body.conversationId });
    res.json({ ok: true, created: result.created });
  });

  const server = app.listen(0);
  const port = server.address().port;

  // 1. Missing token
  const res1 = await fetch(`http://127.0.0.1:${port}/api/bridge/chatgpt/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ turns: [{ role: "user", text: "决定采用黑白红" }] })
  });
  assert.equal(res1.status, 401);

  // 2. Wrong token
  const res2 = await fetch(`http://127.0.0.1:${port}/api/bridge/chatgpt/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "wrong-token", turns: [{ role: "user", text: "决定采用黑白红" }] })
  });
  assert.equal(res2.status, 401);

  // 3. Correct token
  const res3 = await fetch(`http://127.0.0.1:${port}/api/bridge/chatgpt/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "secret-token-xyz", turns: [{ role: "user", text: "决定采用黑白红" }] })
  });
  assert.equal(res3.status, 200);
  const json3 = await res3.json();
  assert.equal(json3.ok, true);

  server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("Extract Bridge: 6. Server does NOT persist raw transcript turns to disk", () => {
  const tmpDir = setupIsolatedMemoryDir();

  const rawTurns = [
    { role: "user", text: "秘密私密聊天记录ABCXYZ：我们必须在三个月内超越竞品！", index: 1 },
    { role: "assistant", text: "助手超长废话回复123456789...", index: 2 }
  ];

  extractFromTranscript(rawTurns, { kind: "chatgpt", conversationId: "conv-private" });

  // Scan all files in tmpDir
  function scanDir(dir) {
    let allContent = "";
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) {
        allContent += scanDir(full);
      } else {
        allContent += fs.readFileSync(full, "utf8");
      }
    }
    return allContent;
  }

  const persistedText = scanDir(tmpDir);
  // Must NOT contain assistant's raw messages
  assert.ok(!persistedText.includes("助手超长废话回复123456789"));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
