# MIGRATION PLAN

Date: 2026-08-31  
Base: `docs/EXISTING_SYSTEM_AUDIT.md`  
Rule: incremental only. No parallel OS. No Hermes rewrite. No API billing except DeepSeek.

## Classification legend

- KEEP — leave running
- MODIFY — small additive change
- REPLACE — new path first, old path stays until tests pass
- DEPRECATE — mark after replacement is proven
- REMOVE — only after no business value + stable substitute + regression pass

## Module table

| Module | Class | Why |
|--------|-------|-----|
| `server.js` dashboard + `/api/tasks` | KEEP + later MODIFY | Boss console. Add health/workers/hermes endpoints later, do not replace. |
| `public/*` | KEEP + later MODIFY | Incremental UI. No rewrite. |
| `src/store.js` | KEEP + MODIFY | Extend fields/states. Do not replace with a new DB in early phases. |
| `src/adapters/processRunner.js` | KEEP | Shared spawn. Workers reuse it. |
| `src/adapters/resolveCommand.js` | KEEP + MODIFY | Add Claude/Grok/Hermes lookup the same way as Codex. |
| `src/adapters/codex.js` | KEEP | Proven subscription CLI. |
| `src/adapters/antigravity.js` | KEEP | Proven after Gemini workaround. |
| `src/adapters/runAgent.js` | KEEP + MODIFY | Becomes dispatcher over WorkerAdapter. Grok stub stays failed until real CLI exists. |
| `src/router.js` `chooseAgent` | MODIFY then DEPRECATE | Keep keyword router until Cost Guard + Hermes exist. Then Hermes does complex routing; local router only policy/availability. |
| `src/router.js` `buildPrompt` | KEEP | Fine for CLI workers. Hermes can wrap later. |
| `config.json` / example | KEEP + MODIFY | Add workers and billing flags. Never enable OpenAI/Anthropic/xAI/Gemini API. |
| `founder_os/` `AGENTS.md` | KEEP | Personal IP / constitution. Never delete. |
| `validation/codex-e2e` | KEEP | Regression fixture. |
| `scripts/smoke-agents.js` | KEEP + MODIFY | Add smoke per worker. |
| `test/*` | KEEP | 14 tests are the current gate. Every phase must still pass them. |
| `data/tasks` `data/reports` | KEEP | Runtime history. gitignored. |
| Keyword auto → Antigravity default | MODIFY | After Cost Guard: prefer available subscription worker, not a dead Gemini default. |
| New `src/integrations/hermes/` | ADD (not replace) | Bridge only. Control Center talks to Bridge, not Hermes internals. |
| New WorkerAdapter + Claude/Grok*/DeepSeek | ADD | Beside existing adapters. Do not delete Codex/Agy. |
| New Cost Guard | ADD | Before every worker run. No paid-API fallback. |
| New Verifier | ADD | Independent of worker self-report. |
| In-app Terminal/Browser/Memory/Skills/CUA | **DO NOT ADD** | Hermes already has them. |
| OpenRouter / OpenAI API / Anthropic API / xAI API / Gemini API | **FORBIDDEN** | Even if Hermes `.env` already contains an Anthropic key. |
| Business apps (书斋, 星选, 原点, BookMatrix, 分类王, me, 视频矩阵) | KEEP | Become LocalToolAdapter later. Never merge-delete. |
| Grok Bot as required runtime | **FORBIDDEN** | Experimental only. System must run at quota=0. |

REMOVE list: **empty**.

## Phase order (locked)

A Audit — this document's predecessor, done.  
B This plan.  
C Git checkpoint.  
D Environment audit file (CLI/auth/billing facts).  
E **Verify** Hermes (already installed 0.20.5). Do not reinstall. Do not `hermes update` unless doctor requires it.  
F Hermes Bridge (`hermes chat -q` first).  
G Codex worker wrapper around existing adapter + healthCheck.  
H Claude Code `claude -p` (subscription CLI). AUTH_REQUIRED if not logged in.  
I Antigravity existing adapter + healthCheck.  
J Grok Build `grok -p/--single`.  
K Grok subscription worker; if only API key path exists → `SUBSCRIPTION_INTEGRATION_UNAVAILABLE`, skip, do not call xAI API.  
L Grok Bot experimental. If no control interface → DEFERRED, not fake PASS.  
M DeepSeek cheap worker (only allowed API). Strict cost cap.  
N Unify WorkerAdapter.  
O Cost Guard.  
P Router uses Guard + availability; Hermes for multi-step.  
Q Verification loop.  
R Control Center UI incremental.  
S Local business tools as CLI/API adapters.  
T–V E2E / fallback / acceptance.

Skip a worker if AUTH_REQUIRED. Never skip Cost Guard once O exists. Never mark PASS because an agent said DONE.

## Hermes usage rule

Control Center → Bridge → `hermes chat -q "..."` (or later kanban/cron).  
Hermes may then call Codex/Claude/Agy/Grok **CLIs** via its terminal tool.  
Do not point Hermes at OpenAI/Anthropic/xAI/Gemini API for those workers.

Hermes current default model is DeepSeek. That is acceptable for CEO reasoning. It is **not** acceptable as a silent substitute for Codex/Claude coding workers.

## First concrete diffs after C (not this commit)

1. `PROJECT_STATE.md` (this repo).  
2. `config/billing-policy.yaml` as specified.  
3. `src/integrations/hermes/bridge.js` with `sendTask` using `hermes chat -q`.  
4. Health endpoint lists real CLI resolved paths (already partly there).

No UI rewrite. No new Electron. No new database.
