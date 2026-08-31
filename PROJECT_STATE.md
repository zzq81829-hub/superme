# PROJECT_STATE

Current Phase: **T partial live acceptance; next: Claude login + Codex quota then re-run T1/T2**  
Current Status: Control Center live. Hermes bridged. Agy + Grok Build + Grok + DeepSeek live PASS. Codex quota. Claude AUTH_REQUIRED. Grok Bot deferred.  
Last Successful Test: `npm test` 25/25

## Worker status

| Worker | Status | Evidence |
|--------|--------|----------|
| Hermes | ONLINE | `HERMES_BRIDGE_OK` 24714 ms |
| Codex | QUOTA_LIMITED | usage limit ~09:58; no OpenAI API fallback |
| Claude Code | AUTH_REQUIRED | CLI says `/login` |
| Antigravity | ONLINE | T3 PASS `AGY_E2E_T3` |
| Grok Build | ONLINE | T4 PASS |
| Grok | ONLINE | T5 PASS |
| Grok Bot | EXPERIMENTAL / UNKNOWN_CONTROL_INTERFACE | T6 DEFERRED |
| DeepSeek | ONLINE | T7 PASS |

## Next action

User: `claude` login (one command). Codex: wait for quota or use other workers. Then re-run T1/T2 only.
