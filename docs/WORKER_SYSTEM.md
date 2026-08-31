# WORKER SYSTEM

Control Center never talks to worker internals except through:

- `src/adapters/runAgent.js`
- `src/integrations/hermes/bridge.js`
- `src/workers/costGuard.js`

| id | binary | billing | required |
|----|--------|---------|----------|
| hermes | `hermes chat --query-file` | DeepSeek cheap API as CEO | no |
| codex | `codex exec` | subscription | no |
| claude | `claude -p` through founder-approved localhost Antigravity proxy | on-demand local proxy | no |
| antigravity | `agy --print` | subscription | no |
| grok-build | `grok -p --always-approve` | subscription | no |
| grok | `grok -p` | subscription CLI, not xAI API | no |
| grok-bot | none | experimental | **no** |
| deepseek | Hermes `--provider deepseek` | API cheap | no |

Fallback if requested worker is down: Codex → Claude → Antigravity → Grok Build. Never OpenAI/Anthropic/xAI/Gemini API.

`INSTALLED` means only that the executable was found. `READY` is reserved for a worker whose required local dependency was actually probed. Claude is `ON_DEMAND` while its local proxy is stopped. Antigravity `dangerous-bypass` is explicit configuration and appears with a warning in the dashboard.

Verifier: non-empty result; if `package.json` exists, `npm test`. Worker saying DONE is not enough.
