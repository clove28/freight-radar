/**
 * 货运雷达 · 货运行情（P5）
 *
 * 替代固定 5/12 元/km 阈值的价格异常检测：
 * 按"路线方向 + 货物大类"查行情区间，低于区间下限=压价，高于上限=虚高。
 *
 * Mock 行情：确定性规则（每公里单价区间按货类浮动）。
 * 真实行情（P6）：接货运价格指数 API 或自建统计，替换 quoteFor 实现即可。
 */
import type { CargoClass } from './types.js';
import type { PriceFlag } from './order.js';

/** 行情区间（元/公里） */
export interface QuoteRange {
  low: number;
  high: number;
  /** 该货类参考区间说明 */
  note: string;
}

/** 货类基础单价区间（元/公里，含油费高速的整车运费） */
const CLASS_BASE: Record<CargoClass, { low: number; high: number }> = {
  农产品: { low: 6.2, high: 9.5 },
  冷藏: { low: 7.5, high: 11 },
  建材: { low: 5.5, high: 8.5 },
  重货: { low: 4.5, high: 7 },
  普货: { low: 5.5, high: 9 },
  危化: { low: 8, high: 12 },
  快递: { low: 6.5, high: 10 },
  其他: { low: 5, high: 9 },
};

/** 距离修正：短途单价高（起步价摊薄），长途单价低（边际成本低） */
export function kmAdjust(km: number): number {
  if (km <= 0) return 1;
  if (km < 300) return 1.25;
  if (km < 600) return 1.1;
  if (km < 1200) return 1.0;
  return 0.9;
}

/** 查询一单货的行情区间（确定性规则，Mock） */
export function quoteFor(cls: CargoClass, km: number): QuoteRange {
  const base = CLASS_BASE[cls] ?? CLASS_BASE.其他;
  const adj = kmAdjust(km);
  // 先各算一次，返回值与 note 共用同一份四舍五入结果，避免两处各算一遍后走样
  const low = Math.round(base.low * adj * 10) / 10;
  const high = Math.round(base.high * adj * 10) / 10;
  return {
    low,
    high,
    note: `${cls} ${km}km 参考区间 ${low}–${high} 元/km`,
  };
}

/** 用行情区间判断价格异常（替代旧固定阈值） */
export function priceFlagByQuote(price: number, km: number, cls: CargoClass): { flag: PriceFlag; quote: QuoteRange } {
  const quote = quoteFor(cls, km);
  if (km <= 0) return { flag: 'normal', quote };
  const perKm = price / km;
  if (perKm < quote.low * 0.92) return { flag: 'low', quote }; // 低于区间下限 ~8% 视为压价
  if (perKm > quote.high * 1.08) return { flag: 'high', quote }; // 高于上限 ~8% 视为虚高
  return { flag: 'normal', quote };
}

/**
 * 行情数据源抽象（P6）
 * 当前为规则实现 RuleQuoteProvider；未来可接真实货运价格指数 API，
 * 只需实现本接口并注入，业务层零改动。
 */
export interface QuoteProvider {
  /** 查询一单货的行情区间（元/公里） */
  getRange(cls: CargoClass, km: number): Promise<QuoteRange>;
}

/** 规则实现（现状：货类基础区间 × 里程修正，确定性可测） */
export class RuleQuoteProvider implements QuoteProvider {
  async getRange(cls: CargoClass, km: number): Promise<QuoteRange> {
    return quoteFor(cls, km);
  }
}
