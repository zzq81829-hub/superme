/**
 * Test Suite: Humanized Copywriting Style Enforcement (Anti-AI Tone Filter & Tag Recommendation)
 *
 * Requirements Source:
 * - ORIGINAL_REQUEST.md (2026-09-04T18:14:38Z) §R3: Humanized Copywriting Style Enforcement (Anti-AI Tone Filter)
 * - ORIGINAL_REQUEST.md (2026-09-04T18:14:38Z) §R4: High-Traffic & High-Relevance Xiaohongshu Tag Recommendation
 * - PROJECT.md: Features 8 & 9 (Anti-AI Tone Filter, Dual-Criteria High-Traffic Tag Recommender)
 * - TEST_INFRA.md: Tiers 1-4 for Anti-AI Tone & Tagging
 *
 * Binding Constraints:
 * 1. Strictly filters out banned clichés:
 *    "在这个快节奏的时代", "总有一款适合你", "建议收藏反复阅读" / "建议收藏", "底层逻辑", "赋能", "闭环", "维度", "颠覆认知"
 * 2. Authentic human persona: grounded candid first-person voice ("我查了一下...", "这条其实是偷换概念", "做不到就别硬撑").
 * 3. Paragraph length enforcement: keep paragraphs <= 3 lines.
 * 4. Tag Volume: 4–6 curated tags appended cleanly at the bottom without cluttering main body.
 * 5. Tags must be tightly matched to domain, high-search-volume on Xiaohongshu, and contain 0 banned keywords.
 */

import test from "node:test";
import assert from "node:assert/strict";

// Dynamic import for progressive milestone implementation
async function tryImport(modulePath) {
  try {
    return await import(modulePath);
  } catch (err) {
    if (err.code === "ERR_MODULE_NOT_FOUND" || err.message?.includes("Cannot find module")) {
      return null;
    }
    throw err;
  }
}

const copyModule = await tryImport("../src/autonomous_content/humanizedCopy.js");

// Authoritative list of banned clichés from requirements
const MANDATORY_BANNED_CLICHES = [
  "在这个快节奏的时代",
  "总有一款适合你",
  "建议收藏反复阅读",
  "建议收藏",
  "底层逻辑",
  "赋能",
  "闭环",
  "维度",
  "颠覆认知"
];

// Additional corporate / AI buzzwords to intercept
const EXTENDED_AI_BUZZWORDS = [
  "认知重塑",
  "心智模型",
  "抓手",
  "对齐颗粒度",
  "对齐",
  "打通底层",
  "沉淀方法论",
  "组合拳",
  "私域流量",
  "链路"
];

// ---------------------------------------------------------------------------
// TIER 1: FEATURE COVERAGE
// ---------------------------------------------------------------------------

test("Tier 1 - F8.1: Individually intercept every mandatory banned cliché", {
  skip: !copyModule?.lintAntiAITone ? "Awaiting M3 lintAntiAITone in humanizedCopy.js" : false
}, () => {
  for (const cliché of MANDATORY_BANNED_CLICHES) {
    const text = `今天我们来聊一聊。${cliché}，很多人都没有意识到这个问题。`;
    const res = copyModule.lintAntiAITone(text);
    assert.equal(res.ok, false, `Should reject text containing cliché: "${cliché}"`);
    assert.ok(Array.isArray(res.violations), "violations must be an array");
    assert.ok(res.violations.length > 0, `violations must record detected cliché: "${cliché}"`);
    assert.ok(
      res.violations.some((v) => v.includes(cliché) || cliché.includes(v)),
      `violations should mention "${cliché}", got: ${JSON.stringify(res.violations)}`
    );
  }
});

test("Tier 1 - F8.2: Multi-cliché detection captures all violations in composite text", {
  skip: !copyModule?.lintAntiAITone ? "Awaiting M3 lintAntiAITone in humanizedCopy.js" : false
}, () => {
  const compositeText = [
    "在这个快节奏的时代，很多人都想要搞懂商业的底层逻辑。",
    "今天为你全面赋能，打造商业自闭环，多维度颠覆认知。",
    "内容干货很多，建议收藏反复阅读，总有一款适合你。"
  ].join("\n\n");

  const res = copyModule.lintAntiAITone(compositeText);
  assert.equal(res.ok, false);
  assert.ok(res.violations.length >= 4, `Should detect multiple violations, found: ${res.violations.length}`);
});

test("Tier 1 - F8.3: Authentic human persona text passes cleanly with 0 violations", {
  skip: !copyModule?.lintAntiAITone ? "Awaiting M3 lintAntiAITone in humanizedCopy.js" : false
}, () => {
  const humanSamples = [
    "我查了一下文献，发现很多人把早起当成了自律的唯一标准。\n但其实只要你睡眠周期混乱，硬撑只会更累。\n做不到就别硬撑，先睡够7小时再说。",
    "外网疯传的这条经验，其实是在偷换概念。\n很多人只看到结果，没看到前置条件。\n普通人照搬大概率会踩坑。",
    "昨天翻了卡尼曼的原著，有句话特别扎心：\n刀已经扎进去了，别用刀柄解释为什么疼。\n承认损失，往往比死撑着更需要勇气。"
  ];

  for (const sample of humanSamples) {
    const res = copyModule.lintAntiAITone(sample);
    assert.equal(res.ok, true, `Human copy must pass: ${sample.slice(0, 30)}...`);
    assert.equal(res.violations.length, 0);
  }
});

test("Tier 1 - F8.4: Paragraph length enforcement: <= 3 lines pass cleanly", {
  skip: !copyModule?.lintAntiAITone ? "Awaiting M3 lintAntiAITone in humanizedCopy.js" : false
}, () => {
  // 1 line
  const p1 = "今天聊一个极简习惯。";
  assert.equal(copyModule.lintAntiAITone(p1).ok, true);

  // 2 lines
  const p2 = "第一条：不要把时间花在无效社交上。\n自己手头的事情做好了，人脉自然来。";
  assert.equal(copyModule.lintAntiAITone(p2).ok, true);

  // 3 lines (exact limit)
  const p3 = "第二条：睡前把手机放远一点。\n很多人不是失眠，只是手停不下来。\n试三天看看效果。";
  assert.equal(copyModule.lintAntiAITone(p3).ok, true);
});

test("Tier 1 - F8.5: Paragraph length enforcement: >= 4 lines rejected", {
  skip: !copyModule?.lintAntiAITone ? "Awaiting M3 lintAntiAITone in humanizedCopy.js" : false
}, () => {
  const p4 = [
    "第一行：很多人问我怎么才能专注。",
    "第二行：其实最简单的方法就是清理桌面。",
    "第三行：只留下当前任务需要的唯一一件东西。",
    "第四行：手机彻底扣过去静音，这样就能进入状态了。"
  ].join("\n");

  const res = copyModule.lintAntiAITone(p4);
  assert.equal(res.ok, false, "Paragraph with 4 lines must be rejected");
  assert.ok(
    res.violations.some((v) => /paragraph|line|行|段落/i.test(v)),
    "Violations must specify paragraph line length error"
  );
});

test("Tier 1 - F9.1: recommendXiaohongshuTags returns strictly 4–6 tags", {
  skip: !copyModule?.recommendXiaohongshuTags ? "Awaiting M3 recommendXiaohongshuTags in humanizedCopy.js" : false
}, () => {
  const topics = [
    { topic: "变富的小技巧", domain: "wealth" },
    { topic: "深度拆书卡尼曼", domain: "shuzhai" },
    { topic: "反内耗指南", domain: "growth" }
  ];

  for (const item of topics) {
    const tags = copyModule.recommendXiaohongshuTags(item.topic, item.domain);
    assert.ok(Array.isArray(tags), "Tags must be an array");
    assert.ok(
      tags.length >= 4 && tags.length <= 6,
      `Tag count must be between 4 and 6, got: ${tags.length} for domain ${item.domain}`
    );
  }
});

test("Tier 1 - F9.2: recommendXiaohongshuTags produces niche domain-matched tags", {
  skip: !copyModule?.recommendXiaohongshuTags ? "Awaiting M3 recommendXiaohongshuTags in humanizedCopy.js" : false
}, () => {
  // Wealth domain
  const wealthTags = copyModule.recommendXiaohongshuTags("如何增加被动收入", "wealth");
  assert.ok(
    wealthTags.some((t) => /搞钱|财富|富有|思维|认知/i.test(t)),
    "Wealth tags must match financial domain keywords"
  );

  // Shuzhai / Reading domain
  const bookTags = copyModule.recommendXiaohongshuTags("思考快与慢书摘", "shuzhai");
  assert.ok(
    bookTags.some((t) => /书单|读书|深度思考|认知|阅读/i.test(t)),
    "Shuzhai tags must match reading and deep thinking keywords"
  );
});

test("Tier 1 - F9.3: recommendXiaohongshuTags purges all AI buzzwords from tags", {
  skip: !copyModule?.recommendXiaohongshuTags ? "Awaiting M3 recommendXiaohongshuTags in humanizedCopy.js" : false
}, () => {
  const testDomains = ["wealth", "shuzhai", "growth", "business", "psychology"];
  for (const domain of testDomains) {
    const tags = copyModule.recommendXiaohongshuTags("探索未知领域", domain);
    for (const tag of tags) {
      for (const banned of MANDATORY_BANNED_CLICHES) {
        assert.ok(
          !tag.includes(banned),
          `Tag "${tag}" must not contain banned cliché "${banned}"`
        );
      }
    }
  }
});

// ---------------------------------------------------------------------------
// TIER 2: BOUNDARY & CORNER CASES (ADVERSARIAL VERIFICATION)
// ---------------------------------------------------------------------------

test("Tier 2 - B2.1: Intercept evasion attempts using zero-width spaces and formatting tricks", {
  skip: !copyModule?.lintAntiAITone ? "Awaiting M3 lintAntiAITone in humanizedCopy.js" : false
}, () => {
  const evasions = [
    "掌握这套底\u200B层\u200B逻\u200B辑，就能搞定一切",
    "为你的业务赋\uFEFF能，带来增长",
    "形成业务闭\u200C环，稳定产出",
    "在这个快 节 奏 的 时 代，我们要放慢脚步",
    "底.层.逻.辑.非常重要",
    "颠_覆_认_知的新发现"
  ];

  for (const evasion of evasions) {
    const res = copyModule.lintAntiAITone(evasion);
    assert.equal(res.ok, false, `Must catch evasion attempt: "${evasion}"`);
  }
});

test("Tier 2 - B2.2: Paragraph line count correctly handles mixed newlines (CRLF vs LF) and spacing", {
  skip: !copyModule?.lintAntiAITone ? "Awaiting M3 lintAntiAITone in humanizedCopy.js" : false
}, () => {
  // CRLF with exactly 3 lines: PASS
  const crlf3 = "第一行文本\r\n第二行文本\r\n第三行文本";
  assert.equal(copyModule.lintAntiAITone(crlf3).ok, true);

  // CRLF with 4 lines: FAIL
  const crlf4 = "第一行\r\n第二行\r\n第三行\r\n第四行";
  assert.equal(copyModule.lintAntiAITone(crlf4).ok, false);

  // Two paragraphs separated by blank lines, each <= 3 lines: PASS
  const multiParaOk = "第一段第一行\n第一段第二行\n\n第二段第一行\n第二段第二行\n第二段第三行";
  assert.equal(copyModule.lintAntiAITone(multiParaOk).ok, true);

  // Two paragraphs, second paragraph has 4 lines: FAIL
  const multiParaFail = "第一段短\n\n第二段第一行\n第二段第二行\n第二段第三行\n第二段第四行";
  assert.equal(copyModule.lintAntiAITone(multiParaFail).ok, false);
});

test("Tier 2 - B2.3: Graceful handling of empty, null, undefined, or whitespace-only inputs", {
  skip: !copyModule?.lintAntiAITone ? "Awaiting M3 lintAntiAITone in humanizedCopy.js" : false
}, () => {
  const edgeCases = ["", "   ", "\n\n\n", null, undefined];
  for (const input of edgeCases) {
    assert.doesNotThrow(() => {
      const res = copyModule.lintAntiAITone(input);
      assert.ok(typeof res === "object");
      assert.equal(res.ok, true, "Empty input should not flag violations");
      assert.equal(res.violations.length, 0);
    });
  }
});

test("Tier 2 - B2.4: Stress test with extreme length content (> 10,000 characters)", {
  skip: !copyModule?.lintAntiAITone ? "Awaiting M3 lintAntiAITone in humanizedCopy.js" : false
}, () => {
  const cleanParagraph = "这是一段干净的人话文本。\n不包含任何AI套话和八股文。\n每段严格控制在三行以内。\n\n";
  const massiveCleanText = cleanParagraph.repeat(200); // ~12,000 chars

  const t0 = Date.now();
  const res = copyModule.lintAntiAITone(massiveCleanText);
  const elapsed = Date.now() - t0;

  assert.equal(res.ok, true);
  assert.ok(elapsed < 2000, `Large text linting must complete within 2s, took ${elapsed}ms`);
});

test("Tier 2 - B2.5: Tag recommender gracefully handles unknown domain or empty topic", {
  skip: !copyModule?.recommendXiaohongshuTags ? "Awaiting M3 recommendXiaohongshuTags in humanizedCopy.js" : false
}, () => {
  const fallbackTags = copyModule.recommendXiaohongshuTags("", "unknown_domain_xyz");
  assert.ok(Array.isArray(fallbackTags));
  assert.ok(fallbackTags.length >= 4 && fallbackTags.length <= 6);
  // Guarantee tags are distinct
  const uniqueTags = new Set(fallbackTags);
  assert.equal(uniqueTags.size, fallbackTags.length, "Tags must be unique without duplicates");
});

test("Tier 2 - B2.6: Tag formatting consistency: tags start with '#' and contain no spaces", {
  skip: !copyModule?.recommendXiaohongshuTags ? "Awaiting M3 recommendXiaohongshuTags in humanizedCopy.js" : false
}, () => {
  const tags = copyModule.recommendXiaohongshuTags("自我成长思考", "growth");
  for (const tag of tags) {
    assert.ok(tag.startsWith("#"), `Tag must start with '#', got: ${tag}`);
    assert.ok(!/\s/.test(tag), `Tag must not contain whitespace, got: ${tag}`);
    assert.ok(tag.length > 1, `Tag must contain characters after '#', got: ${tag}`);
  }
});

// ---------------------------------------------------------------------------
// TIER 3: PAIRWISE COMBINATORIAL TESTING
// ---------------------------------------------------------------------------

test("Tier 3 - P2: Combinatorial Matrix: Paragraph Length x Buzzword Injection", {
  skip: !copyModule?.lintAntiAITone ? "Awaiting M3 lintAntiAITone in humanizedCopy.js" : false
}, () => {
  const matrix = [
    // [lines, hasBuzzword, expectedOk]
    [2, false, true],
    [3, false, true],
    [4, false, false],
    [2, true, false],
    [3, true, false],
    [4, true, false]
  ];

  for (const [lines, hasBuzzword, expectedOk] of matrix) {
    const lineArr = [];
    for (let i = 0; i < lines; i++) {
      if (i === 0 && hasBuzzword) {
        lineArr.push("今天我们要探讨底层逻辑。");
      } else {
        lineArr.push(`这是第${i + 1}行普通人话描述。`);
      }
    }
    const sample = lineArr.join("\n");
    const res = copyModule.lintAntiAITone(sample);
    assert.equal(
      res.ok,
      expectedOk,
      `Lines=${lines}, Buzzword=${hasBuzzword} expected ok=${expectedOk}, got ok=${res.ok}`
    );
  }
});

// ---------------------------------------------------------------------------
// TIER 4: REAL-WORLD WORKLOAD SCENARIOS
// ---------------------------------------------------------------------------

test("Tier 4 - S3: Real-World Scenario: Reference Tweet '10 Habits of Poverty' copy linting", {
  skip: !copyModule?.lintAntiAITone ? "Awaiting M3 lintAntiAITone in humanizedCopy.js" : false
}, () => {
  const noteBody = [
    "# 标题",
    "变富的小技巧",
    "",
    "# 正文",
    "外网疯传的8个变富习惯，我查了实证研究：",
    "其实只有3条真管用，其余多半是噱头。",
    "",
    "① 专注一件事：✅ 基本靠谱。",
    "心流与深度工作能显著提升单位时间产出。",
    "",
    "② 强行5点早起：⚠️ 因果夸大。",
    "早起是因为优秀，不是早起就能变优秀。",
    "睡眠不足7小时，做决策更容易上头出错。",
    "",
    "③ 凡事买最便宜的：❌ 纯属营销噱头。",
    "低价往往意味着高维护成本和频繁换新。",
    "在关键生产工具上省钱，是最大的隐形浪费。",
    "",
    "作者置顶：优先级 ① > ③ > ②，别被噱头带偏。",
    "",
    "#搞钱思维 #财富思维 #认知提升 #自我成长"
  ].join("\n");

  const res = copyModule.lintAntiAITone(noteBody);
  assert.equal(res.ok, true, `Real-world grounded copy must pass linting without AI buzzwords`);
  assert.equal(res.violations.length, 0);
});

test("Tier 4 - S4: Real-World Scenario: Adversarial Corporate AI Buzzword Storm 100% Intercepted", {
  skip: !copyModule?.lintAntiAITone ? "Awaiting M3 lintAntiAITone in humanizedCopy.js" : false
}, () => {
  const buzzwordStorm = [
    "在这个快节奏的时代，我们需要沉淀认知资产。",
    "通过底层逻辑打通业务全链路，为团队深度赋能。",
    "建立高维思考心智模型，形成商业闭环。",
    "多维度颠覆认知，总有一款适合你。",
    "建议收藏反复阅读，抓住未来的抓手。"
  ].join("\n\n");

  const res = copyModule.lintAntiAITone(buzzwordStorm);
  assert.equal(res.ok, false);
  // Verify that it caught multiple specific clichés
  assert.ok(res.violations.length >= 5, `Expected >= 5 violations, got ${res.violations.length}`);
});
