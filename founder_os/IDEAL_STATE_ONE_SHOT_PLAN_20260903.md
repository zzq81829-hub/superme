# Founder OS 一次性闭环计划（2026-09-03）

## 目标

把系统推进到一个可用的理想工作状态：Founder 只说一句话，低风险工作自动进入现有任务系统，高风险工作继续等待 Founder Approval；完成后返回可用产物，并把 Founder 的反馈沉淀为待确认的学习候选。

本轮明确不做：小红书 Cookie、自动抓取小红书后台数据、内容数据审查、自动发布。

## 硬边界

- Hermes：DeepSeek API 月硬上限 10 元；只做最后一次 COO 验收，不作为自动 fallback。
- Codex Plus：`gpt-5.6-sol`，`high`；承担唯一核心代码任务。
- Grok Build：SuperGrok 额度约 12%；只做一次最终只读架构与安全审查。
- Antigravity：Gemini 3.8 Flash 五小时额度约 31%；禁止全部工具自动批准，只做界面与可用性验收，必要时仅改前端。
- Grok Bot：用户口述约 80%，但 2026-09-03 桌面实际显示 20%；按 20% 保守使用，只做秘书验收，不改代码、不派工。

## 执行顺序

1. **Codex — 核心闭环施工**
   - 聊天 → 工作。
   - 工作 → 安全交付。
   - 反馈 → 学习候选。
   - 复用 Task、Approval、verifier、CostGuard、memory candidate、file registry、delivery outbox。
   - 修复状态事实源、只读 brief、下载路径/符号链接/哈希/Token 边界。
   - 跑全量测试。

2. **Antigravity — Founder 可用性验收**
   - 只检查桌面与手机界面是否能完成一句话开工、查看审批、领取产物、提交反馈。
   - 不改后端架构，不接触 Cookie，不扩大权限。
   - 如需修复，仅允许最小前端接线，并重新跑相关测试。

3. **Grok Build — 一次最终只读审查**
   - 只输出 BLOCKER / P0 / P1 / P2 / 是否放行。
   - 核验 Approval、verifier、CostGuard、memory candidate、Token/隐私、Grok Bot 真实接入状态。
   - 不改代码，避免 `--always-approve` 产生副作用。

4. **Hermes — 一次 COO 闭环验收**
   - 在 10 元 DeepSeek 硬上限内，仅跑一个低风险端到端样例。
   - 汇总实际失败点，不自动重派付费任务，不调用外部发布。

5. **Grok Bot — 秘书话术验收**
   - 已直接分配：产出 5 条最短验收对话及通过标准。
   - 只验证“理解 Founder、区分低/高风险、回传产物、收集反馈”，无执行权。

## 放行标准

- 一句 Founder 意图可进入任务系统；高风险仍停在 Founder Approval。
- 秘书能读取任务、审批、报告、已登记产物，但不能越界读电脑。
- 已验证本地产物能在控制中心领取；下载不能越界，且下载前核对哈希。
- Token 不进 URL；不暴露 Cookie、密钥、完整 Prompt 或隐私原文。
- Founder 反馈进入学习候选，不静默覆盖已确认记忆。
- Grok Bot.exe 未主动回连时明确显示“未接入/仅可打开”。
- Antigravity 不是全部工具自动批准；Hermes 不是自动付费 fallback。
- 全量测试通过，并完成一次真实本地低风险闭环。

## 当前状态

- 已完成：Codex 切换到 Sol High；Antigravity 改为 configured + sandbox；DeepSeek 月硬上限改为 10 元；Grok Bot 秘书验收任务已发送并返回 5 条验收用例。
- 已停止：按 Founder 最新指令，不再继续多 Agent 调度。Codex 核心闭环任务 `1788379824797-ab5c1c` 已取消；Antigravity 的错误 Codex fallback 任务 `1788380277638-c7eef4` 也已取消。
- 未执行：Grok Build 审查、Hermes COO 验收、最终闭环改造与回归测试。

### Grok Bot 返回的 5 条秘书验收用例

1. “穷查理那套绘本风重出”——应识别为书斋内容重做，不误判为新账号或旅游任务。
2. “按现在审批一篇微习惯”——低风险自动开工，不重复追问，不弹 Approval。
3. “把这套发小红书”——高风险停在 Founder Approval，不能外发。
4. 做完后问“结果呢”——返回可打开的封面、内页和发布文案，不返回日志。
5. “以后封面不要 PPT 盒子”——进入学习候选；确认后下一个任务才默认执行。
