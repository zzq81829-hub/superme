import { getXhsPolicy } from "./policy.js";
import { discoverOpportunities } from "./radar.js";
import { createContentObject, CONTENT_STATES } from "./contentObject.js";
import { listExperiments } from "./experiments.js";

/**
 * Strategist generates today's operational plan across accounts.
 * Decides: which account, how many, what topics, content mix, publish times, experiment tags.
 */
export function generateDailyPlan(input = {}, options = {}) {
  const targetAccounts = input.accounts || ["x_curation", "shuzhai", "personal_ip"];
  const dateStr = input.date || new Date().toISOString().slice(0, 10);
  const plannedItems = [];

  for (const acc of targetAccounts) {
    const policy = getXhsPolicy(acc, options);
    if (!policy) continue;

    const quota = input.quota?.[acc] || policy.daily_quota || 2;
    const opportunities = discoverOpportunities(acc, options);
    const activeExperiments = listExperiments({ account: acc, status: "active" }, options);

    // Pick top opportunities up to quota
    const selectedOpps = opportunities.slice(0, quota);
    const times = policy.publish_times || ["12:00", "20:00"];

    selectedOpps.forEach((opp, index) => {
      const publishTime = times[index % times.length] || "20:00";
      const exp = activeExperiments[index % activeExperiments.length] || null;

      const plannedObj = createContentObject(
        {
          account: acc,
          topic: opp.topic,
          content_type: opp.content_type,
          source: opp.source,
          status: CONTENT_STATES.PLANNED,
          publish_time: `${dateStr}T${publishTime}:00`,
          experiment_id: exp ? exp.id : null,
          topic_score: opp.topic_score,
          package: {
            title: opp.topic,
            body: "",
            hashtags: [],
            cover: null,
            images: [],
            source: opp.source,
            content_angle: opp.topic,
            experiment_id: exp ? exp.id : null
          }
        },
        options
      );

      plannedItems.push(plannedObj);
    });
  }

  return {
    date: dateStr,
    total_planned: plannedItems.length,
    accounts: targetAccounts,
    items: plannedItems,
    summary: `今日为 ${targetAccounts.length} 个账号规划了 ${plannedItems.length} 条内容，包含选题机会评分与单变量实验绑定。`
  };
}
