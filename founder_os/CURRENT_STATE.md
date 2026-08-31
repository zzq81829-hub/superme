# Current State — V1

## Primary objective
First prove one complete content production loop before expanding into a general AI-company platform.

## Phase 0 — infrastructure bootstrap
Build a local control plane that can create tasks and route them to Antigravity or Codex without requiring manual prompt copying.

Acceptance:
- local dashboard starts,
- task can be created,
- task can be assigned to an agent,
- execution adapter can be tested in dry-run mode,
- project state is preserved.

### V1 control-plane status — 2026-08-31
- Dashboard, JSON task persistence, deterministic routing, automatic execution, bounded fallback, result polling and report logs are implemented.
- The local runtime is intentionally in real execution mode (`dryRun=false`) at `127.0.0.1:3210`; the generated default remains `dryRun=true`.
- The true V1 orchestrator is the local Router. Hermes is reused as a selectable DeepSeek-backed worker, not yet the dispatcher for every task.
- Read-only cached probes verify Codex ChatGPT login, Grok grok.com login and Hermes DeepSeek provider state. Claude is `ON_DEMAND` while the founder-approved local Antigravity reverse proxy on port 8045 is stopped. Antigravity remains `INSTALLED` because no reliable provider-aware, zero-token probe exists.
- Codex, Antigravity, Grok Build, Grok and Hermes/DeepSeek all have real successful execution evidence. Grok and Grok Build are modes of the same `grok.exe`; Grok Bot is honestly deferred.
- Machine-verifiable acceptance supports exact/contained file content, file existence and allowlisted commands. Checks are restricted to the project directory, and failed checks feed evidence into at most one configured repair attempt.
- Real strict E2E task `1788162612513-cb3353` passed Dashboard -> Codex -> exact artifact -> `npm test` -> persisted verification history in 123,797 ms.
- Main tests pass 39/39. Shuzhai 4/4, Classify King 9/9 and OPC Matrix 11/11 regression suites pass; video-matrix Python compilation also passes.
- The complete audit and phased rollback plan is `docs/CODEX_TAKEOVER_PLAN.md`.

### V1 safety decisions
- The `dryRun` safety switch remains available; the current local runtime is intentionally set to `dryRun=false` for real execution validation.
- Claude resolves to its native executable so task prompts do not pass through `cmd.exe`; verifier commands are allowlisted and reject shell metacharacters.
- Codex is limited to the task workspace. Founder OS no longer edits global Antigravity permissions or silently escalates after a denial.
- Antigravity now uses `permissionMode=configured`. If its headless permission rules are insufficient, the task falls back to another Worker instead of enabling all-tools auto-approval.
- Claude's localhost Antigravity reverse proxy is a founder-approved exception. When it is down, Claude is skipped without waiting for login.
- Command output is bounded in memory and every run has a deadline.

## Phase 1 — Shuzhai content loop
Target loop:
book -> analysis -> topic selection -> Xiaohongshu content -> image generation/layout -> scheduled publishing -> traffic data.

Acceptance:
- stable automated output,
- publishable visual quality,
- real traffic validation.

## Phase 2 — Trend Radar
Detect high-performing themes from X/Twitter, Xiaohongshu and other sources; feed validated themes into original content production.

## Phase 3 — MY_BRAIN / IP Layer
Store founder judgments and inject them into generated content so the account builds recognizable personal IP rather than pure aggregation traffic.

## Phase 4 — multi-agent routing
Use Codex, Antigravity, Grok and future agents according to their strengths and available quota.

## Do not do yet
- Build a huge generic orchestration platform before Phase 1 works.
- Add many agents simply because they exist.
- Spend founder time learning infrastructure that agents can build and maintain.
