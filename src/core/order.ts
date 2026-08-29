/**
 * 货运雷达 · 订单领域模型与规则（P2 新增）
 *
 * 订单 = 司机接了一单货源后形成的运输记录。
 * 与演示版（卡友助手.html）的证据链 8 步流程对齐，但本模块只做
 * 状态与损耗的确定性计算，拍照/签字等真机能力留待小程序/真机版。
 *
 * 注意：本文件是 P2 新增模块，不修改 P0/P1 已稳定的 cost/scoring/types。
 */
import { LOSS_STD } from './constants.js';
import type { CargoClass } from './types.js';

/** 订单状态 */
export type OrderStatus = 'accepted' | 'onway' | 'delivered' | 'finished';

/** 证据链步骤定义（对齐演示版） */
export interface OrderStep {
  id: string;
  label: string;
  phase: 'load' | 'onway' | 'unload' | 'finish';
  icon: string;
  done: boolean;
}

/** 损耗对比结果（确定性计算） */
export interface LossResult {
  /** 装货吨 */
  loadTons: number;
  /** 卸货吨 */
  unloadTons: number;
  /** 损耗公斤 = (装-卸)*1000 */
  lossKg: number;
  /** 损耗率 ‰ */
  ratePerMille: number;
  /** 该货物类别的行业参考损耗上限 ‰ */
  stdPerMille: number;
  /** 是否超损（司机应免责的判断依据） */
  overLimit: boolean;
  /** 责任结论文案 */
  verdict: string;
}

/** 订单（含证据链与损耗） */
export interface Order {
  id: string;
  loadId: string;
  from: string;
  to: string;
  cargo: string;
  cls: CargoClass;
  wt: number;
  truck: string;
  price: number;
  km: number;
  owner: string;
  createdAt: number;
  status: OrderStatus;
  steps: OrderStep[];
  loss: LossResult | null;
}

/** 8 步证据链定义（与演示版一致） */
export const ORDER_STEPS: OrderStep[] = [
  { id: 'w1', label: '① 装货称重拍照', phase: 'load', icon: '⚖️', done: false },
  { id: 'w2', label: '② 装车拍照', phase: 'load', icon: '📦', done: false },
  { id: 'w3', label: '③ 篷布/封条拍照', phase: 'load', icon: '🪢', done: false },
  { id: 'w4', label: '途中打卡（可跳过）', phase: 'onway', icon: '📌', done: false },
  { id: 'w5', label: '④ 卸货过磅拍照', phase: 'unload', icon: '⚖️', done: false },
  { id: 'w6', label: '⑤ 卸完拍照', phase: 'unload', icon: '✅', done: false },
  { id: 'w7', label: '损耗对比', phase: 'finish', icon: '📊', done: false },
  { id: 'w8', label: '生成证据包', phase: 'finish', icon: '📁', done: false },
];

/** 由货源创建订单（接单） */
export function createOrder(params: {
  id: string;
  loadId: string;
  from: string;
  to: string;
  cargo: string;
  cls: CargoClass;
  wt: number;
  truck: string;
  price: number;
  km: number;
  owner: string;
}): Order {
  return {
    ...params,
    createdAt: Date.now(),
    status: 'accepted',
    steps: ORDER_STEPS.map(s => ({ ...s })),
    loss: null,
  };
}

/**
 * 损耗对比（确定性公式）
 * 损耗公斤 = (装货吨 − 卸货吨) × 1000
 * 损耗率 ‰ = 损耗公斤 / (装货吨×1000) × 1000
 * 参考上限：农产品 5‰ / 冷藏 10‰ / 其他 2‰（constants.LOSS_STD）
 */
export function calcLoss(cls: CargoClass, loadTons: number, unloadTons: number): LossResult | null {
  if (!(loadTons > 0) || !(unloadTons > 0) || unloadTons > loadTons) return null;
  const lossKg = Math.round((loadTons - unloadTons) * 1000);
  const ratePerMille = loadTons > 0 ? Math.round((lossKg / (loadTons * 1000)) * 1000 * 10) / 10 : 0;
  const stdPerMille = LOSS_STD[cls];
  const overLimit = ratePerMille > stdPerMille;
  return {
    loadTons,
    unloadTons,
    lossKg,
    ratePerMille,
    stdPerMille,
    overLimit,
    verdict: overLimit
      ? `⚠ 损耗 ${lossKg}kg（${ratePerMille}‰）超过行业参考 ${stdPerMille}‰，责任待定（建议留存证据界定责任方）`
      : `✅ 损耗 ${lossKg}kg（${ratePerMille}‰），在行业参考 ${stdPerMille}‰ 以内，自然损耗司机无责`,
  };
}

/** 证据包文本（可复制/打印） */
export function buildEvidencePack(order: Order): string {
  const d: string[] = [];
  d.push('【货运雷达 · 运输证据包】');
  d.push(`货物：${order.cargo} ${order.wt}吨（${order.cls}）`);
  d.push(`路线：${order.from} → ${order.to}（${order.km}公里）`);
  d.push(`运费：¥${order.price} ｜ 货主：${order.owner}`);
  d.push('── 证据链 ──');
  for (const s of order.steps) {
    d.push(`${s.icon} ${s.label}：${s.done ? '已完成 ✓' : '未完成'}`);
  }
  if (order.loss) {
    d.push('── 损耗对比 ──');
    d.push(`装货 ${order.loss.loadTons} 吨 → 卸货 ${order.loss.unloadTons} 吨`);
    d.push(order.loss.verdict);
  }
  return d.join('\n');
}

/**
 * 价格异常检测（P2 简化版）
 * 按"每公里运费"区间判断：低于 5 元/km 疑似压价，高于 12 元/km 疑似虚高。
 * 纯规则，不依赖外部数据；P3 可接入真实行情。
 */
export type PriceFlag = 'low' | 'high' | 'normal';

export function priceFlag(price: number, km: number): PriceFlag {
  if (km <= 0) return 'normal';
  const perKm = price / km;
  if (perKm < 5) return 'low';
  if (perKm > 12) return 'high';
  return 'normal';
}

export const priceFlagLabel = (flag: PriceFlag): string =>
  flag === 'low' ? '⚠ 运费偏低，注意压价' : flag === 'high' ? '⚠ 运费异常偏高，核实货源' : '';
