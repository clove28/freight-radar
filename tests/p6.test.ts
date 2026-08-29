/**
 * P6 单元测试（vitest 可跑部分）
 *
 * 注意：SQLite 仓储（node:sqlite）无法被 vitest/tsx 的 esbuild 转换加载，
 * 其测试见 tests/sqlite.integration.mjs（Node 原生 test runner 执行：
 * `node --test tests/sqlite.integration.mjs`）。
 * 本文件覆盖与 SQLite 无关的 P6 逻辑：行情抽象。
 */
import { describe, expect, it } from 'vitest';
import { RuleQuoteProvider, quoteFor } from '../src/core/quote.js';

describe('行情抽象 QuoteProvider（P6）', () => {
  it('规则实现与 quoteFor 一致', async () => {
    const p = new RuleQuoteProvider();
    const r = await p.getRange('普货', 500);
    expect(r.low).toBe(quoteFor('普货', 500).low);
    expect(r.high).toBe(quoteFor('普货', 500).high);
    expect(r.note).toContain('参考区间');
  });

  it('接口可被未来真实行情实现替换（结构契约）', async () => {
    // 模拟未来接真实行情 API：实现同一接口
    const fakeApiProvider: import('../src/core/quote.js').QuoteProvider = {
      async getRange(_cls, km) {
        return { low: km * 0.05, high: km * 0.09, note: '真实行情' };
      },
    };
    const r = await fakeApiProvider.getRange('普货', 500);
    expect(r.low).toBe(25);
    expect(r.high).toBe(45);
  });
});
