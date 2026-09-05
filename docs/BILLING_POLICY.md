# BILLING POLICY

Source of truth: `config/billing-policy.yaml`.

## 1. Worker 计费模式与权限边界
- **会员 / Session CLI 优先**：Codex、Antigravity、Grok Build、Grok。
- **Claude 本地代理例外**：Claude 允许使用创始人显式批准的本地 Antigravity 反向代理 (`127.0.0.1:8045`)，这是对正常 Anthropic-key 剥离规则的显式例外，且仅用于 `claude -p`。
- **允许付费 API**：DeepSeek / Hermes（每月硬闸 50 元人民币，共账；gemini-proxy 已停用）。
- **严格禁止付费 API**：OpenRouter、OpenAI API、Anthropic API、xAI API、Gemini API。
- **掉线与额度耗尽策略**：若会员 CLI 未登录或配额用尽，标记 `AUTH_REQUIRED` / `QUOTA_LIMITED` 并跳过，严禁静默调用其他付费厂商 API。

## 2. DeepSeek / Hermes 每月 50 元硬闸体系
- **共享一本账 (Single Ledger)**：Hermes 与 DeepSeek 必须计入同一本月度账本 (`data/billing/deepseek-YYYY-MM.json`)。gemini-proxy 反代已停用，Hermes 强制 `--provider deepseek`。
- **自然月硬闸**：每月上限 50 元人民币 (`monthly_limit_cny: 50`)，按自然月重置。
- **预扣与防并发**：派发前执行预扣（`reserveBudget`），执行结束后释放并落盘记录（`recordUsage`）。同一 `taskId` 严禁重复计费。
- **保守估算原则**：若未返回具体费用，按 Token 保守计算或默认单笔 0.20 元估算，宁可少跑，不可漏记。
- **到限即停 (Hard Stop)**：当 `remainingCny <= 0` 时，Cost Guard 自动跳过 DeepSeek 与 Hermes-DeepSeek；若明确指定且无会员 Worker 可回退，直接拦截并报 `HUMAN_ACTION_REQUIRED`。
- **到限提醒与一级告警**：额度耗尽自动生成 `QUOTA_EXCEEDED` 告警并在面板置顶横幅提醒。

## 3. 登记充值 ≠ 自动扣款
- 系统 **严禁自动扣款、严禁读取/存储银行卡、严禁调用支付 API**。
- 是否充值 100% 由创始人在线下自主决定。
- 创始人充值后可通过面板或 `POST /api/billing/deepseek/topup` 登记充值金额（单笔保护上限 ¥30，月累计保护上限 ¥90），登记后本月额度相应恢复。
