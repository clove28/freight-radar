/**
 * 货运雷达 · 历史个性化（P3）
 *
 * 从已完成订单沉淀司机画像：
 *  - 常跑线路（高频 from→to）
 *  - 平均净收益 / km
 *  - 完成率（finished / 总订单）
 *  - 损耗表现（超损比例）
 *
 * 反哺方式（不另起推荐算法）：
 *  - 常跑线路自动并入"车辆常跑路线"，让现有 route 评分项直接受益；
 *  - 画像数据通过 /api/history 提供给前端展示。
 */
import type { Order } from './order.js';
import type { Cargo, Vehicle } from './types.js';
import { calcCost } from './cost.js';
import type { CostOptions } from './cost.js';

/** 历史画像（P3） */
export interface HistoryInsights {
  /** 高频常跑线路（按单数降序） */
  topRoutes: Array<{ from: string; to: string; count: number }>;
  /** 平均每公里净收益（元/km，按已完成订单估算） */
  avgPerKm: number;
  /** 完成率 0–1（finished / 总订单数） */
  completionRate: number;
  /** 超损比例 0–1（有损耗对比的订单中超损占比） */
  lossOverRate: number;
  /** 已完成单数 */
  finishedCount: number;
  /** 累计净收益（元，估算） */
  totalNetIncome: number;
}

/**
 * 从订单沉淀画像。
 * @param orders 订单
 * @param vehicle 车辆（估算净收益用）
 * @param costFor 可选：成本选项（真实空驶）
 */
export function buildHistoryInsights(
  orders: Order[],
  vehicle: Vehicle,
  costFor?: (c: Cargo) => CostOptions | undefined,
): HistoryInsights {
  // 1. 常跑线路：统计 from→to 频次
  const routeCount = new Map<string, { from: string; to: string; count: number }>();
  for (const o of orders) {
    const key = `${o.from}→${o.to}`;
    const cur = routeCount.get(key);
    if (cur) cur.count += 1;
    else routeCount.set(key, { from: o.from, to: o.to, count: 1 });
  }
  const topRoutes = [...routeCount.values()].sort((a, b) => b.count - a.count).slice(0, 5);

  // 2. 完成率
  const finished = orders.filter(o => o.status === 'finished');
  const completionRate = orders.length > 0 ? finished.length / orders.length : 0;

  // 3. 损耗表现：有损耗对比的订单中，超损比例
  const withLoss = orders.filter(o => o.loss !== null);
  const lossOverRate =
    withLoss.length > 0 ? withLoss.filter(o => o.loss!.overLimit).length / withLoss.length : 0;

  // 4. 净收益估算：已完成订单按车辆参数重算成本（订单未存成本快照，演示估算）
  let totalNetIncome = 0;
  for (const o of finished) {
    const c: Cargo = {
      id: o.loadId, from: o.from, to: o.to, km: o.km, cargo: o.cargo, cls: o.cls,
      wt: o.wt, truck: o.truck, price: o.price, pickup: '', owner: o.owner,
      phone: '', verified: true, pub: o.createdAt, status: 'taken',
    };
    const cost = calcCost(c, vehicle, costFor?.(c));
    totalNetIncome += cost.netIncome;
  }
  const totalKm = finished.reduce((s, o) => s + o.km, 0);
  const avgPerKm = totalKm > 0 ? Math.round((totalNetIncome / totalKm) * 100) / 100 : 0;

  return {
    topRoutes,
    avgPerKm,
    completionRate,
    lossOverRate,
    finishedCount: finished.length,
    totalNetIncome: Math.round(totalNetIncome * 100) / 100,
  };
}
