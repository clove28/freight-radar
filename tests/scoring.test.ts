/**
 * 评分引擎单元测试
 * 验证：各分项规则与权重合成、过滤条件、排序。
 */
import { describe, expect, it } from 'vitest';
import {
  filterCargoes,
  rankCargoes,
  scoreBackhaul,
  scoreIncome,
  scoreRoute,
  scoreVehicle,
} from '../src/core/scoring.js';
import type { Cargo, DriverQuery, Vehicle } from '../src/core/types.js';

const vehicle: Vehicle = {
  id: 'v1',
  plate: '晋L·TEST',
  truck: '13米高栏',
  maxLoad: 32,
  fuelPer100km: 32,
  fuelPrice: 7.2,
  tollPerKm: 1.2,
  otherCostPerTrip: 180,
  currentCity: '临沂',
  homeCities: ['临汾', '太原'],
  routes: [{ id: 'r1', from: '临沂', to: '临汾' }],
};

const mk = (id: string, patch: Partial<Cargo>): Cargo => ({
  id, from: '临沂', to: '临汾', km: 500, cargo: '黄豆粕', cls: '农产品',
  wt: 30, truck: '13米高栏', price: 8600, pickup: '今天 08:00',
  owner: '张老板', phone: '13800000000', verified: true,
  pub: Date.now(), status: 'open', ...patch,
});

describe('scoreIncome 收益分', () => {
  it('每公里≥8元 满分', () => {
    expect(scoreIncome(8)).toBe(100);
  });
  it('每公里≤0 零分', () => {
    expect(scoreIncome(0)).toBe(0);
  });
  it('线性区间', () => {
    expect(scoreIncome(4)).toBe(50);
    expect(scoreIncome(2)).toBe(25);
  });
});

describe('scoreRoute 路线分', () => {
  it('命中常跑路线满分', () => {
    expect(scoreRoute(mk('a', {}), vehicle)).toBe(100);
  });
  it('仅目的地相同给部分分', () => {
    expect(scoreRoute(mk('b', { from: '济南', to: '临汾' }), vehicle)).toBe(55);
  });
  it('不匹配给低分', () => {
    expect(scoreRoute(mk('c', { from: '广州', to: '成都' }), vehicle)).toBe(25);
  });
});

describe('scoreBackhaul 回程分', () => {
  it('目的地是回程基地满分', () => {
    expect(scoreBackhaul(mk('a', { to: '临汾' }), vehicle)).toBe(100);
  });
  it('非回程方向低分', () => {
    expect(scoreBackhaul(mk('b', { to: '成都' }), vehicle)).toBe(20);
  });
});

describe('scoreVehicle 车型分', () => {
  it('车型匹配满分', () => {
    expect(scoreVehicle(mk('a', { truck: '13米高栏' }), vehicle)).toBe(100);
  });
  it('车型不匹配低分', () => {
    expect(scoreVehicle(mk('b', { truck: '9.6米' }), vehicle)).toBe(20);
  });
});

describe('filterCargoes 业务过滤', () => {
  const list = [
    mk('a', {}), // 临沂→临汾 回程
    mk('b', { to: '成都', status: 'open' }),
    mk('c', { to: '临汾', wt: 40 }), // 超载
    mk('d', { to: '临汾', status: 'taken' }), // 已接走
  ];

  it('默认过滤掉已接单与超载', () => {
    const r = filterCargoes(list, vehicle, {});
    expect(r.map(c => c.id).sort()).toEqual(['a', 'b']);
  });

  it('backhaulOnly 只看回程', () => {
    const r = filterCargoes(list, vehicle, { backhaulOnly: true });
    expect(r.map(c => c.id)).toEqual(['a']);
  });

  it('运距上限', () => {
    const near = mk('n', { km: 300 }); // 300km 在限内
    const r = filterCargoes([near, ...list], vehicle, { maxKm: 400 });
    expect(r.map(c => c.id)).toEqual(['n']); // 500km 的单全部超限
  });

  it('每公里净收益下限', () => {
    const good = mk('g', {});                 // perKm≈12.99 ≥ 12
    const bad = mk('bad', { price: 4000 });   // perKm≈3.79 < 12
    const r = filterCargoes([good, bad], vehicle, { minPerKm: 12 });
    expect(r.map(c => c.id)).toEqual(['g']);
  });

  it('货物关键字', () => {
    const r = filterCargoes(list, vehicle, { cargo: '黄豆粕' });
    expect(r.length).toBeGreaterThan(0);
  });
});

describe('rankCargoes 综合排序', () => {
  it('回程+常跑路线命中排最前', () => {
    const list = [
      mk('a', {}), // 回程+路线命中 → 最高
      mk('b', { to: '成都', from: '成都' }),
    ];
    const r = rankCargoes(list, vehicle, { topN: 5 });
    expect(r[0]!.cargo.id).toBe('a');
    expect(r[0]!.score.total).toBeGreaterThan(r[1]!.score.total);
  });

  it('只返回 topN', () => {
    const list = [mk('a', {}), mk('b', {}), mk('c', {}), mk('d', { to: '成都' })];
    const r = rankCargoes(list, vehicle, { topN: 2 });
    expect(r.length).toBe(2);
  });

  it('空列表返回空', () => {
    expect(rankCargoes([], vehicle)).toEqual([]);
  });
});
