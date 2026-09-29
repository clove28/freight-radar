import { describe, expect, it } from 'vitest';
import { computeCredibility, cargoCompleteness, CREDIBILITY_LEVEL_LABEL } from '../src/core/credibility.js';

describe('cargoCompleteness', () => {
  it('全填=1', () => expect(cargoCompleteness([true, true, true, true])).toBe(1));
  it('半填=0.5', () => expect(cargoCompleteness([true, false, true, false])).toBe(0.5));
  it('空=0', () => expect(cargoCompleteness([])).toBe(0));
});

describe('computeCredibility', () => {
  it('全优（无运营/历史/反馈时的基准分）', () => {
    const r = computeCredibility({
      verified: true,
      priceFlag: 'normal',
      completeness: 1,
      pub: Date.now(), // 刚发布，无时效惩罚
    });
    // 认证15 + 运营0 + 历史0 + 反馈0 + 价格15 + 完整10 = 40
    expect(r.score).toBe(40);
    expect(r.level).toBe('low');
    expect(r.pending).toBe(true);
    expect(r.evidence.some(e => e.includes('货主已认证'))).toBe(true);
  });

  it('未认证被扣分 + 价格异常扣分', () => {
    const r = computeCredibility({ verified: false, priceFlag: 'low', completeness: 0.5, pub: Date.now() });
    // 认证0 + 价格8 + 完整5 = 13
    expect(r.score).toBe(13);
  });

  it('运营确认 + 历史成交 + 良好反馈 → 高分', () => {
    const r = computeCredibility({
      verified: true,
      opsConfirmed: true,
      historyCount: 5,
      feedbackPositive: 3,
      feedbackNegative: 0,
      priceFlag: 'normal',
      completeness: 1,
      pub: Date.now(),
    });
    // 认证15 + 运营30 + 历史15 + 反馈15 + 价格15 + 完整10 = 100
    expect(r.score).toBe(100);
    expect(r.level).toBe('high');
    expect(r.pending).toBe(false);
  });

  it('历史随时间变旧 → 时效惩罚', () => {
    const old = Date.now() - 48 * 3600_000; // 2 天前
    const fresh = Date.now();
    const rOld = computeCredibility({ verified: true, priceFlag: 'normal', completeness: 1, pub: old });
    const rFresh = computeCredibility({ verified: true, priceFlag: 'normal', completeness: 1, pub: fresh });
    expect(rOld.score).toBeLessThan(rFresh.score);
  });

  it('负反馈拉低', () => {
    const bad = computeCredibility({
      verified: true, historyCount: 5, feedbackPositive: 0, feedbackNegative: 3, priceFlag: 'normal', completeness: 1, pub: Date.now(),
    });
    const good = computeCredibility({
      verified: true, historyCount: 5, feedbackPositive: 3, feedbackNegative: 0, priceFlag: 'normal', completeness: 1, pub: Date.now(),
    });
    expect(bad.score).toBeLessThan(good.score);
  });

  it('分级标签正确', () => {
    expect(CREDIBILITY_LEVEL_LABEL.high).toBe('信任度较高');
  });
});
