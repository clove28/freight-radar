/**
 * 货运雷达 · 平台服务费（P1 新增，虚拟额度占位）
 *
 * 业务：司机决定承运一单后，向平台支付约 SERVICE_FEE_AMOUNT 元的
 * 平台服务费/撮合服务费。平台因此提供"货源核对 + 运营对接 + 运输执行服务"，
 * 而**不是卖一个电话号码**。
 *
 * MVP 约束（写死，重要）：
 *   - 用「虚拟服务额度」（credit），不可提现、不可转账、不可兑换现金
 *   - 只做闭环占位，P7 接入真实支付时替换 Provider
 *   - 服务费状态为确定性状态机（程序负责，AI 不参与）
 *
 * 本模块只定义"扣费/充值/状态"的确定性规则与常量，不负责存储（见 ServiceFeeRepository）。
 */
import type { Order } from './order.js';

/** 平台服务费（元）· 概念参考值，MVP 用虚拟额度 */
export const SERVICE_FEE_AMOUNT = 200;

/** 演示充值一次增加的额度（元） */
export const DEMO_RECHARGE_AMOUNT = 500;

/** 服务费状态 */
export type ServiceFeeState = 'paid' | 'consumed' | 'refunded';

/** 一笔服务费记录 */
export interface ServiceFee {
  id: string;
  orderId: string;
  amount: number;
  state: ServiceFeeState;
  paidAt: number;
}

/** 司机虚拟服务额度 */
export interface DriverCreditBalance {
  driverId: string;
  /** 可用额度（元），不可提现/转账/兑换 */
  balance: number;
}

/** 扣费结果 */
export interface ChargeResult {
  ok: boolean;
  balance: number;
  fee?: ServiceFee;
  reason?: string;
}

/** 尝试扣费（纯函数）：额度足→扣，返回新余额+服务费记录；不足→ok=false+原因 */
export function tryCharge(balance: number, amount: number): ChargeResult {
  if (balance < amount) {
    return { ok: false, balance, reason: `虚拟服务额度不足（${balance} 元），请先充值演示` };
  }
  return { ok: true, balance: balance - amount };
}

/** 由订单创建一笔（已支付）服务费记录（确定性，不生成随机 id 用调用方传入） */
export function mkServiceFee(id: string, orderId: string, amount: number = SERVICE_FEE_AMOUNT): ServiceFee {
  return { id, orderId, amount, state: 'paid', paidAt: Date.now() };
}

/** 服务费是否已支付（供订单关联展示） */
export function isPaid(fee: ServiceFee | undefined): boolean {
  return fee !== undefined && (fee.state === 'paid' || fee.state === 'consumed');
}

/** 订单 → 服务费关联说明（UI/AI 解释用，纯文案，不编造） */
export function serviceFeeNote(order: Pick<Order, 'price' | 'from' | 'to'>): string {
  return `承运此单需支付约 ${SERVICE_FEE_AMOUNT} 元平台服务费，平台将提供货源核对、运营对接与运输执行服务（演示用虚拟额度）。`;
}
