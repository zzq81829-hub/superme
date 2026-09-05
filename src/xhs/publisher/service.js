import { getContentObject, updateContentObject, CONTENT_STATES } from "../contentObject.js";
import { getPublisherDriver } from "./adapter.js";

/**
 * Service to execute publication and query publish status.
 */
export async function dispatchPublish(request = {}, options = {}) {
  const contentId = request.content_id || request.contentId || request.id;
  if (!contentId) throw new Error("content_id is required for publishing");

  const obj = getContentObject(contentId, options);
  if (!obj) throw new Error(`Content object not found: ${contentId}`);

  // Must be APPROVED or SCHEDULED (or FAILED with retry)
  if (![CONTENT_STATES.APPROVED, CONTENT_STATES.SCHEDULED, CONTENT_STATES.FAILED].includes(obj.status)) {
    throw new Error(`Content cannot be published from status: ${obj.status} (must be APPROVED or SCHEDULED)`);
  }

  // Update status to PUBLISHING
  updateContentObject(
    contentId,
    {
      status: CONTENT_STATES.PUBLISHING,
      historyNote: "Dispatched to Publisher Adapter"
    },
    options
  );

  const driverName = request.driver || options.driver || "browser_automation";
  const driver = getPublisherDriver(driverName);

  const publishReq = {
    platform: request.platform || "xiaohongshu",
    account: request.account || obj.account,
    content_id: contentId,
    publish_time: request.publish_time || obj.publish_time || new Date().toISOString()
  };

  const res = await driver.publish(publishReq, options);

  if (res.ok && res.status === "published") {
    const updated = updateContentObject(
      contentId,
      {
        status: CONTENT_STATES.PUBLISHED,
        publish_result: {
          status: "published",
          platform: publishReq.platform,
          url: res.url,
          noteId: res.noteId || null,
          published_at: res.published_at || new Date().toISOString(),
          retry_count: obj.publish_result?.retry_count || 0,
          reason: null,
          action: null
        },
        historyNote: `Successfully published: ${res.url || "URL pending"}`
      },
      options
    );
    return { ok: true, content: updated, result: updated.publish_result };
  } else if (res.status === "blocked") {
    const updated = updateContentObject(
      contentId,
      {
        status: CONTENT_STATES.BLOCKED,
        publish_result: {
          status: "blocked",
          platform: publishReq.platform,
          url: null,
          retry_count: (obj.publish_result?.retry_count || 0) + 1,
          reason: res.reason || "login_required",
          action: res.action || "human_login",
          message: res.message
        },
        historyNote: `Publish blocked: ${res.reason} -> ${res.action}`
      },
      options
    );
    return { ok: false, content: updated, result: updated.publish_result };
  } else {
    const updated = updateContentObject(
      contentId,
      {
        status: CONTENT_STATES.FAILED,
        publish_result: {
          status: "failed",
          platform: publishReq.platform,
          url: null,
          retry_count: (obj.publish_result?.retry_count || 0) + 1,
          reason: res.reason || "unknown_error",
          action: res.action || "retry",
          message: res.message
        },
        historyNote: `Publish failed: ${res.reason}`
      },
      options
    );
    return { ok: false, content: updated, result: updated.publish_result };
  }
}

export function getPublishStatus(contentId, options = {}) {
  const obj = getContentObject(contentId, options);
  if (!obj) return null;

  return {
    content_id: obj.id,
    account: obj.account,
    topic: obj.topic,
    lifecycle_status: obj.status,
    publish_result: obj.publish_result,
    publish_time: obj.publish_time,
    history: obj.history
  };
}
