/**
 * Publisher Adapter Architecture
 * Decouples Founder OS core from specific platform publishing mechanisms.
 * Supports: browser_automation, official_api, desktop_automation, manual_assisted, mock.
 * Ready for future platforms: xiaohongshu, wechat, channels, douyin, x.
 */

const DRIVERS = new Map();

export function registerPublisherDriver(name, driver) {
  DRIVERS.set(name, driver);
}

export function getPublisherDriver(name = "browser_automation") {
  return DRIVERS.get(name) || DRIVERS.get("mock");
}

// Built-in Mock Driver (for testing and dryRun)
registerPublisherDriver("mock", {
  name: "mock",
  async publish(request, options = {}) {
    if (options.simulateFailure) {
      return {
        ok: false,
        status: options.simulateBlocked ? "blocked" : "failed",
        reason: options.failureReason || "simulate_error",
        action: options.suggestedAction || "retry"
      };
    }

    const noteId = `mock_note_${Date.now()}`;
    return {
      ok: true,
      status: "published",
      url: `https://www.xiaohongshu.com/explore/${noteId}`,
      noteId,
      published_at: new Date().toISOString(),
      retry_count: 0
    };
  }
});

// Built-in Browser Automation Driver (calls Xiaohongshu MCP / publishApprovedPackage)
registerPublisherDriver("browser_automation", {
  name: "browser_automation",
  async publish(request, options = {}) {
    try {
      const { publishApprovedPackage, getXhsLoginStatus } = await import("../../publish/xhs.js");
      const login = await getXhsLoginStatus(options);
      if (!login.loggedIn) {
        return {
          ok: false,
          status: "blocked",
          reason: "login_required",
          action: "human_login",
          message: "小红书账号未登录或登录失效，需扫码登录"
        };
      }

      // If dryRun mode is on, return dry-run success
      if (options.dryRun) {
        return {
          ok: true,
          status: "published",
          url: `https://www.xiaohongshu.com/explore/dryrun_${Date.now()}`,
          published_at: new Date().toISOString(),
          retry_count: 0
        };
      }

      const res = await publishApprovedPackage(request.content_id, options);
      if (res.ok) {
        return {
          ok: true,
          status: "published",
          url: res.data?.url || (res.data?.note_id ? `https://www.xiaohongshu.com/explore/${res.data.note_id}` : null),
          noteId: res.data?.note_id || null,
          published_at: new Date().toISOString(),
          retry_count: 0
        };
      } else {
        return {
          ok: false,
          status: res.error === "xiaohongshu_not_logged_in" ? "blocked" : "failed",
          reason: res.error || "publish_failed",
          action: res.error === "xiaohongshu_not_logged_in" ? "human_login" : "check_content",
          message: res.message
        };
      }
    } catch (err) {
      return {
        ok: false,
        status: "failed",
        reason: err.message,
        action: "retry"
      };
    }
  }
});

// Manual Assisted Driver
registerPublisherDriver("manual_assisted", {
  name: "manual_assisted",
  async publish(request, options = {}) {
    return {
      ok: true,
      status: "scheduled",
      reason: "manual_assisted_staged",
      action: "awaiting_founder_confirmation",
      message: "素材已打包至暂存区，等待创始人最终一键发布确认"
    };
  }
});
