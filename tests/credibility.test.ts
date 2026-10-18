import { describe, expect, it } from 'vitest';
import { computeCredibility, cargoCompleteness, recencyPenalty, CREDIBILITY_LEVEL_LABEL } from '../src/core/credibility.js';

/** 固定基准时刻，避免测试依赖真实时钟 */
const NOW = 1_700_000_000_000;
const HOUR = 3_600_000;

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
      pub: NOW, now: NOW, // 刚发布，无时效惩罚
    });
    // 认证15 + 运营0 + 历史0 + 反馈0 + 价格15 + 完整10 = 40
    expect(r.score).toBe(40);
    expect(r.level).toBe('low');
    expect(r.pending).toBe(true);
    expect(r.evidence.some(e => e.includes('货主已认证'))).toBe(true);
  });

  it('未认证被扣分 + 价格异常扣分', () => {
    const r = computeCredibility({ verified: false, priceFlag: 'low', completeness: 0.5, pub: NOW, now: NOW });
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
      pub: NOW, now: NOW,
    });
    // 认证15 + 运营30 + 历史15 + 反馈15 + 价格15 + 完整10 = 100
    expect(r.score).toBe(100);
    expect(r.level).toBe('high');
    expect(r.pending).toBe(false);
  });

  it('历史随时间变旧 → 时效惩罚', () => {
    const old = NOW - 48 * HOUR; // 2 天前
    const fresh = NOW;
    const rOld = computeCredibility({ verified: true, priceFlag: 'normal', completeness: 1, pub: old, now: NOW });
    const rFresh = computeCredibility({ verified: true, priceFlag: 'normal', completeness: 1, pub: fresh, now: NOW });
    expect(rOld.score).toBeLessThan(rFresh.score);
  });

  it('负反馈拉低', () => {
    const bad = computeCredibility({
      verified: true, historyCount: 5, feedbackPositive: 0, feedbackNegative: 3, priceFlag: 'normal', completeness: 1, pub: NOW, now: NOW,
    });
    const good = computeCredibility({
      verified: true, historyCount: 5, feedbackPositive: 3, feedbackNegative: 0, priceFlag: 'normal', completeness: 1, pub: NOW, now: NOW,
    });
    expect(bad.score).toBeLessThan(good.score);
  });

  it('分级标签正确', () => {
    expect(CREDIBILITY_LEVEL_LABEL.high).toBe('信任度较高');
  });
});

describe('recencyPenalty（注入 now，结果确定）', () => {
  it('未传 pub 或非有限值 → 不罚分（NaN 不传染到总分）', () => {
    expect(recencyPenalty(undefined, NOW)).toBe(0);
    expect(recencyPenalty(Number.NaN, NOW)).toBe(0);
    expect(recencyPenalty(NOW, Number.NaN)).toBe(0);
  });

  it('24h 内不罚分（含正好 24h 的边界）', () => {
    expect(recencyPenalty(NOW, NOW)).toBe(0);
    expect(recencyPenalty(NOW - 24 * HOUR, NOW)).toBe(0);
    expect(recencyPenalty(NOW - 47 * HOUR, NOW)).toBe(0);
  });

  it('超过 24h 后每满 24h 扣 2 分', () => {
    expect(recencyPenalty(NOW - 48 * HOUR, NOW)).toBe(2);
    expect(recencyPenalty(NOW - 72 * HOUR, NOW)).toBe(4);
    expect(recencyPenalty(NOW - 120 * HOUR, NOW)).toBe(8);
  });

  it('封顶 10 分；未来时间戳不罚', () => {
    // 6 天前 = 12 分，被 RECENCY_PENALTY_MAX 封顶
    expect(recencyPenalty(NOW - 168 * HOUR, NOW)).toBe(10);
    expect(recencyPenalty(NOW - 365 * 24 * HOUR, NOW)).toBe(10);
    expect(recencyPenalty(NOW + HOUR, NOW)).toBe(0);
  });

  it('不传 now 时仍回退到真实时钟（原行为不变）', () => {
    expect(recencyPenalty(NOW - 365 * 24 * HOUR)).toBe(10);
  });

  it('同一输入 + 同一 now → 分数可复现，不随运行时刻漂移', () => {
    const input = { verified: true, priceFlag: 'normal' as const, completeness: 1, pub: NOW - 72 * HOUR, now: NOW };
    const a = computeCredibility(input);
    const b = computeCredibility(input);
    // 基准 40 − 时效 4（3 天前：超 24h 后满 2 天 × 2 分）= 36
    expect(a.score).toBe(36);
    expect(b.score).toBe(a.score);
  });
});
