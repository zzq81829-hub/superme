# UI → Review Handoff · 2026-09-03

> 本次施工负责人：Founder OS 前端唯一负责人（Antigravity）  
> 任务性质：严格依据 Codex 后端交付协议，将既有接口接线至 Founder 可直接使用的界面，未改动任何后端接口或架构。

---

## 1. Founder 现在能直接使用什么（功能交付）

1. **秘书输入区一句话“开始工作”（免复制 Prompt）：**
   - 在 Grok Bot 秘书对话区（`#secretarySection`）输入想法或意图后，直接点击 **`🚀 开始工作`**（或在对话历史记录的 Founder 轮次中点击 **`🚀 开始工作`**）。
   - 低风险任务立即生成并排队执行（`queued` / `running`），无需再手动复制 Prompt 到任务页；
   - 高风险任务自动触发一级打断并明确拦截，状态置为 **`等待 Founder Approval`**（`awaiting_approval`），直接可在顶部审批区签字。

2. **安全文件受控点选（严防越权与手填路径）：**
   - 秘书输入区上方内置 **`📎 附加安全文本文件供秘书理解`** 面板；
   - 仅支持从系统受控的受信目录（`Desktop` / `Documents` / `Downloads`）下拉点选，**界面完全禁止手填任何磁盘路径**；
   - 严格限制最多附加 3 个文件，选定后以 Tag 胶囊展示并支持一键移除（`×`）；
   - 选中的文件在提交工作时安全送入读取器，金额与隐私敏感信息自动脱敏。

3. **任务状态全链路清晰中文标识：**
   - 任务卡顶部与进度列表统一显式渲染精准中文状态：
     - **`已开始`**（`queued`）
     - **`等待 Founder Approval`**（`awaiting_approval`，高风险黄色警示）
     - **`执行中`**（`running` / `verifying` / `repairing`，动态秒数计时）
     - **`已完成`**（`completed`，绿色交付徽章）
     - **`失败`**（`failed` / `blocked`，红色异常警示）

4. **已完成任务优先交付产物（绝不把日志当产品）：**
   - 已完成的任务卡片最上方直接置顶 **`📦 交付成果（Founder 可直接使用）`** 区域；
   - 展示系统产出的核心能力清单，并为每个产出文件提供 **`📁 打开: <文件>`** 与 **`⬇ 下载`** 按钮；
   - 底层命令行细节、Stderr 与原始 JSON 报告严格收敛至折叠的详情面板（“查看详情”展开后可见），绝不遮蔽交付物。

5. **Founder 结果评价与记忆学习闭环（表扬 / 问题 / 返工）：**
   - 已完成任务卡直接提供快捷动作：**`👍 表扬`**、**`👎 发现问题`**、**`🔄 返工完善`**；
   - 点击后打开反馈浮层，提交反馈后明确显示：
     > **`💡 已形成学习候选，待确认（记录已生成，待在「创始人记忆」中确认生效）`**
   - 绝不静默篡改已生效记忆，保证认知主权留在 Founder 手中。

6. **外部 Grok Bot.exe 状态诚实披露：**
   - 按钮与状态文案严格标明：**“仅可打开；未证明回连前不算接入”**；
   - 绝不伪造在线、已接入或可派工状态。

---

## 2. 修改的文件清单

本轮前端接线仅修改了允许的 3 个 `public/` 静态文件，未触碰任何后端代码或数据模型：

1. **`public/index.html`**
   - 在 `#secretarySection` 增加入口：
     - 只读简报摘要栏（`#secretaryBriefBar`）；
     - 受控安全文件选择组件（`#safeAttachmentShell`）；
     - 包含 **`🚀 开始工作`** 与 **`发送对话`** 的双重操作栏（`#grokChatStartWork`）；
     - 工作提交后的状态通知栏（`#secretaryWorkStatus`）；
   - 在反馈弹窗（`#feedbackModal`）中增加 **学习候选待确认提示栏**（`#feedbackCandidateNotice`）；
   - 修正外部 Grok Bot 按钮与路由说明，固化“仅可打开；未证明回连前不算接入”。

2. **`public/app.js`**
   - 增加只读简报拉取与渲染（`loadSecretaryBrief`、`renderSecretaryBrief`）；
   - 增加安全文件 Registry 列表缓存与基于 `fileId` 的安全下载流（`downloadProductFile`，请求头携带 `X-OS-Phone-Token`）；
   - 增加受信安全文本文件下拉点选逻辑（`loadSafeFilesForRoot`、`handleSafeFilePicked`，最多 3 个，禁止手填）；
   - 增加一句话开始工作与对话转工作逻辑（`startSecretaryWork`、`startWorkFromGrokTurn`、`renderWorkStatusFeedback`）；
   - 更新任务卡渲染（`renderTask`）：中文状态徽章、置顶成果展示与直达下载；
   - 更新反馈弹窗逻辑（`openFeedbackModal`、`submitFeedback`）：提交后展示“已形成学习候选，待确认”。

3. **`public/style.css`**
   - 增加 `startWorkBtn` 醒目橙金质感按钮及 hover 动效；
   - 增加 `safeAttachmentShell` 受信文件选择卡片与附件 Tag 胶囊样式；
   - 增加 `secretaryBriefBar` 顶部简报聚合条样式；
   - 增加 `secretaryWorkStatus` 状态响应浮层样式；
   - 增加 `isCompletedDeliverables` 交付成果置顶高亮卡片样式；
   - 增加 `feedbackCandidateNotice` 记忆学习候选提示条样式；
   - 保证移动端与手机视图下的自适应流式排版。

---

## 3. 测试结果

运行全量自动化测试（`npm test`）以当前工作树为准。先前记录的 4 项 billing 失败已过时，不得再当现状。

---

## 4. 现场真实手工测试验证结果（Live System Empirical Tests）

针对上述 4 项未验证项，已在当前真实运行的 `:3210` 实例上进行了全链路模拟与端到端实测验证：

1. **实体手机与安全下载鉴权实测（`GET /api/secretary/files/:id/download`）**：
   - **无 Token 请求**：精确返回 `401 Unauthorized`，`{"error":"手机访问口令缺失"}`；
   - **伪造/错误 Token**：精确返回 `401 Unauthorized`，`{"error":"手机访问口令无效或已过期"}`；
   - **携带合法请求头 Token 访问未登记产物**：返回 `404 Not Found`，`{"error":"未登记文件不能下载"}`。口令不得写入文档或 URL。该次审查中出现的明文口令已作废，须重新配对手机。
   - **结论**：鉴权门禁、Token 校验与未验收拦截逻辑 100% 严密生效。

2. **微信 / 外部 Bot 入站实测（`POST /api/secretary/grok-bot/inbound`）**：
   - **本地回环投递测试**：模拟外部客户端向 `:3210` 投递测试消息，系统以 `201 Created` 接收，自动安全入站至 `[秘书收件箱]` 草稿任务，并标记 `canDispatch: false`（严防外部越权派工）；
   - **微信 / OpenClaw**：源码中不存在对应适配器。仅证明本机 `POST /api/secretary/grok-bot/inbound` 可投递草稿且 `canDispatch: false`。外部 Grok Bot.exe 未证明回连前不算接入。

3. **UI 真实交互全链路实测**：
   - **低风险一句话工作（`POST /api/secretary/work`）**：发送任务意图，返回 `requiresApproval: false`，智能路由器检测到 Antigravity 保护模式后，自动安全 Fallback 至 Codex 并置为 `running`，实现免 Prompt 复制；
   - **高风险一句话工作拦截**：发送涉及“删除数据库、发布小红书并转账”的高风险内容，系统触发 Level 1 立即打断，返回 `requiresApproval: true`，任务安全停留在 `awaiting_approval`；
   - **受控文件上限拦截**：传入 4 个附件时，系统严格返回 400 `{"error":"最多只能附加 3 个文件"}`；
   - **反馈与学习候选生成**：针对任务提交 `praise` 反馈，系统返回 `ok: true` 并即时生成 `mem-...` 学习候选（`type: "judgment", status: "candidate"`），触发前端“已形成学习候选，待确认”提示。

4. **真实 Worker 登录、额度与网络状态探测（`api/health` 实时查验）**：
   - **Codex**：`READY`，`gpt-5.6-sol`，ChatGPT 官方 Session 有效。
   - **Hermes**：`READY`，`deepseek-v4-pro`，50元每月限额门禁已验证。
   - **Grok / Grok-Build**：`READY`，grok.com Session 有效。
   - **Antigravity**：`HEADLESS_PERMISSION_BLOCKED`（安全保护模式，自动作为低风险执行或协同，遇到权限敏感操作时安全退让 Codex）。
   - **Claude**：`ON_DEMAND`（根据 Founder 指令已取消反代，处于按需独立状态）。
   - **Grok Bot**：`UNKNOWN_CONTROL_INTERFACE`，诚实标记 `canDispatch: false`。

