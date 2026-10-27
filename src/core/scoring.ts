/**
 * 货运雷达 · 综合评分引擎
 *
 * 给每单货源打一个 0–100 的综合分，用于推荐排序。
 * 权重（见 constants.ts）：收益 40% · 路线匹配 20% · 回程概率 20% · 车型匹配 10% · 时间匹配 10%
 *
 * 评分全部基于确定性业务数据（成本、路线、回程、车型、时间），
 * 不包含任何 LLM 主观判断——LLM 只负责解释评分结果。
 */
import {
  BACKHAUL_NONE_SCORE,
  BACKHAUL_SCORE,
  DEFAULT_TOP_N,
  MAX_TOP_N,
  PER_KM_BEST,
  PER_KM_WORST,
  ROUTE_EXACT_SCORE,
  ROUTE_NONE_SCORE,
  ROUTE_SAME_DEST_SCORE,
  SCORE_WEIGHTS,
  TIME_SCORE,
  TIME_SCORE_FALLBACK,
  TRUCK_MATCH_SCORE,
  TRUCK_MISMATCH_SCORE,
} from './constants.js';
import { calcCost, canCarry, truckMatches, type CostOptions } from './cost.js';
import type { Cargo, CostEstimate, DriverQuery, ScoredCargo, ScoreBreakdown, Vehicle } from './types.js';

/** 评分/过滤时提供每单成本选项（P3：可注入真实空驶里程） */
export type CostOptionsFor = (c: Cargo) => CostOptions | undefined;

/** 每公里净收益 → 0-100（线性：≥8 元满分，≤0 零分） */
export function scoreIncome(perKm: number): number {
  if (perKm >= PER_KM_BEST) return 100;
  if (perKm <= PER_KM_WORST) return 0;
  return Math.round((perKm / PER_KM_BEST) * 100);
}

/** 路线匹配：命中常跑路线满分；仅目的地相同给部分分 */
export function scoreRoute(cargo: Cargo, vehicle: Vehicle): number {
  if (!vehicle.routes.length) return ROUTE_NONE_SCORE;
  for (const r of vehicle.routes) {
    if (r.from === cargo.from && r.to === cargo.to) return ROUTE_EXACT_SCORE;
  }
  if (vehicle.routes.some(r => r.to === cargo.to)) return ROUTE_SAME_DEST_SCORE;
  return ROUTE_NONE_SCORE;
}

/** 回程概率：目的地是回程基地城市 → 满分 */
export function scoreBackhaul(cargo: Cargo, vehicle: Vehicle): number {
  return vehicle.homeCities.includes(cargo.to) ? BACKHAUL_SCORE : BACKHAUL_NONE_SCORE;
}

/** 车型匹配 */
export function scoreVehicle(cargo: Cargo, vehicle: Vehicle): number {
  return truckMatches(vehicle.truck, cargo.truck) ? TRUCK_MATCH_SCORE : TRUCK_MISMATCH_SCORE;
}

/**
 * 时间匹配：按装货时间标签估算小时数（演示数据为"今天/明天 HH:MM"），
 * 越近分越高。真实版应使用精确时间戳。
 */
export function scoreTime(cargo: Cargo): number {
  const hours = hoursUntilPickup(cargo.pickup);
  for (const t of TIME_SCORE) {
    if (hours <= t.hours) return t.score;
  }
  return TIME_SCORE_FALLBACK;
}

/** 解析装货时间标签 → 距现在小时数（演示数据的简单解析） */
export function hoursUntilPickup(pickup: string): number {
  const m = pickup.match(/(今天|明天)\s*(\d{1,2}):(\d{2})/);
  if (!m) return 24 * 7;
  const [, day, hh, mm] = m;
  const now = new Date();
  const target = new Date(now);
  if (day === '明天') target.setDate(target.getDate() + 1);
  target.setHours(Number(hh), Number(mm), 0, 0);
  const diffMs = target.getTime() - now.getTime();
  return Math.max(0, diffMs / 3_600_000);
}

/**
 * 用「已经算好的成本」评一单（纯函数）。
 *
 * 拆出本函数是为了让 `rankCargoes` 复用自己已经算出的成本：
 * 旧写法在 `rankCargoes` 里先 `calcCost` 一次、再调 `scoreCargo` 又算一次，
 * 即每单成本被算两遍；而 `costFor` 可能查库或调地图（P3 真实空驶里程），
 * 重复调用既浪费时间也可能产生不一致结果。
 */
export function scoreCargoWithCost(cargo: Cargo, vehicle: Vehicle, cost: CostEstimate): ScoreBreakdown {
  const income = scoreIncome(cost.perKm);
  const route = scoreRoute(cargo, vehicle);
  const backhaul = scoreBackhaul(cargo, vehicle);
  const vehicleS = scoreVehicle(cargo, vehicle);
  const time = scoreTime(cargo);
  const total = Math.round(
    income * SCORE_WEIGHTS.income +
      route * SCORE_WEIGHTS.route +
      backhaul * SCORE_WEIGHTS.backhaul +
      vehicleS * SCORE_WEIGHTS.vehicle +
      time * SCORE_WEIGHTS.time,
  );
  return { income, route, backhaul, vehicle: vehicleS, time, total };
}

/**
 * 综合评分一单（自行算成本）
 * @param costFor 可选：该单的成本选项（P3 注入真实空驶里程），每单调用一次
 */
export function scoreCargo(cargo: Cargo, vehicle: Vehicle, costFor?: CostOptionsFor): ScoreBreakdown {
  return scoreCargoWithCost(cargo, vehicle, calcCost(cargo, vehicle, costFor?.(cargo)));
}

/** 过滤（业务规则，不含 LLM） */
export function filterCargoes(cargos: Cargo[], vehicle: Vehicle, q: DriverQuery, costFor?: CostOptionsFor): Cargo[] {
  return cargos.filter(c => {
    if (c.status !== 'open') return false;
    // 载重约束
    if (!canCarry(vehicle, c)) return false;
    // 车型约束（司机明确指定车型时；纯空白视同未指定，保持"不过滤"的既有行为）
    const truckFilter = q.truck?.trim();
    if (truckFilter && !truckMatches(truckFilter, c.truck)) return false;
    // 出发地
    if (q.from && !c.from.includes(q.from)) return false;
    // 目的地
    if (q.to && !c.to.includes(q.to)) return false;
    // 货物关键字
    if (q.cargo && !(c.cargo.includes(q.cargo) || c.cls.includes(q.cargo))) return false;
    // 运距上限
    if (q.maxKm !== undefined && c.km > q.maxKm) return false;
    // 只看回程
    if (q.backhaulOnly && !vehicle.homeCities.includes(c.to)) return false;
    // 每公里净收益下限（需要先算成本）
    if (q.minPerKm !== undefined) {
      const cost = calcCost(c, vehicle, costFor?.(c));
      if (cost.perKm < q.minPerKm) return false;
    }
    return true;
  });
}

/**
 * 归一化返回条数：把来自 AI 解析 / 查询参数的"不可信条数"收敛到安全区间。
 * 非法值（undefined / NaN / 小数 / ≤0）回退默认条数，超大值截断到 MAX_TOP_N，
 * 避免 slice(0, 负数) 出现"少返回一条"这类反直觉结果。
 */
export function normalizeTopN(topN?: number): number {
  if (topN === undefined || !Number.isFinite(topN)) return DEFAULT_TOP_N;
  const n = Math.floor(topN);
  if (n < 1) return DEFAULT_TOP_N;
  return Math.min(n, MAX_TOP_N);
}

/**
 * 对一列货源评分并排序（业务代码完成，LLM 不参与）
 * @param costFor 可选：每单成本选项（P3 注入真实空驶里程）
 * @returns 按总分降序的 ScoredCargo 列表（条数经 normalizeTopN 收敛）
 */
export function rankCargoes(cargos: Cargo[], vehicle: Vehicle, q: DriverQuery = {}, costFor?: CostOptionsFor): ScoredCargo[] {
  const filtered = filterCargoes(cargos, vehicle, q, costFor);
  const scored = filtered.map(c => {
    // 成本只算一次：同一个 cost 既作为结果返回，也用于评分（旧写法会重复算一遍）
    const cost = calcCost(c, vehicle, costFor?.(c));
    const score = scoreCargoWithCost(c, vehicle, cost);
    return {
      cargo: c,
      cost,
      score,
      isBackhaul: vehicle.homeCities.includes(c.to),
      isRouteMatch: vehicle.routes.some(r => r.from === c.from && r.to === c.to),
    } satisfies ScoredCargo;
  });
  scored.sort((a, b) => b.score.total - a.score.total);
  return scored.slice(0, normalizeTopN(q.topN));
}
