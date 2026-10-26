/**
 * 演示环境限流单元测试
 *
 * 背景：项目挂公网后 /api/assistant 会真调大模型花钱，链接一公开就能被人刷。
 * 这里锁住两层闸门的行为：单 IP 每分钟上限、全站每日上限，以及跨天重置。
 * 时间用注入的 now()，不依赖真实时钟，结果确定可复现。
 */
import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../src/server/rateLimit.js';

describe('RateLimiter 单 IP 每分钟', () => {
  it('未超限时逐次放行并递减剩余额度', () => {
    const clock = { t: 1_000_000 };
    const rl = new RateLimiter({ perIpPerMinute: 3, dailyTotal: 100, now: () => clock.t });

    const first = rl.check('1.1.1.1');
    expect(first.allowed).toBe(true);
    expect(first.remainingDaily).toBe(99);

    expect(rl.check('1.1.1.1').allowed).toBe(true);
    expect(rl.check('1.1.1.1').allowed).toBe(true);

    // 第 4 次（同一分钟内）被拒
    const blocked = rl.check('1.1.1.1');
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe('ip-per-minute');
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it('被拒不会额外消耗当日额度', () => {
    const clock = { t: 0 };
    const rl = new RateLimiter({ perIpPerMinute: 1, dailyTotal: 10, now: () => clock.t });
    rl.check('a');
    const blocked = rl.check('a');
    expect(blocked.allowed).toBe(false);
    expect(rl.usedToday).toBe(1);
  });

  it('一分钟后自动恢复', () => {
    const clock = { t: 0 };
    const rl = new RateLimiter({ perIpPerMinute: 1, dailyTotal: 10, now: () => clock.t });
    expect(rl.check('a').allowed).toBe(true);
    expect(rl.check('a').allowed).toBe(false);
    clock.t += 60_001;
    expect(rl.check('a').allowed).toBe(true);
  });

  it('不同 IP 互不挤占', () => {
    const clock = { t: 0 };
    const rl = new RateLimiter({ perIpPerMinute: 1, dailyTotal: 10, now: () => clock.t });
    expect(rl.check('a').allowed).toBe(true);
    expect(rl.check('b').allowed).toBe(true);
    expect(rl.check('a').allowed).toBe(false);
  });

  it('空 IP 归到同一个桶（不因取不到 IP 就无限放行）', () => {
    const clock = { t: 0 };
    const rl = new RateLimiter({ perIpPerMinute: 1, dailyTotal: 10, now: () => clock.t });
    expect(rl.check('').allowed).toBe(true);
    expect(rl.check('').allowed).toBe(false);
  });
});

describe('RateLimiter 全站每日总量', () => {
  it('达到每日上限后拒绝，且原因是 daily-total', () => {
    const clock = { t: 0 };
    const rl = new RateLimiter({ perIpPerMinute: 100, dailyTotal: 2, now: () => clock.t });
    expect(rl.check('a').allowed).toBe(true);
    expect(rl.check('b').allowed).toBe(true);

    const blocked = rl.check('c');
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe('daily-total');
    expect(blocked.remainingDaily).toBe(0);
  });

  it('跨天自动重置', () => {
    const clock = { t: 0 };
    const rl = new RateLimiter({ perIpPerMinute: 100, dailyTotal: 1, now: () => clock.t });
    expect(rl.check('a').allowed).toBe(true);
    expect(rl.check('a').allowed).toBe(false);

    clock.t += 24 * 3600 * 1000; // 次日
    expect(rl.check('a').allowed).toBe(true);
    expect(rl.usedToday).toBe(1);
  });
});

describe('RateLimiter 参数收敛', () => {
  it('NaN / 0 / 负数 / 小数都收敛到安全值', () => {
    const clock = { t: 0 };
    const nan = new RateLimiter({ perIpPerMinute: Number.NaN, dailyTotal: Number.NaN, now: () => clock.t });
    // NaN → 回退默认（每 IP 5 次）
    for (let i = 0; i < 5; i++) expect(nan.check('x').allowed).toBe(true);
    expect(nan.check('x').allowed).toBe(false);

    const zero = new RateLimiter({ perIpPerMinute: 0, dailyTotal: 0, now: () => clock.t });
    // 0 → 回退默认，不是「永不限流」也不是「全部拒绝」
    expect(zero.check('y').allowed).toBe(true);

    const frac = new RateLimiter({ perIpPerMinute: 2.9, dailyTotal: 2.9, now: () => clock.t });
    expect(frac.check('z').allowed).toBe(true);
    expect(frac.check('z').allowed).toBe(true);
    expect(frac.check('z').allowed).toBe(false);
  });
});
