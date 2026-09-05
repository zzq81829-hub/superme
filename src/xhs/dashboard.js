import { listContentObjects, CONTENT_STATES } from "./contentObject.js";
import { getXhsPolicy } from "./policy.js";
import { listExperiments } from "./experiments.js";

/**
 * XHS Operations Executive Dashboard Aggregator.
 * Single unified snapshot for Founder OS.
 */
export async function getXhsDashboard(options = {}) {
  const allContents = listContentObjects({}, options);
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const todayContents = allContents.filter(
    (c) => (c.publish_time && c.publish_time.startsWith(todayStr)) || (c.createdAt && c.createdAt.startsWith(todayStr))
  );

  const planned = todayContents.filter((c) => c.status === CONTENT_STATES.PLANNED).length;
  const generating = todayContents.filter((c) => c.status === CONTENT_STATES.GENERATING).length;
  const qc_passed = todayContents.filter((c) => [CONTENT_STATES.APPROVED, CONTENT_STATES.SCHEDULED].includes(c.status)).length;
  const waiting_rework = todayContents.filter((c) => [CONTENT_STATES.FAILED, CONTENT_STATES.RETRYING].includes(c.status)).length;
  const scheduled = todayContents.filter((c) => c.status === CONTENT_STATES.SCHEDULED).length;
  const published = todayContents.filter((c) =>
    [CONTENT_STATES.PUBLISHED, CONTENT_STATES.METRICS_24H, CONTENT_STATES.METRICS_72H, CONTENT_STATES.LEARNED].includes(c.status)
  ).length;

  // Aggregate metrics
  let totalImpressions = 0;
  let totalViews = 0;
  let totalFavorites = 0;
  let totalLikes = 0;
  let totalGmv = 0;

  for (const c of allContents) {
    totalImpressions += c.metrics?.impressions || 0;
    totalViews += c.metrics?.views || 0;
    totalFavorites += c.metrics?.favorites || 0;
    totalLikes += c.metrics?.likes || 0;
    totalGmv += c.metrics?.gmv || 0;
  }

  const overallRpm = totalImpressions > 0 ? Math.round((totalGmv / totalImpressions) * 1000 * 100) / 100 : 0;

  // Find top content
  const sortedByEngage = [...allContents].sort((a, b) => {
    const aEngage = (a.metrics?.favorites || 0) + (a.metrics?.likes || 0);
    const bEngage = (b.metrics?.favorites || 0) + (b.metrics?.likes || 0);
    return bEngage - aEngage;
  });
  const topContent = sortedByEngage.slice(0, 3).map((c) => ({
    id: c.id,
    account: c.account,
    topic: c.topic,
    views: c.metrics?.views || 0,
    favorites: c.metrics?.favorites || 0,
    likes: c.metrics?.likes || 0,
    rpm: c.metrics?.revenue_per_thousand || 0
  }));

  // Account health / anomalies
  const anomalies = [];
  const blockedNotes = allContents.filter((c) => c.status === CONTENT_STATES.BLOCKED);
  if (blockedNotes.length > 0) {
    anomalies.push({
      type: "publish_blocked",
      message: `有 ${blockedNotes.length} 篇内容发布受阻（原因：${blockedNotes[0].publish_result?.reason || "登录失效"}），需要人工授权`,
      action: blockedNotes[0].publish_result?.action || "human_login"
    });
  }

  const activeExperiments = listExperiments({ status: "active" }, options);

  return {
    operational_status: "RUNNING",
    date: todayStr,
    summary: {
      planned_today: planned,
      generating,
      qc_passed,
      waiting_rework,
      scheduled,
      published_today: published
    },
    performance: {
      total_impressions: totalImpressions,
      total_views: totalViews,
      total_favorites: totalFavorites,
      total_likes: totalLikes,
      total_gmv: totalGmv,
      overall_rpm: overallRpm
    },
    top_content: topContent,
    active_experiments: activeExperiments.length,
    anomalies,
    founder_touches_needed: anomalies.length > 0 ? 1 : 0
  };
}
