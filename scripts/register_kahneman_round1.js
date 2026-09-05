import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createPackage, freezePackage, getPackage, updatePackage } from "../src/content/store.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const packs = [
  {
    id: "shuzhai-xhs-kahneman-lawyer-20260903",
    dir: "小红书/小红书图文_快与慢_辩护律师_20260903",
    title: "越会讲道理，越会给错误找理由",
    cta: "写下此刻一件很确定的事，标：理由还是辩护",
    experiment: {
      accountId: "shuzhai",
      source: "《思考，快与慢》书摘转述 · 系统2辩护人",
      insight: "I13 越会讲道理，越会给错误找理由",
      audience: "会自我分析、靠‘我想明白了’维持自尊的人",
      painOrDesire: "解释越圆，错得越稳",
      objective: "traffic_and_follow",
      topic: "认知自欺 / 辩护律师",
      title: "越会讲道理，越会给错误找理由",
      hookType: "轻微冒犯 + 反转（越X越Y）",
      emotion: "被揭穿、不服、想对号入座",
      contentStructure: "6页爆款骨架",
      cta: "你最近一次‘想明白了’，是真想明白，还是把直觉说圆了？",
      predictionScores: { traffic: 9, click: 9, read: 8, save: 7, discussion: 8, share: 7, follow: 9, fit: 9, evidence: 8 },
      recommendation: "Round 1 先测反常识身份钩子",
      risks: ["避免把系统2辩护写成智商越高越容易错"],
      strategyVersion: "v0",
      hypothesisIds: ["H001"]
    },
    facts: [
      { id: "fact-lawyer-01", text: "卡尼曼将认知描述为系统1与系统2两个虚构角色；系统2常为系统1的直觉写辩护词。", source: "《思考，快与慢》书中转述，本机书摘未提供页码" },
      { id: "fact-lawyer-02", text: "琳达问题演示合取谬误：更具体的故事被判成更可能。书摘未给百分比。", source: "《思考，快与慢》书中转述" }
    ],
    expressions: [
      { id: "expr-lawyer-01", text: "越会讲道理，越会给错误找理由。" },
      { id: "expr-lawyer-02", text: "你不是在思考，你在给直觉找律师。" }
    ]
  },
  {
    id: "shuzhai-xhs-kahneman-loss-20260903",
    dir: "小红书/小红书图文_快与慢_损失厌恶_20260903",
    title: "你在躲认输",
    cta: "给死磕的那件事写一条：再过这条线就停",
    experiment: {
      accountId: "shuzhai",
      source: "《思考，快与慢》前景理论与损失厌恶（金钱实验）",
      insight: "I08 你舍不得割的是怕认输",
      audience: "套牢、死磕项目、不愿离开的人",
      painOrDesire: "浮亏不卖、沉没成本加注，希望学会止损",
      objective: "save",
      topic: "止损 / 损失厌恶",
      title: "你在躲认输",
      hookType: "处境 + 恐惧",
      emotion: "疼、被说中、想收藏动作",
      contentStructure: "6页爆款骨架",
      cta: "你现在死磕的，是还有机会，还是只是不敢认输？",
      predictionScores: { traffic: 8, click: 9, read: 8, save: 9, discussion: 8, share: 7, follow: 8, fit: 9, evidence: 7 },
      recommendation: "Round 1 收藏型；用数字锚和一条今晚动作验证收藏",
      risks: ["金钱实验只能类比职场与关系，不能写成感情因果"],
      strategyVersion: "v0",
      hypothesisIds: ["H002"]
    },
    facts: [
      { id: "fact-loss-01", text: "前景理论：损失厌恶约2倍；有的赌局期望收益须达赌注约2倍才够吸引。", source: "《思考，快与慢》书中转述，金钱实验" },
      { id: "fact-loss-02", text: "亚洲疾病框架：600人，拯救/死亡表述会翻转风险偏好。书摘未给百分比。职场死磕为类比。", source: "《思考，快与慢》书中转述" }
    ],
    expressions: [
      { id: "expr-loss-01", text: "你舍不得割的，是怕认输。" },
      { id: "expr-loss-02", text: "亏一块的疼，大约要赚两块。" }
    ]
  },
  {
    id: "shuzhai-xhs-kahneman-peakend-20260903",
    dir: "小红书/小红书图文_快与慢_峰终记忆_20260903",
    title: "记忆在剪辑",
    cta: "同一段日子写两笔：当时的身体账，现在的故事账",
    experiment: {
      accountId: "shuzhai",
      source: "《思考，快与慢》体验自我、记忆自我、冰水实验与峰终定律",
      insight: "I17 你不是在生活，你在为记忆供稿",
      audience: "发九宫格、写年终、用回顾给人生打分的人",
      painOrDesire: "故事好看但体验很差，希望看清记忆剪辑",
      objective: "discussion_and_follow",
      topic: "记忆剪辑 / 峰终",
      title: "记忆在剪辑",
      hookType: "反常识处境 + 未完成问题",
      emotion: "发愣、悲哀的清醒",
      contentStructure: "6页爆款骨架",
      cta: "最近一段‘值得’的日子，是当时好过，还是结尾好看？",
      predictionScores: { traffic: 8, click: 9, read: 8, save: 7, discussion: 9, share: 8, follow: 9, fit: 9, evidence: 7 },
      recommendation: "Round 1 测存在论问题是否比工具句更能带来评论和关注",
      risks: ["不得把峰终定律收成‘所以活在当下’的鸡汤"],
      strategyVersion: "v0",
      hypothesisIds: ["H003"]
    },
    facts: [
      { id: "fact-peak-01", text: "体验自我与记忆自我；记忆自我按高潮和结尾给整段打分。", source: "《思考，快与慢》书中转述" },
      { id: "fact-peak-02", text: "冰水：60秒极冷 vs 再加30秒稍暖，事后多数人愿重复更久那轮。书摘未给样本量。", source: "《思考，快与慢》书中转述" }
    ],
    expressions: [
      { id: "expr-peak-01", text: "你记得的是故事，不是时间。" },
      { id: "expr-peak-02", text: "你不是在生活，你在为记忆供稿。" }
    ]
  }
];

const images = ["01_封面.png", "02_行为清单.png", "03_机制解释.png", "04_经典书证.png", "05_双面剖析.png", "06_结尾.png"];
const docs = ["发布文案.md", "README_审批说明.md"];

for (const spec of packs) {
  const existing = getPackage(spec.id);
  if (["approved", "published"].includes(existing?.status)) throw new Error(`Refusing to re-freeze ${spec.id} in ${existing.status} status`);
  const copyPath = path.join(root, spec.dir, "发布文案.md");
  const body = fs.readFileSync(copyPath, "utf8");
  const media = [
    ...images.map((f) => ({ kind: "image", path: `${spec.dir}/${f}` })),
    ...docs.map((f) => ({ kind: "document", path: `${spec.dir}/${f}` })),
    { kind: "document", path: "小红书/社科书籍号_第一轮试验_思考快与慢_20260903/03_Experiment_Snapshots.md" }
  ];
  if (existing) {
    updatePackage(spec.id, { experiment: spec.experiment });
  } else {
    createPackage({
      id: spec.id,
      project: "shuzhai",
      platform: "xiaohongshu",
      title: spec.title,
      body,
      layout: { templateId: "shuzhai-editorial-v1", callToAction: spec.cta },
      media,
      layers: { facts: spec.facts, expressions: spec.expressions, viewpoints: [] },
      experiment: spec.experiment
    });
  }
  const frozen = freezePackage(spec.id);
  if (frozen.status !== "awaiting_approval") {
    throw new Error(`${spec.id} expected awaiting_approval, got ${frozen.status}`);
  }
  console.log(`FROZEN ${frozen.id} status=${frozen.status} approval=${frozen.approvalStatus} hash=${frozen.payloadHash}`);
}

console.log("DONE. Did not approve. Did not publish.");
