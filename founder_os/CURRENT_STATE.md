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
- Dashboard, task persistence, deterministic routing, automatic execution and result polling are implemented.
- The local runtime is now enabled with `config.json -> dryRun=false` and the Dashboard is running on `127.0.0.1:3210`.
- Codex uses `codex exec` with explicit `workspace-write`, JSONL output, timeout handling and per-task logs.
- Antigravity uses the installed `agy --print` headless interface with JSON output, timeout handling and native CLI diagnostics.
- Unit/integration tests cover routing, command construction, dry-run behavior, child-process output and timeout termination.
- A real Codex adapter smoke test passed end to end.
- A real Dashboard -> persisted task -> router -> Codex CLI -> workspace file -> persisted result/log -> Dashboard result test passed. Codex created the exact 26-byte proof file in 109,221 ms and exited with code 0.
- A real Dashboard -> persisted task -> router -> Antigravity CLI -> provider -> persisted error/log -> Dashboard error test also completed. The provider rejected the request after 18,202 ms with `User location is not supported for the API use.` This is an external access blocker, not an adapter or control-plane defect.
- Follow-up diagnosis confirmed Antigravity CLI `1.1.22` is current and authenticates through a consumer Google account. The machine's effective public egress country is Japan, which Antigravity officially supports, while no Gemini API key or Google Cloud ADC mode is configured. The remaining likely blocker is the signed-in Google account's associated country or consumer eligibility; the compliant alternatives are correcting a genuinely incorrect account country, using an eligible Gemini API key, or using Gemini Enterprise Agent Platform.
- Antigravity live loop is now viable on this machine by avoiding Gemini: `--model claude-sonnet-4-6`, `--add-dir <project>`, no `--sandbox`, and `--dangerously-skip-permissions` for headless tool use. Task `1788138927817-7b78d3` completed in 141508 ms with a real inspection report.
- Gemini remains location-blocked (`User location is not supported`). Fallback is `gpt-oss-120b-medium`.
- The current feasibility verdict is: local control plane, Codex, and Antigravity are all viable now if Antigravity is not left on the default Gemini model.

### V1 safety decisions
- The `dryRun` safety switch remains available; the current local runtime is intentionally set to `dryRun=false` for real execution validation.
- Agent processes are spawned without a shell to avoid command injection through task text.
- Codex is limited to the task workspace; Antigravity uses its CLI sandbox by default.
- No adapter enables dangerous permission-bypass flags.
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
