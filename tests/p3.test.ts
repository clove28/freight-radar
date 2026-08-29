/**
 * P3 新增模块单元测试
 * 覆盖：货主信用规则、历史画像、空驶规划、真实 API 仓储。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  applyRating,
  creditBadge,
  creditPenalty,
  mkCredit,
  RATING_SCORE,
  unblacklist,
} from '../src/core/credit.js';
import { buildHistoryInsights } from '../src/core/history.js';
import { MockRoutePlanner } from '../src/core/routePlanner.js';
import { ApiCargoRepository } from '../src/data/apiRepository.js';
import { createOrder, type Order } from '../src/core/order.js';
import type { Vehicle } from '../src/core/types.js';

describe('货主信用规则（P3）', () => {
  it('三档权重：👍+1 / 😐0 / 👎−3', () => {
    expect(RATING_SCORE).toEqual({ good: 1, medium: 0, bad: -3 });
  });

  it('负分自动进黑名单', () => {
    const c = mkCredit('测试货主');
    applyRating(c, 'bad');
    applyRating(c, 'bad');
    expect(c.score).toBe(-6);
    expect(c.blacklisted).toBe(true);
    expect(creditBadge(c)).toBe('bad');
  });

  it('正分不入黑名单且徽标为 good', () => {
    const c = mkCredit('张老板');
    applyRating(c, 'good');
    applyRating(c, 'good');
    applyRating(c, 'good');
    expect(c.score).toBe(3);
    expect(c.blacklisted).toBe(false);
    expect(creditBadge(c)).toBe('good');
  });

  it('评价带标签与备注', () => {
    const c = mkCredit('李经理');
    applyRating(c, 'good', ['按时装货', '运费准时结'], '合作顺畅');
    expect(c.tags['按时装货']).toBe(1);
    expect(c.comments.length).toBe(1);
    expect(c.total).toBe(1);
  });

  it('无评价记录 → none 徽标', () => {
    expect(creditBadge(undefined)).toBe('none');
  });

  it('unblacklist 清零分数但保留记录', () => {
    const c = mkCredit('襄汾货运部');
    applyRating(c, 'bad');
    unblacklist(c);
    expect(c.blacklisted).toBe(false);
    expect(c.score).toBe(0);
    expect(c.total).toBe(1);
  });

  it('信用降权：黑名单 -30，一般差评 -15，正常 0', () => {
    const bad = mkCredit('黑名单');
    applyRating(bad, 'bad');
    expect(creditPenalty(bad)).toBe(-30);

    const mid = mkCredit('中性');
    applyRating(mid, 'bad'); // score=-3 进黑名单
    applyRating(mid, 'good'); // score=-2
    applyRating(mid, 'good'); // score=-1
    applyRating(mid, 'good'); // score=0 → 自动移出黑名单（score<0 才黑）
    expect(mid.blacklisted).toBe(false);
    expect(creditPenalty(mid)).toBe(-15);

    const good = mkCredit('好评');
    applyRating(good, 'good');
    applyRating(good, 'good');
    expect(creditPenalty(good)).toBe(0);
    expect(creditPenalty(undefined)).toBe(0);
  });
});

describe('历史画像（P3）', () => {
  const vehicle: Vehicle = {
    id: 'v1', plate: '晋L·T', truck: '13米高栏', maxLoad: 32,
    fuelPer100km: 32, fuelPrice: 7.2, tollPerKm: 1.2, otherCostPerTrip: 180,
    currentCity: '临沂', homeCities: ['临汾'], routes: [],
  };

  const mkOrder = (id: string, from: string, to: string, status: Order['status'], loss?: boolean): Order => {
    const o = createOrder({ id, loadId: id, from, to, cargo: '黄豆粕', cls: '农产品', wt: 30, truck: '13米高栏', price: 8000, km: 600, owner: '张老板' });
    o.status = status;
    if (loss !== undefined) {
      o.loss = {
        loadTons: 30, unloadTons: loss ? 28 : 29.9, lossKg: loss ? 2000 : 100,
        ratePerMille: loss ? 66.7 : 3.3, stdPerMille: 5, overLimit: loss,
        verdict: loss ? '超损' : '无责',
      };
    }
    return o;
  };

  it('沉淀常跑线路（按频次）', () => {
    const orders = [
      mkOrder('a', '临沂', '临汾', 'finished'),
      mkOrder('b', '临沂', '临汾', 'finished'),
      mkOrder('c', '郑州', '广州', 'finished'),
    ];
    const h = buildHistoryInsights(orders, vehicle);
    expect(h.topRoutes[0]).toEqual({ from: '临沂', to: '临汾', count: 2 });
    expect(h.completionRate).toBe(1);
    expect(h.finishedCount).toBe(3);
  });

  it('完成率 = finished / 总数', () => {
    const orders = [
      mkOrder('a', '临沂', '临汾', 'finished'),
      mkOrder('b', '临沂', '临汾', 'accepted'),
      mkOrder('c', '临沂', '临汾', 'delivered'),
    ];
    const h = buildHistoryInsights(orders, vehicle);
    expect(h.completionRate).toBeCloseTo(1 / 3, 5);
  });

  it('超损比例统计', () => {
    const orders = [
      mkOrder('a', '临沂', '临汾', 'finished', true),
      mkOrder('b', '临沂', '临汾', 'finished', false),
    ];
    const h = buildHistoryInsights(orders, vehicle);
    expect(h.lossOverRate).toBe(0.5);
  });

  it('空订单不崩溃', () => {
    const h = buildHistoryInsights([], vehicle);
    expect(h.topRoutes).toEqual([]);
    expect(h.completionRate).toBe(0);
    expect(h.totalNetIncome).toBe(0);
  });
});

describe('空驶里程规划（P3）', () => {
  it('同城空驶为 0', async () => {
    const p = new MockRoutePlanner();
    expect(await p.estimateEmptyKm('临沂', '临沂')).toBe(0);
  });

  it('不同城市返回稳定距离', async () => {
    const p = new MockRoutePlanner();
    const d1 = await p.estimateEmptyKm('广州', '武汉');
    const d2 = await p.estimateEmptyKm('广州', '武汉');
    expect(d1).toBe(d2);
    expect(d1).toBeGreaterThan(0);
  });
});

describe('真实货源 API 仓储（P3）', () => {
  it('解析数组响应', async () => {
    const fake = { ok: true, status: 200, json: async () => [{ id: 'A1', from: '广州', to: '武汉', km: 1000, cargo: '普货', cls: '普货', wt: 20, truck: '13米高栏', price: 7000, pickup: '今天 08:00', owner: 'x', phone: '1', verified: true, pub: 0, status: 'open' }] } as Response;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fake));
    const repo = new ApiCargoRepository({ url: 'http://test/api', timeoutMs: 1000 });
    const list = await repo.listAll();
    expect(list.length).toBe(1);
    expect(list[0]!.id).toBe('A1');
    vi.unstubAllGlobals();
  });

  it('解析 {data:[...]} 包裹响应', async () => {
    const fake = { ok: true, status: 200, json: async () => ({ data: [{ id: 'B1', from: 'a', to: 'b', km: 1, cargo: 'c', cls: '普货', wt: 1, truck: 't', price: 1, pickup: '', owner: 'o', phone: '', verified: true, pub: 0, status: 'open' }] }) } as Response;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fake));
    const repo = new ApiCargoRepository({ url: 'http://test/api' });
    const list = await repo.listAll();
    expect(list.length).toBe(1);
    vi.unstubAllGlobals();
  });

  it('过滤非法条目（空数据 → []）', async () => {
    const fake = { ok: true, status: 200, json: async () => [{ id: 1 }, null, { id: 'ok', from: 'a', to: 'b', km: 1, cargo: 'c', cls: '普货', wt: 1, truck: 't', price: 1, status: 'open' }] } as Response;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fake));
    const repo = new ApiCargoRepository({ url: 'http://test/api' });
    const list = await repo.listAll();
    expect(list.length).toBe(1);
    expect(list[0]!.id).toBe('ok');
    vi.unstubAllGlobals();
  });

  it('HTTP 非 2xx 抛错', async () => {
    const fake = { ok: false, status: 500, json: async () => ({}) } as Response;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fake));
    const repo = new ApiCargoRepository({ url: 'http://test/api' });
    await expect(repo.listAll()).rejects.toThrow('HTTP 500');
    vi.unstubAllGlobals();
  });

  it('超时抛错', async () => {
    vi.stubGlobal('fetch', vi.fn((_u: string, init?: RequestInit) => new Promise((_, reject) => {
      // 模拟永不返回；用 AbortSignal 触发
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const repo = new ApiCargoRepository({ url: 'http://slow/api', timeoutMs: 50 });
    await expect(repo.listAll()).rejects.toThrow('超时');
    vi.unstubAllGlobals();
  });
});
