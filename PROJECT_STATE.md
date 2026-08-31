# PROJECT_STATE

Current Phase: **T1 Codex live PASS; T2 still AUTH_REQUIRED**  
Current Status: T1/T3/T4/T5/T7/T8/T9 PASS. T2 Claude login still required. Grok Bot deferred.  
Last Successful Test: `npm test` 26/26

## Worker status

| Worker | Status | Evidence |
|--------|--------|----------|
| Hermes | ONLINE | `HERMES_BRIDGE_OK` 24714 ms |
| Codex | QUOTA_LIMITED | usage limit ~09:58; no OpenAI API fallback |
| Claude Code | SUBSCRIPTION_UNAVAILABLE | `claude auth status` = API key only; we refuse ANTHROPIC_API_KEY |
| Antigravity | ONLINE | T3 PASS `AGY_E2E_T3` |
| Grok Build | ONLINE | T4 PASS |
| Grok | ONLINE | T5 PASS |
| Grok Bot | EXPERIMENTAL / UNKNOWN_CONTROL_INTERFACE | T6 DEFERRED |
| DeepSeek | ONLINE | T7 PASS |

## Next action

Only human: `claude` then `/login`. After that T2 can be re-run. Company already runs without Claude/Codex.
