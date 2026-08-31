# Project: 书摘 / 书斋

## Mission
Turn books and knowledge into high-quality, traffic-tested Xiaohongshu content with as little founder manual operation as possible.

## Core loop
Book
-> parse / understand
-> select angle
-> optionally match current trend
-> write content
-> inject founder IP layer
-> generate/layout visuals
-> schedule/publish
-> collect performance
-> improve next selection.

## Near-term priority
Do not over-expand functionality.
Make the image/text output directly usable on Xiaohongshu and validate that the produced posts receive meaningful views.

## Production & Publishing Rule (已落地规则)
- 内容严格维护三层：素材事实、候选表达、观点卡片（带 understand_only / influence_or_paraphrase / attributable 许可）；
- 最终产物生成本地冻结发布包 (`data/content/packages`) 并计算 SHA-256 锁定哈希；
- 冻结包必须经创始人显式批准，批准后进入 `ready_manual` 供线下手工发帖；
- **系统绝不自动发布到外部平台**。

## Future modules
- Book Intelligence / memory
- Trend Radar
- MY_BRAIN
- IP Layer
- content quality control
- scheduled publishing
- analytics feedback loop
