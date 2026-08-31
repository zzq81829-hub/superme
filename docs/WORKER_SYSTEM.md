# WORKER SYSTEM

Control Center never talks to worker internals except through:

- `src/adapters/runAgent.js`
- `src/integrations/hermes/bridge.js`
- `src/workers/costGuard.js`

| id | binary | billing | required |
|----|--------|---------|----------|
| hermes | `hermes chat --query-file` | DeepSeek cheap API as CEO | no |
| codex | `codex exec` | subscription | no |
| claude | `claude -p` | subscription | no |
| antigravity | `agy --print` | subscription | no |
| grok-build | `grok -p --always-approve` | subscription | no |
| grok | `grok -p` | subscription CLI, not xAI API | no |
| grok-bot | none | experimental | **no** |
| deepseek | Hermes `--provider deepseek` | API cheap | no |

Fallback if requested worker is down: Codex → Claude → Antigravity → Grok Build. Never OpenAI/Anthropic/xAI/Gemini API.

Verifier: non-empty result; if `package.json` exists, `npm test`. Worker saying DONE is not enough.
