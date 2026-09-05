# Project: 书摘 / 书斋

> **顶层宪法**：本账号（社科书籍号）一切经营与生产遵守 `founder_os/CONTENT_OPERATING_SYSTEM.md`（Content OS v1.0）——本文件下述角色/标准是其落地执行层；冲突以宪法为准。
> **目标发布账号**：小红书 **「good try」**（本地 Profile: `xhs_account_1`，统一运营属地：中国·福建·厦门）。

## Mission
Turn books and knowledge into high-quality, traffic-tested Xiaohongshu content with as little founder manual operation as possible.

## Core loop: 7 角色对抗编辑部 (Adversarial Multi-Agent Engine)
系统不只做单一顺序的“拆解”，而是让 7 个角色在流水线中相互博弈、对抗质检：

1. **Researcher (事实锚定)**
   - 核心职责：原文到底说了什么？出处章节、核心论据、科学实验样本是什么？确保事实底牌坚实。
2. **Insight Miner (洞察提纯)**
   - 核心职责：全书中挖掘出最值得传播、最具启发性的 20 个锋利洞察，拒绝水账。
3. **Audience Psychologist (受众心理诊断)**
   - 核心职责：哪类人看到会疼？哪种生活处境会被击中？挖掘隐秘的愧疚、恐惧与渴望。
4. **Growth Editor (增长与 Hook 包装)**
   - 核心职责：怎么包装最容易让人停下大拇指？运用反直觉关系（越X越Y）与轻微冒犯打造 3 秒生死 Hook。
5. **Skeptic / Fact Checker (对抗性质检 · 防标题党)**
   - 核心职责：与 Growth Editor 互相打架——“等等，这个标题是不是把原观点夸大了？原材料是否真能支持这个论点？”（严格执行：情绪可放大，事实不能放大）。
6. **XHS Editor (平台化与去 AI 腔)**
   - 核心职责：去掉 AI 味、论文味与正确废话；执行“一句话成立即收刀”；适配小红书图文 6 页爆款骨架。
7. **Chief Editor (主编决策汇总)**
   - 核心职责：综合对抗博弈结果，最后只向创始人呈报：**「今天最值得发的 5 条精选题（含封面Hook + 痛点受众 + 论据）」**，创始人只需做品味勾选，无需自己憋选题。


## Near-term priority
Do not over-expand functionality.
Make the image/text output directly usable on Xiaohongshu and validate that the produced posts receive meaningful views.

## Production & Publishing Rule (已落地规则)
- 内容严格维护三层：素材事实、候选表达、观点卡片（带 understand_only / influence_or_paraphrase / attributable 许可）；
- 最终产物生成本地冻结发布包 (`data/content/packages`) 并计算 SHA-256 锁定哈希；
- 冻结包必须经创始人显式批准；批准后由控制中枢经本机 xhs-mcp 发布到小红书。
- Worker 不得自行外发。未上号时批准停留在 `approved`，扫码后点「立即发布」。

## Content & Aesthetic Standards (2026-09-03 创始人准则)
- **30秒停留法则与 5 大打磨支柱**：
  1. 选题：痛点/恐惧/渴望先行，以书为解药，非单纯解析书；
  2. 情绪：好奇、共鸣、焦虑、反常识、被理解、身份认同；
  3. Hook：封面大标 + 第一页 + 前 3 句完成 3 秒留存；
  4. 价值：即学即用交付，拒绝大而全总结，追求“明天就能用”；
  5. 转化：收藏行动清单、评论区争议引流、关注与深度信任建立。
- **视觉排版铁律**：
  - 封面：叙事绘本/油画肌理背景（视觉占幅大） + 左上米白纸质信息卡 + 红黑经典杂志层级字 + 底部半透暗调收底；
  - 构图：不对称呼吸感，避让右侧画面主体；
  - 杜绝：PPT“盒中盒”与色块生硬堆砌；
  - 留白：四边留白 ≥110px，正文行距 ≥1.7，单页信息块 ≤4 个。


## Future modules
- Book Intelligence / memory
- Trend Radar
- MY_BRAIN
- IP Layer
- content quality control
- scheduled publishing
- analytics feedback loop
