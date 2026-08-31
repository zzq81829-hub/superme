# EXISTING SYSTEM AUDIT

Date: 2026-08-31  
Scope: `C:\Users\22145\Desktop\superme` (Control Center) plus sibling business tools on this machine.  
Constraint: no install, no rewrite, no Hermes reimplementation.

## 1. What this project already is

`superme` is **AI Founder OS V1**: a local Express dashboard that creates a task, routes it to a CLI agent, waits, and stores the result as JSON.

It is **not** Hermes. It is **not** the book/XHS/video factories. Those already exist as separate desktop products.

Real runtime path today:

```
Browser http://127.0.0.1:3210
  -> public/index.html + public/app.js
  -> POST /api/tasks
  -> src/store.js  (data/tasks/*.json)
  -> src/router.js chooseAgent + dispatchTask
  -> src/adapters/runAgent.js
  -> Codex  (codex exec --json, stdin prompt)
     or Antigravity (agy --print, JSON)
  -> src/adapters/processRunner.js spawn(shell:false)
  -> data/reports/*
  -> GET /api/tasks  (Dashboard poll 5s)
```

Entry: `启动_AI公司.bat` -> `npm start` -> `node server.js`.  
Health (live at audit time): `ok:true`, `dryRun:false`, port `3210`.

## 2. Current project tree (source only)

| Path | Role |
|------|------|
| `server.js` | HTTP API + static UI |
| `src/config.js` | merge `config.example.json` + `config.json` |
| `src/store.js` | file JSON task store |
| `src/router.js` | keyword router + prompt + dispatch |
| `src/adapters/runAgent.js` | `runAgent(agent, task, project, config)` |
| `src/adapters/codex.js` | Codex CLI adapter |
| `src/adapters/antigravity.js` | Antigravity CLI adapter + Gemini location fallback |
| `src/adapters/processRunner.js` | bounded spawn |
| `src/adapters/resolveCommand.js` | find `codex.exe` / `agy.exe` when PATH is empty |
| `src/adapters/logPaths.js` | `data/reports` |
| `public/*` | one-page Control Center |
| `scripts/smoke-agents.js` | real CLI smoke |
| `test/*.js` | 14 unit tests, all passing |
| `founder_os/*` | founder constitution, not executable |
| `validation/codex-e2e/` | proven Codex write test |
| `config.json` | live runtime (`dryRun:false`); gitignored |

No Electron in `superme`. No database. No MCP client. No verifier. No Hermes bridge. No billing. No health of workers beyond config echo.

## 3. What already runs (proven, not claimed)

| Capability | Proof | Status |
|------------|--------|--------|
| Dashboard start | health JSON on `:3210` | LIVE |
| Create + auto-run task | POST `/api/tasks` sets `queued`/`running` | LIVE |
| File persistence | `data/tasks`, `data/reports` | LIVE |
| Codex real exec | task `1788135955732-85104d`, 109221 ms, `E2E_PROOF.txt` 26 bytes | PROVEN |
| Antigravity real exec | task `1788138927817-7b78d3`, 141508 ms, `claude-sonnet-4-6`, inspection report | PROVEN |
| Dry-run | task `1788134248078-de13dc` | PROVEN |
| Unit tests | `npm test` → 14/14 | PASS |
| CLI resolution | health `resolvedCommand` for Codex hashed exe and `agy.EXE` | LIVE |

Antigravity Gemini default is **blocked** (`User location is not supported`). Working path: `--model claude-sonnet-4-6`, `--add-dir <project>`, no `--sandbox`, headless skip-permissions. Fallback model: `gpt-oss-120b-medium`.

## 4. UI-only vs real backend

| Surface | UI | Backend |
|---------|----|---------|
| Title / description / agent / projectPath | yes | yes |
| Create and execute | yes | yes, one POST |
| Task list + poll | yes | yes |
| Worker dashboard / cost / CEO=Hermes | **no** | **no** |
| Verification / repair loop | **no** | **no** |
| Book / XHS / video pipelines | placeholder copy only | **not in this repo** |
| Grok / Claude / DeepSeek / Grok Bot | grok stub returns error | **not implemented** |

`runAgent("grok")` exists only as `{ ok:false, error:"Grok adapter is not enabled in V1" }`. That is a stub, not an integration.

## 5. Overlap with Hermes (do not rebuild)

Hermes is **already installed**: `hermes 0.20.5` at `C:\Users\22145\AppData\Local\hermes\hermes-agent`.

Hermes already owns: Terminal, Browser, Memory, Skills, Computer Use (`hermes computer-use`), MCP (`hermes mcp`), Sessions, Kanban, Cron, `hermes chat -q` non-interactive, Doctor, Approvals.

`superme` currently duplicates a **thin** subset: task JSON + spawn CLI + simple keyword router. That is Control Center work, not a second Hermes.

**Do not** add terminal/browser/memory/skills/computer-use inside `superme`. Bridge Hermes instead.

Hermes live `hermes status` (audit, keys redacted):

- Default model: `deepseek-v4-pro` / provider DeepSeek (API key present — allowed under billing policy)
- OpenRouter / OpenAI / Gemini / xAI API: not set
- Nous Portal: not logged in
- Hermes Codex OAuth: not stored (desktop Codex CLI still works independently)
- xAI OAuth: not stored
- Anthropic API key **is present in Hermes env**. Claude Worker must still use `claude` CLI subscription, never this key.
- Gateway: stopped

## 6. Local workers on this machine (environment, not yet wired)

| Worker | Binary | Headless flag (from `--help`) | Wired in superme? | Notes |
|--------|--------|-------------------------------|-------------------|-------|
| Codex | `%LOCALAPPDATA%\OpenAI\Codex\bin\<hash>\codex.exe` (not on User PATH) | `codex exec --json -` | YES | Subscription via OpenAI Codex app; `auth.json` exists |
| Antigravity | `agy.exe` on PATH | `agy --print` | YES | Gemini location-blocked; Claude/GPT-OSS models work |
| Claude Code | `claude` npm shim | `claude -p/--print` | NO | Must verify login later; do not use ANTHROPIC_API_KEY |
| Grok Build | `grok.exe` 1.0.13 | `grok -p/--single` | NO | Distinct from Grok model API |
| Grok (model/session) | same `grok` TUI / Grok login | unknown as separate worker | NO | Do not treat as Grok Bot |
| Grok Bot | no dedicated control CLI found; `~/.grok/bin/agent.exe` is the same Grok Build TUI | UNKNOWN | NO | Mark EXPERIMENTAL / UNKNOWN_CONTROL_INTERFACE |
| DeepSeek | no `deepseek` CLI | n/a | NO | Hermes already uses DeepSeek as default model |
| Hermes | `hermes.exe` | `hermes chat -q` | NO | CEO/runtime candidate; already installed |

FFmpeg: installed via WinGet full build, on PATH.  
Git: `D:\Git\cmd\git.exe`.  
Node: v24.18.1.

## 7. Founder IP and business tools (DO NOT DELETE)

These are sibling products. They are Layer 4 tools, not something to fold into Hermes internals.

| Product | Path | What it is | Billing risk |
|---------|------|------------|--------------|
| 書斎 / 书摘 | `Desktop\工作流` | Electron+Express book→insight→日报→小红书出版引擎 | uses `openai` npm package internally |
| Book Matrix | `Desktop\book_matrix` | Streamlit book→痛点→XHS/抖音/B站 + Imagine video | README asks for `XAI_API_KEY` |
| BookMatrix Neon 6.0 | `Desktop\opc矩阵` | 10-agent book factory, Remotion, Seedance, FFmpeg | mixed APIs; dry-run default |
| 星选 | `Desktop\星选` | X→小红书 rewrite; Grok skill `/x-xhs` | prefers Grok session, can take `XAI_API_KEY` |
| 原点 | `Desktop\原点` | 政治经济学研学 | optional DeepSeek (allowed) |
| me.skill | `Desktop\me` | 数字分身 / 个人 IP | Grok session or `XAI_API_KEY` |
| 分类王 | `Desktop\分类王` | 素材分类归档 | local |
| AI Video Matrix | `Desktop\github` | 8 开源视频引擎聚合 | local+various |
| Founder OS docs | `superme/founder_os` | IP / 书摘 mission, not code | n/a |

**绝对不能删除：** 上述业务数据目录（`output/`, `data/`, 书库, 出版历史）、`founder_os/`, `AGENTS.md`, 已验证的 Codex/Antigravity adapters, `data/tasks` 历史。

个人 IP 层（判断、口吻、MY_BRAIN）目前只在文档和 `me` / 星选 / 书斋里，不在 `superme` 运行时。保留。

## 8. What should be kept / changed / replaced

See `docs/MIGRATION_PLAN.md` for KEEP/MODIFY/REPLACE/DEPRECATE/REMOVE.

Summary:

- KEEP: dashboard, task JSON store, Codex/Antigravity adapters, processRunner, dryRun switch, founder_os, business apps.
- MODIFY: router (cost/availability only; complex orchestration → Hermes), health API, UI incremental, task states.
- REPLACE later: in-process `dispatchTask` as the CEO. Hermes should orchestrate; Control Center should call a Bridge.
- DEPRECATE: keyword-only auto router after Hermes+Cost Guard exist and regression passes.
- REMOVE: nothing now.

## 9. What Hermes can replace later

- Multi-step decompose / kanban / retry loops  
- Terminal/browser/computer-use  
- Session memory and skills  
- Long-running autonomous work  

What Hermes must **not** replace: 书摘/星选/视频/分类王 data and UIs; founder IP artifacts; Control Center as the boss console.

## 10. Gaps vs the AI Company OS spec

Missing in `superme` today: Hermes Bridge, Claude/Grok Build/Grok/Grok Bot/DeepSeek workers, Cost Guard, billing policy file, verification loop, worker health monitor, structured task states (PLANNING/VERIFYING/REPAIRING), logs/ tree, Git repo, Control Center worker/cost panels.

Duplicates to avoid: second terminal, second memory, second computer-use, second skill runner.

## 11. Sweep checklist (anti-omission)

Searched in `superme`: Agent, Router, Worker, Task, Provider, Model, Tool, Book, Memory, Media, Publish, Video, XHS, Codex, Claude, Grok, Antigravity, DeepSeek, Hermes, Electron, MCP, FFmpeg.

Hits that matter: Codex/Antigravity/runAgent/router/store only. Book/XHS only in README/founder_os copy. Claude/Grok/DeepSeek/Hermes/MCP/FFmpeg/Electron: **no runtime code** in this repo.

Sibling repos on Desktop were opened via README (not deleted, not rewritten).

## 12. Acceptance of PHASE A

This audit is complete enough to write a migration plan without installing anything and without rewriting Control Center.
