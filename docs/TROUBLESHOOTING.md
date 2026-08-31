# TROUBLESHOOTING

| Symptom | Cause | Action |
|---------|--------|--------|
| Codex `usage limit` | ChatGPT/Codex quota | Wait or hop to Agy/Grok Build. Never OpenAI API. |
| Claude `Not logged in` while `auth status` loggedIn | Auth is `ANTHROPIC_API_KEY` | `claude auth login` (subscription). We strip the key. |
| Claude hang on `-p` | Default model `gemini-3.7-flash` + no OAuth | Adapter forces `--model sonnet`; still needs subscription login. |
| Agy location 400 | Gemini geo gate | Use `claude-sonnet-4-6`. |
| `codex` not on PATH | Desktop app hashed bin | `resolveCommand.js` finds it. |
| Grok `--output-format text` | Invalid | Use `plain`. |
