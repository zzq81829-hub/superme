import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  createCandidate,
  listCandidates,
  confirmCandidate,
  rejectCandidate,
  listActive,
  proposeUpdate,
  getMemory,
  assertNoSecrets,
  addEvidence
} from "../src/memory/store.js";
import { buildMemoryContext } from "../src/memory/inject.js";
import { buildPrompt } from "../src/router.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const memoryDir = process.env.MEMORY_BASE_DIR || path.join(root, "data", "memory");
const itemsDir = path.join(memoryDir, "items");
const candidatesDir = path.join(memoryDir, "candidates");

test("Memory Ledger: 1. Candidate created -> confirm becomes active", () => {
  const candidate = createCandidate({
    type: "judgment",
    title: "审美标准：黑白红高级质感",
    content: "界面设计必须遵循巴黎时装秀质感，黑、象牙白、高级红，细边框，克制高级，严禁游戏风和霓虹灯。",
    projectScope: ["*"],
    license: "understand_only",
    sensitivity: "medium"
  });

  assert.equal(candidate.status, "candidate");
  assert.equal(candidate.license, "understand_only");
  assert.ok(fs.existsSync(path.join(candidatesDir, `${candidate.id}.json`)));

  const testing = confirmCandidate(candidate.id, { reason: "Founder verified taste standard" });
  assert.equal(testing.status, "testing");
  assert.ok(testing.confirmedAt);
  assert.equal(testing.evidenceCount, 1);
  assert.ok(testing.history.some((h) => h.action === "confirmed_testing"));

  assert.ok(fs.existsSync(path.join(itemsDir, `${testing.id}.json`)));
  assert.ok(!fs.existsSync(path.join(candidatesDir, `${testing.id}.json`)));

  assert.equal(listActive().some((m) => m.id === testing.id), false);
  assert.equal(listActive({ includeTesting: true }).some((m) => m.id === testing.id), true);
});

test("Memory Ledger: 2. Propose update -> confirm causes old item to be superseded, listActive returns only new", () => {
  // 1. Create initial active memory
  const initial = createCandidate({
    type: "goal",
    title: "2026 Q3 核心目标",
    content: "第一版跑通书斋闭环。",
    projectScope: ["shuzhai"],
    license: "influence_or_paraphrase"
  });
  const active1 = confirmCandidate(initial.id, { reason: "Initial goal confirmed" });
  addEvidence(active1.id, { positive: true, source: "e2" });
  addEvidence(active1.id, { positive: true, source: "e3" });
  assert.equal(getMemory(active1.id).status, "active");

  // 2. Propose update on active1
  const updateCandidate = proposeUpdate(active1.id, {
    content: "第一版跑通书斋闭环，并且沉淀创始人判断，不越权发布。",
    reason: "Refining Q3 scope with IP layer"
  });

  assert.equal(updateCandidate.status, "candidate");
  assert.equal(updateCandidate.supersedes, active1.id);
  assert.equal(updateCandidate.version, 2);

  // Before confirm, listActive still returns active1
  const activeListBefore = listActive({ project: "shuzhai" });
  assert.ok(activeListBefore.some((m) => m.id === active1.id));
  assert.ok(!activeListBefore.some((m) => m.id === updateCandidate.id));

  // 3. Confirm the update candidate → testing; old active stays until evidence promotes
  const testing2 = confirmCandidate(updateCandidate.id, { reason: "Approved Q3 scope update" });
  assert.equal(testing2.status, "testing");
  assert.equal(testing2.version, 2);
  assert.equal(getMemory(active1.id).status, "active");

  let promoted = testing2;
  promoted = addEvidence(testing2.id, { positive: true, source: "evt-2", note: "second" });
  promoted = addEvidence(testing2.id, { positive: true, source: "evt-3", note: "third" });
  assert.equal(promoted.status, "active");

  const oldItem = getMemory(active1.id);
  assert.equal(oldItem.status, "superseded");
  assert.equal(oldItem.supersededBy, testing2.id);
  assert.ok(oldItem.validTo);

  const activeListAfter = listActive({ project: "shuzhai" });
  assert.ok(activeListAfter.some((m) => m.id === testing2.id));
  assert.ok(!activeListAfter.some((m) => m.id === active1.id));
});

test("Memory Ledger: 3. Secret patterns are rejected and never saved", () => {
  const secretSamples = [
    { title: "My API Key", content: "sk-1234567890abcdef1234567890abcdef" },
    { title: "User Password", content: "password: secretPassword123" },
    { title: "Founder ID", content: "身份证号码是 110101199003072345 请保存" },
    { title: "Bank Card", content: "卡号 6222 0212 3456 7890 123" },
    { title: "Private Key", content: "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA..." }
  ];

  for (const sample of secretSamples) {
    assert.throws(() => {
      createCandidate(sample);
    }, /Secret or sensitive credential pattern detected/);
  }
});

test("Memory Ledger: 4. listActive filters by projectScope correctly", () => {
  // Global memory
  const gCand = createCandidate({
    type: "taboo",
    title: "全局禁忌：严禁未经批准对外发布",
    content: "严禁在无人工审批的情况下自动发布内容。",
    projectScope: ["*"]
  });
  const gActive = confirmCandidate(gCand.id);
  addEvidence(gActive.id, { positive: true, source: "e2" });
  addEvidence(gActive.id, { positive: true, source: "e3" });

  // Specific project memory
  const pCand = createCandidate({
    type: "project_context",
    title: "书斋项目背景",
    content: "书摘出版引擎，定位深度阅读者。",
    projectScope: ["shuzhai"]
  });
  const pActive = confirmCandidate(pCand.id);
  addEvidence(pActive.id, { positive: true, source: "e2" });
  addEvidence(pActive.id, { positive: true, source: "e3" });

  // Other project memory
  const oCand = createCandidate({
    type: "project_context",
    title: "星选项目背景",
    content: "选品分析雷达。",
    projectScope: ["xingxuan"]
  });
  const oActive = confirmCandidate(oCand.id);
  addEvidence(oActive.id, { positive: true, source: "e2" });
  addEvidence(oActive.id, { positive: true, source: "e3" });

  // Query for shuzhai: should include gActive and pActive, NOT oActive
  const shuzhaiMemories = listActive({ project: "shuzhai" });
  assert.ok(shuzhaiMemories.some((m) => m.id === gActive.id));
  assert.ok(shuzhaiMemories.some((m) => m.id === pActive.id));
  assert.ok(!shuzhaiMemories.some((m) => m.id === oActive.id));

  // Query without project: returns all active
  const allMemories = listActive();
  assert.ok(allMemories.some((m) => m.id === gActive.id));
  assert.ok(allMemories.some((m) => m.id === pActive.id));
  assert.ok(allMemories.some((m) => m.id === oActive.id));
});

test("Memory Ledger: 5. buildMemoryContext includes strict UNDERSTAND_ONLY constraint", () => {
  const context = buildMemoryContext({ project: "shuzhai" });
  assert.ok(typeof context === "string");
  assert.ok(context.includes("FOUNDER MEMORY (current effective only):"));
  assert.ok(context.includes("[UNDERSTAND_ONLY]"));
  assert.ok(context.includes("DO NOT quote directly in public copy"));
});

test("Memory Ledger: 6. buildPrompt injects active memory safely into prompt", () => {
  const task = {
    title: "编写书斋封面文案",
    description: "需要符合调性",
    projectPath: "D:\\Projects\\shuzhai"
  };

  const prompt = buildPrompt(task, task.projectPath);
  assert.ok(prompt.includes("FOUNDER MEMORY (current effective only):"));
  assert.ok(prompt.includes("USER INTENT:"));
});
