/**
 * 货运雷达 · 认证常量（P8）
 *
 * 独立于 SQLite 仓储，避免 vitest/tsx 加载 node:sqlite 的限制，
 * 使会话/手机号相关纯逻辑可单元测试。
 */

/** 会话有效期（毫秒）：7 天 */
export const SESSION_TTL = 7 * 24 * 3600 * 1000;

/** 验证码有效期（毫秒）：10 分钟 */
export const SMS_CODE_TTL = 10 * 60 * 1000;

/** 手机号格式（中国大陆 1 开头 11 位） */
export const PHONE_RE = /^1\d{10}$/;

/** 验证码：6 位数字 */
export function genSmsCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ---------- P10 登录安全 ----------

/** 连续登录失败多少次后锁定 */
export const LOGIN_FAIL_LIMIT = 5;

/** 锁定时长（毫秒）：10 分钟 */
export const LOGIN_LOCK_MS = 10 * 60 * 1000;

/**
 * 判定是否允许登录尝试（P10）
 * @param failCount 已连续失败次数
 * @param lastFailAt 上次失败时间戳（0=从未失败）
 * @param now 当前时间戳
 * @returns allowed=true 可尝试；否则 locked=true 且 waitSeconds 为剩余锁定秒数
 */
export function loginAttemptAllowed(failCount: number, lastFailAt: number, now = Date.now()): { allowed: boolean; locked?: boolean; waitSeconds?: number } {
  if (failCount >= LOGIN_FAIL_LIMIT && lastFailAt > 0) {
    const elapsed = now - lastFailAt;
    if (elapsed < LOGIN_LOCK_MS) {
      return { allowed: false, locked: true, waitSeconds: Math.ceil((LOGIN_LOCK_MS - elapsed) / 1000) };
    }
  }
  return { allowed: true };
}
