# PROJECT_STATE

Current Phase: **C complete after this checkpoint; next is D Environment Audit**  
Current Status: Control Center V1 live. Codex + Antigravity real loops proven. Hermes already installed, not bridged.  
Last Successful Test: `npm test` 14/14 (2026-08-31)

## Worker status

| Worker | Status | Evidence |
|--------|--------|----------|
| Hermes | ONLINE (CLI installed), not integrated | `hermes` 0.20.5; `hermes chat -q` exists; gateway stopped |
| Codex | ONLINE via desktop CLI | E2E task `1788135955732-85104d` |
| Claude Code | UNKNOWN (CLI present, login not verified this phase) | `claude -p` in `--help` |
| Antigravity | ONLINE with non-Gemini model | task `1788138927817-7b78d3` |
| Grok Build | CLI ONLINE, not integrated | `grok 1.0.13`, `-p/--single` |
| Grok | SUBSCRIPTION_INTEGRATION_UNAVAILABLE until OAuth path proven | Hermes xAI OAuth not logged in; do not use XAI_API_KEY |
| Grok Bot | EXPERIMENTAL / UNKNOWN_CONTROL_INTERFACE | `agent.exe` is Grok Build TUI, not a bot controller |
| DeepSeek | API key present in Hermes, not a superme worker yet | allowed billing class: cheap |

## Known issues

- `codex` not on User PATH; resolver finds hashed exe.
- Antigravity Gemini: location 400. Use `claude-sonnet-4-6`.
- `config.json` `dryRun=false` while README says default true.
- No git history before phase C.
- No verifier. Worker message currently equals success.
- Hermes `.env` contains Anthropic API key. Must not be used for Claude Worker.

## Blocked items

- Grok Bot programmatic control: none found.
- Grok subscription (non-API) via Hermes: xAI OAuth not logged in.

## Next action

PHASE D — Environment Audit document (`docs/ENVIRONMENT_AUDIT.md`), still no install, still no refactor. Then PHASE E verify Hermes doctor/status only.
