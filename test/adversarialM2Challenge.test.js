/**
 * Adversarial Challenge & Stress Test Suite: Milestone 2
 * Visual Card Renderer (src/autonomous_content/visualCardRenderer.js) &
 * Multi-Tier Ingestion Fallback (src/autonomous_content/goldChance.js)
 *
 * Authored by: m2_challenger_2 (Empirical Challenger)
 * Verified against Playwright headless Chromium & Node.js runtime.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import {
  renderDarkTweetCard,
  generateTweetCardHtml,
  getDynamicCardLayout,
  resolveBrowserExecutable
} from "../src/autonomous_content/visualCardRenderer.js";
import {
  fetchTweetSource,
  buildGoldChancePackage,
  screenFeasibility,
  generateGroundedTitle,
  generateAuthorPinnedComment,
  REFERENCE_TWEET_10_HABITS
} from "../src/autonomous_content/goldChance.js";

function createTestDir(prefix = "adv-m2-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// =============================================================================
// SUITE 1: VISUAL CARD RENDERER STRESS
// =============================================================================

test("CHALLENGE-1.1: Extreme Item Counts & Dynamic Vertical Layout Scaling", async () => {
  const { chromium } = await import("playwright-core");
  const execPath = resolveBrowserExecutable();
  const browser = await chromium.launch(execPath ? { executablePath: execPath, headless: true } : { headless: true });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1440 } });

  try {
    // Probe 1, 3, 5, 10, 20 items
    const counts = [1, 3, 5, 10, 20];
    const results = {};

    for (const count of counts) {
      const items = Array.from({ length: count }, (_, i) => ({
        num: i + 1,
        text: `第 ${i + 1} 项认知习惯与实证法则测试（第${i + 1}行内容排版测试）`
      }));

      const html = generateTweetCardHtml({
        author: "Layout Tester",
        handle: "@layout_tester",
        translatedTitle: `测试清单 ${count} 项`,
        translatedSubtitle: "垂直节律压力测试",
        items
      }, { width: 1080, height: 1440 });

      await page.setContent(html, { waitUntil: "domcontentloaded" });

      const geom = await page.evaluate(() => {
        const body = document.body;
        const footer = document.querySelector(".meta-footer-wrap");
        const list = document.querySelector(".list-container");
        const footerRect = footer ? footer.getBoundingClientRect() : null;
        const listRect = list ? list.getBoundingClientRect() : null;

        return {
          bodyScrollHeight: body.scrollHeight,
          footerBottom: footerRect ? footerRect.bottom : null,
          listHeight: listRect ? listRect.height : null,
          isOverflowing: body.scrollHeight > 1440,
          isFooterClipped: footerRect ? footerRect.bottom > 1440 : false
        };
      });

      results[count] = geom;
    }

    // Assertions & Bug Confirmations:
    // 1 item: Fits within 1440px but leaves ~800px void
    assert.equal(results[1].isOverflowing, false);
    assert.ok(results[1].listHeight < 150, "1 item takes small vertical space");

    // 10 items: Fits neatly within 1440px
    assert.equal(results[10].isOverflowing, false);
    assert.equal(results[10].isFooterClipped, false);

    console.log("[CHALLENGE-1.1 HARDENED RESULT]", results[20]);
    assert.equal(results[20].isOverflowing, false, "HARDENED: 20 items must not cause scrollHeight > 1440px");
    assert.equal(results[20].isFooterClipped, false, "HARDENED: 20 items must not push engagement footer off-screen");
    assert.ok(results[20].footerBottom <= 1440, "HARDENED: Footer bottom must remain within 1440px viewport");
  } finally {
    await browser.close();
  }
});

test("CHALLENGE-1.2: Malformed Metadata - Unbroken Author Name Header Overflow Defended", async () => {
  const { chromium } = await import("playwright-core");
  const execPath = resolveBrowserExecutable();
  const browser = await chromium.launch(execPath ? { executablePath: execPath, headless: true } : { headless: true });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1440 } });

  try {
    const longName = "UnbrokenSuperLongDisplayNameWithoutAnySpacesOrPunctuation1234567890";
    const html = generateTweetCardHtml({
      author: longName,
      handle: "@test_handle",
      items: ["Item 1"]
    });

    await page.setContent(html, { waitUntil: "domcontentloaded" });

    const layout = await page.evaluate(() => {
      const followBtn = document.querySelector(".follow-btn");
      const authorName = document.querySelector(".author-name");
      const btnRect = followBtn.getBoundingClientRect();
      const nameRect = authorName.getBoundingClientRect();
      return {
        authorNameRight: nameRect.right,
        followBtnRight: btnRect.right,
        isFollowBtnClipped: btnRect.right > 1080
      };
    });

    // HARDENED VERIFICATION:
    // .author-name has max-width: 520px and text-overflow: ellipsis.
    // Unbroken name does not expand header-left past viewport and does not push follow button off screen.
    assert.equal(layout.isFollowBtnClipped, false, "HARDENED: Unbroken author name does not push Follow button past 1080px");
    assert.ok(layout.followBtnRight <= 1080, "Follow button right edge must be <= 1080px");
  } finally {
    await browser.close();
  }
});

test("CHALLENGE-1.3: Malformed Metadata - Raw HTML/CSS Injection Neutralized", async () => {
  const { chromium } = await import("playwright-core");
  const execPath = resolveBrowserExecutable();
  const browser = await chromium.launch(execPath ? { executablePath: execPath, headless: true } : { headless: true });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1440 } });

  try {
    const maliciousTweet = {
      author: "Attacker",
      handle: "@attacker",
      translatedTitle: "Harmless Title <style>body{display:none !important;}</style>",
      items: ["Item with raw script: <script>window._xss_executed = true;</script>"]
    };

    const html = generateTweetCardHtml(maliciousTweet);
    await page.setContent(html);

    const check = await page.evaluate(() => {
      return {
        bodyDisplay: window.getComputedStyle(document.body).display,
        hasRawScriptTag: !!document.querySelector("script")
      };
    });

    // HARDENED VERIFICATION:
    // Injected <style> and <script> are escaped via escapeHtml.
    // Body display is not 'none', and no raw <script> tag exists in the DOM.
    assert.notEqual(check.bodyDisplay, "none", "HARDENED: Injected CSS <style> is escaped so body is displayed");
    assert.equal(check.hasRawScriptTag, false, "HARDENED: Injected <script> is escaped and not executed");
  } finally {
    await browser.close();
  }
});

test("CHALLENGE-1.4: Non-Existent Directory Auto-Creation", async () => {
  const tmpDir = createTestDir("adv-dir-");
  const deepPath = path.join(tmpDir, "level1", "level2", "card.png");

  const res = await renderDarkTweetCard(REFERENCE_TWEET_10_HABITS, deepPath, { mock: true });
  assert.ok(fs.existsSync(deepPath), "Parent directories must be created recursively");
  assert.equal(res.mode, "mock");
});

test("CHALLENGE-1.5: Concurrency - 10 Parallel Mock Renders", async () => {
  const tmpDir = createTestDir("adv-par-mock-");
  const promises = Array.from({ length: 10 }, (_, i) => {
    const p = path.join(tmpDir, `card_${i}.png`);
    return renderDarkTweetCard(REFERENCE_TWEET_10_HABITS, p, { mock: true });
  });

  const results = await Promise.all(promises);
  assert.equal(results.length, 10);
  for (const r of results) {
    assert.ok(fs.existsSync(r.path));
  }
});

test("CHALLENGE-1.6: Concurrency - 4 Parallel Playwright Headless Browser Renders", async () => {
  const tmpDir = createTestDir("adv-par-pw-");
  const promises = Array.from({ length: 4 }, (_, i) => {
    const p = path.join(tmpDir, `card_pw_${i}.png`);
    return renderDarkTweetCard(REFERENCE_TWEET_10_HABITS, p, { mock: false });
  });

  const results = await Promise.all(promises);
  assert.equal(results.length, 4);
  for (const r of results) {
    assert.ok(fs.existsSync(r.path));
    assert.ok(fs.statSync(r.path).size > 1000, "Should be a real rendered PNG");
  }
});

// =============================================================================
// SUITE 2: INGESTION NETWORK ADVERSITY & ROBUSTNESS
// =============================================================================

test("CHALLENGE-2.1: Ingestion Network Adversity - Invalid URLs & Non-Twitter Domains", async () => {
  const sources = [
    "http://non_existent_domain_test_9999999.org/path",
    "https://github.com/torvalds/linux",
    "https://example.com/blog/article",
    "ftp://unsupported.domain/file"
  ];

  for (const src of sources) {
    const result = await fetchTweetSource(src, { timeoutMs: 300 });
    assert.ok(result);
    assert.equal(result.sourceTier, "tier3_fixture", "Must deterministically fallback to Tier 3");
    assert.ok(result.items.length > 0);
  }
});

test("CHALLENGE-2.2: Ingestion Network Adversity - Network Timeouts & Aborts", async () => {
  // Ultra-short timeout triggers AbortSignal immediately
  const result = await fetchTweetSource("https://x.com/someone/status/999999999999", {
    timeoutMs: 1
  });
  assert.ok(result);
  assert.equal(result.sourceTier, "tier3_fixture");
  assert.ok(result.items.length > 0);
});

test("CHALLENGE-2.3: Ingestion Type Adversity - Non-String url/query Handled Safely", async () => {
  // HARDENED VERIFICATION:
  // When sourceInput has non-string url (e.g. { url: 12345 }),
  // url is safely coerced to string without throwing TypeError: url?.includes is not a function.
  const result = await fetchTweetSource({ url: 12345 }, { offline: true });
  assert.ok(result, "Must return valid normalized tweet data");
  assert.equal(result.sourceTier, "tier3_fixture", "Must recover gracefully to tier3_fixture");
  assert.ok(result.items.length > 0);
});

test("CHALLENGE-2.4: Feasibility Screening - Null and Undefined Elements Handled Safely", () => {
  // HARDENED VERIFICATION:
  // In screenFeasibility:
  // Claims containing null, undefined, or empty items are filtered and evaluated safely without crashing.
  const result = screenFeasibility(["正常观点", null, undefined, "另一观点"]);
  assert.ok(Array.isArray(result), "Must return an array");
  assert.equal(result.length, 2, "Must process the 2 valid claims safely");
  assert.equal(result[0].claim, "正常观点");
  assert.equal(result[1].claim, "另一观点");
});

test("CHALLENGE-2.5: Title Normalization - Whitespace, Unicode, and Length Bounds", () => {
  // HARDENED VERIFICATION (Challenger 1 Finding D):
  // 1. Newlines and tabs collapsed
  const t1 = generateGroundedTitle("变富\n\n技巧");
  assert.ok(!t1.includes("\n"), "Must collapse newlines");
  assert.ok(t1.length >= 4 && t1.length <= 10);

  const t2 = generateGroundedTitle("变富\t\t技巧");
  assert.ok(!t2.includes("\t"), "Must collapse tabs");
  assert.ok(t2.length >= 4 && t2.length <= 10);

  // 2. Zero-width unicode stripped
  const t3 = generateGroundedTitle("\u200B\u200B\u200B\u200B");
  assert.ok(t3.length >= 4 && t3.length <= 10, "Must satisfy 4-10 chars even on invisible input");

  // 3. HTML tags stripped
  const t4 = generateGroundedTitle("<script>alert(1)</script>");
  assert.ok(!t4.includes("<script>"), "Must strip script tags");
  assert.ok(t4.length >= 4 && t4.length <= 10);

  // 4. Default title bounds protected
  const t5 = generateGroundedTitle("", { defaultTitle: "abc" });
  assert.ok(t5.length >= 4 && t5.length <= 10, "Default title must satisfy 4-10 chars");
});

test("CHALLENGE-2.6: Author Pinned Comment - Debunked vs Questionable Nuance", () => {
  // HARDENED VERIFICATION (Challenger 1 Finding B & C):
  // 1. 0 valid items, mixed debunked + questionable:
  const mixedComment = generateAuthorPinnedComment([
    { index: 1, claim: "就餐不固定", rating: "questionable", badge: "⚠️ 因果夸大" },
    { index: 2, claim: "喝特制神药月入十万", rating: "debunked", badge: "❌ 纯属营销噱头" }
  ]);
  assert.ok(mixedComment.includes("避坑") || mixedComment.includes("营销噱头"), "Must warn against debunked scam");
  assert.ok(!mixedComment.includes(">"), "Must not form positive recommendation ranking for debunked/questionable");

  // 2. Valid items mixed with debunked and questionable:
  const comment = generateAuthorPinnedComment([
    { index: 1, claim: "规律运动", rating: "valid", priorityWeight: 75 },
    { index: 2, claim: "冷水澡根治抑郁", rating: "debunked" },
    { index: 3, claim: "就餐不固定", rating: "questionable" }
  ]);
  assert.ok(comment.includes("优先级：①"), "Must prioritize valid item");
  assert.ok(comment.includes("②") && comment.includes("避坑"), "Must explicitly call out debunked item for avoidance");
  assert.ok(comment.includes("③") && (comment.includes("包装过头") || comment.includes("吓唬人")), "Must identify questionable hyperbole");

  // 3. Single empty object defense:
  const emptyObjComment = generateAuthorPinnedComment([{}]);
  assert.ok(!emptyObjComment.includes("undefined"), "Must not output [undefined]");
});
