import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";

import {
  generateIPProposals,
  injectMonetizationCTA,
  generatePinnedChecklist,
  rankIPProposals,
  saveIPProposals,
  loadIPProposals,
  normalizeCtaType,
  DEFAULT_IP_ARCHETYPES
} from "../src/autonomous_content/ipDiscovery.js";

import { evaluateCompliance } from "../src/autonomous_content/complianceFirewall.js";

function createTempDir(prefix = "ip-test-") {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return {
    dir: tmp,
    cleanup: () => {
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {}
    }
  };
}

// ----------------------------------------------------------------------------
// Suite 1: normalizeCtaType
// ----------------------------------------------------------------------------
test("ipDiscovery: normalizeCtaType standardizes supported and fallback types", () => {
  assert.equal(normalizeCtaType("book"), "book");
  assert.equal(normalizeCtaType("BOOK_RECOMMENDATION"), "book");
  assert.equal(normalizeCtaType("toolkit"), "toolkit");
  assert.equal(normalizeCtaType("digital_toolkit"), "toolkit");
  assert.equal(normalizeCtaType("consulting"), "consultation");
  assert.equal(normalizeCtaType("consultation"), "consultation");
  assert.equal(normalizeCtaType("checklist"), "checklist");
  assert.equal(normalizeCtaType("checklist_card"), "checklist");
  assert.equal(normalizeCtaType("unknown_custom_type"), "engagement");
  assert.equal(normalizeCtaType(null), "engagement");
});

// ----------------------------------------------------------------------------
// Suite 2: generateIPProposals
// ----------------------------------------------------------------------------
test("ipDiscovery: generateIPProposals produces at least 3 distinct, complete IP schemes", () => {
  const proposals = generateIPProposals();
  assert.ok(Array.isArray(proposals));
  assert.ok(proposals.length >= 3, "Must generate at least 3 distinct proposals");

  for (const p of proposals) {
    assert.ok(p.id, "Proposal must have an id");
    assert.ok(typeof p.personaTitle === "string" && p.personaTitle.length > 0);
    assert.ok(Array.isArray(p.personaTags) && p.personaTags.length >= 3);
    assert.ok(typeof p.targetAudience === "string" && p.targetAudience.length > 0);
    assert.ok(typeof p.hookAngle === "string" && p.hookAngle.length > 0);
    assert.ok(Array.isArray(p.contentPillars) && p.contentPillars.length >= 3);
    assert.ok(Array.isArray(p.benchmarkAccounts) && p.benchmarkAccounts.length >= 2);
    assert.ok(Array.isArray(p.monetizationPaths) && p.monetizationPaths.length >= 2);
    assert.ok(Array.isArray(p.monetizationModels) && p.monetizationModels.length >= 2);
    assert.ok(typeof p.score === "number" && p.score > 0);
    assert.ok(p.estimatedTimeCommitment);
    assert.ok(p.competitiveMoat);
  }
});

test("ipDiscovery: generateIPProposals includes Founder Breakthrough Directive Fact-Checker persona", () => {
  const proposals = generateIPProposals();
  const factChecker = proposals.find(
    (p) => p.personaTitle.includes("质检") || p.personaTitle.includes("求真") || p.id === "ip-fact-checker-mythbuster"
  );

  assert.ok(factChecker, "Must include 权威信息质检官/避坑指南 persona");
  assert.ok(factChecker.personaTags.some((t) => t.includes("质检") || t.includes("打假") || t.includes("求真")));
  assert.ok(factChecker.hookAngle.includes("外网") || factChecker.hookAngle.includes("质检"));
  assert.ok(factChecker.contentPillars.some((p) => p.includes("打标") || p.includes("求真") || p.includes("质检")));
  assert.ok(factChecker.monetizationModels.some((m) => m.includes("带货") || m.includes("测评")));
});

test("ipDiscovery: generateIPProposals intelligently tailors proposals to founderProfile and marketSignals", () => {
  const profile = {
    founderBackground: "SaaS & AI Tool Maker",
    interests: ["Solopreneurship", "AI Workflow", "Digital Products"],
    strengths: ["systems automation", "rapid MVP"]
  };
  const signals = {
    highGrowthCategories: ["AI效率工具", "轻资产创业"]
  };

  const proposals = generateIPProposals(profile, signals);
  assert.ok(proposals.length >= 3);

  const solopreneur = proposals.find((p) => p.id === "ip-solopreneur-geek");
  assert.ok(solopreneur);
  assert.ok(solopreneur.score >= 90, "Solopreneur score should receive profile & signal boost");
  assert.ok(solopreneur.contentPillars.some((pillar) => pillar.includes("实战") || pillar.includes("变现")));
});

// ----------------------------------------------------------------------------
// Suite 3: injectMonetizationCTA
// ----------------------------------------------------------------------------
test("ipDiscovery: injectMonetizationCTA - Book recommendation CTA injection", () => {
  const baseNote = {
    title: "高能量人的底层逻辑",
    body: "行动力不足往往不是因为懒，而是心理内耗与目标过载。"
  };

  const enhanced = injectMonetizationCTA(baseNote, "book", {
    bookTitle: "《微习惯》",
    corePitch: "每天只做5分钟，彻底打破拖延怪圈。"
  });

  assert.ok(enhanced.enhancedBody.includes("《微习惯》"));
  assert.ok(enhanced.enhancedBody.includes("精选好书推荐"));
  assert.ok(enhanced.ctaSlide);
  assert.equal(enhanced.ctaSlide.role, "monetization_cta");
  assert.equal(enhanced.ctaSlide.type, "book");
  assert.ok(enhanced.ctaSlide.text.length <= 120);
  assert.ok(enhanced.ctaSlide.callToAction.length <= 32);
});

test("ipDiscovery: injectMonetizationCTA - Digital Toolkit CTA injection", () => {
  const baseNote = {
    title: "一人公司全自动化工作流",
    body: "一个人就是一支团队的核心在于让AI承担80%的搬运工作。"
  };

  const enhanced = injectMonetizationCTA(baseNote, "toolkit", {
    toolkitName: "一人公司生产力Notion系统",
    actionPrompt: "已将完整模板整理进工具包"
  });

  assert.ok(enhanced.enhancedBody.includes("Notion"));
  assert.ok(enhanced.enhancedBody.includes("一人公司生产力Notion系统"));
  assert.ok(enhanced.ctaSlide);
  assert.equal(enhanced.ctaSlide.type, "toolkit");
  assert.ok(enhanced.ctaSlide.text.length <= 120);
  assert.ok(enhanced.ctaSlide.callToAction.length <= 32);
});

test("ipDiscovery: injectMonetizationCTA - 1-on-1 Consultation CTA injection", () => {
  const baseNote = {
    title: "超级个体如何寻找第一商业定位",
    body: "商业定位不是凭空想出来的，是在市场真实碰撞中涌现的。"
  };

  const enhanced = injectMonetizationCTA(baseNote, "consultation", {
    serviceName: "超级个体商业模式深度咨询",
    spotsLimit: "本周仅余2席"
  });

  assert.ok(enhanced.enhancedBody.includes("咨询"));
  assert.ok(enhanced.enhancedBody.includes("本周仅余2席"));
  assert.ok(enhanced.ctaSlide);
  assert.equal(enhanced.ctaSlide.type, "consultation");
  assert.ok(enhanced.ctaSlide.callToAction.length <= 32);
});

test("ipDiscovery: injectMonetizationCTA - Fact-Check Checklist CTA injection", () => {
  const baseNote = {
    title: "外网疯传的早起奇迹，我查了资料：只有2条靠谱",
    body: "不要神化早起，生理节律是因人而异的。"
  };

  const enhanced = injectMonetizationCTA(baseNote, "checklist", {
    checklistTitle: "全网爆款避坑自查清单",
    items: ["查样本来源", "辨因果倒置", "防利益绑架"]
  });

  assert.ok(enhanced.enhancedBody.includes("自查清单"));
  assert.ok(enhanced.enhancedBody.includes("查样本来源"));
  assert.ok(enhanced.ctaSlide);
  assert.equal(enhanced.ctaSlide.type, "checklist");
  assert.ok(enhanced.ctaSlide.callToAction.length <= 32);
});

test("ipDiscovery: injectMonetizationCTA - Fallback on unknown CTA type", () => {
  const enhanced = injectMonetizationCTA({ title: "测试", body: "正文内容" }, "unknown_foo", {});
  assert.ok(enhanced.enhancedBody.includes("思考与互动"));
  assert.ok(enhanced.ctaSlide);
  assert.equal(enhanced.ctaSlide.role, "monetization_cta");
  assert.equal(enhanced.ctaSlide.type, "engagement");
});

test("ipDiscovery: injectMonetizationCTA - Idempotent injection does not duplicate body or slides", () => {
  const baseNote = { title: "防重复测试", body: "原始正文内容。" };
  const first = injectMonetizationCTA(baseNote, "book", { bookTitle: "《纳瓦尔宝典》" });
  const second = injectMonetizationCTA(first, "book", { bookTitle: "《纳瓦尔宝典》" });

  assert.equal(second.ctaSlides.length, 1);
  assert.equal(second.slides.filter((s) => s.role === "monetization_cta").length, 1);

  // Body should not have two book headers
  const occurrences = (second.enhancedBody.match(/📖 【精选好书推荐】/g) || []).length;
  assert.equal(occurrences, 1, "CTA header should appear exactly once after multiple injections");
});

test("ipDiscovery: injectMonetizationCTA - Extreme long text properly clamped within limits", () => {
  const superLongPitch = "Very long description. ".repeat(100);
  const enhanced = injectMonetizationCTA({ title: "长文本测试", body: "正文" }, "book", {
    bookTitle: "《长文本测试书名》",
    corePitch: superLongPitch
  });

  assert.ok(enhanced.ctaSlide.text.length <= 120, "CTA text must be <= 120 chars");
  assert.ok(enhanced.ctaSlide.callToAction.length <= 32, "CTA callToAction must be <= 32 chars");
});

test("ipDiscovery: injectMonetizationCTA - Special characters and emojis safely preserved", () => {
  const config = {
    bookTitle: "《纳瓦尔宝典：财富与幸福指南》✨🔥",
    corePitch: '“建立专长，用代码和媒体做杠杆——不要用时间换钱。”'
  };

  const enhanced = injectMonetizationCTA({ title: "符号测试", body: "正文" }, "book", config);
  assert.ok(enhanced.enhancedBody.includes("✨🔥"));
  assert.ok(enhanced.enhancedBody.includes("“建立专长"));
  assert.ok(enhanced.enhancedBody.includes("杠杆"));
  assert.ok(enhanced.ctaSlide.text.includes("✨🔥"));
});

test("ipDiscovery: injectMonetizationCTA - Injected content passes Two-Tier Compliance Firewall", () => {
  const enhanced = injectMonetizationCTA({ title: "合规性测试", body: "合规正文。" }, "book", {
    bookTitle: "《思考，快与慢》",
    corePitch: "理解系统1与系统2的运作方式。"
  });

  const evaluation = evaluateCompliance({
    title: enhanced.title,
    body: enhanced.enhancedBody,
    slides: [enhanced.ctaSlide]
  });

  assert.equal(evaluation.passed, true, "Injected CTA must pass compliance firewall");
  assert.equal(evaluation.riskLevel, "clean");
});

// ----------------------------------------------------------------------------
// Suite 4: generatePinnedChecklist
// ----------------------------------------------------------------------------
test("ipDiscovery: generatePinnedChecklist produces structured checklist and formatted comment", () => {
  const checklist = generatePinnedChecklist("外网自律神话", [
    "5点早起收入翻倍",
    "冷水澡根治焦虑",
    "多任务并行提高效率"
  ]);

  assert.ok(checklist.title.includes("外网自律神话"));
  assert.ok(Array.isArray(checklist.checklistItems));
  assert.equal(checklist.checklistItems.length, 3);
  assert.ok(checklist.formattedComment.includes("作者置顶"));
  assert.ok(checklist.formattedComment.includes("求真声明"));
  assert.equal(checklist.complianceStatus, "passed");
  assert.equal(String(checklist), checklist.formattedComment);
});

test("ipDiscovery: generatePinnedChecklist defaults gracefully when empty", () => {
  const checklist = generatePinnedChecklist();
  assert.ok(checklist.title.includes("客观避坑自查清单"));
  assert.ok(checklist.checklistItems.length >= 5);
  assert.ok(checklist.checklistItems[0].includes("查样本来源"));
  assert.ok(checklist.checklistItems[1].includes("辨因果倒置"));
});

// ----------------------------------------------------------------------------
// Suite 5: rankIPProposals
// ----------------------------------------------------------------------------
test("ipDiscovery: rankIPProposals sorts proposals according to conversionRate and revenue", () => {
  const proposals = generateIPProposals();
  const historicalMetrics = {
    "搞钱": { conversionRate: 0.12, revenue: 35000, likes: 2000, collects: 3500 },
    "认知": { conversionRate: 0.04, revenue: 5000, likes: 800, collects: 1200 },
    "质检": { conversionRate: 0.06, revenue: 12000, likes: 1500, collects: 2200 }
  };

  const ranked = rankIPProposals(proposals, historicalMetrics);
  assert.ok(Array.isArray(ranked));
  assert.equal(ranked.length, proposals.length);

  // The '搞钱' proposal should rank first due to higher conversionRate and revenue
  assert.ok(ranked[0].personaTitle.includes("搞钱") || ranked[0].score > ranked[1].score);
  assert.ok(ranked[0].score >= ranked[1].score);
  assert.ok(ranked[0].metricAttribution);
});

test("ipDiscovery: rankIPProposals handles empty proposals or metrics gracefully", () => {
  assert.deepEqual(rankIPProposals([]), []);
  const proposals = generateIPProposals();
  const rankedWithNoMetrics = rankIPProposals(proposals, {});
  assert.equal(rankedWithNoMetrics.length, proposals.length);
});

// ----------------------------------------------------------------------------
// Suite 6: saveIPProposals and loadIPProposals
// ----------------------------------------------------------------------------
test("ipDiscovery: saveIPProposals and loadIPProposals round-trip persistence", () => {
  const { dir, cleanup } = createTempDir("proposals-io-");
  try {
    const filePath = path.join(dir, "subfolder", "ip_proposals.json");
    const proposals = generateIPProposals();

    const saved = saveIPProposals(proposals, filePath);
    assert.equal(saved, true);
    assert.ok(fs.existsSync(filePath));

    const loaded = loadIPProposals(filePath);
    assert.ok(Array.isArray(loaded));
    assert.equal(loaded.length, proposals.length);
    assert.equal(loaded[0].id, proposals[0].id);
  } finally {
    cleanup();
  }
});
