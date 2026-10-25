/**
 * Express API 集成测试
 * 验证：路由存在、返回结构正确、错误处理（400/404/500）。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';
import type { Express } from 'express';
import type { DashboardData, Recommendation, ScoredCargo, Vehicle } from '../src/core/types.js';

// 用原生 fetch 走真实 HTTP 栈（Node 18+ 自带）
let server: ReturnType<Express['listen']> | null = null;
let base = '';

/** fetch JSON 的类型化辅助（测试用，运行时零开销） */
async function getJson<T>(url: string): Promise<{ status: number; body: T }> {
  const res = await fetch(url);
  return { status: res.status, body: (await res.json()) as T };
}

function start(): Promise<string> {
  return new Promise(resolve => {
    const app = createApp();
    server = app.listen(0, () => {
      const addr = server!.address();
      const port = typeof addr === 'object' && addr ? addr.port : 3000;
      base = `http://127.0.0.1:${port}`;
      resolve(base);
    });
  });
}

describe('货运雷达 API', () => {
  beforeAll(async () => {
    await start();
  });

  afterAll(() => {
    server?.close();
  });

  it('GET /api/health 健康检查', async () => {
    const { status, body } = await getJson<{ ok: boolean; name: string }>(`${base}/api/health`);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.name).toBe('货运雷达');
  });

  it('GET /api/dashboard 返回首页聚合', async () => {
    const { status, body } = await getJson<DashboardData>(`${base}/api/dashboard`);
    expect(status).toBe(200);
    expect(body.vehicle).toBeDefined();
    expect(body.currentCity).toBe('临沂');
    expect(body.topLoads.length).toBe(3);
    expect(body.monthOrders).toBeGreaterThan(0);
    // 每单都有成本与评分
    for (const t of body.topLoads) {
      expect(t.cost).toBeDefined();
      expect(t.score.total).toBeGreaterThanOrEqual(0);
    }
  });

  it('GET /api/dashboard 返回 P1 扩展字段（openCount/topLoad/activeOrders）', async () => {
    const { body } = await getJson<Record<string, unknown>>(`${base}/api/dashboard`);
    expect(typeof body.openCount).toBe('number');
    expect(body.openCount).toBeGreaterThan(0);
    expect(body.topLoad).not.toBeNull();
    expect(body.activeOrders).toBe(0); // P1 约定：订单未接入，返回 0
  });

  it('GET /api/cargos 返回评分列表（默认10条）', async () => {
    const { status, body } = await getJson<ScoredCargo[]>(`${base}/api/cargos`);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body.length).toBeLessThanOrEqual(10);
    // 按总分降序
    for (let i = 1; i < body.length; i++) {
      expect(body[i - 1]!.score.total).toBeGreaterThanOrEqual(body[i]!.score.total);
    }
  });

  it('GET /api/cargos 支持按净收益/每公里/距离排序', async () => {
    const net = await getJson<ScoredCargo[]>(`${base}/api/cargos?sort=netIncome&topN=50`);
    for (let i = 1; i < net.body.length; i++) {
      expect(net.body[i - 1]!.cost.netIncome).toBeGreaterThanOrEqual(net.body[i]!.cost.netIncome);
    }
    const perKm = await getJson<ScoredCargo[]>(`${base}/api/cargos?sort=perKm&topN=50`);
    for (let i = 1; i < perKm.body.length; i++) {
      expect(perKm.body[i - 1]!.cost.perKm).toBeGreaterThanOrEqual(perKm.body[i]!.cost.perKm);
    }
    const dist = await getJson<ScoredCargo[]>(`${base}/api/cargos?sort=distance&topN=50`);
    for (let i = 1; i < dist.body.length; i++) {
      expect(dist.body[i - 1]!.cargo.km).toBeLessThanOrEqual(dist.body[i]!.cargo.km);
    }
  });

  it('GET /api/cargos?backhaulOnly=1 只返回回程货', async () => {
    const { body } = await getJson<ScoredCargo[]>(`${base}/api/cargos?backhaulOnly=1&topN=50`);
    expect(body.length).toBeGreaterThan(0);
    for (const item of body) {
      expect(item.isBackhaul).toBe(true);
    }
  });

  it('GET /api/cargos/:id 详情与 404', async () => {
    const { body: list } = await getJson<ScoredCargo[]>(`${base}/api/cargos`);
    const id = list[0]!.cargo.id;
    const { status, body: detail } = await getJson<ScoredCargo>(`${base}/api/cargos/${id}`);
    expect(status).toBe(200);
    expect(detail.cargo.id).toBe(id);
    expect(detail.cost.netIncome).toBeDefined();

    const miss = await fetch(`${base}/api/cargos/NOPE`);
    expect(miss.status).toBe(404);
  });

  it('POST /api/assistant 自然语言推荐', async () => {
    const res = await fetch(`${base}/api/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '帮我看看回临汾的黄豆粕单' }),
    });
    expect(res.status).toBe(200);
    const r = (await res.json()) as Recommendation;
    expect(r.explanation).toBeTruthy();
    expect(r.scored).toBeDefined();
  });

  it('POST /api/assistant 空文本返回 400', async () => {
    const res = await fetch(`${base}/api/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('GET /api/cargos/:id/explain 返回 AI 解释与 404', async () => {
    const { body: list } = await getJson<ScoredCargo[]>(`${base}/api/cargos`);
    const id = list[0]!.cargo.id;
    const { status, body } = await getJson<{ explanation: string }>(`${base}/api/cargos/${id}/explain`);
    expect(status).toBe(200);
    expect(body.explanation.length).toBeGreaterThan(0);
    const miss = await fetch(`${base}/api/cargos/NOPE/explain`);
    expect(miss.status).toBe(404);
  });

  it('PUT /api/vehicle 更新车辆档案', async () => {
    const res = await fetch(`${base}/api/vehicle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fuelPrice: 7.6, currentCity: '武汉' }),
    });
    expect(res.status).toBe(200);
    const v = (await res.json()) as Vehicle;
    expect(v.fuelPrice).toBe(7.6);
    expect(v.currentCity).toBe('武汉');
    expect(v.truck).toBe('13米高栏'); // 未传字段保留原值
  });

  it('GET /api/vehicle 返回车辆档案', async () => {
    const { status, body } = await getJson<Vehicle>(`${base}/api/vehicle`);
    expect(status).toBe(200);
    expect(body.truck).toBe('13米高栏');
    expect(body.homeCities).toContain('临汾');
  });

  it('PUT /api/prefs 策略：合法值保存、非法值沿用旧值、null 清空', async () => {
    const put = async (value: unknown) => {
      const res = await fetch(`${base}/api/prefs`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredStrategy: value }),
      });
      return { status: res.status, body: (await res.json()) as { preferredStrategy: string | null } };
    };

    const saved = await put('national');
    expect(saved.status).toBe(200);
    expect(saved.body.preferredStrategy).toBe('national');

    // 非法字符串 / 非字符串都不能覆盖已保存的合法值（语义：沿用旧值，而非回退 highway）
    const badString = await put('expressway');
    expect(badString.status).toBe(200);
    expect(badString.body.preferredStrategy).toBe('national');

    const badType = await put(123);
    expect(badType.body.preferredStrategy).toBe('national');

    const cleared = await put(null);
    expect(cleared.body.preferredStrategy).toBeNull();
  });

  it('GET /api/route/environment 非法策略回退高速，合法策略透传', async () => {
    // 显式传空 env：确保走 Mock 路线，不依赖本机 .env / 外网
    const isolated = createApp(undefined, {});
    const srv = isolated.listen(0);
    await new Promise<void>(resolve => srv.once('listening', resolve));
    try {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;

      const bad = await getJson<{ strategy: string }>(
        `${baseUrl}/api/route/environment?${new URLSearchParams({ from: '广州', to: '武汉', strategy: 'expressway' })}`,
      );
      expect(bad.status).toBe(200);
      expect(bad.body.strategy).toBe('highway');

      const good = await getJson<{ strategy: string }>(
        `${baseUrl}/api/route/environment?${new URLSearchParams({ from: '广州', to: '武汉', strategy: 'national' })}`,
      );
      expect(good.body.strategy).toBe('national');
    } finally {
      srv.close();
    }
  });
});
