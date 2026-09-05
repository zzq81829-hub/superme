/**
 * Test Suite: Shuzhai Book Card Pipeline & Card Layout Standard Preservation
 *
 * Requirements Source:
 * - ORIGINAL_REQUEST.md (2026-09-04T18:14:38Z) §R5: good try (Shuzhai) Book Card Pipeline Preservation
 * - PROJECT.md: Feature 10 (Shuzhai Pipeline & card-layout-standard Preservation)
 * - TEST_INFRA.md: Tiers 1-4 for Shuzhai Preservation
 * - .agents/skills/card-layout-standard/SKILL.md: Authoritative visual specification
 *
 * Dimensional Invariants:
 * 1. Art banner bridge gap: 36px ~ 52px (avoids top-heavy bottom-empty layout).
 * 2. Vertical breathing rhythm:
 *    - Title to lead card: 88px ~ 96px
 *    - Lead card to core body block: 42px ~ 48px
 *    - Core blocks / list items breathing gaps: 26px ~ 32px
 *    - Tracking: Title +3px ~ +4px, body +2.0px ~ +2.5px
 *    - Line height: 1.55 ~ 1.70 times font size
 * 3. Translucent frosted paper micro-cards:
 *    - Background: rgba(255, 255, 255, 0.68 ~ 0.72) (~70% opacity)
 *    - Border: 1px semi-transparent pale gold/bone rgba(216, 206, 188, 0.65)
 *    - Border radius: 12px ~ 14px
 *    - Padding: vertical >= 20px, horizontal >= 32px
 *    - Accent indicator strip: 6px ~ 8px width on left
 * 4. Anchored bottom takeaway card:
 *    - Card height: >= 118px ~ 128px
 *    - 2-tier info hierarchy (top kicker + bottom 34pt~36pt Kai quote)
 *    - Left side: 8px bronze accent bar
 * 5. Slide policy: 4 to 7 slides per package.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// Dynamic imports
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

const layoutModule = await tryImport("../src/content/xiaohongshuLayout.js");
const skillModule = await tryImport("../src/skills/cardLayoutStandard.js");

// Sample Shuzhai Book Package
const sampleShuzhaiPackage = {
  id: "pkg-kahneman-loss-aversion",
  project: "shuzhai",
  accountId: "xhs_account_1",
  platform: "xiaohongshu",
  title: "为什么你总在沉没成本里溺水？",
  body: [
    "很多人不是舍不得过去的付出，而是不敢面对承认错误的痛苦。",
    "丹尼尔·卡尼曼在《思考，快与慢》中提出前景理论：",
    "损失带来的痛苦感受，在心理学上是同等收益快乐的2.5倍。",
    "于是我们为了避免承认那点确定性的损失，选择继续往无底洞里押注更多筹码。",
    "真正的高手，刀扎进去了就立刻止血，绝不用刀柄解释为什么疼。"
  ].join("\n\n"),
  layout: {
    templateId: "shuzhai-editorial-v1",
    callToAction: "收藏这一页，留给下一次沉没时自省。"
  },
  layers: {
    facts: [{ source: "《思考，快与慢》丹尼尔·卡尼曼 第4章 前景理论" }],
    expressions: [{ text: "刀已经扎进去，不要用刀柄解释为什么疼" }],
    viewpoints: [{ title: "沉没成本心理账本", usage: "quote" }]
  }
};

// ---------------------------------------------------------------------------
// TIER 1: FEATURE COVERAGE
// ---------------------------------------------------------------------------

test("Tier 1 - F10.1: card-layout-standard authoritative skill file exists and contains all required dimensions", () => {
  const skillFile = path.join(root, ".agents", "skills", "card-layout-standard", "SKILL.md");
  assert.ok(fs.existsSync(skillFile), "SKILL.md must exist in .agents/skills/card-layout-standard/");

  const content = fs.readFileSync(skillFile, "utf8");
  // 1. Art banner bridge gap: 36px ~ 52px
  assert.match(content, /36px\s*~\s*52px/i, "Must define 36px ~ 52px art banner bridge");

  // 2. Title to lead card spacing: 88px ~ 96px
  assert.match(content, /88px\s*~\s*96px/i, "Must define 88px ~ 96px title spacing");

  // 3. Core block breathing gap: 26px ~ 32px
  assert.match(content, /26px\s*~\s*32px/i, "Must define 26px ~ 32px breathing gap");

  // 4. Micro-card 70% translucency: 0.68 ~ 0.72
  assert.match(content, /0\.68\s*~\s*0\.72|70%/i, "Must define ~70% frosted paper translucency");

  // 5. Anchored bottom card height: >= 118px ~ 128px
  assert.match(content, /118px\s*~\s*128px/i, "Must define >= 118px bottom takeaway card");
});

test("Tier 1 - F10.2: readCardLayoutStandardDirective returns complete prompt injection directive", () => {
  assert.ok(skillModule?.readCardLayoutStandardDirective, "readCardLayoutStandardDirective must be exported");
  const directive = skillModule.readCardLayoutStandardDirective();
  assert.ok(directive.length > 200, "Directive must contain full skill guidelines");
  assert.ok(directive.includes("MANDATORY SKILL (card-layout-standard"), "Directive must include header");
  assert.ok(directive.includes("36px ~ 52px"), "Directive must include banner bridge constraint");
  assert.ok(directive.includes("88px ~ 96px"), "Directive must include title spacing constraint");
  assert.ok(directive.includes("26px ~ 32px"), "Directive must include breathing gap constraint");
});

test("Tier 1 - F10.3: buildXiaohongshuLayoutPlan produces valid multi-slide plan for Shuzhai package", () => {
  assert.ok(layoutModule?.buildXiaohongshuLayoutPlan, "buildXiaohongshuLayoutPlan must be exported");
  const plan = layoutModule.buildXiaohongshuLayoutPlan(sampleShuzhaiPackage);

  assert.ok(plan, "Layout plan must not be null");
  assert.ok(plan.template, "Plan must contain template metadata");
  assert.ok(Array.isArray(plan.slides), "Plan must contain slides array");

  // Canvas aspect ratio: 1080x1440 (3:4)
  assert.equal(plan.template.canvas.width, 1080);
  assert.equal(plan.template.canvas.height, 1440);
  assert.equal(plan.template.canvas.ratio, "3:4");

  // Verify slide structure
  assert.ok(plan.slides.length >= 4 && plan.slides.length <= 7, `Slide count must be 4-7, got: ${plan.slides.length}`);
  assert.equal(plan.slides[0].role, "cover", "First slide must be cover");
  assert.equal(plan.slides[1].role, "hook", "Second slide must be hook");
  assert.equal(plan.slides[plan.slides.length - 1].role, "ending", "Last slide must be ending");
});

test("Tier 1 - F10.4: normalizeXiaohongshuLayout validates template and callToAction", () => {
  assert.ok(layoutModule?.normalizeXiaohongshuLayout, "normalizeXiaohongshuLayout must be exported");

  // Default template
  const normDefault = layoutModule.normalizeXiaohongshuLayout(null);
  assert.ok(normDefault.templateId);
  assert.ok(normDefault.callToAction);

  // Valid custom call to action
  const custom = layoutModule.normalizeXiaohongshuLayout({
    templateId: "shuzhai-editorial-v1",
    callToAction: "把这一句留给下一次重读。"
  });
  assert.equal(custom.templateId, "shuzhai-editorial-v1");
  assert.equal(custom.callToAction, "把这一句留给下一次重读。");
});

test("Tier 1 - F10.5: Card Layout Standard dimensional constants in xiaohongshuLayout.js", {
  skip: !layoutModule?.CARD_LAYOUT_STANDARD && !layoutModule?.XIAOHONGSHU_LAYOUT_TEMPLATES?.["shuzhai-card-standard-v1"]
    ? "Awaiting M4 CARD_LAYOUT_STANDARD or shuzhai-card-standard-v1 in xiaohongshuLayout.js"
    : false
}, () => {
  const std = layoutModule.CARD_LAYOUT_STANDARD || layoutModule.XIAOHONGSHU_LAYOUT_TEMPLATES["shuzhai-card-standard-v1"];

  // 1. Art banner bridge
  const bannerGap = std.bannerBridgeGap || std.artBannerBridge;
  assert.ok(bannerGap.min >= 36 && bannerGap.max <= 52, "Banner bridge gap must be within [36, 52]px");

  // 2. Title spacing
  const titleSpacing = std.titleSpacing;
  assert.ok(titleSpacing.min >= 88 && titleSpacing.max <= 96, "Title spacing must be within [88, 96]px");

  // 3. Breathing gap
  const breathingGap = std.breathingGap;
  assert.ok(breathingGap.min >= 26 && breathingGap.max <= 32, "Breathing gap must be within [26, 32]px");

  // 4. Frosted micro-card
  const micro = std.microCard;
  assert.ok(micro.opacity >= 0.68 && micro.opacity <= 0.72, "Micro-card opacity must be 0.68 ~ 0.72");
  assert.ok(micro.radius >= 12 && micro.radius <= 14, "Micro-card border radius must be 12 ~ 14px");
  assert.ok(micro.indicatorWidth >= 6 && micro.indicatorWidth <= 8, "Accent strip width must be 6 ~ 8px");

  // 5. Anchored bottom card
  const anchor = std.anchorCard;
  assert.ok(anchor.minHeight >= 118, "Anchor card minimum height must be >= 118px");
});

// ---------------------------------------------------------------------------
// TIER 2: BOUNDARY & CORNER CASES
// ---------------------------------------------------------------------------

test("Tier 2 - B10.1: callToAction length boundary enforcement (<= 32 characters)", () => {
  // Exactly 32 chars: PASS
  const exactly32 = "一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一二";
  assert.equal(exactly32.length, 32);
  assert.doesNotThrow(() => {
    layoutModule.normalizeXiaohongshuLayout({ callToAction: exactly32 });
  });

  // 33 chars: FAIL
  const length33 = "一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一二三";
  assert.equal(length33.length, 33);
  assert.throws(() => {
    layoutModule.normalizeXiaohongshuLayout({ callToAction: length33 });
  }, /32 characters or fewer/i);
});

test("Tier 2 - B10.2: Unsupported layout template ID throws informative error", () => {
  assert.throws(() => {
    layoutModule.normalizeXiaohongshuLayout({ templateId: "non-existent-template-999" });
  }, /Unsupported Xiaohongshu layout template/i);
});

test("Tier 2 - B10.3: Non-Xiaohongshu platform returns null cleanly", () => {
  const result = layoutModule.normalizeXiaohongshuLayout(null, { platform: "weibo" });
  assert.equal(result, null);
});

test("Tier 2 - B10.4: Short text generates minimum 4 slides with breathing-room filler", () => {
  const shortPkg = {
    ...sampleShuzhaiPackage,
    body: "一句话洞察。",
    layers: {
      facts: [],
      expressions: [],
      viewpoints: []
    }
  };
  const plan = layoutModule.buildXiaohongshuLayoutPlan(shortPkg);
  assert.ok(plan.slides.length >= 4, `Plan must have at least 4 slides, got: ${plan.slides.length}`);
  assert.ok(
    plan.slides.some((s) => s.role === "breathing-room"),
    "Must inject breathing-room slide when body text is short"
  );
});

test("Tier 2 - B10.5: Verbose text respects slide maximum limit (7 slides)", () => {
  const longPkg = {
    ...sampleShuzhaiPackage,
    body: "深度分析第一条内容。".repeat(30) + "\n\n" + "深度分析第二条内容。".repeat(30)
  };
  const plan = layoutModule.buildXiaohongshuLayoutPlan(longPkg);
  assert.ok(plan.slides.length <= 7, `Slide count must not exceed 7, got: ${plan.slides.length}`);
  assert.equal(plan.slides[plan.slides.length - 1].role, "ending", "Ending slide must always be preserved");
});

test("Tier 2 - B10.6: Anti-pattern check: Typography and line height invariants", () => {
  // Line height must strictly adhere to 1.55 ~ 1.70 times font size per card-layout-standard
  const skillFile = path.join(root, ".agents", "skills", "card-layout-standard", "SKILL.md");
  assert.ok(fs.existsSync(skillFile));
  const content = fs.readFileSync(skillFile, "utf8");
  assert.match(content, /1\.55\s*~\s*1\.70/i, "Line height standard must be 1.55 ~ 1.70");
  assert.match(content, /\+3px\s*~\s*\+4px/i, "Title tracking standard must be +3px ~ +4px");
  assert.match(content, /\+2\.0px\s*~\s*\+2\.5px/i, "Body tracking standard must be +2.0px ~ +2.5px");
});

// ---------------------------------------------------------------------------
// TIER 3: PAIRWISE COMBINATORIAL TESTING
// ---------------------------------------------------------------------------

test("Tier 3 - P3: Template list enumeration and schema consistency", () => {
  assert.ok(layoutModule?.listXiaohongshuLayoutTemplates, "listXiaohongshuLayoutTemplates must be exported");
  const templates = layoutModule.listXiaohongshuLayoutTemplates();
  assert.ok(templates.length >= 1, "Must list at least 1 template");

  for (const t of templates) {
    assert.ok(t.id, "Template must have id");
    assert.ok(t.name, "Template must have name");
    assert.ok(t.canvas, "Template must have canvas specs");
    assert.equal(t.canvas.width, 1080);
    assert.equal(t.canvas.height, 1440);
    assert.ok(t.safeArea, "Template must have safeArea");
    assert.ok(t.typography, "Template must have typography");
    assert.ok(t.slidePolicy, "Template must have slidePolicy");
    if (t.id.startsWith("shuzhai")) {
      assert.equal(t.slidePolicy.minimum, 4);
      assert.equal(t.slidePolicy.maximum, 7);
    } else {
      assert.ok(t.slidePolicy.minimum >= 1);
      assert.ok(t.slidePolicy.maximum >= t.slidePolicy.minimum);
    }
  }
});

// ---------------------------------------------------------------------------
// TIER 4: REAL-WORLD WORKLOAD SCENARIOS
// ---------------------------------------------------------------------------

test("Tier 4 - S5: Real-World Scenario: Verify existing Shuzhai packages in data/content/packages/", () => {
  const packagesDir = path.join(root, "data", "content", "packages");
  if (!fs.existsSync(packagesDir)) return;

  const packageFiles = fs.readdirSync(packagesDir)
    .filter((f) => f.startsWith("shuzhai-") && f.endsWith(".json"));

  assert.ok(packageFiles.length >= 1, "Must have at least one shuzhai package fixture in data/content/packages/");

  for (const file of packageFiles) {
    const pkgPath = path.join(packagesDir, file);
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

    // If templateId is supported (e.g. shuzhai-editorial-v1), buildXiaohongshuLayoutPlan must succeed
    const templateId = pkg?.layout?.templateId || "shuzhai-editorial-v1";
    if (layoutModule.XIAOHONGSHU_LAYOUT_TEMPLATES[templateId]) {
      assert.doesNotThrow(() => {
        const plan = layoutModule.buildXiaohongshuLayoutPlan(pkg);
        if (plan) {
          assert.ok(plan.slides.length >= 4 && plan.slides.length <= 7);
        }
      }, `Package ${file} with supported template must generate valid layout plan`);
    } else {
      // Legacy or un-migrated template IDs must throw unsupported template error
      assert.throws(() => {
        layoutModule.buildXiaohongshuLayoutPlan(pkg);
      }, /Unsupported Xiaohongshu layout template/i);
    }
  }
});
