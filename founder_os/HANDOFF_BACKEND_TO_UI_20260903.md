# Backend → UI Handoff · 2026-09-03

## 1. 前端可调用的接口

- `POST /api/secretary/chat`：秘书对话；仍是对话，不自动越过审批。
- `POST /api/secretary/work`：把 Founder 一句话登记为现有 Task。低风险自动进入既有调度；高风险返回 `awaiting_approval`。
- `POST /api/secretary/chat/:turnId/to-work`：把已保存的 Founder 聊天消息直接送入同一 Task 工作流。
- `GET /api/secretary/brief`：只读汇总任务、审批、报告、已验收产物、Worker 状态、候选和本地交付队列。
- `GET /api/secretary/files`：读取文件 Registry。
- `GET /api/secretary/files/:fileId/download`（兼容 `/api/files/:fileId/download`）：按 Registry `fileId` 下载已验收文件；手机口令只放 `X-OS-Phone-Token` 请求头。
- `POST /api/tasks/:taskId/approve`、`POST /api/tasks/:taskId/reject-approval`：Founder 审批入口。
- `POST /api/tasks/:taskId/reviews`：提交 `praise`、`issue` 或 `note`；反馈会进入 learning event，并生成待确认候选，不会静默改写已确认记忆。

## 2. 请求与响应最小示例

### 一句话 → 工作

```json
POST /api/secretary/work
{"text":"审查 superme 后端安全问题","attachments":[{"rootName":"Desktop","relativePath":"superme/server.js"}]}
```

```json
{"ok":true,"requiresApproval":false,"task":{"id":"...","status":"queued","riskLevel":"low"}}
```

高风险示例会返回 `requiresApproval: true`、`status: "awaiting_approval"`、`approvalStatus: "pending"`，任何 Agent 都不能自动批准。

### 只读秘书简报

```json
GET /api/secretary/brief
```

```json
{"ok":true,"brief":{"runningTasks":[],"pendingApprovals":{"count":0,"items":[]},"recentDeliverables":[],"founderDecisionsRequired":{"totalPending":0},"deliveryOutbox":[]}}
```

### 领取文件

```http
GET /api/secretary/files/fil_xxx/download
X-OS-Phone-Token: <phone-token>
```

客户端不能传绝对路径或 URL 查询参数 token；文件必须已登记、已验收、路径在项目根目录内、无符号链接越权且哈希未变化。

### Founder 反馈

```json
POST /api/tasks/task_x/reviews
{"kind":"praise","text":"这一版结构对了"}
```

响应包含 `review` 和 `candidate`（候选写入失败时为 `null`），候选仍须 Founder 在 Memory Ledger 中确认。

## 3. Founder 在界面上应该看到什么

- “一句话开始工作”入口：低风险显示已排队/执行，高风险明确显示“等待 Founder 审批”。
- 简报页能看到任务进度、审批队列、报告元数据、已验收产物和本地交付队列。
- 产物卡片使用 `fileId` 领取；哈希变化、未验收或越权路径显示阻断原因。
- 反馈后出现“待确认学习候选”，而不是直接改变已确认记忆。
- Grok Bot 没有主动回连证据时显示“未接入/仅可打开”，不显示“已接入”。

## 4. 测试总数与结果

全量 `npm test` 以当前工作树实测为准。审查后修复了 brief 只读、下载 GET 不写入口令、报告摘要与口令文档泄漏；勿把过时的 159/163 当作现状。

## 5. 尚未验证的真实风险

- 未用实体手机完成一次带真实请求头的下载回归；仅完成本地 HTTP 测试。
- 外部 `Grok Bot.exe` 仍没有主动回连证据，实际接入保持未确认。
- UI 尚未在本轮修改；以上接口需由前端接线。
- 真实 Worker 额度、登录和网络可用性仍以运行时状态为准。
