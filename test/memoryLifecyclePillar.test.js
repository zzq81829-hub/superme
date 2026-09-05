import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import {
  createCandidate,
  confirmCandidate,
  getMemory,
  addEvidence,
  rejectCandidate,
  listActive,
  proposeUpdate,
  assertNoSecrets,
  detectMemoryConflict,
  checkMemoryConflict
} from "../src/memory/store.js";
import { buildMemoryContext } from "../src/memory/inject.js";
import { listEvents } from "../src/learning/events.js";

function setupIsolatedEnv() {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "m4-memory-test-"));
  const memoryDir = path.join(baseDir, "memory");
  const candidatesDir = path.join(memoryDir, "candidates");
  const itemsDir = path.join(memoryDir, "items");
  const eventsDir = path.join(baseDir, "events");

  fs.mkdirSync(candidatesDir, { recursive: true });
  fs.mkdirSync(itemsDir, { recursive: true });
  fs.mkdirSync(eventsDir, { recursive: true });

  process.env.MEMORY_BASE_DIR = memoryDir;
  process.env.LEARNING_EVENTS_DIR = eventsDir;

  const options = {
    baseDir,
    memoryDir,
    eventsDir
  };

  return { baseDir, memoryDir, eventsDir, options };
}

// ---------------------------------------------------------------------------
// TEST 1: Candidate Confirmation Enters Testing (Never Directly to Active)
// ---------------------------------------------------------------------------
test("R3-Memory-1: confirmCandidate transitions candidate strictly to testing (never active)", () => {
  const { options, memoryDir } = setupIsolatedEnv();

  const candidate = createCandidate({
    title: "反常识选题抓手",
    content: "开头3秒抛出违背直觉的硬核结论，迅速唤起好奇心",
    type: "judgment",
    domain: "copywriting",
    license: "influence_or_paraphrase",
    projectScope: ["shuzhai"]
  }, options);

  assert.equal(candidate.status, "candidate");
  assert.equal(candidate.evidenceCount, 0);
  assert.equal(candidate.confidence, 0);

  // Candidate file exists in candidatesDir
  const candFile = path.join(memoryDir, "candidates", `${candidate.id}.json`);
  assert.ok(fs.existsSync(candFile));

  // Confirm candidate: MUST transition to testing
  const testing = confirmCandidate(candidate.id, { reason: "Founder verified initial hypothesis" }, options);

  assert.equal(testing.status, "testing");
  assert.equal(testing.evidenceCount, 1);
  assert.equal(testing.confidence, 0.33);
  assert.ok(testing.confirmedAt);
  assert.ok(testing.history.some((h) => h.action === "confirmed_testing"));

  // Moved from candidates to items
  assert.ok(!fs.existsSync(candFile));
  assert.ok(fs.existsSync(path.join(memoryDir, "items", `${testing.id}.json`)));

  // Testing card is NOT in default listActive()
  const activeOnly = listActive({ project: "shuzhai" }, options);
  assert.equal(activeOnly.some((m) => m.id === testing.id), false);

  // Testing card IS included when includeTesting = true
  const withTesting = listActive({ project: "shuzhai", includeTesting: true }, options);
  assert.equal(withTesting.some((m) => m.id === testing.id), true);
});

// ---------------------------------------------------------------------------
// TEST 2: Evidence Escalation: 3-Signal Positive Threshold Promotes to Active
// ---------------------------------------------------------------------------
test("R3-Memory-2: addEvidence requires evidenceCount >= 3 and confidence >= 0.70 to escalate to active", () => {
  const { options } = setupIsolatedEnv();

  const candidate = createCandidate({
    title: "信息图解结构",
    content: "图文排版采用'观点+三步清单'，增强可执行性",
    type: "aesthetic",
    domain: "visual"
  }, options);

  // Signal 1: confirm candidate (evidenceCount=1, confidence=0.33, status=testing)
  const testing = confirmCandidate(candidate.id, {}, options);
  assert.equal(testing.status, "testing");
  assert.equal(testing.evidenceCount, 1);
  assert.equal(testing.confidence, 0.33);

  // Signal 2: first positive evidence (+0.22 -> 0.55, count=2)
  const afterSignal2 = addEvidence(testing.id, {
    positive: true,
    source: "evt-approval-001",
    note: "高赞互动表现良好"
  }, options);

  assert.equal(afterSignal2.status, "testing"); // Still testing! (< 3 signals)
  assert.equal(afterSignal2.evidenceCount, 2);
  assert.equal(afterSignal2.confidence, 0.55);
  assert.equal(listActive({}, options).some((m) => m.id === testing.id), false);

  // Signal 3: second positive evidence (+0.22 -> 0.77 >= 0.70, count=3 >= 3)
  const afterSignal3 = addEvidence(testing.id, {
    positive: true,
    source: "evt-metric-002",
    note: "完播率超过基线15%"
  }, options);

  assert.equal(afterSignal3.status, "active"); // Promoted to active!
  assert.equal(afterSignal3.evidenceCount, 3);
  assert.equal(afterSignal3.confidence, 0.77);
  assert.equal(afterSignal3.trend, "rising");

  // Verified in listActive()
  assert.equal(listActive({}, options).some((m) => m.id === testing.id), true);
});

// ---------------------------------------------------------------------------
// TEST 3: Negative Evidence Drops Confidence & Demotes to Declining
// ---------------------------------------------------------------------------
test("R3-Memory-3: Negative feedback lowers confidence and drops < 0.40 demote to declining", () => {
  const { options } = setupIsolatedEnv();

  // Create and promote card to active
  const cand = createCandidate({
    title: "极简纯文本封面",
    content: "纯黑白大字报风格，无任何插画素材",
    type: "aesthetic",
    domain: "visual"
  }, options);

  confirmCandidate(cand.id, {}, options);
  addEvidence(cand.id, { positive: true, source: "s1" }, options);
  const activeCard = addEvidence(cand.id, { positive: true, source: "s2" }, options);
  assert.equal(activeCard.status, "active");
  assert.equal(activeCard.confidence, 0.77);

  // Negative feedback 1 (-0.22 -> 0.55, still >= 0.40, remains active)
  const neg1 = addEvidence(cand.id, {
    positive: false,
    source: "evt-feedback-001",
    note: "受众反馈封面单调"
  }, options);

  assert.equal(neg1.status, "active");
  assert.equal(neg1.confidence, 0.55);
  assert.equal(neg1.trend, "falling");

  // Negative feedback 2 (-0.22 -> 0.33 < 0.40, demotes to declining)
  const neg2 = addEvidence(cand.id, {
    positive: false,
    source: "evt-feedback-002",
    note: "点击率连续低于大盘"
  }, options);

  assert.equal(neg2.status, "declining");
  assert.equal(neg2.confidence, 0.33);
  assert.equal(neg2.trend, "falling");

  // Declining card is removed from active list
  assert.equal(listActive({}, options).some((m) => m.id === cand.id), false);

  // Also test testing card demotion: starts at 0.33, negative evidence drops to 0.11 < 0.40 -> declining
  const cand2 = createCandidate({
    title: "试用文风",
    content: "生活化口语尝试",
    domain: "tone"
  }, options);
  const testingCard = confirmCandidate(cand2.id, {}, options);
  assert.equal(testingCard.confidence, 0.33);

  const demotedTesting = addEvidence(testingCard.id, { positive: false, source: "neg-test" }, options);
  assert.equal(demotedTesting.status, "declining");
  assert.equal(demotedTesting.confidence, 0.11);
});

// ---------------------------------------------------------------------------
// TEST 4: Semantic Conflict Detection in Same Domain
// ---------------------------------------------------------------------------
test("R3-Memory-4: Semantic and domain conflict detection across opposing style clusters and contradictions", () => {
  const { options } = setupIsolatedEnv();

  // 1. Visual Style Cluster Opposition (Black/White minimal vs Macaron high-saturation colorful)
  const cardBlack = createCandidate({
    title: "巴黎时装秀黑白红高级质感",
    content: "界面设计遵循巴黎时装秀质感，黑、象牙白、高级红，克制高级，严禁游戏风和霓虹灯",
    domain: "visual",
    type: "aesthetic"
  }, options);
  confirmCandidate(cardBlack.id, {}, options);

  const cardMacaron = {
    id: "mem-macaron-001",
    title: "马卡龙高饱和鲜艳活泼风",
    content: "封面采用彩色马卡龙高饱和鲜艳霓虹配色，活泼动漫风",
    domain: "visual",
    type: "aesthetic"
  };

  const conflictVisual = detectMemoryConflict(cardMacaron, [cardBlack]);
  assert.equal(conflictVisual.hasConflict, true);
  assert.ok(conflictVisual.conflictingIds.includes(cardBlack.id));
  assert.ok(conflictVisual.reason.includes("visual_style"));

  // 2. Tone Cluster Opposition (Serious factual vs humorous exaggerated hype)
  const cardFactual = {
    id: "mem-fact-001",
    title: "硬核事实核查",
    content: "严肃求真客观严谨，扮演权威信息质检官，严厉打假",
    domain: "tone",
    type: "judgment"
  };
  const cardHype = {
    id: "mem-hype-002",
    title: "娱乐夸张噱头",
    content: "幽默搞笑段子戏谑，夸张震惊体营销噱头，引发情绪共鸣",
    domain: "tone",
    type: "judgment"
  };

  const conflictTone = detectMemoryConflict(cardHype, [cardFactual]);
  assert.equal(conflictTone.hasConflict, true);
  assert.ok(conflictTone.conflictingIds.includes(cardFactual.id));
  assert.ok(conflictTone.reason.includes("tone"));

  // 3. Contradiction Topic Opposition (Prohibition vs Requirement)
  const cardNoEmoji = {
    id: "mem-no-emoji",
    title: "克制排版",
    content: "严禁使用emoji表情包，保持文字纯净度",
    domain: "copywriting",
    type: "judgment"
  };
  const cardMustEmoji = {
    id: "mem-must-emoji",
    title: "生动排版",
    content: "正文必须大量使用emoji增加视觉跳跃感",
    domain: "copywriting",
    type: "judgment"
  };

  const conflictEmoji = detectMemoryConflict(cardMustEmoji, [cardNoEmoji]);
  assert.equal(conflictEmoji.hasConflict, true);
  assert.ok(conflictEmoji.conflictingIds.includes(cardNoEmoji.id));

  // 4. Non-conflicting cards in same domain
  const cardHeader = {
    id: "mem-header",
    title: "标题字数规范",
    content: "主标题不超过14个字，居中排版",
    domain: "visual",
    type: "aesthetic"
  };
  const cardFootnote = {
    id: "mem-footnote",
    title: "脚注格式",
    content: "底部标注版权与数据引用源",
    domain: "visual",
    type: "aesthetic"
  };

  const noConflict = detectMemoryConflict(cardFootnote, [cardHeader]);
  assert.equal(noConflict.hasConflict, false);
  assert.equal(noConflict.conflictingIds.length, 0);

  // 5. Direct conflictKey match
  const cardKeyA = {
    id: "mem-key-a",
    title: "单选策略A",
    content: "策略配置方案 alpha",
    domain: "strategy",
    conflictKey: "monetization_anchor"
  };
  const cardKeyB = {
    id: "mem-key-b",
    title: "单选策略B",
    content: "策略配置方案 beta",
    domain: "strategy",
    conflictKey: "monetization_anchor"
  };
  const keyConflict = detectMemoryConflict(cardKeyB, [cardKeyA]);
  assert.equal(keyConflict.hasConflict, true);
  assert.ok(keyConflict.conflictingIds.includes(cardKeyA.id));
});

// ---------------------------------------------------------------------------
// TEST 5: Conflict Isolation & Quarantine (Emits Event, Prevents Active Promotion)
// ---------------------------------------------------------------------------
test("R3-Memory-5: Conflicting cards are quarantined in testing, emit LEARNING_CONFLICT, and never promote to active", () => {
  const { options } = setupIsolatedEnv();

  // 1. Establish established active card A
  const candA = createCandidate({
    title: "黑白红克制极简风",
    content: "界面设计必须遵循巴黎时装秀质感，黑、象牙白、高级红，克制高级，严禁游戏风和霓虹灯",
    domain: "visual",
    type: "aesthetic"
  }, options);
  confirmCandidate(candA.id, {}, options);
  addEvidence(candA.id, { positive: true, source: "s1" }, options);
  const activeA = addEvidence(candA.id, { positive: true, source: "s2" }, options);
  assert.equal(activeA.status, "active");

  // 2. Introduce conflicting candidate B (Macaron colorful neon)
  const candB = createCandidate({
    title: "马卡龙彩色高饱和霓虹风",
    content: "封面采用彩色马卡龙高饱和鲜艳霓虹配色，活泼动漫风",
    domain: "visual",
    type: "aesthetic"
  }, options);

  // 3. Confirm candidate B: conflict detected with activeA!
  const testingB = confirmCandidate(candB.id, { reason: "Founder exploring new direction" }, options);

  assert.equal(testingB.status, "testing");
  assert.equal(testingB.hasConflict, true);
  assert.ok(testingB.conflictsWith.includes(candA.id));

  // Verify LEARNING_CONFLICT event was emitted to ledger
  const conflictEvents = listEvents({ type: "LEARNING_CONFLICT" }, options);
  assert.ok(conflictEvents.length >= 1);
  const matchedEvent = conflictEvents.find((e) => e.subject.id === candB.id || e.payload?.conflictingWith?.includes(candA.id));
  assert.ok(matchedEvent);
  assert.equal(matchedEvent.type, "LEARNING_CONFLICT");
  assert.equal(matchedEvent.domain, "visual");

  // 4. Feed multiple positive signals to candidate B (up to 5 positive signals)
  let currentB = testingB;
  for (let i = 1; i <= 4; i++) {
    currentB = addEvidence(candB.id, { positive: true, source: `pos-${i}`, note: "高互动" }, options);
  }

  // Evidence count is 5, confidence is capped at 1.0, but because of conflict, it MUST remain testing!
  assert.equal(currentB.evidenceCount, 5);
  assert.ok(currentB.confidence >= 0.70);
  assert.equal(currentB.hasConflict, true);
  assert.equal(currentB.status, "testing"); // QUARANTINED! Never becomes active!
  assert.ok(currentB.history.some((h) => h.action === "promotion_blocked_by_conflict"));

  // Active list still contains only Card A, NOT Card B
  const activeList = listActive({ domain: "visual" }, options);
  assert.equal(activeList.some((m) => m.id === candA.id), true);
  assert.equal(activeList.some((m) => m.id === candB.id), false);
});

// ---------------------------------------------------------------------------
// TEST 6: Non-Overwriting Invariant (Conflicting Items Coexist Separately)
// ---------------------------------------------------------------------------
test("R3-Memory-6: Conflicting memory entries are isolated rather than overwritten", () => {
  const { options, memoryDir } = setupIsolatedEnv();

  const candA = createCandidate({
    id: "mem-original-visual",
    title: "黑白红克制极简",
    content: "黑白红高级质感，克制高级，严禁游戏风和霓虹灯",
    domain: "visual",
    type: "aesthetic"
  }, options);
  confirmCandidate(candA.id, {}, options);
  addEvidence(candA.id, { positive: true, source: "s1" }, options);
  addEvidence(candA.id, { positive: true, source: "s2" }, options);

  const candB = createCandidate({
    id: "mem-rival-visual",
    title: "彩色马卡龙高饱和",
    content: "彩色马卡龙高饱和鲜艳霓虹，活泼可爱",
    domain: "visual",
    type: "aesthetic"
  }, options);
  confirmCandidate(candB.id, {}, options);

  // Both files exist independently on disk in items directory
  const pathA = path.join(memoryDir, "items", "mem-original-visual.json");
  const pathB = path.join(memoryDir, "items", "mem-rival-visual.json");

  assert.ok(fs.existsSync(pathA));
  assert.ok(fs.existsSync(pathB));

  const diskA = JSON.parse(fs.readFileSync(pathA, "utf8"));
  const diskB = JSON.parse(fs.readFileSync(pathB, "utf8"));

  // Card A was not overwritten
  assert.equal(diskA.id, "mem-original-visual");
  assert.equal(diskA.status, "active");
  assert.equal(diskA.title, "黑白红克制极简");

  // Card B is isolated in testing
  assert.equal(diskB.id, "mem-rival-visual");
  assert.equal(diskB.status, "testing");
  assert.equal(diskB.hasConflict, true);
});

// ---------------------------------------------------------------------------
// TEST 7: Supersession Updates Are Not Conflicts and Supersede Cleanly
// ---------------------------------------------------------------------------
test("R3-Memory-7: ProposeUpdate follows versioning lineage and does not trigger false conflict", () => {
  const { options } = setupIsolatedEnv();

  const original = createCandidate({
    title: "Q3 运营目标",
    content: "以极简内容打通书斋受众闭环",
    domain: "strategy",
    type: "goal"
  }, options);

  confirmCandidate(original.id, {}, options);
  addEvidence(original.id, { positive: true, source: "s1" }, options);
  addEvidence(original.id, { positive: true, source: "s2" }, options);
  assert.equal(getMemory(original.id, options).status, "active");

  // Propose update: version 2 linked via supersedes
  const v2Candidate = proposeUpdate(original.id, {
    content: "以极简内容打通书斋受众闭环，同时沉淀个人IP认知质检官人设",
    reason: "升级加入IP定位层"
  }, options);

  assert.equal(v2Candidate.version, 2);
  assert.equal(v2Candidate.supersedes, original.id);

  // Confirm v2 -> testing
  const v2Testing = confirmCandidate(v2Candidate.id, {}, options);
  assert.equal(v2Testing.status, "testing");
  assert.equal(v2Testing.hasConflict, false); // NOT a conflict!

  // Add evidence to v2 -> promotes to active and supersedes original
  addEvidence(v2Candidate.id, { positive: true, source: "ev2" }, options);
  const v2Active = addEvidence(v2Candidate.id, { positive: true, source: "ev3" }, options);
  assert.equal(v2Active.status, "active");

  const originalAfter = getMemory(original.id, options);
  assert.equal(originalAfter.status, "superseded");
  assert.equal(originalAfter.supersededBy, v2Candidate.id);
  assert.ok(originalAfter.validTo);
});

// ---------------------------------------------------------------------------
// TEST 8: Secret Assertion Rejection
// ---------------------------------------------------------------------------
test("R3-Memory-8: assertNoSecrets strictly blocks API keys, tokens, passwords and IDs", () => {
  const badSamples = [
    { title: "OpenAI Key", content: "sk-proj-abc12345678901234567890abcdef" },
    { title: "Anthropic Key", content: "sk-ant-api03-abcdef1234567890abcdef" },
    { title: "Root Pass", content: "password: SuperSecretPass123!" },
    { title: "Bearer Token", content: "bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdef" },
    { title: "Private RSA", content: "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA..." },
    { title: "Citizen ID", content: "请保存创始人身份证：110101199003072345" },
    { title: "Credit Card", content: "付款卡号 6222 0212 3456 7890 123" }
  ];

  for (const sample of badSamples) {
    assert.throws(() => {
      createCandidate(sample);
    }, /Secret or sensitive credential pattern detected/);
  }

  // Verify assertNoSecrets directly throws
  assert.throws(() => assertNoSecrets("sk-test12345678"), /Secret or sensitive credential pattern detected/);

  // Clean text does not throw
  assert.doesNotThrow(() => assertNoSecrets("巴黎时装秀黑白红克制高级"));
});

// ---------------------------------------------------------------------------
// TEST 9: Domain-Aware Prompt Injection with [试用中，证据不足 / testing] Prefix
// ---------------------------------------------------------------------------
test("R3-Memory-9: buildMemoryContext supports domain filtering and prefixes testing cards", () => {
  const { options } = setupIsolatedEnv();

  // Active Visual Memory
  const m1Cand = createCandidate({
    title: "巴黎黑白红高级质感",
    content: "黑底、细边框、高级红，克制奢华",
    domain: "visual",
    type: "aesthetic"
  }, options);
  confirmCandidate(m1Cand.id, {}, options);
  addEvidence(m1Cand.id, { positive: true, source: "s1" }, options);
  addEvidence(m1Cand.id, { positive: true, source: "s2" }, options);

  // Testing Visual Memory (Conflicting / Tentative)
  const m2Cand = createCandidate({
    title: "马卡龙彩色霓虹试用",
    content: "高饱和彩色马卡龙活泼风",
    domain: "visual",
    type: "aesthetic"
  }, options);
  confirmCandidate(m2Cand.id, {}, options); // In testing status

  // Active Copywriting Memory
  const m3Cand = createCandidate({
    title: "爆款3秒Hook文案公式",
    content: "先抛痛点反常识，再给操作清单",
    domain: "copywriting",
    type: "judgment"
  }, options);
  confirmCandidate(m3Cand.id, {}, options);
  addEvidence(m3Cand.id, { positive: true, source: "s1" }, options);
  addEvidence(m3Cand.id, { positive: true, source: "s2" }, options);

  // 1. Query with domain: "visual"
  const visualContext = buildMemoryContext({ domain: "visual", includeTesting: true }, options);
  assert.ok(visualContext.includes("FOUNDER MEMORY"));
  assert.ok(visualContext.includes("巴黎黑白红高级质感"));
  // Testing card MUST be prefixed with [试用中，证据不足 / testing]
  assert.ok(visualContext.includes("[试用中，证据不足 / testing] [AESTHETIC] 马卡龙彩色霓虹试用"));
  assert.ok(visualContext.includes("Status: TESTING (试用中，证据不足，不得当作永久人格)"));
  // Copywriting memory MUST be filtered out
  assert.ok(!visualContext.includes("爆款3秒Hook文案公式"));

  // 2. Query with domain: "copywriting"
  const copyContext = buildMemoryContext({ domain: "copywriting", includeTesting: true }, options);
  assert.ok(copyContext.includes("爆款3秒Hook文案公式"));
  assert.ok(!copyContext.includes("巴黎黑白红高级质感"));
  assert.ok(!copyContext.includes("马卡龙彩色霓虹试用"));

  // 3. Query with includeTesting: false
  const activeOnlyContext = buildMemoryContext({ domain: "visual", includeTesting: false }, options);
  assert.ok(activeOnlyContext.includes("巴黎黑白红高级质感"));
  assert.ok(!activeOnlyContext.includes("马卡龙彩色霓虹试用"));
});

// ---------------------------------------------------------------------------
// TEST 10: checkMemoryConflict API Structured Report & Event Verification
// ---------------------------------------------------------------------------
test("R3-Memory-10: checkMemoryConflict returns structured report and records LEARNING_CONFLICT", () => {
  const { options } = setupIsolatedEnv();

  const c1 = createCandidate({
    title: "严肃客观质检",
    content: "严肃客观理性，严禁夸大营销噱头",
    domain: "tone",
    type: "judgment"
  }, options);
  confirmCandidate(c1.id, {}, options);

  const c2 = createCandidate({
    title: "情绪夸张噱头",
    content: "充满情绪化夸张营销噱头，引发震惊",
    domain: "tone",
    type: "judgment"
  }, options);

  const report = checkMemoryConflict(c2, options);
  assert.equal(report.hasConflict, true);
  assert.ok(report.conflictingIds.includes(c1.id));
  assert.ok(report.reason.length > 0);

  // Check event in ledger
  const conflictEvents = listEvents({ type: "LEARNING_CONFLICT" }, options);
  assert.ok(conflictEvents.length >= 1);
  const found = conflictEvents.find((e) => e.subject.id === c2.id);
  assert.ok(found);
  assert.equal(found.domain, "tone");
});
