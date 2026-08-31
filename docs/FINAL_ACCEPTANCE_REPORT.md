# FINAL ACCEPTANCE REPORT (partial — honest)

Date: 2026-08-31  
Control Center: `http://127.0.0.1:3210`

| Test | Result | Evidence |
|------|--------|----------|
| T1 Hermes→Codex sandbox | **QUOTA_LIMITED** | `turn.failed` usage limit until ~09:58. Did **not** fall back to OpenAI API. |
| T2 Hermes→Claude review | **AUTH_REQUIRED** | `Not logged in · Please run /login`. Did **not** use ANTHROPIC_API_KEY. |
| T3 Hermes→Antigravity sandbox | **PASS** | `1788140378507-d20e54` completed, `PROOF.txt`=`AGY_E2E_T3`, verifier `npm-test` ok |
| T4 Grok Build sandbox | **PASS** | `1788140548366-a9b201` completed, verifier `npm-test` ok (after `--output-format plain`) |
| T5 Grok research | **PASS** | `1788140659089-58f3b6` Cost Guard paragraph |
| T6 Grok Bot | **DEFERRED** | `UNKNOWN_CONTROL_INTERFACE`. Not faked. |
| T7 DeepSeek | **PASS** | `1788140683449-75e42d` + earlier `HERMES_BRIDGE_OK` |
| T8 Grok Bot down | **PASS** | health + costGuard unit test: company still routes |
| T9 Codex down / quota | **PARTIAL** | Unit: skip Codex → Claude, never API. Live: Codex quota returned generic exit 1 so runtime fallback did not fire; adapter now prefers JSONL `turn.failed` message. Still no OpenAI API. |

Unit tests: `npm test` → 25/25 (`./test/*.js` only).

Human actions remaining: Codex quota wait or upgrade; `claude` `/login`.
