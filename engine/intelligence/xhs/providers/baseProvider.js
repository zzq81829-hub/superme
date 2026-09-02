/**
 * Base abstract provider for Xiaohongshu Data Intelligence.
 * Standardizes lifecycle, status, rate limiting, and CAPTCHA detection.
 */
export class BaseXhsProvider {
  constructor(name, options = {}) {
    this.name = name;
    this.options = options;
    this.status = "IDLE"; // IDLE, RUNNING, NEED_LOGIN, NEED_VERIFICATION, ERROR
    this.lastError = null;
    this.lastRunAt = null;
  }

  getStatus() {
    return {
      provider: this.name,
      status: this.status,
      lastError: this.lastError,
      lastRunAt: this.lastRunAt
    };
  }

  /**
   * Helper to detect Xiaohongshu CAPTCHA / Slider / Risk Control in HTML or responses
   */
  isCaptchaOrRiskControl(textOrUrl = "") {
    const s = String(textOrUrl).toLowerCase();
    return (
      s.includes("captcha") ||
      s.includes("sec.xiaohongshu.com") ||
      s.includes("验证码") ||
      s.includes("请完成安全验证") ||
      s.includes("滑动拼图") ||
      s.includes("访问频次异常") ||
      s.includes("risk") ||
      s.includes("盾")
    );
  }

  isLoginExpired(textOrUrl = "") {
    const s = String(textOrUrl).toLowerCase();
    return (
      s.includes("login") ||
      s.includes("登录已过期") ||
      s.includes("请重新登录") ||
      s.includes("passport.xiaohongshu.com") ||
      s.includes("401")
    );
  }
}
