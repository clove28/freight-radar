/**
 * 货运雷达 · 极简内存限流（演示环境用）
 *
 * 场景：项目挂到公网后，/api/assistant 会真的调 DeepSeek 花真金白银。
 * 链接一公开，任何人都能刷。这里加两层闸门，把最坏损失钉死：
 *   1. 单个 IP 每分钟最多 N 次（防有人写循环刷）
 *   2. 全站每天最多 M 次（防被转发到群里集体刷）
 *
 * 命中限制时**不报错**：调用方回退到规则引擎，功能不中断、只是文案变成模板。
 * （和 LLM 失败回退同一套设计哲学：演示永远有东西可看，但钱不会失控）
 *
 * 实现取舍：单进程内存计数，不引 Redis。演示机重启即清零，可以接受；
 * 真要多实例部署时把本类换成 Redis 实现即可（对外接口不变）。
 */

/** 限流判定结果 */
export interface RateLimitDecision {
  /** 是否放行 */
  allowed: boolean;
  /** 拒绝原因：单 IP 太频 / 全站当日额度用完 */
  reason?: 'ip-per-minute' | 'daily-total';
  /** 建议等待秒数（reason=ip-per-minute 时有效） */
  retryAfterSec?: number;
  /** 当日剩余次数 */
  remainingDaily: number;
}

export interface RateLimiterOptions {
  /** 单 IP 每分钟上限，缺省 5 */
  perIpPerMinute?: number;
  /** 全站每日上限，缺省 200 */
  dailyTotal?: number;
  /** 时间源，便于测试注入 */
  now?: () => number;
}

/** 把可能来自环境变量的数字收敛到安全区间（NaN / 负数 / 0 一律回退默认） */
function toPositiveInt(raw: unknown, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

export class RateLimiter {
  private readonly perIp: number;
  private readonly daily: number;
  private readonly now: () => number;
  /** IP → 最近一分钟内的命中时间戳 */
  private readonly hits = new Map<string, number[]>();
  /** 当前统计到的 UTC 日期（yyyy-mm-dd） */
  private day = '';
  private dayCount = 0;

  constructor(opts: RateLimiterOptions = {}) {
    this.perIp = toPositiveInt(opts.perIpPerMinute, 5);
    this.daily = toPositiveInt(opts.dailyTotal, 200);
    this.now = opts.now ?? Date.now;
  }

  /** 判定一次调用是否放行；放行时立即计数 */
  check(ip: string): RateLimitDecision {
    const t = this.now();
    const dayKey = new Date(t).toISOString().slice(0, 10);
    if (dayKey !== this.day) {
      // 跨天重置（演示机器不需要更精细的滚动窗口）
      this.day = dayKey;
      this.dayCount = 0;
      this.hits.clear();
    }

    const remainingDaily = Math.max(0, this.daily - this.dayCount);
    if (this.dayCount >= this.daily) {
      return { allowed: false, reason: 'daily-total', remainingDaily: 0 };
    }

    const key = ip || 'unknown';
    const windowStart = t - 60_000;
    const recent = (this.hits.get(key) ?? []).filter((ts) => ts > windowStart);
    if (recent.length >= this.perIp) {
      this.hits.set(key, recent);
      const oldest = recent[0] ?? t;
      return {
        allowed: false,
        reason: 'ip-per-minute',
        retryAfterSec: Math.max(1, Math.ceil((oldest + 60_000 - t) / 1000)),
        remainingDaily,
      };
    }

    recent.push(t);
    this.hits.set(key, recent);
    this.dayCount++;
    this.prune(t - 60_000);
    return { allowed: true, remainingDaily: Math.max(0, this.daily - this.dayCount) };
  }

  /** 当日已用次数（自检/日志用） */
  get usedToday(): number {
    return this.dayCount;
  }

  /** 清掉窗口外的 IP 记录，避免长时间运行内存膨胀 */
  private prune(windowStart: number): void {
    if (this.hits.size <= 1000) return;
    for (const [key, list] of this.hits) {
      const kept = list.filter((ts) => ts > windowStart);
      if (kept.length) this.hits.set(key, kept);
      else this.hits.delete(key);
    }
  }
}
