# PROJECT_STATE

Current Phase: **T live fallback PASS; remaining human: Claude /login**  
Current Status: Control Center live. T3/T4/T5/T7/T8/T9 live PASS. T1 Codex quota covered by T9 hop. T2 Claude AUTH_REQUIRED. Grok Bot deferred.  
Last Successful Test: `npm test` 26/26

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

Only human: `claude` then `/login`. After that T2 can be re-run. Company already runs without Claude/Codex.
