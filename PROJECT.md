# Project: Dual-Pipeline Content Engine & Humanized Copywriting System

## Architecture
This project establishes a strictly isolated, automated dual-pipeline content engine and humanized copywriting system for AI Founder OS.

### Accounts & Pipeline Topology
- **good try (`xhs_account_1`)**: Dedicated to `shuzhai` pipeline. Produces 6-page illustrated book cards complying with `card-layout-standard` (top banner bridge 36~52px, breathing gaps 26~32px, title spacing 88~96px, 70% translucent frosted paper micro-cards, anchor takeaway card >=118px). Strictly rejects any X curation content.
- **Gold chance (`xhs_account_2`)**: Dedicated to `x_curation` pipeline. Ingests overseas X tweets, generates faithful dark-mode translated visual cards, performs item-by-item feasibility screening with standardized status badges (`✅ 基本靠谱 / 科学依据充分`, `⚠️ 因果夸大 / 偷换概念 / 包装过头`, `❌ 纯属营销噱头 / 伪科学`) and 1–2 sentence sharp critiques, generates author pinned comment rankings (`优先级：⑥ > ② > ⑦`), 4–10 char grounded concise titles, and 4–6 high-volume niche Xiaohongshu tags. Strictly rejects Shuzhai book cards.
- **枳子8 (`xhs_account_3`)**: Dedicated to `personal_ip` pipeline.

### Data Flow & Isolation Architecture
1. **Packaging Gate (`src/content/store.js`)**:
   - `createPackage(input)` and `freezePackage(id)` enforce `validateAccountPipelineIsolation(pkg)`:
     - If `pkg.accountId === "shuzhai"` or `"xhs_account_1"`, verifies package contains Shuzhai book card assets/metadata and immediately throws an error if X tweet assets, tweet translation cards, or feasibility badges are detected.
     - If `pkg.accountId === "x_curation"` or `"xhs_account_2"`, verifies package contains X curation visual and feasibility ratings, and immediately throws an error if Shuzhai book reading card layouts are detected.
2. **Publishing Gate (`src/publish/xhs.js` & `scripts/direct_xhs_publish.js`)**:
   - Re-verifies pipeline routing constraints before image staging and profile launch.
   - Strictly associates profile directory (`data/profiles/xhs_account_1` vs `data/profiles/xhs_account_2`) and writes database/ledger records in SQLite (`engine/intelligence/xhs/storage/schema.js`) matching `data/accounts.json`.
3. **Gold chance Engine (`src/autonomous_content/goldChance.js`)**:
   - Ingestion: `agent-reach` with fallback to tweet URLs, Jina Reader, and local feed fixtures.
   - Translation & Card: Visual generator rendering authentic X tweet dark-mode card (`#000000`, verified badge, translation header, metrics).
   - Feasibility Screening: Item-by-item reality check using exact badges and concise critiques.
   - Pinned Comment: Generates author priority ranking string and dismissal of gimmicks.
   - Grounded Title: Generates natural 4–10 character title without clickbait punctuation.
4. **Anti-AI Tone Engine & Tagging (`src/autonomous_content/humanizedCopy.js`)**:
   - Anti-AI Filter: Strictly lints and eliminates banned clichés (“在这个快节奏的时代”, “总有一款适合你”, “建议收藏反复阅读”, “底层逻辑”, “赋能”, “闭环”, “维度”, “颠覆认知”), limits paragraphs to <= 3 lines, enforces candid first-person voice.
   - Tag Recommender: Curates 4–6 domain-matched, high-search-volume Xiaohongshu tags cleanly appended at bottom.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Account & Pipeline Binding Validation | Strict zero-bleed validation in `createPackage`, `freezePackage`, and `publishApprovedPackage`. Rejects cross-pipeline packages. | M1 | ORIGINAL_REQUEST:224-230 |
| 2 | Account Ledger Consistency | Staging, SQLite database (`xhs_notes`, `xhs_accounts`), and outbox entries record `account_id` and `profileDir` matching `data/accounts.json`. | M1 | ORIGINAL_REQUEST:264-265 |
| 3 | Multi-Tier X Ingestion | Automated X tweet ingestion via `agent-reach` with fallback to direct URLs and structured feeds. | M2 | ORIGINAL_REQUEST:232-234 |
| 4 | Dark-Mode X Translated Visual Card | Generates faithful, clean Chinese translated screenshot/card preserving X minimalist, high-density aesthetic matching `media_1788545202334.jpg`. | M2 | ORIGINAL_REQUEST:234-236, Survey Spec |
| 5 | Item-by-Item Feasibility Screening | Reality check per claim with badges (`✅ 基本靠谱 / 科学依据充分`, `⚠️ 因果夸大 / 偷换概念 / 包装过头`, `❌ 纯属营销噱头 / 伪科学`) and 1–2 sentence sharp critiques. | M2 | ORIGINAL_REQUEST:236-240 |
| 6 | Author Pinned Comment Engine | Generates authentic author pinned comment prioritizing claims (`⑥ > ② > ⑦ > ⑩ > ⑤`) and dismissing exaggerated/fear-mongering items. | M2 | ORIGINAL_REQUEST:240-242 |
| 7 | Grounded Concise Title Generator | Generates natural, grounded titles between 4–10 Chinese characters without clickbait punctuation or sensationalist phrasing. | M2 | ORIGINAL_REQUEST:242-244 |
| 8 | Anti-AI Tone Filter | Eliminates 15+ robotic clichés (“在这个快节奏的时代”, “底层逻辑”, “赋能”, “闭环”, “维度”, etc.), enforces candid persona, keeps paragraphs under 3 lines. | M3 | ORIGINAL_REQUEST:245-251 |
| 9 | Dual-Criteria High-Traffic Tag Recommender | Selects 4–6 curated tags matching domain and verified high-impression/high-search-volume on Xiaohongshu, purged of AI buzzwords. | M3 | ORIGINAL_REQUEST:252-255 |
| 10 | Shuzhai Pipeline & card-layout-standard Preservation | Preserves `card-layout-standard` specs (art banner bridge 36~52px, title spacing 88~96px, breathing gaps 26~32px, 70% frosted micro-cards, anchor takeaway card >=118px) for `good try`. | M4 | ORIGINAL_REQUEST:256-258 |
| 11 | Full Test Suite Zero Regression | Preserves 100% pass rate across all 511+ existing tests (`npm test`). | M5 | ORIGINAL_REQUEST:258, 279 |
| 12 | End-to-End Sample Run & Audit Verification | End-to-end sample run generating valid Gold chance package matching `media_1788545202334.jpg` and `media_1788545206960.jpg` with forensic audit passing clean. | M5 | ORIGINAL_REQUEST:267-273 |

*Cross-check*: All 12 features from the survey and requirements inventory are assigned to Milestones M1–M5. None are unassigned.

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Strict Account & Pipeline Isolation | Features 1, 2: Account isolation validation in store/publisher, error throwing on bleed, database ledger consistency. | none | PLANNED |
| M2 | Gold chance Curation, Translation & Feasibility Engine | Features 3, 4, 5, 6, 7: Ingestion fallback, visual dark card generator, 3-tier feasibility badges, author pinned comment ranking, 4–10 char grounded title. | M1 | PLANNED |
| M3 | Anti-AI Tone Engine & High-Traffic Tagging | Features 8, 9: Anti-AI tone linter & humanized rewriter, 4–6 high-impression Xiaohongshu tag recommendation engine. | M1 | PLANNED |
| M4 | Shuzhai Pipeline Preservation & Card Layout Standard | Feature 10: Preserving good try shuzhai generation, card-layout-standard compliance, and layout schema validations. | M1 | PLANNED |
| M5 | E2E Dual-Track Verification & Acceptance | Features 11, 12: Run complete opaque-box E2E test suite (Tiers 1–4) + Tier 5 adversarial hardening, verifying zero regressions (511+ tests passing) and sample package matching reference media. | M1, M2, M3, M4 | PLANNED |

---

## Interface Contracts

### 1. Store ↔ Account Isolation (`src/content/store.js`)
```javascript
export function validateAccountPipelineIsolation(pkg, targetAccount) {
  // Throws PipelineRoutingError if:
  // - targetAccount === "shuzhai" / "xhs_account_1" but package contains X curation assets, feasibility badges, or tweet visuals.
  // - targetAccount === "x_curation" / "xhs_account_2" but package contains Shuzhai book reading card layouts or lacks X translation/feasibility assets.
}
```

### 2. Gold Chance Engine (`src/autonomous_content/goldChance.js`)
```javascript
export function buildGoldChancePackage(tweetInput, options) {
  // Returns:
  // {
  //   id: string,
  //   project: "x_curation",
  //   accountId: "xhs_account_2",
  //   title: string, // strictly 4–10 chars, no clickbait punctuation
  //   body: string, // circled numbers, exact badges, 1-2 sentence critiques, under 3 lines/para
  //   authorPinnedComment: string, // ranking string: ⑥ > ② > ⑦ ... dismissal of gimmicks
  //   tags: string[], // 4-6 high volume tags
  //   visualCard: { path: string, width: 1080, height: 1440, theme: "dark" },
  //   feasibilityRatings: [{ index: 1, claim: string, badge: string, critique: string }]
  // }
}
```

### 3. Copywriting Engine ↔ Anti-AI Filter (`src/autonomous_content/humanizedCopy.js`)
```javascript
export function lintAntiAITone(text) {
  // Returns: { ok: boolean, violations: string[], cleanedText: string }
  // Checks banned keywords: ["快节奏的时代", "总有一款适合你", "建议收藏", "底层逻辑", "赋能", "闭环", "维度", "颠覆认知", ...]
  // Enforces paragraph lines <= 3
}

export function recommendXiaohongshuTags(topic, domain) {
  // Returns 4–6 curated tags meeting dual criteria (domain matched + verified high volume)
}
```

### 4. Publisher ↔ Account Routing (`src/publish/xhs.js`)
```javascript
export function resolvePublisherAccount(pkg) {
  // Returns matching account from data/accounts.json:
  // - id: "shuzhai" | "x_curation" | "personal_ip"
  // - profileDir: "xhs_account_1" | "xhs_account_2" | "xhs_account_3"
  // Re-validates isolation constraints before staging images or dispatching.
}
```

---

## Code Layout
- `src/content/store.js`: Package store, freezing, approval, isolation gate.
- `src/content/xiaohongshuLayout.js`: Shuzhai card layout specifications and plan generator.
- `src/publish/xhs.js`: Publisher pre-checks, account resolution, image staging.
- `src/autonomous_content/goldChance.js`: Core Gold chance pipeline (ingestion, feasibility rating, pinned comment, title).
- `src/autonomous_content/visualCardRenderer.js`: Dark-mode X translated tweet card generator.
- `src/autonomous_content/humanizedCopy.js`: Anti-AI tone linter and Xiaohongshu tag recommender.
- `src/autonomous_content/circadianScheduler.js`: Scrubbed tags, circadian release scheduling.
- `test/accountIsolation.test.js`: Opaque-box isolation test suite.
- `test/goldChancePipeline.test.js`: Gold chance end-to-end pipeline test suite.
- `test/antiAiTone.test.js`: Tone linting and tag recommendation test suite.
- `test/e2eDualPipeline.test.js`: Comprehensive dual-track integration test suite.
