# WORKER SYSTEM

Control Center never talks to worker internals except through:

- `src/adapters/runAgent.js`
- `src/integrations/hermes/bridge.js`
- `src/workers/costGuard.js`

| id | binary | billing | required |
|----|--------|---------|----------|
| hermes | `hermes chat --query-file` | DeepSeek cheap API as COO | no |
| codex | `codex exec` | subscription | no |
| claude | `claude -p` through founder-approved localhost Antigravity proxy | Gemini Flash 3.7 via proxy (≈ Antigravity) | no |
| antigravity | `agy --print` | subscription | no |
| grok-build | `grok -p --always-approve` | subscription | no |
| grok | `grok -p` | subscription CLI, not xAI API | no |
| grok-bot (秘书人格，非任务 Worker) | chat via `grok -p` + 人格文件 | subscription | no |
| deepseek | Hermes `--provider deepseek` | API cheap | no |

Fallback if requested worker is down: Codex → Claude → Antigravity → Grok Build. Never OpenAI/Anthropic/xAI/Gemini API.

## 当前各 Worker 实际模型 (2026-09-01 创始人指令后)

| Worker | 实际模型 | 依据 |
|--------|----------|------|
| Codex | **gpt-5.6-luna**（reasoning: **max**） | `~/.codex/config.toml` + `config.json` agents.codex（适配器 `-m`/`-c` 强制） |
| Claude | **claude-sonnet-4-6**（经 Antigravity 反向代理，`--model` 显式传入） | `config.json` agents.claude.model + `claude.js` |
| Antigravity | **gemini-flash-3.7** | `config.json` agents.antigravity.model |
| Grok / Grok Build | grok.com 订阅默认模型（grok-4.x 系，UI fork 副模型 grok-4.6） | `~/.grok/config.toml` |
| Hermes / DeepSeek | **DeepSeek**（`hermes chat --provider deepseek`）；可选 **gemini-proxy**（`custom:gemini-proxy` → 反代 :8045 `/v1/chat/completions`，OpenAI 兼容线，gemini-flash-3.7，key 在 `~/.hermes/.env` GEMINI_PROXY_API_KEY，需 `model.max_tokens≤16384`，2026-09-01 接入并实测出 OK；上游账号池配额常耗尽 429） | `src/integrations/hermes/bridge.js` + `~/.hermes/config.yaml` providers.gemini-proxy |

## 全员强制技能（马尾辫 / ponytail）

- 创始人要求**所有 Worker**（Codex / Claude / Antigravity / Grok / Hermes / DeepSeek）工作时**始终**启用 **马尾辫 / ponytail** 技能（最懒但可行的方案、YAGNI、标准库优先、一行能解决不用五十行）。
- 实现：`src/router.js` `buildPrompt` 每次派工把 `~/.codex/skills/ponytail/SKILL.md` 正文嵌入任务提示词（`MANDATORY SKILL` 块），所有 Worker 共享，保证必然生效，不靠模型自觉。
- 技能文件缺失时静默跳过（不阻塞派工），但会失去强制效果。
- 注：ponytail 技能自带「非编码任务不适用」的内部约束，摘要/翻译/研究类任务由模型自行把握。

## Worker landscape (2026-09-01, founder decision)

- Claude 可接入的模型是 **Gemini Flash 3.7**（经创始人批准的 Antigravity 反向代理），能力上 **≈ Antigravity**（同为 Gemini 系）：相似任务两者可互换，回退链中 Claude 与 Antigravity 互为同类回退。
- **ChatGPT / Codex 可适度接手 Claude 的审查类工作**：回退链 `codex → claude → antigravity → grok-build` 已实现——Claude 不可用时，审查任务先落 Codex，再落 Antigravity。

`INSTALLED` means only that the executable was found. `READY` is reserved for a worker whose required local dependency was actually probed. Claude is `ON_DEMAND` while its local proxy is stopped. Antigravity `dangerous-bypass` is explicit configuration and appears with a warning in the dashboard.

Readiness probes are read-only and cached for 60 seconds: `codex login status`, `grok models`, and `hermes status`. They do not send a model prompt or spend task tokens. Antigravity remains `INSTALLED` until a provider-aware, non-consuming auth probe is available.

Verifier: non-empty result; if `package.json` exists, `npm test`. Worker saying DONE is not enough.
