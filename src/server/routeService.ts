/**
 * 货运雷达 · 路线环境服务（P4）
 *
 * 把高德客户端 + 天气规则 + 路线策略组合成"一趟货的路况全景"：
 *  - 驾车路径（距离/时长/过路费，支持高速/国道/平衡策略）
 *  - 出发地与目的地天气 + 对油耗/胎压/气耗的影响建议
 *  - 沿途补给点（加油站/餐馆）
 *
 * 全部确定性计算；高德仅提供基础数据，LLM 不参与。
 */
import { AmapClient, type AmapPoi, type AmapWeather, type DrivingPlan } from '../data/amap.js';
import { weatherImpact, gasFuelFactor } from '../core/weather.js';
import { ROUTE_STRATEGIES, type RouteStrategy } from '../core/routeStrategy.js';
import { CITIES, distBetween } from '../data/seed.js';

export interface RouteEnvironmentResult {
  from: string;
  to: string;
  plan: DrivingPlan;
  strategy: RouteStrategy;
  strategyLabel: string;
  /** 出发地天气 + 影响 */
  fromWeather: { weather: AmapWeather; impact: ReturnType<typeof weatherImpact> };
  /** 目的地天气（简版） */
  toWeather: AmapWeather;
  /** 中途城市天气（P5 沿途多段） */
  midWeather: AmapWeather | null;
  /** 沿途补给点 */
  pois: AmapPoi[];
  /** 是否为真实高德数据 */
  real: boolean;
}

/** 高速 vs 国道 对比结果 */
export interface RouteCompareResult {
  from: string;
  to: string;
  /** 高速路线（时间短 · 有过路费） */
  highway: { plan: DrivingPlan; fuel: number; totalCost: number };
  /** 国道（时间长 · 免过路费） */
  national: { plan: DrivingPlan; fuel: number; totalCost: number };
  /** 哪个总成本更低 */
  cheaper: 'highway' | 'national';
  real: boolean;
}

export class RouteEnvironmentService {
  constructor(private amap: AmapClient) {}

  /** 一趟货的路况全景 */
  async routeEnvironment(from: string, to: string, strategy: RouteStrategy = 'highway'): Promise<RouteEnvironmentResult> {
    const amapStrategy = strategy === 'national' ? 1 : strategy === 'balanced' ? 10 : 0;
    const [plan, fromW, toW, pois] = await Promise.all([
      this.amap.driving(from, to, amapStrategy as never),
      this.amap.weather(from),
      this.amap.weather(to),
      this.amap.poisAround(from, '加油站|餐馆', 8000),
    ]);
    const impact = weatherImpact(fromW.weather, fromW.temp, fromW.windScale);
    // P5：中途城市天气（在 from/to 之间找最近的城市；长距离才有意义）
    let midWeather: AmapWeather | null = null;
    if (plan.distanceKm > 300) {
      const mid = midpointCity(from, to);
      if (mid) {
        try {
          midWeather = await this.amap.weather(mid);
        } catch {
          midWeather = null;
        }
      }
    }
    return {
      from,
      to,
      plan,
      strategy,
      strategyLabel: ROUTE_STRATEGIES.find(s => s.value === strategy)?.label ?? strategy,
      fromWeather: { weather: fromW, impact },
      toWeather: toW,
      midWeather,
      pois,
      real: plan.real,
    };
  }

  /** 高速 vs 国道 对比：同样里程，哪个总成本（过路费+油费）更低 */
  async compare(from: string, to: string, vehicle: { fuelPer100km: number; fuelPrice: number }): Promise<RouteCompareResult> {
    const [highway, national] = await Promise.all([
      this.amap.driving(from, to, 0), // 0 = 高速优先
      this.amap.driving(from, to, 1), // 1 = 国道优先
    ]);
    const fuel = (p: DrivingPlan) => Math.round((p.distanceKm / 100) * vehicle.fuelPer100km * vehicle.fuelPrice);
    const h = { plan: highway, fuel: fuel(highway), totalCost: Math.round(highway.toll + fuel(highway)) };
    const n = { plan: national, fuel: fuel(national), totalCost: Math.round(national.toll + fuel(national)) };
    return { from, to, highway: h, national: n, cheaper: h.totalCost <= n.totalCost ? 'highway' : 'national', real: highway.real };
  }

  /** 天气对某车油耗的最终修正系数（含天然气） */
  fuelFactorFor(isGas: boolean, strategy: RouteStrategy, weather: AmapWeather): number {
    const impact = weatherImpact(weather.weather, weather.temp, weather.windScale);
    const gasAdj = gasFuelFactor(impact, isGas);
    // 结合路线策略的油耗系数：高速省油、国道费油
    const strategyFuel = strategy === 'highway' ? 0.95 : strategy === 'balanced' ? 1.05 : 1.15;
    return Math.round(gasAdj * strategyFuel * 100) / 100;
  }

  get strategies() {
    return ROUTE_STRATEGIES;
  }
}

/** 找路线中点附近城市（用 seed 的城市距离表） */
function midpointCity(from: string, to: string): string | null {
  const dTotal = distBetween(from, to);
  if (dTotal <= 0) return null;
  let best: string | null = null;
  let bestDiff = Infinity;
  for (const c of CITIES) {
    if (c === from || c === to) continue;
    const d1 = distBetween(from, c);
    const d2 = distBetween(c, to);
    // 接近半程且总距离接近直达
    const diff = Math.abs(d1 + d2 - dTotal) + Math.abs(d1 - d2);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = c;
    }
  }
  return best;
}
