/**
 * 成本计算引擎单元测试
 * 验证：油费/高速费/其他/空驶/总成本/净收益/每公里 公式正确，纯函数可复现。
 */
import { describe, expect, it } from 'vitest';
import { calcCost, canCarry, truckMatches } from '../src/core/cost.js';
import type { Cargo, Vehicle } from '../src/core/types.js';

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
  routes: [],
};

const cargo: Cargo = {
  id: 'C1',
  from: '临沂',
  to: '临汾',
  km: 500,
  cargo: '黄豆粕',
  cls: '农产品',
  wt: 30,
  truck: '13米高栏',
  price: 8600,
  pickup: '今天 08:00',
  owner: '张老板',
  phone: '13800000000',
  verified: true,
  pub: Date.now(),
  status: 'open',
};

describe('calcCost 成本计算', () => {
  it('油费 = 里程/100 × 百公里油耗 × 油价', () => {
    const c = calcCost(cargo, vehicle);
    // 500/100*32*7.2 = 1152
    expect(c.fuel).toBe(1152);
  });

  it('高速费 = 里程 × 每公里系数', () => {
    const c = calcCost(cargo, vehicle);
    expect(c.toll).toBe(600);
  });

  it('其他费用来自车辆档案', () => {
    const c = calcCost(cargo, vehicle);
    expect(c.other).toBe(180);
  });

  it('空驶成本 = 空驶里程/100 × 油耗 × 油价（空驶取15%）', () => {
    const c = calcCost(cargo, vehicle);
    // emptyKm = round(500*0.15)=75 → 75/100*32*7.2 = 172.8
    expect(c.emptyCost).toBe(172.8);
  });

  it('总成本 = 油费+高速费+其他+空驶', () => {
    const c = calcCost(cargo, vehicle);
    expect(c.totalCost).toBe(1152 + 600 + 180 + 172.8);
  });

  it('净收益 = 运费 − 总成本', () => {
    const c = calcCost(cargo, vehicle);
    expect(c.netIncome).toBe(8600 - 2104.8);
  });

  it('每公里净收益 = 净收益 / 总里程', () => {
    const c = calcCost(cargo, vehicle);
    expect(c.perKm).toBe(12.99); // 6495.2/500 = 12.9904 → 12.99
  });

  it('零里程不崩溃', () => {
    const zero = { ...cargo, km: 0, price: 0 };
    const c = calcCost(zero, vehicle);
    expect(c.perKm).toBe(0);
    expect(c.totalCost).toBeGreaterThan(0); // 空驶0，其他费用仍在
  });
});

describe('canCarry 载重约束', () => {
  it('超载不可接', () => {
    expect(canCarry(vehicle, { ...cargo, wt: 33 })).toBe(false);
  });
  it('载重内可接', () => {
    expect(canCarry(vehicle, { ...cargo, wt: 31 })).toBe(true);
  });
});

describe('truckMatches 车型匹配', () => {
  it('完全一致', () => {
    expect(truckMatches('13米高栏', '13米高栏')).toBe(true);
  });
  it('包含匹配', () => {
    expect(truckMatches('13米高栏', '13米')).toBe(true);
  });
  it('不匹配', () => {
    expect(truckMatches('13米高栏', '9.6米')).toBe(false);
  });
  it('任一侧车型为空时判不匹配（未知 ≠ 匹配）', () => {
    expect(truckMatches('', '13米高栏')).toBe(false);
    expect(truckMatches('13米高栏', '')).toBe(false);
    expect(truckMatches('', '')).toBe(false);
  });
  it('纯空白车型视同未填，同样不匹配', () => {
    expect(truckMatches('  ', '13米高栏')).toBe(false);
    expect(truckMatches('13米高栏', '\t\n')).toBe(false);
  });
  it('车型内部的空白仍被忽略，不影响正常匹配', () => {
    expect(truckMatches('13米 高栏', ' 13米 ')).toBe(true);
  });
});
