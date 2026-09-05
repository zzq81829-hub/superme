import { getContentObject, updateContentObject, CONTENT_STATES } from "./contentObject.js";

/**
 * Analyst synchronizes real metrics and handles lifecycle progression:
 * PUBLISHED -> 24H_METRICS -> 72H_METRICS
 * Strictly forbids fabricating metrics.
 */
export async function syncMetrics(input = {}, options = {}) {
  const contentId = input.content_id || input.contentId || input.id;
  if (!contentId) throw new Error("content_id is required for metrics sync");

  const obj = getContentObject(contentId, options);
  if (!obj) throw new Error(`Content object not found: ${contentId}`);

  const incoming = input.metrics || input;
  const now = new Date();

  // Normalize incoming fields
  const updatedMetrics = {
    ...obj.metrics,
    impressions: Number(incoming.impressions ?? obj.metrics.impressions ?? 0),
    views: Number(incoming.views ?? incoming.reads ?? incoming.clicks ?? obj.metrics.views ?? 0),
    clicks: Number(incoming.clicks ?? incoming.views ?? obj.metrics.clicks ?? 0),
    likes: Number(incoming.likes ?? obj.metrics.likes ?? 0),
    favorites: Number(incoming.favorites ?? incoming.collects ?? incoming.saves ?? obj.metrics.favorites ?? 0),
    comments: Number(incoming.comments ?? obj.metrics.comments ?? 0),
    shares: Number(incoming.shares ?? obj.metrics.shares ?? 0),
    follows: Number(incoming.follows ?? incoming.followersGained ?? obj.metrics.follows ?? 0),
    profile_visits: Number(incoming.profile_visits ?? incoming.profileVisits ?? obj.metrics.profile_visits ?? 0),
    dms: Number(incoming.dms ?? obj.metrics.dms ?? 0),
    leads: Number(incoming.leads ?? obj.metrics.leads ?? 0),
    products: Number(incoming.products ?? obj.metrics.products ?? 0),
    orders: Number(incoming.orders ?? obj.metrics.orders ?? 0),
    gmv: Number(incoming.gmv ?? incoming.conversions_gmv ?? obj.metrics.gmv ?? 0),
    last_synced_at: now.toISOString()
  };

  // Determine lifecycle advancement
  let nextStatus = obj.status;
  const publishedAt = obj.publish_result?.published_at ? new Date(obj.publish_result.published_at) : null;
  const elapsedHours = publishedAt ? (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60) : 0;

  if (input.stage === "72h" || elapsedHours >= 72) {
    if (obj.status === CONTENT_STATES.PUBLISHED || obj.status === CONTENT_STATES.METRICS_24H) {
      nextStatus = CONTENT_STATES.METRICS_72H;
    }
  } else if (input.stage === "24h" || elapsedHours >= 24) {
    if (obj.status === CONTENT_STATES.PUBLISHED) {
      nextStatus = CONTENT_STATES.METRICS_24H;
    }
  }

  // Attempt to sync to SQLite intelligence repository if present
  try {
    const { appendNoteSnapshot, upsertNote } = await import("../../engine/intelligence/xhs/storage/repository.js");
    upsertNote({
      noteId: obj.id,
      title: obj.package?.title || obj.topic,
      accountKey: obj.account,
      publishTime: obj.publish_result?.published_at || now.toISOString(),
      url: obj.publish_result?.url || null
    });
    appendNoteSnapshot({
      accountKey: obj.account,
      noteId: obj.id,
      impressions: updatedMetrics.impressions,
      views: updatedMetrics.views,
      likes: updatedMetrics.likes,
      favorites: updatedMetrics.favorites,
      comments: updatedMetrics.comments,
      shares: updatedMetrics.shares,
      followersGained: updatedMetrics.follows,
      source: "autonomous_analyst"
    });
  } catch {
    // Non-fatal if sqlite is unavailable in test sandbox
  }

  const updated = updateContentObject(
    contentId,
    {
      status: nextStatus,
      metrics: updatedMetrics,
      historyNote: nextStatus !== obj.status ? `Lifecycle escalated to ${nextStatus} after metrics sync` : "Metrics synchronized"
    },
    options
  );

  return {
    ok: true,
    content_id: contentId,
    status: updated.status,
    metrics: updated.metrics
  };
}
