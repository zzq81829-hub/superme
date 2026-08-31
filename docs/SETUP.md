# SETUP

1. Node.js 24+, Git.
2. `安装依赖.bat` or `npm install`.
3. Copy is automatic: missing `config.json` is created from `config.example.json`.
4. `启动_AI公司.bat` or `npm start`.
5. Open `http://127.0.0.1:3210`.

Workers expected on this machine (not installed by this repo): Codex desktop, `agy`, `claude`, `grok`, `hermes`, FFmpeg.

Claude must be `claude auth login` (subscription). API key auth is rejected.

DeepSeek is the only allowed model API (used by Hermes CEO).
