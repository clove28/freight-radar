/**
 * P4 新增模块单元测试
 * 覆盖：天气影响规则、路线策略系数、成本修正（策略+天气）、高德回退。
 */
import { describe, expect, it } from 'vitest';
import { weatherImpact, gasFuelFactor } from '../src/core/weather.js';
import {
  fuelFactor, tollFactor, durationFactor, ROUTE_STRATEGIES,
  normalizeStrategy, DEFAULT_ROUTE_STRATEGY, type RouteStrategy,
} from '../src/core/routeStrategy.js';
import { calcCost } from '../src/core/cost.js';
import { ApiRoutePlanner, MockRoutePlanner } from '../src/core/routePlanner.js';
import { RouteEnvironmentService } from '../src/server/routeService.js';
import { AmapClient } from '../src/data/amap.js';
import type { Cargo, Vehicle } from '../src/core/types.js';

const vehicle: Vehicle = {
  id: 'v1', plate: '晋L·T', truck: '13米高栏', maxLoad: 32,
  fuelPer100km: 32, fuelPrice: 7.2, tollPerKm: 1.2, otherCostPerTrip: 180,
  currentCity: '临沂', homeCities: ['临汾'], routes: [],
};

const cargo: Cargo = {
  id: 'C1', from: '广州', to: '武汉', km: 1050, cargo: '日用百货', cls: '普货',
  wt: 28, truck: '13米高栏', price: 7600, pickup: '今天 08:00',
  owner: '张老板', phone: '1', verified: true, pub: 0, status: 'open',
};

describe('天气影响规则（P4）', () => {
  it('晴天常温：无修正', () => {
    const r = weatherImpact('晴', 22, '2');
    expect(r.fuelFactor).toBe(1);
    expect(r.tireAdjustBar).toBe(0);
    expect(r.slowDown).toBe(false);
  });

  it('雨天：油耗+6%，建议降速', () => {
    const r = weatherImpact('小雨', 20, '3');
    expect(r.fuelFactor).toBe(1.06);
    expect(r.slowDown).toBe(true);
    expect(r.advice).toContain('降速');
  });

  it('雪天：油耗+12%（常温无低温叠加）', () => {
    expect(weatherImpact('大雪', 20, '4').fuelFactor).toBe(1.12);
  });

  it('低温：油耗+4%，胎压+0.1 需补气', () => {
    const r = weatherImpact('晴', 5, '2');
    expect(r.fuelFactor).toBe(1.04);
    expect(r.tireAdjustBar).toBe(0.1);
  });

  it('严寒：再+4%，胎压累计+0.2', () => {
    const r = weatherImpact('晴', -10, '2');
    expect(r.fuelFactor).toBe(1.08);
    expect(r.tireAdjustBar).toBe(0.2);
  });

  it('高温：油耗+5%，胎压-0.1 降压防爆', () => {
    const r = weatherImpact('晴', 36, '2');
    expect(r.fuelFactor).toBe(1.05);
    expect(r.tireAdjustBar).toBe(-0.1);
    expect(r.advice).toContain('防爆');
  });

  it('大风≥6级：油耗+5%，建议降速', () => {
    const r = weatherImpact('晴', 22, '7');
    expect(r.fuelFactor).toBe(1.05);
    expect(r.slowDown).toBe(true);
  });

  it('雨天+低温叠加', () => {
    const r = weatherImpact('小雨', 8, '2');
    expect(r.fuelFactor).toBe(1.1); // 0.06 + 0.04
    expect(r.tireAdjustBar).toBe(0.1);
  });

  it('天然气车：低温再+2%', () => {
    const base = weatherImpact('晴', 5, '2');
    expect(gasFuelFactor(base, true)).toBe(1.06);
    expect(gasFuelFactor(base, false)).toBe(1.04);
  });
});

describe('路线策略系数（P4）', () => {
  it('三种策略齐全', () => {
    expect(ROUTE_STRATEGIES.map(s => s.value)).toEqual(['highway', 'balanced', 'national']);
  });

  it('高速费：高速1.0 / 平衡0.6 / 国道0', () => {
    expect(tollFactor('highway')).toBe(1.0);
    expect(tollFactor('balanced')).toBe(0.6);
    expect(tollFactor('national')).toBe(0);
  });

  it('油耗：高速0.95 / 平衡1.05 / 国道1.15', () => {
    expect(fuelFactor('highway')).toBe(0.95);
    expect(fuelFactor('balanced')).toBe(1.05);
    expect(fuelFactor('national')).toBe(1.15);
  });

  it('时长：高速0.75 / 国道1.6', () => {
    expect(durationFactor('highway')).toBe(0.75);
    expect(durationFactor('national')).toBe(1.6);
  });

  it('normalizeStrategy：只放行三种合法策略，其余回退高速', () => {
    expect(normalizeStrategy('highway')).toBe('highway');
    expect(normalizeStrategy('balanced')).toBe('balanced');
    expect(normalizeStrategy('national')).toBe('national');
    for (const bad of ['expressway', 'Highway', '', ' ', '高速', null, undefined, 0, 1, {}] as unknown[]) {
      expect(normalizeStrategy(bad)).toBe(DEFAULT_ROUTE_STRATEGY);
    }
  });

  it('非法策略兜底为高速系数，不再返回 undefined', () => {
    // 策略可能来自持久化偏好 / 查询参数 / 旧数据，运行时不受联合类型约束
    const junk = ['expressway', 'Highway', '', null, undefined, 0, {}] as unknown as RouteStrategy[];
    for (const bad of junk) {
      expect(tollFactor(bad)).toBe(1.0);
      expect(fuelFactor(bad)).toBe(0.95);
      expect(durationFactor(bad)).toBe(0.75);
    }
  });
});

describe('成本修正（策略+天气，P4）', () => {
  it('默认（不传策略）与旧版一致（向后兼容）', () => {
    const base = calcCost(cargo, vehicle);
    const noOpt = calcCost(cargo, vehicle, {});
    expect(noOpt.fuel).toBe(base.fuel);
    expect(noOpt.toll).toBe(base.toll);
    expect(base.fuel).toBeCloseTo((1050 / 100) * 32 * 7.2, 6); // 无策略修正
  });

  it('国道：过路费为 0，油耗上升', () => {
    const highway = calcCost(cargo, vehicle, { routeStrategy: 'highway' });
    const national = calcCost(cargo, vehicle, { routeStrategy: 'national' });
    expect(national.toll).toBe(0);
    expect(national.fuel).toBeGreaterThan(highway.fuel);
  });

  it('天气影响注入：雨天油耗更高', () => {
    const normal = calcCost(cargo, vehicle);
    const rainy = calcCost(cargo, vehicle, { fuelFactor: 1.06 });
    expect(rainy.fuel).toBeGreaterThan(normal.fuel);
  });

  it('策略+天气叠加', () => {
    const both = calcCost(cargo, vehicle, { routeStrategy: 'national', fuelFactor: 1.12 });
    expect(both.toll).toBe(0);
    // 国道1.15 × 雪天1.12 = 1.288
    expect(both.fuel).toBeCloseTo((1050 / 100) * 32 * 7.2 * 1.288, 0);
  });

  it('非法策略不会把金额算成 NaN（按高速兜底）', () => {
    const highway = calcCost(cargo, vehicle, { routeStrategy: 'highway' });
    const junk = calcCost(cargo, vehicle, { routeStrategy: 'expressway' as RouteStrategy });
    expect(junk).toEqual(highway);
    expect(Number.isNaN(junk.totalCost)).toBe(false);
    expect(Number.isNaN(junk.netIncome)).toBe(false);
    expect(Number.isNaN(junk.perKm)).toBe(false);
  });
});

describe('路线规划回退（P4）', () => {
  it('MockRoutePlanner 同城空驶 0', async () => {
    const p = new MockRoutePlanner();
    expect(await p.estimateEmptyKm('临沂', '临沂')).toBe(0);
  });

  it('ApiRoutePlanner 无 key 时回退 Mock（不抛错）', async () => {
    const p = new ApiRoutePlanner(undefined);
    const km = await p.estimateEmptyKm('广州', '武汉');
    expect(km).toBeGreaterThan(0);
    expect(km).toBe(await p.estimateEmptyKm('广州', '武汉')); // 稳定
  });

  it('RouteEnvironmentService 无 key 时返回 Mock 全景', async () => {
    const svc = new RouteEnvironmentService(new AmapClient({}));
    const r = await svc.routeEnvironment('广州', '武汉', 'highway');
    expect(r.real).toBe(false);
    expect(r.plan.distanceKm).toBeGreaterThan(0);
    expect(r.fromWeather.weather).toBeTruthy();
    expect(r.pois.length).toBeGreaterThan(0);
    expect(r.strategyLabel).toContain('高速');
  });

  it('fuelFactorFor 组合天气与策略', () => {
    const svc = new RouteEnvironmentService(new AmapClient({}));
    // 大雪(1.12) + 低温-5(0.08) = 1.2；国道 1.15 → 1.38
    const f = svc.fuelFactorFor(false, 'national', { city: 'x', weather: '大雪', temp: -5, windScale: '4', humidity: 90, real: true });
    expect(f).toBeCloseTo(1.38, 5);
    // 常温雪天：1.12 × 国道1.15 ≈ 1.288 → 舍入 1.29
    const f2 = svc.fuelFactorFor(false, 'national', { city: 'x', weather: '大雪', temp: 20, windScale: '4', humidity: 90, real: true });
    expect(f2).toBeCloseTo(1.29, 2);
  });
});
