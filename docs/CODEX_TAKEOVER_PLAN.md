# CODEX TAKEOVER PLAN

Audit date: 2026-08-31 (Asia/Shanghai)

Classification vocabulary: `DONE`, `PARTIALLY DONE`, `BROKEN`, `NOT IMPLEMENTED`, `UNKNOWN`.

## 1. Current State

Overall classification: `PARTIALLY DONE`.

The repository is a clean Git repository on `master`. The local dashboard is running at `127.0.0.1:3210`, loads without browser console errors, persists tasks and reports, and can invoke several real command-line workers. The current system is a useful V1 control plane, but it is not yet the target “Hermes as CEO” architecture and its health, verification, safety, and worker-identity claims are stronger than the implementation.

Current real flow:

```text
Dashboard
   |
Express server + JSON task store
   |
Local keyword router (actual orchestrator)
   |
Cost Guard using configured policy + shallow worker health
   |
Adapter -> Codex / Claude / Antigravity / Grok / Hermes-DeepSeek
   |
Generic verifier (non-empty output + npm test when package.json exists)
   |
Task/report JSON -> dashboard polling
```

Hermes is displayed as CEO, but currently it is one selectable worker. `getWorkers()` and `getStatus()` expose bridge metadata; they do not make Hermes the dispatcher. Streaming and cancellation are not implemented.

## 2. What Grok Build Completed

- `DONE`: Git baseline and phased commit history were created.
- `DONE`: Worker adapters exist for Codex, Claude, Antigravity, Grok Build/Grok, and Hermes/DeepSeek.
- `DONE`: Task persistence, execution reports, timeout handling, retry/fallback plumbing, dashboard worker list, and basic Cost Guard exist.
- `DONE`: Codex, Antigravity, Grok Build, Grok, and Hermes/DeepSeek have real successful execution artifacts.
- `DONE`: Grok Bot is honestly marked experimental with unknown control interface.
- `DONE`: Claude local reverse-proxy availability is checked before execution and can fall back when the proxy is down.
- `PARTIALLY DONE`: Multi-hop fallback works in demonstrated cases, but availability is not reliably preflighted.
- `PARTIALLY DONE`: Documentation exists for architecture, billing, operations, migration, workers, and troubleshooting, but several claims conflict with current code or user-approved policy.
- `PARTIALLY DONE`: Local-tool inventory exists, but not all founder projects are registered.

What should be retained: the small Express/JSON control plane, adapter boundary, process timeout/logging, honest Grok Bot deferral, existing real proof fixtures, and incremental Git history. A rewrite would add risk without solving the current gaps.

## 3. What Is Actually Working

- `DONE`: Node.js v24.18.1, npm 11.16.0, and Git 2.55.0 are available.
- `DONE`: Main unit suite passes 28/28.
- `DONE`: Dashboard loads, shows tasks/workers, and exposes no browser warnings/errors in the tested session.
- `DONE`: Codex CLI 0.151.0-alpha.7.2 is logged in with ChatGPT; a real end-to-end proof completed and was verified.
- `DONE`: Antigravity CLI 1.1.22 completed a real proof using `claude-sonnet-4-6`.
- `DONE`: Grok CLI 1.0.13 is logged in with grok.com and completed real build/research prompts.
- `DONE`: Hermes 0.20.5 invoked DeepSeek explicitly and completed real prompts.
- `DONE`: Claude Code 2.1.251 is configured for the founder-approved localhost Antigravity reverse proxy. When port 8045 is down, it returns `PROXY_DOWN` and routing can continue with another worker.
- `DONE`: Shuzhai XHS tests pass 4/4; Classify King tests pass 9/9; Xingxuan CLI help works; Shuzhai server/Electron syntax checks pass.

## 4. What Is Broken

- `BROKEN`: `C:\Users\22145\Desktop\github\server\script_engine.py` has an invalid f-string at line 336.
- `BROKEN`: OPC Matrix Remotion discovery test fails because `node_modules/remotion` is a stale junction targeting the old `Desktop\合并\opc矩阵` location. Result: 10/11 tests pass.
- `BROKEN`: Antigravity real runs always add `--dangerously-skip-permissions`; the UI/docs do not disclose this sufficiently.
- `BROKEN`: Generic verification can pass a wrong implementation when the worker returns text and the repository's broad `npm test` passes.
- `PARTIALLY DONE`: Earlier failed tasks remain visible without compact error summaries or clear separation from current worker health.
- `PARTIALLY DONE`: `config.json` is in real execution mode while examples describe dry-run as the safe default.

## 5. Architecture Problems

- `PARTIALLY DONE`: Hermes is a worker, not the CEO/orchestrator promised by the UI.
- `PARTIALLY DONE`: Keyword routing does not reason from acceptance criteria, cost, capability, live availability, or project policy.
- `PARTIALLY DONE`: Repair is one generic retry rather than an evidence-driven Task -> Result -> Verify -> Repair -> Retest loop.
- `NOT IMPLEMENTED`: Task-specific verification contracts and artifact assertions.
- `NOT IMPLEMENTED`: Streaming worker output and cancellation.
- `PARTIALLY DONE`: Grok Build and Grok are two modes of the same `grok.exe`, not independently authenticated backends.
- `PARTIALLY DONE`: Health checks mostly prove executable presence, not login, quota, model, provider, or proxy readiness.
- `PARTIALLY DONE`: JSON storage is appropriate for V1 but has no pagination/compaction policy.
- `UNKNOWN`: No supported remote control interface for Grok Bot has been established.

## 6. Billing / Subscription Problems

- `DONE`: Codex uses the logged-in ChatGPT session rather than an OpenAI API key.
- `DONE`: Grok uses the logged-in grok.com session rather than an xAI API key.
- `DONE`: DeepSeek is invoked through Hermes with provider `deepseek`, which is the only directly billed API allowed by current founder policy.
- `DONE`: Claude's localhost Antigravity reverse proxy is explicitly approved by the founder. It is not a billing-policy violation. Claude is an on-demand worker: start its terminal/proxy when needed; otherwise mark it unavailable and continue.
- `PARTIALLY DONE`: Cost Guard blocks explicitly configured forbidden providers, but it does not inspect all effective provider state or prove which upstream a reverse proxy uses.
- `PARTIALLY DONE`: Hermes has other provider credentials in its private configuration. The current bridge forces DeepSeek, but policy enforcement should validate the selected provider at execution time and never log secrets.
- `BROKEN`: Some billing/setup documents still describe Claude as subscription-only or the proxy as forbidden, contradicting the founder-approved exception.

## 7. Security Problems

- `BROKEN`: Antigravity auto-approves every tool through `--dangerously-skip-permissions` and writes global permission settings under the user's profile.
- `PARTIALLY DONE`: Windows `.cmd`/`.bat` workers require a shell path; prompt redaction helps, but documentation overstates universal `shell: false` execution.
- `PARTIALLY DONE`: The service binds to localhost, but it has no authentication. That is acceptable only while it remains strictly local.
- `PARTIALLY DONE`: Logs redact task prompts in displayed arguments, but result text may still contain project-sensitive material; retention/compaction is undefined.
- `PARTIALLY DONE`: Project paths are checked by workers but there is no central allowlist protecting unrelated directories.
- `UNKNOWN`: The operational security boundary of the local Antigravity reverse proxy is external to this repository. The system will only test localhost availability and avoid exposing its credentials.

## 8. Missing Integrations

- `NOT IMPLEMENTED`: A true Hermes planning/delegation contract for complex tasks.
- `NOT IMPLEMENTED`: Strong authenticated health probes for every worker.
- `NOT IMPLEMENTED`: Distinct Grok research versus Grok Build capability contracts; currently both call the same executable.
- `NOT IMPLEMENTED`: Grok Bot control surface; intentionally deferred until a documented interface exists.
- `PARTIALLY DONE`: Local tools omit OPC Matrix, `me`, and the video-matrix repository under `Desktop\github`.
- `NOT IMPLEMENTED`: Structured acceptance criteria supplied at task creation and consumed by the verifier.
- `NOT IMPLEMENTED`: Per-worker concurrency, quota cooldown, and durable circuit-breaker state.

## 9. Regression Risks

- Changing Antigravity permissions can make headless execution fail until granular allow rules are correct.
- Replacing the router wholesale could break demonstrated fallbacks; changes must preserve adapter contracts.
- Stronger health probes must not spend paid tokens or create remote work merely to display a badge.
- Hermes promotion must not duplicate Hermes runtime or create a second task database.
- Repairing OPC dependencies may alter `node_modules`; the lockfile must remain the source of truth and application files must not be rewritten.
- `C:\Users\22145\Desktop\me` is a dirty user worktree and must not be modified as part of unrelated regression work.
- Historical Git data starts with the imported baseline, so pre-existing legacy failures cannot be attributed to Grok Build with certainty.

## 10. Recommended Fix Order

### Phase 1 — Truth and Safety Baseline

**GOAL:** Make runtime claims accurate and remove implicit unsafe behavior without losing the proven worker flows.

**FILES:** `src/workers/health.js`, `src/adapters/antigravity.js`, `src/config.js`, `config.example.json`, `config/local-tools.json`, `public/app.js`, relevant tests and docs.

**IMPLEMENTATION:** Separate installed/logged-in/ready states; label Claude proxy-down as on-demand; expose Antigravity permission mode; make dangerous bypass explicit and opt-in; stop silently rewriting global permissions; align dry-run/runtime documentation; register missing local projects; preserve the user-approved Claude proxy exception.

**TEST:** Unit tests, CLI read-only status probes, dashboard browser smoke test, dry-run dispatch for all workers, one controlled Antigravity proof only after permission policy is explicit.

**ACCEPTANCE:** Dashboard no longer reports binary presence as full readiness; no dangerous Antigravity flag appears unless explicitly configured; Claude proxy-down does not block task creation; 28+ tests pass.

**ROLLBACK:** Revert the phase commit; restore the previous adapter flags and static health response while keeping audit documentation.

### Phase 2 — Verifiable Task Contract

**GOAL:** Turn “worker returned text” into evidence-based completion.

**FILES:** `server.js`, `src/store.js`, `src/router.js`, `src/verifier/verifyTask.js`, adapters' result schema, `public/app.js`, tests.

**IMPLEMENTATION:** Add optional acceptance criteria and check types (command, file-exists, exact-content, no-change, test); persist attempts and verification evidence; pass verifier failures into bounded repair prompts; retest before PASS; preserve legacy tasks.

**TEST:** Unit tests for false-positive prevention, failure/repair/pass, timeout, malformed criteria, and legacy task migration; controlled E2E proof with an initially wrong artifact.

**ACCEPTANCE:** A task cannot reach completed unless every declared acceptance check passes; failed checks are visible; repair is bounded and auditable.

**ROLLBACK:** Keep the new fields but disable strict verification behind configuration; fall back to current non-empty/npm-test behavior.

### Phase 3 — Router, Health, and Cost Guard

**GOAL:** Route by task type, live readiness, policy, and cost without paid health checks.

**FILES:** `src/router.js`, `src/workers/health.js`, `src/workers/costGuard.js`, `src/billing/policy.js`, `src/hermes/bridge.js`, configs and tests.

**IMPLEMENTATION:** Add cached non-mutating auth/status probes; distinguish offline/auth-required/quota/cooldown/proxy-down; validate effective provider before execution; use deterministic capability policy for simple work and Hermes planning only for complex work; preserve adapter fallbacks.

**TEST:** Fake CLI fixtures for each health state, policy-denial tests, quota cooldown tests, router matrices, and real read-only status commands.

**ACCEPTANCE:** Forbidden direct APIs cannot run; DeepSeek remains the only directly billed provider; Claude works only while its approved localhost proxy is ready; routing reasons match observed state.

**ROLLBACK:** Disable active probes and Hermes planning independently; retain the old keyword router as a feature-flag fallback.

### Phase 4 — Worker Identity and Operations

**GOAL:** Make every worker name correspond to a truthful capability and supported operating procedure.

**FILES:** `src/adapters/grokBuild.js`, worker IDs/config, `docs/WORKER_SYSTEM.md`, `docs/OPERATIONS.md`, `docs/GROK_BOT.md`, UI labels and tests.

**IMPLEMENTATION:** Represent Grok Build and Grok as explicit modes of one authenticated CLI unless distinct interfaces are discovered; keep Grok Bot experimental/disabled; document “start Claude terminal/proxy when needed”; add log retention and task pagination boundaries.

**TEST:** Command-construction tests, UI label test, dry-run modes, Grok read-only session/model check, log redaction tests.

**ACCEPTANCE:** No duplicated or misleading worker identity; operators can tell whether a worker is installed, authenticated, ready, experimental, or sharing a backend.

**ROLLBACK:** Restore the two legacy labels while retaining backend metadata and documentation.

### Phase 5 — Legacy Application Regression Repair

**GOAL:** Restore all discovered founder applications to their prior runnable baseline without redesigning them.

**FILES:** `C:\Users\22145\Desktop\github\server\script_engine.py`; OPC Matrix dependency installation under `C:\Users\22145\Desktop\opc矩阵\remotion`; local-tools config.

**IMPLEMENTATION:** Correct the invalid f-string; refresh Remotion dependencies from the locked package graph so junctions target the current directory; do not touch the dirty `me` worktree.

**TEST:** Python compile sweep; video-matrix targeted checks; OPC Matrix 11-test suite; Remotion CLI discovery; existing Shuzhai/Classify King/Xingxuan checks.

**ACCEPTANCE:** Video-matrix Python files compile; OPC Matrix passes 11/11; no unrelated app files or lockfiles change unexpectedly.

**ROLLBACK:** Revert the one-line Python change; remove only package-manager-created dependency changes by reinstalling from the unchanged lockfile. Never delete a broad directory manually.

### Phase 6 — Full Acceptance and Checkpoint

**GOAL:** Demonstrate the complete local control loop and leave a recoverable V1 checkpoint.

**FILES:** Validation fixtures, tests, `README.md`, `founder_os/CURRENT_STATE.md`, final acceptance report.

**IMPLEMENTATION:** Run Task -> Worker -> Result -> Verifier -> Repair -> Retest -> Pass through Dashboard/API; exercise Codex, approved Claude proxy when manually started, Antigravity, Grok modes, and Hermes/DeepSeek; record honest skips; update status and operational docs; create incremental Git commits.

**TEST:** Main test suite, browser smoke, real minimal E2E proofs, policy-negative tests, and legacy regression suite.

**ACCEPTANCE:** Every supported worker has either a current real PASS or an honest SKIPPED/OFFLINE reason; strict verification proves one repair loop; dashboard displays truthful status; all targeted regression checks pass.

**ROLLBACK:** Revert phase commits in reverse order. Preserve reports and the audit plan for diagnosis; do not reset or overwrite user worktrees.

## 11. Testing Strategy

1. Fast unit tests on every phase commit.
2. Fake-CLI contract tests for exit codes, timeouts, auth, quota, malformed output, and redaction.
3. Read-only real CLI probes for installed/session/model state.
4. Minimal paid/remote E2E only where needed; DeepSeek is the only allowed directly billed API.
5. Browser smoke testing in a new temporary tab so existing signed-in pages are untouched.
6. Legacy regression tests remain read-only except for the two scoped repairs.
7. Inspect Git status before and after every phase and never absorb unrelated user changes.

## 12. Acceptance Criteria

- Main test suite passes with new tests covering readiness, permission mode, policy enforcement, and strict verification.
- Dashboard creates a task and shows truthful routing, attempts, worker result, verification evidence, and final status.
- A deliberately failing first attempt can be repaired and retested to PASS within a configured bound.
- Codex uses ChatGPT login; Grok uses its session; Claude uses only the founder-approved localhost Antigravity reverse proxy; DeepSeek runs only through the explicitly selected Hermes provider.
- Antigravity dangerous permission bypass is never implicit.
- No unsupported Grok Bot capability is claimed.
- Video-matrix Python compilation and OPC Matrix 11/11 regression checks pass.
- Documentation matches actual configuration and current test counts.
- No secrets, full prompts, or unrelated user changes are committed.

## 13. Rollback Strategy

- One focused Git commit per phase, preceded and followed by tests and `git status` inspection.
- Use normal Git reverts for repository changes; never use destructive reset commands.
- Preserve backward-compatible task JSON and feature-flag strict verification/router changes.
- Keep adapters independently disableable so one worker outage does not stop the control plane.
- Treat Claude proxy and Grok Bot as optional dependencies; their absence must degrade to an honest status, not a startup failure.
- For sibling applications without Git, make only minimal line-level edits, record exact files, and retain lockfiles as dependency rollback sources.

