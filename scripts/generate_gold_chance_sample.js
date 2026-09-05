/**
 * Benchmark Artifact Generator: Gold chance Sample Run
 *
 * Implements Milestone 6: E2E Dual-Track Verification & Sample Run Validation.
 * Generates valid benchmark artifacts in assets/gold_chance_sample/ and data/content/packages/:
 * 1. Visual dark-mode translated tweet card PNG (1080x1440) matching media_1788545202334.jpg and ref_card_layout.jpg.
 * 2. Feasibility screening body with circled numbers, 3-tier badges, and 1-2 sentence critiques matching ref_copy_feasibility.jpg.
 * 3. Author pinned comment with priority ranking and gimmick dismissal.
 * 4. Grounded concise title ("变富的小技巧", strictly 4-10 chars, 0 clickbait punctuation).
 * 5. 4-6 curated Xiaohongshu tags (#怎样变得富有 #搞钱思维 #财富思维 #变美变富变强).
 * 6. Package stored and frozen via src/content/store.js strictly bound to xhs_account_2 with 0 cross-bleed.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  REFERENCE_TWEET_10_HABITS,
  buildGoldChancePackage,
  renderDarkTweetCard
} from "../src/autonomous_content/goldChance.js";
import {
  createPackage,
  freezePackage,
  getPackage,
  validateAccountPipelineIsolation
} from "../src/content/store.js";
import { lintAntiAITone } from "../src/autonomous_content/humanizedCopy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

export async function generateGoldChanceSample(options = {}) {
  const assetsSampleDir = options.sampleDir || path.join(rootDir, "assets", "gold_chance_sample");
  const mediaDir = options.mediaDir || path.join(rootDir, "data", "content", "media", "x_curation");
  const packagesDir = options.packagesDir || path.join(rootDir, "data", "content", "packages");

  fs.mkdirSync(assetsSampleDir, { recursive: true });
  fs.mkdirSync(mediaDir, { recursive: true });
  fs.mkdirSync(packagesDir, { recursive: true });

  console.log("=== Generating Gold Chance Benchmark Artifacts ===");

  // 1. Render 1080x1440 dark-mode visual card matching reference layout
  const visualCardPngPath = path.join(assetsSampleDir, "tweet_card_1080x1440.png");
  console.log(`Rendering dark-mode translated tweet card to: ${visualCardPngPath}`);
  
  const cardResult = await renderDarkTweetCard(REFERENCE_TWEET_10_HABITS, visualCardPngPath, {
    width: 1080,
    height: 1440,
    theme: "dark"
  });

  // Also copy to internal media repository for content pipeline
  const internalMediaPath = path.join(mediaDir, "gold_chance_10habits_card.png");
  fs.copyFileSync(visualCardPngPath, internalMediaPath);

  // 2. Build Gold chance content package
  const pkgId = options.packageId || "gold-chance-sample-10habits";
  const pkgPayload = buildGoldChancePackage(REFERENCE_TWEET_10_HABITS, {
    packageId: pkgId,
    visualCardPath: internalMediaPath,
    title: "变富的小技巧",
    tags: ["#怎样变得富有", "#搞钱思维", "#财富思维", "#变美变富变强"]
  });

  // Verify anti-AI tone compliance
  const toneCheck = lintAntiAITone(pkgPayload.body);
  if (!toneCheck.ok) {
    console.warn("Tone warnings:", toneCheck.violations);
  }

  // 3. Store and freeze package strictly bound to xhs_account_2
  console.log(`Storing content package ${pkgId} via src/content/store.js...`);
  
  // Ensure media array references real file
  pkgPayload.media = [
    {
      kind: "image",
      path: internalMediaPath,
      theme: "dark",
      source: "x_tweet"
    }
  ];

  const storeOptions = { baseDir: packagesDir };
  
  // If package already exists, update or create fresh
  let pkg;
  try {
    const existing = getPackage(pkgId, storeOptions);
    if (existing) {
      fs.unlinkSync(path.join(packagesDir, `${pkgId}.json`));
    }
  } catch {}

  pkg = createPackage(pkgPayload, storeOptions);

  // Verify account isolation before freeze
  validateAccountPipelineIsolation(pkg, "xhs_account_2");

  // Freeze package
  console.log(`Freezing package ${pkgId}...`);
  const frozenPkg = freezePackage(pkgId, storeOptions);

  // 4. Save metadata and copywriting summary in assets/gold_chance_sample/
  const metadataPath = path.join(assetsSampleDir, "sample_package.json");
  fs.writeFileSync(metadataPath, JSON.stringify(frozenPkg, null, 2), "utf8");

  const copyPath = path.join(assetsSampleDir, "copywriting.md");
  const copyContent = `# Gold Chance 标杆样本：${frozenPkg.title}

- **账号绑定**: ${frozenPkg.accountId} (Gold chance / x_curation 专属，严格隔离)
- **发布平台**: ${frozenPkg.platform}
- **状态**: ${frozenPkg.status} (${frozenPkg.approvalStatus})
- **视觉卡片**: 1080x1440 PNG (dark-mode Lights Out 极简黑底)

## 标题
${frozenPkg.title}

## 正文（客观事实核查与求真纠偏）
${frozenPkg.body}

## 作者置顶评论（优先级排序与营销噱头剥离）
${frozenPkg.authorPinnedComment}

## 标签群
${frozenPkg.tags.join(" ")}

## 事实核查明细
${frozenPkg.feasibilityRatings.map(r => `- ${r.circledIndex} **${r.claim}** [${r.badge}]: ${r.critique}`).join("\n")}
`;
  fs.writeFileSync(copyPath, copyContent, "utf8");

  console.log("=== Benchmark Sample Generation Complete ===");
  console.log(`Artifact 1 (Visual Card): ${visualCardPngPath}`);
  console.log(`Artifact 2 (Copywriting): ${copyPath}`);
  console.log(`Artifact 3 (Frozen Package): ${path.join(packagesDir, `${pkgId}.json`)}`);

  return {
    packageId: pkgId,
    visualCardPath: visualCardPngPath,
    copywritingPath: copyPath,
    packagePath: path.join(packagesDir, `${pkgId}.json`),
    package: frozenPkg
  };
}

// Execute directly if run via CLI
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  generateGoldChanceSample()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Error generating sample:", err);
      process.exit(1);
    });
}
