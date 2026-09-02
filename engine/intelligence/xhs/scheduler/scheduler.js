import { xhsIntelligenceService } from "../services/xhsService.js";

class XhsIntelligenceScheduler {
  constructor() {
    this.timer = null;
    this.intervalMs = 6 * 60 * 60 * 1000; // 6 hours
    this.enabled = false;
  }

  start() {
    if (this.enabled) return;
    this.enabled = true;
    xhsIntelligenceService.schedulerEnabled = true;

    // Run periodically
    this.timer = setInterval(async () => {
      if (!this.enabled) return;
      try {
        console.log("[XHS Scheduler] 触发例行定时采集...");
        await xhsIntelligenceService.collectAllAccounts();
        await xhsIntelligenceService.collectPublic();
      } catch (err) {
        console.error("[XHS Scheduler] 定时采集异常:", err.message);
      }
    }, this.intervalMs);
  }

  stop() {
    this.enabled = false;
    xhsIntelligenceService.schedulerEnabled = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  toggle() {
    if (this.enabled) this.stop();
    else this.start();
    return this.enabled;
  }
}

export const xhsScheduler = new XhsIntelligenceScheduler();
