# ChatGPT「提取本次对话」浏览器桥 (ChatGPT Extract Bridge)

## 1. 定位与原则
- **公司面板为唯一运营中心**：所有执行、账本、记忆与决策汇聚于 Founder OS 控制台 (`:3210`)；
- **ChatGPT 仅作思考空间**：不作为指令入口或权威记忆库；
- **零全文留存**：系统仅在内存中提炼创始人实质性判断/决策，**绝不落盘保存完整聊天记录**；
- **纯本地规则驱动**：禁止调用 OpenAI / Anthropic / xAI / Gemini 官方付费 API 做抽取；
- **候选确认机制**：所有提炼结果仅生成待确认候选卡片，必须经创始人一键确认后方可入库生效。

---

## 2. 极简安装步骤

1. **安装浏览器扩展**：
   - 在 Chrome / Edge / Firefox 中安装 [Tampermonkey (油猴脚本管理器)](https://www.tampermonkey.net/)。

2. **安装提取脚本**：
   - 确保 Founder OS 本机服务已启动 (`npm start`)；
   - 在浏览器中打开：
     ```
     http://127.0.0.1:3210/bridge/chatgpt-extract.user.js
     ```
   - Tampermonkey 会自动弹出安装界面，点击「**安装 (Install)**」。

3. **打开 ChatGPT 即可使用**：
   - 访问 `https://chatgpt.com/` 或 `https://chat.openai.com/`；
   - 页面右下角会出现「**⚡ 提取本次对话到 Founder OS**」悬浮按钮；
   - 在有深度思考或决策产生的对话中，点击按钮即可一键将你的观点提炼并送入本机候选队列。

---

## 3. Token 与安全配置

- 配置文件位置：`config.json`
- 字段说明：
  ```json
  "bridge": {
    "enabled": true,
    "token": "change-me",
    "allowedOrigins": [
      "https://chatgpt.com",
      "https://chat.openai.com"
    ]
  }
  ```
- **Token 保护**：若修改了 `config.json` 中的 `token`，请在 Tampermonkey 脚本顶部 `CONFIG.token` 同步修改；
- **Scoped CORS**：服务端仅对 `/api/bridge/chatgpt/extract` 对 `allowedOrigins` 开放跨域请求，其余控制台 API 严格隔离。
