# OPERATIONS

- Dashboard: `http://127.0.0.1:3210`
- Health: `GET /api/health`  Workers: `GET /api/workers`  Tools: `GET /api/tools`
- Tasks persist in `data/tasks`. Logs in `data/reports`.
- `dryRun` in gitignored `config.json`. Live machine currently `false`.
- Fallback: Codex → Claude → Antigravity → Grok Build. Never OpenAI/Anthropic/xAI/Gemini API.
- Grok Bot missing does not stop the company.
