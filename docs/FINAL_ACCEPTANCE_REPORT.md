# FINAL ACCEPTANCE REPORT (Codex takeover checkpoint)

Date: 2026-08-31  
Control Center: `http://127.0.0.1:3210`

| Test | Result | Evidence |
|------|--------|----------|
| T1 Hermes→Codex sandbox | **PASS** | After quota window, `1788141529170-37d39e` Codex completed, verifier npm-test ok. Earlier hop `1788141128599-052513` Agy-created `CODEX_E2E_T1`. |
| T2 Hermes→Claude review | **ON_DEMAND / SKIPPED** | Founder approved the localhost Antigravity reverse proxy used by Claude. Port 8045 is currently down, so health reports `ON_DEMAND` and routing skips Claude. Start the Claude terminal only when needed. |
| T3 Hermes→Antigravity sandbox | **PASS** | `1788140378507-d20e54` completed, `PROOF.txt`=`AGY_E2E_T3`, verifier `npm-test` ok |
| T4 Grok Build sandbox | **PASS** | `1788140548366-a9b201` completed, verifier `npm-test` ok (after `--output-format plain`) |
| T5 Grok research | **PASS** | `1788140659089-58f3b6` Cost Guard paragraph |
| T6 Grok Bot | **DEFERRED** | `UNKNOWN_CONTROL_INTERFACE`. Not faked. |
| T7 DeepSeek | **PASS** | `1788140683449-75e42d` + earlier `HERMES_BRIDGE_OK` |
| T8 Grok Bot down | **PASS** | health + costGuard unit test: company still routes |
| T9 Codex down / quota | **PASS** | Live hop `codex,claude unavailable; fallback antigravity`, verifier npm-test ok, no OpenAI API. |
| T10 strict machine verifier | **PASS** | Dashboard task `1788162612513-cb3353`: Codex created exact no-newline `PROOF.txt`; file equality and `npm test` passed; execution and verification history persisted. |
| T11 worker readiness truth | **PASS** | Read-only probes show Hermes/Codex/Grok READY, Claude ON_DEMAND, Antigravity INSTALLED with explicit permission warning, Grok Bot unknown. |
| T12 legacy regressions | **PASS** | Video-matrix Python compile fixed; OPC Matrix dependency junction repaired and suite passes 11/11. |

Unit tests: `npm test` → 39/39 (`./test/*.js` only).

Human actions remaining: none for the control plane. Start the Claude terminal/proxy only when a task needs Claude. Direct Antigravity runs now keep configured granular permissions; permission denial causes fallback instead of automatic escalation.
