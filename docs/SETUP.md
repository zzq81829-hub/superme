# SETUP

1. Node.js 24+, Git.
2. `安装依赖.bat` or `npm install`.
3. Copy is automatic: missing `config.json` is created from `config.example.json`.
4. `启动_AI公司.bat` or `npm start`.
5. Open `http://127.0.0.1:3210`.

Workers expected on this machine (not installed by this repo): Codex desktop, `agy`, `claude`, `grok`, `hermes`, FFmpeg.

Claude is optional and on-demand on this machine. Its founder-approved Antigravity reverse proxy is exposed locally at `ANTHROPIC_BASE_URL=http://127.0.0.1:8045`; start the Claude terminal/proxy only when Claude is needed. If the local port is down, Founder OS skips Claude. Non-local Anthropic API key fallback remains forbidden.

DeepSeek is the only allowed model API (used by Hermes CEO).

Antigravity headless permissions default to `permissionMode: "configured"`. The current machine may explicitly use `"dangerous-bypass"` to preserve a proven flow, but that mode auto-approves every tool and is displayed as a security risk. Founder OS never silently switches into it or edits global Antigravity permissions.
