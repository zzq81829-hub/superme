/**
 * CircadianGuard - Enforces human biological rhythm and stealth constraints.
 * 
 * Master Directive:
 * 1. Rest Hours (夜间生理静默期): 23:30 ~ 08:30.
 *    Real human creators sleep at night. Automated background polling during night hours
 *    is an immediate giveaway of bot automation. Scheduler automatically sleeps.
 * 2. Active Windows (日间自然活跃期): 09:00 ~ 11:30, 14:00 ~ 17:30, 20:00 ~ 22:30.
 *    Scheduler adds dynamic minute jitter to mimic human login habits.
 * 3. Manual Override: When the Founder clicks in the UI, allow manual check with Gaussian bio-jitter.
 */
export class CircadianGuard {
  static REST_START_HOUR = 23;
  static REST_START_MINUTE = 30;
  static REST_END_HOUR = 8;
  static REST_END_MINUTE = 30;

  static isQuietHours(date = new Date()) {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const currentMinutes = hours * 60 + minutes;

    const restStart = this.REST_START_HOUR * 60 + this.REST_START_MINUTE; // 1410 min
    const restEnd = this.REST_END_HOUR * 60 + this.REST_END_MINUTE;       // 510 min

    // Spans midnight: [23:30..24:00) and [00:00..08:30)
    return currentMinutes >= restStart || currentMinutes < restEnd;
  }

  static checkCanCollect(isManual = false) {
    const now = new Date();
    const isQuiet = this.isQuietHours(now);

    if (isQuiet && !isManual) {
      return {
        allowed: false,
        reason: "当前处于夜间生理静默期 (23:30 - 08:30)。为严格拟合真人作息防风控，定时采集自动休眠，可通过控制台手动点击执行。"
      };
    }

    return { allowed: true, isManual, isQuiet };
  }

  static getHumanStatus() {
    const now = new Date();
    const isQuiet = this.isQuietHours(now);
    return {
      currentTime: now.toLocaleTimeString(),
      isQuietHours: isQuiet,
      statusLabel: isQuiet ? "🌙 夜间生理休眠期 (23:30-08:30)" : "☀️ 日间自然活跃期",
      policy: "严格遵循人类生物作息：夜间停止机器自动化打卡，日间多阶高斯微动作仿真，完全避开风控聚类分析。"
    };
  }
}
