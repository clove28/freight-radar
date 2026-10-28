/**
 * 货运雷达 · 成本计算引擎（确定性业务计算）
 *
 * 所有金额计算必须由本模块完成，禁止交给 LLM 计算。
 * 公式（与产品需求一致）：
 *   油费     = 总里程 / 100 × 百公里油耗 × 油价
 *   高速费   = 总里程 × 每公里高速费系数
 *   其他费用 = 车辆档案中的固定杂费（食宿/停车/装车杂费）
 *   空驶成本 = 空驶里程 / 100 × 百公里油耗 × 油价（去装货地的空驶）
 *   总成本   = 油费 + 高速费 + 其他费用 + 空驶成本
 *   净收益   = 运费 − 总成本
 *   每公里净收益 = 净收益 / 总行驶里程
 *
 * 注：空驶里程在 Mock 数据中取"当前城市→出发地"的估算距离；接真实 API 后
 * 由路线规划服务提供精确值。计算函数本身只依赖传入数字，保持纯函数可测。
 */
import type { Cargo, CostEstimate, Vehicle } from './types.js';
import { EMPTY_KM_DEFAULT_RATIO } from './constants.js';
import { fuelFactor, tollFactor, type RouteStrategy } from './routeStrategy.js';

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** 成本计算选项：可注入真实空驶里程 / 路线策略 / 天气系数（P3+P4） */
export interface CostOptions {
  /** 空驶里程（公里），缺省时按运距 15% 估算 */
  emptyKm?: number;
  /** 路线策略：高速/国道/平衡（P4），缺省高速 */
  routeStrategy?: RouteStrategy;
  /** 油耗修正系数（P4 天气影响，1=正常），缺省 1 */
  fuelFactor?: number;
  /** 高速费修正系数（P4 覆盖策略默认，一般不传） */
  tollFactorOverride?: number;
}

/** 计算一趟货的成本与净收益（纯函数） */
export function calcCost(cargo: Cargo, vehicle: Vehicle, opts: CostOptions = {}): CostEstimate {
  const totalKm = Math.max(cargo.km, 0);
  // 空驶里程：P3 起可由 RoutePlanner 注入真实值（当前城市→装货地）；
  // 未注入时按 EMPTY_KM_DEFAULT_RATIO（15%）估算（向后兼容）。
  const emptyKm =
    opts.emptyKm !== undefined
      ? Math.max(0, Math.round(opts.emptyKm))
      : Math.round(totalKm * EMPTY_KM_DEFAULT_RATIO);

  // P4：路线策略与天气影响。缺省（不传 strategy）时与旧版行为完全一致；
  // 只有显式传入 strategy 才应用策略系数（向后兼容）。
  const strategy = opts.routeStrategy;
  const fFuel = strategy ? fuelFactor(strategy) * (opts.fuelFactor ?? 1) : (opts.fuelFactor ?? 1);
  const fToll = strategy ? tollFactor(strategy) : (opts.tollFactorOverride ?? 1);

  const fuel = (totalKm / 100) * vehicle.fuelPer100km * vehicle.fuelPrice * fFuel;
  const toll = totalKm * vehicle.tollPerKm * fToll;
  const other = vehicle.otherCostPerTrip;
  const emptyCost = (emptyKm / 100) * vehicle.fuelPer100km * vehicle.fuelPrice;
  const totalCost = fuel + toll + other + emptyCost;
  const netIncome = cargo.price - totalCost;
  const perKm = totalKm > 0 ? netIncome / totalKm : 0;

  return {
    fuel: round2(fuel),
    toll: round2(toll),
    other: round2(other),
    emptyCost: round2(emptyCost),
    totalCost: round2(totalCost),
    netIncome: round2(netIncome),
    perKm: round2(perKm),
  };
}

/** 车型是否匹配（字符串包含匹配，如"13米高栏"与"13米"） */
export function truckMatches(vehicleTruck: string, cargoTruck: string): boolean {
  const a = vehicleTruck.replace(/\s+/g, '');
  const b = cargoTruck.replace(/\s+/g, '');
  // 未知 ≠ 匹配：任一侧没填车型（空串或纯空白）时直接判不匹配。
  // 否则 String.prototype.includes('') 恒为 true，空车型的车辆档案会对所有货源
  // 拿满车型分（权重 10%），"车型不符"这道防线静默失效。
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * 车辆是否能拉这单货（载重约束）
 * 货物重量超出核定载重则不可接（超载违法）。
 */
export function canCarry(vehicle: Vehicle, cargo: Cargo): boolean {
  return cargo.wt <= vehicle.maxLoad;
}
