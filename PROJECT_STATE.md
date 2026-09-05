# PROJECT_STATE

Current Phase: **Codex takeover hardening complete; ready for Shuzhai product loop**
Current Status: strict verifier E2E PASS; Claude on-demand; Grok Bot deferred; Memory ledger implemented; Approval queue implemented; DeepSeek ¥30 budget hard-cap implemented; Content three-layer & frozen publishing package implemented; ChatGPT extract bridge implemented; Secretary inbox & probe implemented.
Governance: 治理口径已与创始人问答完全对齐 (本机控制系统 AI CEO / Grok Bot 秘书 / Hermes COO)；Grok Bot 真实探测为 UNKNOWN_CONTROL_INTERFACE (canDispatch 恒为 false)。模型分配 (2026-09-03 更新)：Codex=gpt-5.6-luna(high)、Antigravity=gemini-3.8-flash(high，长周期工程与微步推理强化)、Claude 反代=claude-sonnet-4-6、Hermes/DeepSeek=DeepSeek；全员派工强制马尾辫 ponytail skill，内容生产强制执行 30 秒停留法则与 5 大打磨支柱（选题痛点优先、情绪触发、Hook 3秒生死线、即学即用、转化互动）。
Memory: 记忆账本与 ChatGPT 浏览器提取桥已落地；2026-09-03 审美与 5 支柱准则已确认为 active memory 并持久化。
Approval: 一级高风险审批队列与任务披露已落地 (五大拦截/哈希校验/改派/零自动dispatch)。
Billing: DeepSeek 每月 30 元硬闸已落地 (Hermes+DeepSeek 共账/预扣防重/到限停用与横幅提醒/登记充值非自动付款)。
Publishing: 内容三层与冻结发布包已落地；创始人批准后经本机 xhs-mcp 发小红书（未上号则停在 approved；Worker /send 仍 403）。
Secretary: 本机秘书收件箱已落地 (接收意图生成草稿任务或记忆候选/零自动dispatch/零自动confirm)。
Last Successful Test: `npm test` 116/116 pass

## Worker status

| Worker | Status | Evidence |
|--------|--------|----------|
| Hermes | READY | read-only status verifies DeepSeek provider; real bridge proof passed |
| Codex | READY | `codex login status` verifies ChatGPT; model gpt-5.6-luna (reasoning high); strict E2E task `1788162612513-cb3353` passed |
| Claude Code | ON_DEMAND | claude-sonnet-4-6 via founder-approved localhost Antigravity reverse proxy; proxy currently stopped; start Claude terminal when needed |
| Antigravity | INSTALLED | model gemini-3.8-flash (high); upgraded 2026-09-03; granular configured permissions only |
| Grok Build | READY | grok.com session verified; T4 PASS; shares `grok.exe` |
| Grok | READY | grok.com session verified; T5 PASS; shares `grok.exe` |
| Grok Bot | EXPERIMENTAL / UNKNOWN_CONTROL_INTERFACE | T6 DEFERRED |
| DeepSeek | READY | Hermes status verifies selected DeepSeek provider; T7 PASS |

## Next action

Begin the Shuzhai content loop using machine acceptance criteria. Start the Claude terminal/proxy only when a task specifically needs Claude; no login repair is required now.
