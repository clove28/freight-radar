/**
 * P12 单元测试
 * 覆盖：CSV 每公里收益列、账本 km 补录逻辑（纯函数部分）。
 */
import { describe, expect, it } from 'vitest';
import { booksToCsv, bookIncome } from '../src/core/stats.js';
import type { BookEntry } from '../src/core/types.js';

const mkBook = (id: string, ts: number, from: string, to: string, fee: number, fuel: number, toll: number, other: number, km?: number, note = ''): BookEntry => ({
  id, ts, from, to, fee, fuel, toll, other, greenSave: 0, note, km,
});

describe('CSV 每公里收益列（P12）', () => {
  it('表头包含每公里收益', () => {
    const csv = booksToCsv([]);
    expect(csv.split('\n')[0]).toContain('每公里收益(元/km)');
  });

  it('真实 km 时每公里收益精确', () => {
    // 净收益 4900，km 500 → 9.8
    const b = mkBook('a', Date.now(), '临沂', '临汾', 8000, 2000, 1000, 100, 500);
    const csv = booksToCsv([b]);
    const row = csv.split('\n')[1]!;
    const cols = row.split(',');
    expect(cols[8]).toBe('4900'); // 净收益
    expect(cols[9]).toBe('9.8'); // 每公里
  });

  it('无 km 时用估算值兜底（不为空）', () => {
    const b = mkBook('a', Date.now(), '临沂', '临汾', 8000, 2000, 1000, 100);
    const csv = booksToCsv([b]);
    const cols = csv.split('\n')[1]!.split(',');
    expect(Number(cols[9])).toBeGreaterThan(0);
  });

  it('bookIncome 公式不变', () => {
    expect(bookIncome(mkBook('a', 0, 'x', 'y', 10000, 3000, 1500, 500))).toBe(5000);
  });
});
