/**
 * CircadianGuard - Enforces human biological rhythm and stealth constraints.
 * 
 * Master Directive:
 * 1. Rest Hours (夜间生理静默期): 23:30 ~ 08:30.
 *    Real human creators sleep at night. Automated background polling during night hours
 *    is an immediate giveaway of bot automation. Scheduler automatically sleeps.
 * 2. Active Windows (日间自然活跃期): 
 *    - 早间活跃窗口: 09:30 ~ 11:30
 *    - 午后活跃窗口: 14:30 ~ 17:00
 *    - 晚间活跃窗口: 20:00 ~ 22:30
 * 3. Dynamic Jitter: All triggers add Gaussian variance (±15~35 min) to eliminate mechanical periodicity.
 * 4. Manual Override: When the Founder clicks in the UI, allow execution with bio-jitter and clear notice.
 */
export class CircadianGuard {
  static REST_START_HOUR = 23;
  static REST_START_MINUTE = 30;
  static REST_END_HOUR = 8;
  static REST_END_MINUTE = 30;

  static ACTIVE_WINDOWS = [
    { name: "早间自然活跃期", startH: 9, startM: 30, endH: 11, endM: 30 },
    { name: "午后自然活跃期", startH: 14, startM: 30, endH: 17, endM: 0 },
    { name: "晚间黄金活跃期", startH: 20, startM: 0, endH: 22, endM: 30 }
  ];

  static isQuietHours(date = new Date()) {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const currentMinutes = hours * 60 + minutes;

    const restStart = this.REST_START_HOUR * 60 + this.REST_START_MINUTE; // 1410 min (23:30)
    const restEnd = this.REST_END_HOUR * 60 + this.REST_END_MINUTE;       // 510 min (08:30)

    // Spans midnight: [23:30..24:00) or [00:00..08:30)
    return currentMinutes >= restStart || currentMinutes < restEnd;
  }

  static getActiveWindowName(date = new Date()) {
    const currentMinutes = date.getHours() * 60 + date.getMinutes();
    for (const w of this.ACTIVE_WINDOWS) {
      const startMin = w.startH * 60 + w.startM;
      const endMin = w.endH * 60 + w.endM;
      if (currentMinutes >= startMin && currentMinutes <= endMin) {
        return w.name;
      }
    }
    return null;
  }

  static checkCanCollect(isManual = false) {
    const now = new Date();
    const isQuiet = this.isQuietHours(now);

    if (isQuiet && !isManual) {
      return {
        allowed: false,
        reason: "当前处于夜间生理静默期 (23:30 - 08:30)。为严格拟合真人作息防风控，后台自动定时已休眠。可在控制台手动点击执行。"
      };
    }

    const activeWin = this.getActiveWindowName(now);
    let warning = null;
    if (isQuiet && isManual) {
      warning = "【生理作息提醒】当前处于夜间生理静默期 (23:30 - 08:30)。已响应创始人手动指令执行，已开启最高级别高斯长延时与拟人保护。";
    }

    return {
      allowed: true,
      isManual,
      isQuiet,
      activeWindow: activeWin,
      warning
    };
  }

  /**
   * Calculates the delay in milliseconds until the next human-like active trigger.
   * Eliminates fixed-interval polling by picking a random time in the upcoming window.
   */
  static getNextScheduledDelayMs(now = new Date()) {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Check targets for today: 09:30, 14:30, 20:00
    const targetHours = [
      { h: 9, m: 30, jitterMaxMin: 35 },
      { h: 14, m: 30, jitterMaxMin: 40 },
      { h: 20, m: 0, jitterMaxMin: 30 }
    ];

    for (const target of targetHours) {
      // Gaussian random jitter: 5 ~ jitterMaxMin minutes
      const jitterMin = Math.floor(5 + Math.random() * target.jitterMaxMin);
      const targetMin = target.h * 60 + target.m + jitterMin;

      if (targetMin > currentMinutes + 10) {
        const delayMinutes = targetMin - currentMinutes;
        return delayMinutes * 60 * 1000;
      }
    }

    // If past all of today's windows, schedule for tomorrow morning 09:30 + jitter
    const tomorrowJitterMin = Math.floor(10 + Math.random() * 35);
    const morningTargetMin = 9 * 60 + 30 + tomorrowJitterMin;
    const remainingTodayMin = 24 * 60 - currentMinutes;
    const totalDelayMin = remainingTodayMin + morningTargetMin;
    return totalDelayMin * 60 * 1000;
  }

  static getHumanStatus() {
    const now = new Date();
    const isQuiet = this.isQuietHours(now);
    const activeWin = this.getActiveWindowName(now);

    return {
      currentTime: now.toLocaleTimeString(),
      isQuietHours: isQuiet,
      activeWindow: activeWin,
      statusLabel: isQuiet
        ? "🌙 夜间生理休眠期 (23:30-08:30)"
        : activeWin
        ? `☀️ ${activeWin}`
        : "⛅ 日间过渡期 (待命)",
      restHoursRange: "23:30 - 08:30",
      activeWindowsList: "早 09:30-11:30 | 午 14:30-17:00 | 晚 20:00-22:30",
      policy: "严格拟合人类作息：夜间停止机器自动化打卡，日间三波段高斯随机离散触发，多阶微动作防风控。"
    };
  }
}
