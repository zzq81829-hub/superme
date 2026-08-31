# ENVIRONMENT AUDIT

Date: 2026-08-31  
Machine: Windows, user `22145`  
No packages were installed for this phase.

## Runtimes

| Tool | Version / path | Notes |
|------|----------------|-------|
| Node | v24.18.1 `C:\Program Files\nodejs\node.exe` | Also Hermes Node on PATH |
| npm | 11.16.0 | |
| Git | `D:\Git\cmd\git.exe` | `superme` now has repo, commit `59c5d51` |
| Python (Hermes) | 3.11.16 | Bundled with Hermes |
| FFmpeg | WinGet `Gyan.FFmpeg` full build, on PATH | Business video tools |

## Subscription CLIs

| CLI | Path | Headless | Auth observation |
|-----|------|----------|------------------|
| Codex | `%LOCALAPPDATA%\OpenAI\Codex\bin\<hash>\codex.exe` not on User PATH | `codex exec --json -` | `~\.codex\auth.json` exists; real E2E passed |
| Antigravity | `%LOCALAPPDATA%\agy\bin\agy.exe` | `agy --print` | Logged in; Gemini location-blocked; Claude/GPT-OSS OK |
| Claude Code | `%APPDATA%\npm\claude.ps1` | `claude -p` | Login not verified this phase |
| Grok Build | `~\.grok\bin\grok.exe` 1.0.13 | `grok -p` / `--single` | Binary present; subscription vs API not distinguished yet |
| Hermes | `%LOCALAPPDATA%\hermes\hermes-agent\bin\hermes.exe` 0.20.5 | `hermes chat -q` | Installed. Gateway stopped. Default model DeepSeek |

## Hermes provider facts (no secrets)

- DeepSeek API key: present (only allowed API class)
- OpenAI / Gemini / xAI / OpenRouter API: not set
- Anthropic API key: present in Hermes env — **must not drive Claude Worker**
- Codex OAuth inside Hermes: missing (desktop Codex still works)
- xAI OAuth inside Hermes: missing → Grok subscription worker not ready
- MiniMax key: present (out of scope; do not add as worker unless asked)

## Forbidden fallbacks

Do not enable: OpenRouter, OpenAI API, Anthropic API, xAI API, Gemini API.  
If a subscription CLI is logged out: `AUTH_REQUIRED`, pick another subscription worker, never swap to API.

## Grok Bot

No separate control CLI. `agent.exe` help text is Grok Build TUI. Status: `UNKNOWN_CONTROL_INTERFACE`. Non-blocking.

## Control Center process

`node server.js` serves `127.0.0.1:3210`. `config.json` gitignored, currently `dryRun:false`.
