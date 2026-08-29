/**
 * P11 单元测试
 * 覆盖：账本里程优先逻辑、CSV 导出、Provider 抽象契约。
 */
import { describe, expect, it } from 'vitest';
import { bookKm, booksToCsv, buildStats } from '../src/core/stats.js';
import { DevSmsProvider, AliyunSmsProvider, createSmsProvider, createQuoteProvider } from '../src/data/providers.js';
import type { BookEntry } from '../src/core/types.js';

const mkBook = (id: string, ts: number, from: string, to: string, fee: number, fuel: number, toll: number, other: number, km?: number): BookEntry => ({
  id, ts, from, to, fee, fuel, toll, other, greenSave: 0, note: '', km,
});

describe('账本里程（P11）', () => {
  it('bookKm 优先真实 km', () => {
    const b = mkBook('a', Date.now(), '临沂', '临汾', 8000, 2000, 1000, 100, 640);
    expect(bookKm(b)).toBe(640);
  });

  it('无 km 时回退估算', () => {
    const b = mkBook('a', Date.now(), '临沂', '临汾', 8000, 2000, 1000, 100);
    const est = bookKm(b);
    expect(est).toBeGreaterThan(0);
    expect(est).not.toBe(640);
  });

  it('统计每公里用真实 km', () => {
    const now = new Date(2026, 7, 15);
    // 真实 km=500：净收益 4900 → perKm 9.8
    const b = mkBook('a', now.getTime(), '临沂', '临汾', 8000, 2000, 1000, 100, 500);
    const stats = buildStats([b], 1, now);
    expect(stats.monthly[0]!.perKm).toBe(9.8);
  });
});

describe('CSV 导出（P11）', () => {
  it('生成表头与数据行', () => {
    const b = mkBook('a', new Date(2026, 7, 3, 10, 30).getTime(), '临沂', '临汾', 8600, 2450, 1100, 150, 640);
    const csv = booksToCsv([b]);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('日期,路线,里程');
    expect(lines[1]).toContain('2026-08-03');
    expect(lines[1]).toContain('临沂→临汾');
    expect(lines[1]).toContain('640');
    // 净收益 = 8600-2450-1100-150 = 4900
    expect(lines[1]).toContain('4900');
  });

  it('含逗号备注被正确转义', () => {
    const b: BookEntry = { id: 'a', ts: Date.now(), from: 'x', to: 'y', fee: 1, fuel: 0, toll: 0, other: 0, greenSave: 0, note: '含,逗号', km: 100 };
    const csv = booksToCsv([b]);
    expect(csv).toContain('"含,逗号"');
  });

  it('按时间倒序', () => {
    const older = mkBook('old', 1000, 'a', 'b', 1, 0, 0, 0);
    const newer = mkBook('new', 2000, 'c', 'd', 1, 0, 0, 0);
    const csv = booksToCsv([older, newer]);
    const lines = csv.split('\n');
    expect(lines[1]).toContain('c→d'); // 新的在前
  });
});

describe('Provider 抽象（P11）', () => {
  it('DevSmsProvider 返回 devCode（演示）', async () => {
    const p = new DevSmsProvider();
    const r = await p.send('13800000000', '123456');
    expect(r.ok).toBe(true);
    expect(r.devCode).toBe('123456');
  });

  it('AliyunSmsProvider 未接入 SDK 时明确报错（骨架）', async () => {
    const p = new AliyunSmsProvider({ accessKey: 'ak', secret: 'sk', sign: 's', template: 't' });
    const r = await p.send('13800000000', '123456');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('接入 SDK');
  });

  it('createSmsProvider 默认 Dev；配置后 Aliyun', () => {
    expect(createSmsProvider({}) instanceof DevSmsProvider).toBe(true);
    expect(createSmsProvider({ SMS_PROVIDER: 'aliyun', ALIYUN_SMS_ACCESS_KEY: 'ak' }) instanceof AliyunSmsProvider).toBe(true);
  });

  it('createQuoteProvider 未配置时回退规则区间', async () => {
    const p = createQuoteProvider({});
    const r = await p.getRange('普货', 500);
    expect(r.low).toBeGreaterThan(0);
    expect(r.high).toBeGreaterThan(r.low);
  });
});
