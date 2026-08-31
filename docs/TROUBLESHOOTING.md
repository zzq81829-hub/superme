# TROUBLESHOOTING

| Symptom | Cause | Action |
|---------|--------|--------|
| Codex `usage limit` | ChatGPT/Codex quota | Wait or hop to Agy/Grok Build. Never OpenAI API. |
| Claude via Antigravity reverse proxy | `ANTHROPIC_BASE_URL=http://127.0.0.1:8045` | If proxy is down, skip Claude and hop to next worker. Do not wait for Anthropic login. |
| Agy location 400 | Gemini geo gate | Use `claude-sonnet-4-6`. |
| `codex` not on PATH | Desktop app hashed bin | `resolveCommand.js` finds it. |
| Grok `--output-format text` | Invalid | Use `plain`. |
