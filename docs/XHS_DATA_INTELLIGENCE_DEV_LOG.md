# XHS Data Intelligence v0.1 开发审计与记录

> 记录时间：2026-09-03  
> 负责人：Antigravity (AI Founder OS 施工执行)

---

## 1. 架构审计与当前系统结构

- **运行环境**：Windows 11, Node.js v24.18.1 (ESM), Express 5.1.0, 本地服务端口 3210。
- **内置技术优势**：Node v24 内置 `node:sqlite` 原生数据库支持（`DatabaseSync`），性能极高、零额外 C++ 编译风险，完全符合 Ponytail 极简依赖原则。
- **数据流结构**：
  - 核心业务数据维持现有的 `data/tasks/`, `data/content/packages/`, `data/reviews/` 本地 JSON / Markdown；
  - 本次 XHS 数据情报模块为纯增量时间序列模块，数据库落于 `data/intelligence/xhs.sqlite`，严格隔离，不污染也不迁移任何旧数据。
- **安全与权限边界**：
  - 维持 `POST /api/content/packages/:id/send` 403 禁用状态，全模块 100% 只读（Read-Only），绝无自动发布、评论、点赞、私信代码；
  - 账号 Session 与持久化 Profile 位于 `data/profiles/`，加入 `.gitignore`，禁止扫描与提交；
  - 敏感字段（Cookie、Token、x-s、验证码）严格从日志过滤；
  - 内置 `MockProvider`，离线/未扫码时全功能均可完备自测。

---

## 2. 模块规划与接入位置

```text
engine/
  intelligence/
    xhs/
      storage/
        db.js                 # SQLite DatabaseSync 封装与连接池管理
        schema.js             # 数据库表结构定义与迁移
      providers/
        baseProvider.js       # 抽象 Provider 接口与风控状态管理
        mockProvider.js       # 仿真/离线 Provider（完整自测用）
        creatorCenterProvider.js # 自有账号创作者中心采集（Playwright Profile 隔离）
        publicResearchProvider.js # 外部竞品/关键词/公开笔记只读研究采集
      analysis/
        metrics.js            # 统计指标、速率 Velocity 与 ViralScore 确定性算法
        brief.js              # 每日数据情报简报（回答 10 大核心问题）
      scheduler/
        scheduler.js          # 本地轻量定时采集器（默认关闭，支持按需手动与开关）
      services/
        xhsService.js         # 统一协调服务入口
      routes/
        xhsRoutes.js          # Express API 路由挂载
```

接入点：
- 在 `server.js` 仅增加一行挂载：`app.use("/api/intelligence/xhs", xhsRouter);`
- 在 `public/index.html` 增设“小红书数据情报”专属面板（4 个 Tab：我的账号、竞品雷达、AI 简报、系统状态）
- 在 `public/app.js` 与 `public/style.css` 接入交互控制器，严格实现 loading / progress / success / failure / retry 状态反馈。

---

## 3. 风险与控制策略

1. **自动发布风险**：
   - 控制：全模块不包含任何发布动作，`/send` 保持 403，完全切断发布通路。
2. **小红书平台风控与验证码**：
   - 控制：低频顺序执行、请求限流与指数退避、CAPTCHA 与滑块检测；一旦检测到风险页，立即挂起并置为 `status: "NEED_VERIFICATION"`，提示 Founder 人工扫码，绝不暴力重试。
3. **多账号串号风险**：
   - 控制：严格隔离 `xhs_account_1`, `xhs_account_2`, `xhs_account_3` 的存储路径（`data/profiles/xhs_account_1/` 等），互不干扰。
4. **测试不依赖扫码**：
   - 控制：通过 MockProvider 注入多日多阶段 Snapshot（如 100 → 500 → 3000 播放增长），保证在任何未扫码环境下均可 100% 验证分析引擎、Velocity、ViralScore、API 与 UI。
