/**
 * P2 订单 API 集成测试
 * 覆盖：接单闭环、证据链步骤、损耗对比、证据包、底线偏好过滤、价格异常字段。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';
import type { Express } from 'express';
import type { Order } from '../src/core/order.js';
import type { ScoredCargoView } from '../src/server/services.js';

let server: ReturnType<Express['listen']> | null = null;
let base = '';

async function getJson<T>(url: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const res = await fetch(url, init);
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

describe('P2 订单与底线 API', () => {
  beforeAll(async () => {
    await start();
  });
  afterAll(() => {
    server?.close();
  });

  it('接单闭环：接单 → 详情 → 证据链 → 损耗 → 证据包', async () => {
    // 拿一单货
    const { body: list } = await getJson<ScoredCargoView[]>(`${base}/api/cargos?topN=1`);
    const loadId = list[0]!.cargo.id;

    // 接单
    const accept = await getJson<Order>(`${base}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loadId }),
    });
    expect(accept.status).toBe(201);
    const order = accept.body;
    expect(order.steps.length).toBe(8);
    expect(order.status).toBe('accepted');

    // 该货源已标记 taken → 不再出现在开放货源列表（评分层只返回 open）
    const { body: after } = await getJson<ScoredCargoView[]>(`${base}/api/cargos?topN=50`);
    expect(after.every(s => s.cargo.id !== loadId)).toBe(true);

    // 完成 w1、w2
    const s1 = await getJson<Order>(`${base}/api/orders/${order.id}/steps/w1`, { method: 'POST' });
    expect(s1.body.steps.find(s => s.id === 'w1')?.done).toBe(true);
    await getJson<Order>(`${base}/api/orders/${order.id}/steps/w2`, { method: 'POST' });

    // 损耗对比（普货 2‰：30→29.95 无责）
    const loss = await getJson<Order>(`${base}/api/orders/${order.id}/loss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loadTons: 30, unloadTons: 29.95 }),
    });
    expect(loss.status).toBe(200);
    expect(loss.body.loss?.overLimit).toBe(false);
    expect(loss.body.loss?.lossKg).toBe(50);
    expect(loss.body.status).toBe('delivered');

    // 证据包（自动完成 w8 并置 finished）
    const pack = await getJson<{ pack: string }>(`${base}/api/orders/${order.id}/pack`);
    expect(pack.body.pack).toContain('证据链');
    expect(pack.body.pack).toContain('无责');
    const finalOrder = await getJson<Order>(`${base}/api/orders/${order.id}`);
    expect(finalOrder.body.status).toBe('finished');
  });

  it('重复接同一货源返回 400', async () => {
    const { body: list } = await getJson<ScoredCargoView[]>(`${base}/api/cargos?topN=1`);
    const loadId = list[0]!.cargo.id;
    const first = await getJson<Order>(`${base}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loadId }),
    });
    expect(first.status).toBe(201);
    const second = await getJson<Order>(`${base}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loadId }),
    });
    expect(second.status).toBe(400);
  });

  it('非法损耗参数返回 400', async () => {
    const { body: list } = await getJson<ScoredCargoView[]>(`${base}/api/cargos?topN=1`);
    const loadId = list[0]!.cargo.id;
    const accept = await getJson<Order>(`${base}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loadId }),
    });
    const bad = await getJson<Order>(`${base}/api/orders/${accept.body.id}/loss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loadTons: 10, unloadTons: 11 }),
    });
    expect(bad.status).toBe(400);
  });

  it('订单列表包含已接订单；Dashboard activeOrders 同步', async () => {
    const { body: orders } = await getJson<Order[]>(`${base}/api/orders`);
    expect(orders.length).toBeGreaterThan(0);
    const { body: dash } = await getJson<{ activeOrders: number }>(`${base}/api/dashboard`);
    expect(dash.activeOrders).toBeGreaterThan(0);
  });

  it('底线偏好：保存后大厅默认过滤生效', async () => {
    // 保存极高底线 → 全部被过滤
    const put = await getJson<unknown>(`${base}/api/prefs`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minNetIncome: 999999 }),
    });
    expect(put.status).toBe(200);
    const { body: list } = await getJson<ScoredCargoView[]>(`${base}/api/cargos?topN=50`);
    expect(list.length).toBe(0);

    // 清空底线 → 恢复
    await getJson<unknown>(`${base}/api/prefs`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minNetIncome: null }),
    });
    const { body: list2 } = await getJson<ScoredCargoView[]>(`${base}/api/cargos?topN=50`);
    expect(list2.length).toBeGreaterThan(0);
  });

  it('货源列表带价格异常标记字段', async () => {
    const { body: list } = await getJson<ScoredCargoView[]>(`${base}/api/cargos?topN=50`);
    expect(list.length).toBeGreaterThan(0);
    for (const item of list) {
      expect(['low', 'high', 'normal']).toContain(item.priceFlag);
      expect(typeof item.priceFlagLabel).toBe('string');
    }
  });

  it('GET /api/orders/:id 404', async () => {
    const res = await fetch(`${base}/api/orders/NOPE`);
    expect(res.status).toBe(404);
  });
});
