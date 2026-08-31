# PROJECT_STATE

Current Phase: **F–R incremental shipped; next T live E2E matrix**  
Current Status: Control Center V1 plus Hermes Bridge, Cost Guard, extra CLI workers, verifier, worker HUD.  
Last Successful Test: `npm test` 24/24 (2026-08-31)

## Worker status

| Worker | Status | Evidence |
|--------|--------|----------|
| Hermes | ONLINE + bridged | Live `sendTask` returned `HERMES_BRIDGE_OK` in 24714 ms |
| Codex | ONLINE | prior E2E `1788135955732-85104d` |
| Claude Code | CLI ONLINE, adapter dry-run tested | `claude -p`; login not re-probed this turn |
| Antigravity | ONLINE | prior live task `1788138927817-7b78d3` |
| Grok Build | CLI ONLINE, adapter dry-run tested | `grok -p` |
| Grok | same CLI as Grok Build | not xAI API |
| Grok Bot | EXPERIMENTAL / UNKNOWN_CONTROL_INTERFACE | Cost Guard falls through; company still runs |
| DeepSeek | via Hermes provider | allowed cheap API |

## Known issues

- `codex` still not on User PATH (resolver works).
- Antigravity Gemini location-blocked; Claude model used.
- Hermes config.yaml version 34 vs 38; not migrated.
- Verifier runs `npm test` when the target has package.json; inspection tasks on this repo will also test.

## Blocked items

- Grok Bot programmatic control still missing.
- Hermes xAI/Codex OAuth not configured (desktop CLIs used instead).

## Next action

PHASE T: sandbox E2E for Hermes→Codex / Claude / Agy / Grok Build. Do not fake Grok Bot PASS.
