import { listContentObjects } from "./contentObject.js";

/**
 * 6-Factor Opportunity Scoring Formula:
 * (需求强度 × 与账号匹配度 × 传播潜力 × 商业价值 × 新鲜度) ÷ 制作成本
 * Normalized to 0 ~ 100 integer.
 */
export function calculateTopicScore(factors = {}) {
  const demand = Math.max(1, Math.min(10, Number(factors.demand || 5)));
  const accountMatch = Math.max(1, Math.min(10, Number(factors.accountMatch ?? factors.account_match ?? 5)));
  const virality = Math.max(1, Math.min(10, Number(factors.virality || 5)));
  const commercialValue = Math.max(1, Math.min(10, Number(factors.commercialValue ?? factors.commercial_val ?? 5)));
  const freshness = Math.max(1, Math.min(10, Number(factors.freshness || 5)));
  const productionCost = Math.max(1, Math.min(10, Number(factors.productionCost ?? factors.production_cost ?? 5)));

  // Raw product of 5 factors: 1^5 to 10^5 = 1 to 100,000. Divided by cost (1 to 10): 0.1 to 100,000.
  // Geometric mean scaling to a 0~100 score:
  const geometricMean = Math.pow(demand * accountMatch * virality * commercialValue * freshness, 1 / 5);
  // Cost penalty factor: cost 1 gives 1.1x boost, cost 10 gives 0.6x penalty
  const costModifier = 1.15 - (productionCost - 1) * 0.055;
  const score = Math.round(Math.min(100, Math.max(1, (geometricMean / 10) * 100 * costModifier)));

  return {
    score,
    factors: {
      demand,
      accountMatch,
      virality,
      commercialValue,
      freshness,
      productionCost
    },
    isHighValue: score >= 75
  };
}

/**
 * Radar discovers opportunities tailored for the 3 accounts:
 * 1. x_curation (Gold chance): Overseas X signals, life hacks, facts vs hype
 * 2. shuzhai (good try): Psychology, behavioral economics, anti-hustle, cognitive models
 * 3. personal_ip (枳子8): Founder lessons, solopreneur operational loops, candid business truth
 */
export function discoverOpportunities(account = "shuzhai", options = {}) {
  const recent = listContentObjects({ account }, options);
  const recentTopics = new Set(recent.map((c) => c.topic));

  const candidatePools = {
    x_curation: [
      {
        topic: "硅谷高管都在用的10个极简习惯，哪些真管用？",
        content_type: "观点型",
        source: "x_tweet",
        factors: { demand: 9, accountMatch: 9, virality: 9, commercialValue: 7, freshness: 9, productionCost: 3 }
      },
      {
        topic: "海外热议：为什么效率工具反而让你越来越穷？",
        content_type: "观点型",
        source: "x_tweet",
        factors: { demand: 8, accountMatch: 9, virality: 8, commercialValue: 8, freshness: 8, productionCost: 4 }
      },
      {
        topic: "变富的底层逻辑？X热帖逐条求真避坑指南",
        content_type: "观点型",
        source: "x_tweet",
        factors: { demand: 9, accountMatch: 10, virality: 9, commercialValue: 8, freshness: 9, productionCost: 3 }
      },
      {
        topic: "每天睡4小时真的可行吗？外网硬核实测辟谣",
        content_type: "知识型",
        source: "x_tweet",
        factors: { demand: 7, accountMatch: 8, virality: 7, commercialValue: 6, freshness: 7, productionCost: 3 }
      }
    ],
    shuzhai: [
      {
        topic: "为什么越努力的人越容易陷入效率陷阱？",
        content_type: "观点型",
        source: "book+trend",
        factors: { demand: 9, accountMatch: 10, virality: 9, commercialValue: 8, freshness: 8, productionCost: 4 }
      },
      {
        topic: "《金钱心理学》：真正拉开贫富差距的3个非理性习惯",
        content_type: "知识型",
        source: "book+trend",
        factors: { demand: 8, accountMatch: 9, virality: 8, commercialValue: 9, freshness: 7, productionCost: 5 }
      },
      {
        topic: "卡尼曼决策清单：遇到这3种直觉反应，立刻停下来",
        content_type: "观点型",
        source: "book+trend",
        factors: { demand: 8, accountMatch: 9, virality: 7, commercialValue: 7, freshness: 8, productionCost: 4 }
      },
      {
        topic: "查理·芒格穷查理宝典：普通人最重要的逆向思维",
        content_type: "知识型",
        source: "book+trend",
        factors: { demand: 8, accountMatch: 8, virality: 8, commercialValue: 8, freshness: 7, productionCost: 5 }
      }
    ],
    personal_ip: [
      {
        topic: "我把公司业务交给AI自主跑了3天，真实的成本与教训",
        content_type: "观点型",
        source: "founder_notes",
        factors: { demand: 10, accountMatch: 10, virality: 9, commercialValue: 10, freshness: 10, productionCost: 4 }
      },
      {
        topic: "一个人就是一家AI公司：从接需求到复盘的全闭环拆解",
        content_type: "观点型",
        source: "founder_notes",
        factors: { demand: 9, accountMatch: 10, virality: 9, commercialValue: 9, freshness: 9, productionCost: 4 }
      },
      {
        topic: "为什么我不建议普通人买那些花里胡哨的AI课？",
        content_type: "观点型",
        source: "founder_notes",
        factors: { demand: 9, accountMatch: 9, virality: 9, commercialValue: 8, freshness: 8, productionCost: 3 }
      }
    ]
  };

  const pool = candidatePools[account] || candidatePools.shuzhai;
  return pool
    .filter((cand) => !recentTopics.has(cand.topic))
    .map((cand) => {
      const scored = calculateTopicScore(cand.factors);
      return {
        ...cand,
        topic_score: scored.score,
        factors: scored.factors,
        isHighValue: scored.isHighValue
      };
    })
    .sort((a, b) => b.topic_score - a.topic_score);
}
