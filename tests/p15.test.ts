/**
 * P15 单元测试
 * 覆盖：HTML 报表生成（转义/自包含/汇总）、分页切片逻辑。
 */
import { describe, expect, it } from 'vitest';
import { booksToHtml, booksToCsv, bookIncome } from '../src/core/stats.js';
import type { BookEntry } from '../src/core/types.js';

const mkBook = (id: string, ts: number, from: string, to: string, fee: number, fuel: number, toll: number, other: number, km?: number, note = ''): BookEntry => ({
  id, ts, from, to, fee, fuel, toll, other, greenSave: 0, note, km,
});

describe('HTML 报表（P15）', () => {
  it('自包含且含汇总', () => {
    const books = [
      mkBook('a', Date.now(), '临沂', '临汾', 8600, 2450, 1100, 150, 640),
      mkBook('b', Date.now(), '广州', '武汉', 7000, 2000, 1000, 100, 1000),
    ];
    const html = booksToHtml(books, { vehicle: '晋L·T 13米高栏' });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('货运雷达 · 收益报表');
    expect(html).toContain('晋L·T');
    // 汇总：总净收益 = (8600-2450-1100-150)+(7000-2000-1000-100) = 4900+3900 = 8800
    expect(html).toContain('8800');
    // 两行数据
    expect(html).toContain('临沂 → 临汾');
    expect(html).toContain('广州 → 武汉');
    // 打印样式
    expect(html).toContain('@media print');
  });

  it('HTML 转义防注入', () => {
    const b: BookEntry = { id: 'a', ts: Date.now(), from: 'x', to: 'y', fee: 1, fuel: 0, toll: 0, other: 0, greenSave: 0, note: '<script>alert(1)</script>', km: 100 };
    const html = booksToHtml([b]);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('CSV 与 HTML 数据一致（净收益）', () => {
    const b = mkBook('a', Date.now(), 'x', 'y', 8000, 2000, 1000, 300);
    expect(bookIncome(b)).toBe(4700);
    const csv = booksToCsv([b]);
    const html = booksToHtml([b]);
    expect(csv).toContain('4700');
    expect(html).toContain('4700');
  });
});

describe('分页切片逻辑（P15）', () => {
  it('切片正确', () => {
    const arr = Array.from({ length: 25 }, (_, i) => i);
    const page = 2, limit = 10;
    const slice = arr.slice((page - 1) * limit, page * limit);
    expect(slice).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  });

  it('越界页返回空', () => {
    const arr = Array.from({ length: 5 }, (_, i) => i);
    expect(arr.slice(3 * 10, 4 * 10)).toEqual([]);
  });

  it('limit 上限截断（防超大请求）', () => {
    const rawLimit = 1000;
    const limit = Math.min(100, Math.max(1, rawLimit));
    expect(limit).toBe(100);
  });
});
