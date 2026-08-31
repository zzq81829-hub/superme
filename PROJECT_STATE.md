# PROJECT_STATE

Current Phase: **Codex takeover hardening complete; ready for Shuzhai product loop**
Current Status: strict verifier E2E PASS; Claude on-demand; Grok Bot deferred; Memory ledger implemented; Approval queue implemented; DeepSeek ¥30 budget hard-cap implemented; Content three-layer & frozen publishing package implemented; ChatGPT extract bridge implemented; Secretary inbox & probe implemented.
Governance: 治理口径已与创始人问答完全对齐 (本机控制系统 AI CEO / Grok Bot 秘书 / Hermes COO)；Grok Bot 真实探测为 UNKNOWN_CONTROL_INTERFACE (canDispatch 恒为 false)。
Memory: 记忆账本与 ChatGPT 浏览器提取桥已落地 (纯本地规则提炼/零全文留存/候选确认入库/Prompt安全注入/零OpenAI API)。
Approval: 一级高风险审批队列与任务披露已落地 (五大拦截/哈希校验/改派/零自动dispatch)。
Billing: DeepSeek 每月 30 元硬闸已落地 (Hermes+DeepSeek 共账/预扣防重/到限停用与横幅提醒/登记充值非自动付款)。
Publishing: 内容三层 (素材事实/候选表达/观点卡片与许可) 与冻结发布包已落地 (SHA-256锁哈希/修改重批/待手发/恒拒自动外发)。
Secretary: 本机秘书收件箱已落地 (接收意图生成草稿任务或记忆候选/零自动dispatch/零自动confirm)。
Last Successful Test: `npm test` 81/81 pass

## Worker status

| Worker | Status | Evidence |
|--------|--------|----------|
| Hermes | READY | read-only status verifies DeepSeek provider; real bridge proof passed |
| Codex | READY | `codex login status` verifies ChatGPT; strict E2E task `1788162612513-cb3353` passed |
| Claude Code | ON_DEMAND | founder-approved localhost Antigravity reverse proxy is currently stopped; start Claude terminal when needed |
| Antigravity | INSTALLED | T3 historical real PASS; provider readiness unprobed; granular configured permissions only |
| Grok Build | READY | grok.com session verified; T4 PASS; shares `grok.exe` |
| Grok | READY | grok.com session verified; T5 PASS; shares `grok.exe` |
| Grok Bot | EXPERIMENTAL / UNKNOWN_CONTROL_INTERFACE | T6 DEFERRED |
| DeepSeek | READY | Hermes status verifies selected DeepSeek provider; T7 PASS |

## Next action

Begin the Shuzhai content loop using machine acceptance criteria. Start the Claude terminal/proxy only when a task specifically needs Claude; no login repair is required now.
