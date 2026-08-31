# PROJECT_STATE

Current Phase: **Codex takeover hardening complete; ready for Shuzhai product loop**
Current Status: strict verifier E2E PASS; Claude on-demand; Grok Bot deferred.
Last Successful Test: `npm test` 38/38

## Worker status

| Worker | Status | Evidence |
|--------|--------|----------|
| Hermes | READY | read-only status verifies DeepSeek provider; real bridge proof passed |
| Codex | READY | `codex login status` verifies ChatGPT; strict E2E task `1788162612513-cb3353` passed |
| Claude Code | ON_DEMAND | founder-approved localhost Antigravity reverse proxy is currently stopped; start Claude terminal when needed |
| Antigravity | INSTALLED / RISK | T3 real PASS; provider readiness unprobed; explicit `dangerous-bypass` warning |
| Grok Build | READY | grok.com session verified; T4 PASS; shares `grok.exe` |
| Grok | READY | grok.com session verified; T5 PASS; shares `grok.exe` |
| Grok Bot | EXPERIMENTAL / UNKNOWN_CONTROL_INTERFACE | T6 DEFERRED |
| DeepSeek | READY | Hermes status verifies selected DeepSeek provider; T7 PASS |

## Next action

Begin the Shuzhai content loop using machine acceptance criteria. Start the Claude terminal/proxy only when a task specifically needs Claude; no login repair is required now.
