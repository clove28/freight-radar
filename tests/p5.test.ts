/**
 * P5 新增模块单元测试
 * 覆盖：文件持久化仓储、路线偏好记忆、行情价格异常、中途天气。
 */
import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFileRepositories } from '../src/data/fileRepository.js';
import { quoteFor, priceFlagByQuote, kmAdjust } from '../src/core/quote.js';
import { PRICE_FLAG_HIGH_RATIO, PRICE_FLAG_LOW_RATIO } from '../src/core/constants.js';
import { RouteEnvironmentService } from '../src/server/routeService.js';
import { AmapClient } from '../src/data/amap.js';
import { createOrder } from '../src/core/order.js';
import type { Cargo, CargoClass } from '../src/core/types.js';

/** 每个用例独立的临时目录 */
function tmpDir(): string {
  const d = mkdtempSync(path.join(tmpdir(), 'fr-test-'));
  return d;
}

afterEach(() => {
  // 清理测试临时目录
  for (const d of globalThis.__frTmpDirs ?? []) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  globalThis.__frTmpDirs = [];
});

declare global {
  // eslint-disable-next-line no-var
  var __frTmpDirs: string[] | undefined;
}

describe('文件持久化仓储（P5）', () => {
  it('订单重启后不丢失（模拟重建仓储实例）', async () => {
    const dir = tmpDir();
    (globalThis.__frTmpDirs ??= []).push(dir);

    // 第一次：写入订单
    const repos1 = createFileRepositories(dir);
    const cargo = (await repos1.cargo.listAll())[0]!;
    const order = createOrder({
      id: 'PERSIST-O1', loadId: cargo.id, from: cargo.from, to: cargo.to,
      cargo: cargo.cargo, cls: cargo.cls, wt: cargo.wt, truck: cargo.truck,
      price: cargo.price, km: cargo.km, owner: cargo.owner,
    });
    await repos1.order.save(order);
    await repos1.prefs.save({ minPerKm: 3, minNetIncome: null, maxKm: null, preferredStrategy: 'national' });

    // 第二次：新实例（模拟重启）应读到同一订单与偏好
    const repos2 = createFileRepositories(dir);
    const orders = await repos2.order.listAll();
    expect(orders.some(o => o.id === 'PERSIST-O1')).toBe(true);
    const prefs = await repos2.prefs.get();
    expect(prefs.minPerKm).toBe(3);
    expect(prefs.preferredStrategy).toBe('national');

    // 文件真实存在
    expect(existsSync(path.join(dir, 'orders.json'))).toBe(true);
    expect(existsSync(path.join(dir, 'prefs.json'))).toBe(true);
  });

  it('车辆与信用持久化', async () => {
    const dir = tmpDir();
    (globalThis.__frTmpDirs ??= []).push(dir);
    const repos1 = createFileRepositories(dir);
    const v = await repos1.vehicle.get();
    v.currentCity = '武汉';
    v.fuelPrice = 7.6;
    await repos1.vehicle.save(v);
    const c = await repos1.credit.rate('新货主', 'good', ['按时装货']);

    const repos2 = createFileRepositories(dir);
    const v2 = await repos2.vehicle.get();
    expect(v2.currentCity).toBe('武汉');
    expect(v2.fuelPrice).toBe(7.6);
    const c2 = await repos2.credit.getByOwner('新货主');
    expect(c2?.score).toBe(1);
    expect(c?.blacklisted).toBe(false);
  });
});

describe('行情价格异常（P5）', () => {
  it('普货 500km 区间约 6.1–9.9 元/km', () => {
    const q = quoteFor('普货', 500);
    expect(q.low).toBeGreaterThan(5);
    expect(q.high).toBeGreaterThan(q.low);
  });

  it('短途单价上浮、长途下浮', () => {
    expect(kmAdjust(100)).toBe(1.25);
    expect(kmAdjust(500)).toBe(1.1);
    expect(kmAdjust(1000)).toBe(1.0);
    expect(kmAdjust(2000)).toBe(0.9);
  });

  it('note 与返回值共用同一份四舍五入结果', () => {
    const classes: CargoClass[] = ['农产品', '冷藏', '建材', '重货', '普货', '危化', '快递', '其他'];
    // 覆盖 kmAdjust 的每一档边界（0 / 短途 / 中途 / 长途分界）
    for (const cls of classes) {
      for (const km of [0, 100, 300, 500, 600, 1200, 2000]) {
        const q = quoteFor(cls, km);
        // note 里的两个数字必须与 low / high 完全一致，而不是各算一遍
        expect(q.note).toContain(`参考区间 ${q.low}–${q.high} 元/km`);
        // 保留一位小数（再次四舍五入应等于原值）
        expect(Math.round(q.low * 10) / 10).toBe(q.low);
        expect(Math.round(q.high * 10) / 10).toBe(q.high);
        expect(q.high).toBeGreaterThan(q.low);
      }
    }
  });

  it('普货 500km 精确为 6.1–9.9 元/km', () => {
    expect(quoteFor('普货', 500)).toMatchObject({ low: 6.1, high: 9.9 });
    expect(quoteFor('普货', 500).note).toContain('6.1–9.9 元/km');
  });

  it('冷藏比普货贵', () => {
    expect(quoteFor('冷藏', 500).low).toBeGreaterThan(quoteFor('普货', 500).low);
  });

  it('低于区间下限 → low；区间内 → normal；高于上限 → high', () => {
    // 普货 500km：low≈6.05 high≈9.9，区间约 [6.05, 9.9]
    const normal = priceFlagByQuote(500 * 8, 500, '普货');
    expect(normal.flag).toBe('normal');
    const low = priceFlagByQuote(500 * 4, 500, '普货');
    expect(low.flag).toBe('low');
    const high = priceFlagByQuote(500 * 15, 500, '普货');
    expect(high.flag).toBe('high');
    expect(low.quote.note).toContain('参考区间');
  });

  it('异常阈值来自 constants，上下限各放宽 8%', () => {
    expect(PRICE_FLAG_LOW_RATIO).toBe(0.92);
    expect(PRICE_FLAG_HIGH_RATIO).toBe(1.08);
    // 与注释里的「~8%」对齐：改一个阈值而忘了另一个/注释，这里会报警
    expect(1 - PRICE_FLAG_LOW_RATIO).toBeCloseTo(0.08, 10);
    expect(PRICE_FLAG_HIGH_RATIO - 1).toBeCloseTo(0.08, 10);
  });

  it('阈值边缘：留 1 分钱余量时判 normal，越过才判 low/high', () => {
    const q = quoteFor('普货', 500);
    // 用「元」为单位的 1 分钱余量，避开 perKm = price / km 在等号处的浮点抖动
    const lowEdge = q.low * PRICE_FLAG_LOW_RATIO * 500;
    expect(priceFlagByQuote(lowEdge + 0.01, 500, '普货').flag).toBe('normal');
    expect(priceFlagByQuote(lowEdge - 0.01, 500, '普货').flag).toBe('low');

    const highEdge = q.high * PRICE_FLAG_HIGH_RATIO * 500;
    expect(priceFlagByQuote(highEdge - 0.01, 500, '普货').flag).toBe('normal');
    expect(priceFlagByQuote(highEdge + 0.01, 500, '普货').flag).toBe('high');
  });
});

describe('中途天气（P5）', () => {
  it('短途无中途天气，长途有', async () => {
    const svc = new RouteEnvironmentService(new AmapClient({}));
    // 同城 = Mock 最短距离 → 无中途
    const short = await svc.routeEnvironment('临汾', '临汾', 'highway');
    expect(short.midWeather).toBeNull();
    // 注入远距离 fake：driving 返回 1000km → 应有中途天气
    const fakeAmap = {
      driving: async () => ({ distanceKm: 1000, durationMin: 600, toll: 100, real: true }),
      weather: async (city: string) => ({ city, weather: '晴', temp: 20, windScale: '2', humidity: 50, real: true }),
      poisAround: async () => [],
      get enabled() {
        return true;
      },
    } as unknown as AmapClient;
    const svc2 = new RouteEnvironmentService(fakeAmap);
    const long = await svc2.routeEnvironment('广州', '乌鲁木齐', 'highway');
    expect(long.plan.distanceKm).toBe(1000);
    expect(long.midWeather).not.toBeNull();
    expect(long.midWeather?.city).toBeTruthy();
  });
});
