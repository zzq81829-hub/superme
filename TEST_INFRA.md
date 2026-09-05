# E2E Test Infra: Dual-Pipeline Content Engine & Humanized Copywriting System

## Test Philosophy
- Opaque-box, requirement-driven: derived strictly from `ORIGINAL_REQUEST.md` (header `## 2026-09-04T18:14:38Z`), user benchmark media (`media_1788545202334.jpg`, `media_1788545206960.jpg`), and `data/accounts.json`.
- Zero coupling to implementation internals; verifies pure observable inputs, outputs, errors, file payloads, and database records.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial Testing + Real-World Workload Testing.

## Feature Inventory & Test Coverage Goals
| # | Feature | Source | Tier 1 (Feature) | Tier 2 (Boundary) | Tier 3 (Pairwise) |
|---|---------|--------|:----------------:|:-----------------:|:-----------------:|
| 1 | Account & Pipeline Binding Validation | R1:224-230 | 5 | 5 | ✓ |
| 2 | Account Ledger & Storage Consistency | R1:264-265 | 5 | 5 | ✓ |
| 3 | Multi-Tier Ingestion & Fallbacks | R2:232-234 | 5 | 5 | ✓ |
| 4 | Dark-Mode X Visual Card Translation | R2:234-236 | 5 | 5 | ✓ |
| 5 | Feasibility Screening & Badges | R2:236-240 | 5 | 5 | ✓ |
| 6 | Author Pinned Comment Engine | R2:240-242 | 5 | 5 | ✓ |
| 7 | Grounded Concise Title (4–10 chars) | R2:242-244 | 5 | 5 | ✓ |
| 8 | Anti-AI Tone Filter (Cliché Removal) | R3:245-251 | 5 | 5 | ✓ |
| 9 | High-Traffic Tag Recommender (4–6 tags) | R4:252-255 | 5 | 5 | ✓ |
| 10 | Shuzhai Pipeline Preservation | R5:256-258 | 5 | 5 | ✓ |
| 11 | Zero Regression Across Existing Suites | AC:279 | 5 | 5 | ✓ |
| 12 | End-to-End Benchmark Sample Validation | AC:267-273 | 5 | 5 | ✓ |

## Test Architecture
- **Runner**: Node.js built-in test runner with isolation hook:
  `node --import ./test-support/isolate-data.js --test ./test/*.js`
- **Pass/Fail Semantics**: 100% tests must pass (exit code 0). 0 failures, 0 regressions against baseline (511 passing tests).
- **Directory Layout**:
  - `test/accountIsolation.test.js`: Focuses on strict account routing, cross-bleed rejection, error throwing, and ledger recording.
  - `test/goldChancePipeline.test.js`: Focuses on X ingestion, translation cards, 3-badge feasibility screening, author pinned comments, and 4–10 char titles.
  - `test/antiAiTone.test.js`: Focuses on tone linter (zero banned clichés), paragraph length checks, and 4–6 tag recommendation.
  - `test/shuzhaiPreservation.test.js`: Focuses on book card pipeline preservation and card layout standard parameters.
  - `test/e2eDualPipeline.test.js`: Focuses on end-to-end multi-account pipeline execution and benchmark sample matching.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Target Account |
|---|----------|--------------------|----------------|
| 1 | Reference Image Scenario: 10 Habits of Poverty (Korean tweet translation, feasibility check, author pinned comment, 6-char title `变富的小技巧`) | F3, F4, F5, F6, F7, F8, F9, F12 | `xhs_account_2` |
| 2 | Naval Ravikant Leverage & Judgment Tweet (English tweet translation, feasibility check, 7-char title, author pinned ranking) | F3, F4, F5, F6, F7, F8, F9 | `xhs_account_2` |
| 3 | Shuzhai Kahneman Loss Aversion 6-Page Illustrated Book Card Note | F1, F10, F11 | `xhs_account_1` |
| 4 | Adversarial Cross-Bleed Attack: Attempting to submit X curation note to `xhs_account_1` and Shuzhai book cards to `xhs_account_2` | F1, F2 | `xhs_account_1`, `xhs_account_2` |
| 5 | Anti-AI Cliché Attack: Submitting high-density AI/PPT buzzword content (“在这个快节奏的时代底层逻辑赋能闭环”) | F8, F9 | `xhs_account_2` |
| 6 | Full Dual-Track Publishing Workflow: Staging, approval, and mock delivery outbox routing | F1, F2, F10, F12 | Both Accounts |

## Coverage Thresholds
- Tier 1: >= 60 test assertions across all 12 features.
- Tier 2: >= 60 boundary and edge-case assertions (min/max title length, single claim, 100% debunked, banned words in tags, empty media, traversal).
- Tier 3: >= 12 cross-feature combinatorial assertions.
- Tier 4: >= 6 realistic application-level scenarios.
