/**
 * 评分引擎单元测试
 * 验证：各分项规则与权重合成、过滤条件、排序。
 */
import { describe, expect, it } from 'vitest';
import { calcCost } from '../src/core/cost.js';
import {
  filterCargoes,
  normalizeTopN,
  rankCargoes,
  scoreBackhaul,
  scoreCargo,
  scoreCargoWithCost,
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
  it('车档案没填车型时不再给满分（未知 ≠ 匹配）', () => {
    const noTruck: Vehicle = { ...vehicle, truck: '' };
    expect(scoreVehicle(mk('c', {}), noTruck)).toBe(20);
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

  it('指定车型时只保留匹配货源', () => {
    const nine = mk('nine', { truck: '9.6米' });
    const r = filterCargoes([nine, mk('wide', {})], vehicle, { truck: '9.6米' });
    expect(r.map(c => c.id)).toEqual(['nine']);
  });

  it('纯空白车型查询视同未指定，不做过滤', () => {
    const r = filterCargoes(list, vehicle, { truck: '   ' });
    expect(r.map(c => c.id).sort()).toEqual(['a', 'b']);
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

describe('normalizeTopN 返回条数归一化', () => {
  it('缺省与非法值回退默认条数', () => {
    expect(normalizeTopN(undefined)).toBe(5);
    expect(normalizeTopN(Number.NaN)).toBe(5);
    expect(normalizeTopN(0)).toBe(5);
    expect(normalizeTopN(-3)).toBe(5);
  });

  it('小数向下取整', () => {
    expect(normalizeTopN(2.9)).toBe(2);
  });

  it('超大值截断到上限', () => {
    expect(normalizeTopN(999)).toBe(50);
  });

  it('合法值原样返回', () => {
    expect(normalizeTopN(3)).toBe(3);
  });
});

describe('rankCargoes 非法 topN 兜底', () => {
  it('负数 topN 不再少返回一条', () => {
    const list = [mk('a', {}), mk('b', {}), mk('c', {})];
    // 旧行为 slice(0,-1) 只会返回 2 条；现在回退默认条数 → 3 条全部返回
    expect(rankCargoes(list, vehicle, { topN: -1 }).length).toBe(3);
  });

  it('小数 topN 向下取整', () => {
    const list = [mk('a', {}), mk('b', {}), mk('c', {})];
    expect(rankCargoes(list, vehicle, { topN: 1.9 }).length).toBe(1);
  });
});

describe('rankCargoes 每单成本只算一次（去重）', () => {
  it('costFor 每单只调用一次', () => {
    const list = [mk('a', {}), mk('b', { from: '成都', to: '成都' }), mk('c', { to: '太原', km: 800 })];
    const calls: string[] = [];
    rankCargoes(list, vehicle, { topN: 5 }, c => {
      calls.push(c.id);
      return { emptyKm: 120 };
    });
    // 旧写法每单会被调两次（rankCargoes 内 calcCost 一次 + scoreCargo 内再一次），
    // costFor 接真实空驶里程/地图时等于白打一次外部调用
    expect(calls.sort()).toEqual(['a', 'b', 'c']);
  });

  it('scoreCargoWithCost 与 scoreCargo 结果一致', () => {
    const c = mk('a', { km: 800 });
    const opts = { emptyKm: 120, routeStrategy: 'highway' as const };
    expect(scoreCargoWithCost(c, vehicle, calcCost(c, vehicle, opts))).toEqual(scoreCargo(c, vehicle, () => opts));
  });

  it('注入的真实空驶里程同时进入返回成本与评分', () => {
    const c = mk('a', {});
    const injected = { emptyKm: 0 };
    const ranked = rankCargoes([c], vehicle, { topN: 1 }, () => injected);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.cost).toEqual(calcCost(c, vehicle, injected));
    expect(ranked[0]!.score).toEqual(scoreCargoWithCost(c, vehicle, calcCost(c, vehicle, injected)));
  });
});
