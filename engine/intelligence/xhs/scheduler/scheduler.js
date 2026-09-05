import { xhsIntelligenceService } from "../services/xhsService.js";
import { CircadianGuard } from "../services/circadianGuard.js";

class XhsIntelligenceScheduler {
  constructor() {
    this.timer = null;
    this.enabled = false;
    this.nextRunAt = null;
  }

  scheduleNext() {
    if (!this.enabled) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const delayMs = CircadianGuard.getNextScheduledDelayMs();
    this.nextRunAt = new Date(Date.now() + delayMs).toISOString();
    console.log(`[XHS Scheduler] 拟人作息已对齐，下次采集时间: ${new Date(this.nextRunAt).toLocaleString()} (延迟 ${(delayMs / 60000).toFixed(1)} 分钟)`);

    this.timer = setTimeout(async () => {
      if (!this.enabled) return;
      try {
        const guard = CircadianGuard.checkCanCollect(false);
        if (!guard.allowed) {
          console.log(`[XHS Scheduler] ${guard.reason}`);
        } else {
          console.log(`[XHS Scheduler] 触发拟人时序采集 (${guard.activeWindow || "日间时段"})...`);
          await xhsIntelligenceService.collectAllAccounts(false, false);
          await xhsIntelligenceService.collectPublic([], false, false);
        }
      } catch (err) {
        console.error("[XHS Scheduler] 定时采集异常:", err.message);
      } finally {
        this.scheduleNext();
      }
    }, delayMs);
  }

  start() {
    if (this.enabled) return;
    this.enabled = true;
    xhsIntelligenceService.schedulerEnabled = true;
    this.scheduleNext();
  }

  stop() {
    this.enabled = false;
    xhsIntelligenceService.schedulerEnabled = false;
    this.nextRunAt = null;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log("[XHS Scheduler] 定时采集已停止");
  }

  toggle() {
    if (this.enabled) this.stop();
    else this.start();
    return this.enabled;
  }

  getNextRunInfo() {
    return {
      enabled: this.enabled,
      nextRunAt: this.nextRunAt
    };
  }
}

export const xhsScheduler = new XhsIntelligenceScheduler();

