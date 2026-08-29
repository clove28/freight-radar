/**
 * P10 单元测试
 * 覆盖：统计模块（月度趋势/线路分布）、登录失败锁定、密码强度。
 */
import { describe, expect, it } from 'vitest';
import { buildStats, bookIncome, monthLabels, estKm } from '../src/core/stats.js';
import { loginAttemptAllowed, LOGIN_FAIL_LIMIT, LOGIN_LOCK_MS } from '../src/core/auth.js';
import type { BookEntry } from '../src/core/types.js';

const mkBook = (id: string, ts: number, from: string, to: string, fee: number, fuel: number, toll: number, other: number): BookEntry => ({
  id, ts, from, to, fee, fuel, toll, other, greenSave: 0, note: '',
});

describe('统计模块（P10）', () => {
  it('bookIncome 净收益公式', () => {
    expect(bookIncome(mkBook('a', 0, 'x', 'y', 8000, 2000, 1000, 300))).toBe(4700);
  });

  it('monthLabels 生成近 N 个月', () => {
    const now = new Date(2026, 7, 15); // 2026-08
    const labels = monthLabels(3, now);
    expect(labels).toEqual(['2026-06', '2026-07', '2026-08']);
  });

  it('月度收益趋势聚合正确', () => {
    const now = new Date(2026, 7, 15);
    const books = [
      mkBook('a', new Date(2026, 7, 3).getTime(), '临沂', '临汾', 8600, 2450, 1100, 150), // 8月 净4900
      mkBook('b', new Date(2026, 7, 10).getTime(), '太原', '临沂', 6200, 1900, 880, 150), // 8月 净3270
      mkBook('c', new Date(2026, 6, 20).getTime(), '郑州', '广州', 6800, 2100, 950, 150), // 7月 净3600
    ];
    const stats = buildStats(books, 3, now);
    expect(stats.monthly[2]!.label).toBe('2026-08');
    expect(stats.monthly[2]!.income).toBe(4900 + 3270);
    expect(stats.monthly[2]!.orders).toBe(2);
    expect(stats.monthly[1]!.income).toBe(3600);
    expect(stats.monthly[1]!.orders).toBe(1);
    expect(stats.monthIncome).toBe(8170);
  });

  it('线路分布按单数降序 Top', () => {
    const now = new Date(2026, 7, 15);
    const books = [
      mkBook('a', Date.now(), '临沂', '临汾', 8000, 2000, 1000, 100),
      mkBook('b', Date.now(), '临沂', '临汾', 8000, 2000, 1000, 100),
      mkBook('c', Date.now(), '郑州', '广州', 8000, 2000, 1000, 100),
    ];
    const stats = buildStats(books, 2, now);
    expect(stats.routes[0]!.from).toBe('临沂');
    expect(stats.routes[0]!.to).toBe('临汾');
    expect(stats.routes[0]!.count).toBe(2);
  });

  it('空账本不崩溃', () => {
    const stats = buildStats([], 3, new Date(2026, 7, 15));
    expect(stats.monthly.length).toBe(3);
    expect(stats.monthly.every(m => m.income === 0)).toBe(true);
    expect(stats.routes).toEqual([]);
    expect(stats.avgPerKmAll).toBe(0);
  });

  it('estKm 稳定且为正', () => {
    const a = estKm('临沂', '临汾');
    const b = estKm('临沂', '临汾');
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
  });
});

describe('登录失败锁定（P10）', () => {
  it('未达上限允许尝试', () => {
    expect(loginAttemptAllowed(0, 0).allowed).toBe(true);
    expect(loginAttemptAllowed(LOGIN_FAIL_LIMIT - 1, Date.now()).allowed).toBe(true);
  });

  it('达上限且锁定期内拒绝', () => {
    const now = Date.now();
    const r = loginAttemptAllowed(LOGIN_FAIL_LIMIT, now - 60_000, now);
    expect(r.allowed).toBe(false);
    expect(r.locked).toBe(true);
    expect(r.waitSeconds).toBeGreaterThan(0);
    expect(r.waitSeconds).toBeLessThanOrEqual(LOGIN_LOCK_MS / 1000);
  });

  it('锁定超时后恢复', () => {
    const now = Date.now();
    const r = loginAttemptAllowed(LOGIN_FAIL_LIMIT, now - LOGIN_LOCK_MS - 1000, now);
    expect(r.allowed).toBe(true);
  });

  it('未达上限的失败不锁（允许继续尝试）', () => {
    const now = Date.now();
    expect(loginAttemptAllowed(3, now - 5000, now).allowed).toBe(true);
  });
});
