/**
 * P13 单元测试
 * 覆盖：月度汇总字段（运费/成本/里程）。
 */
import { describe, expect, it } from 'vitest';
import { buildStats } from '../src/core/stats.js';
import type { BookEntry } from '../src/core/types.js';

const mkBook = (id: string, ts: number, from: string, to: string, fee: number, fuel: number, toll: number, other: number, km?: number): BookEntry => ({
  id, ts, from, to, fee, fuel, toll, other, greenSave: 0, note: '', km,
});

describe('月度汇总字段（P13）', () => {
  it('monthFee/monthCost/monthKm 聚合正确', () => {
    const now = new Date(2026, 7, 15);
    const books = [
      mkBook('a', new Date(2026, 7, 3).getTime(), '临沂', '临汾', 8600, 2450, 1100, 150, 640),
      mkBook('b', new Date(2026, 7, 10).getTime(), '太原', '临沂', 6200, 1900, 880, 150, 550),
      mkBook('c', new Date(2026, 6, 20).getTime(), '郑州', '广州', 6800, 2100, 950, 150, 1000), // 7月，不计入
    ];
    const stats = buildStats(books, 3, now);
    // 本月（8月）：运费 8600+6200=14800；成本 2450+1100+150+1900+880+150=6630；里程 640+550=1190
    expect(stats.monthFee).toBe(14800);
    expect(stats.monthCost).toBe(6630);
    expect(stats.monthKm).toBe(1190);
    // 净收益 = 运费 - 成本 = 8170
    expect(stats.monthIncome).toBe(14800 - 6630);
  });

  it('空账本时月度字段为 0', () => {
    const stats = buildStats([], 3, new Date(2026, 7, 15));
    expect(stats.monthFee).toBe(0);
    expect(stats.monthCost).toBe(0);
    expect(stats.monthKm).toBe(0);
  });

  it('无 km 时 monthKm 用估算', () => {
    const now = new Date(2026, 7, 15);
    const b = mkBook('a', now.getTime(), '临沂', '临汾', 8000, 2000, 1000, 100);
    const stats = buildStats([b], 1, now);
    expect(stats.monthKm).toBeGreaterThan(0);
  });
});
