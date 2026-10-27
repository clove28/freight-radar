/**
 * 货运雷达 · 业务常量与评分权重
 *
 * 所有"拍脑袋"的阈值/权重集中在这里，方便后续调参，
 * 也便于在 README 和面试中解释每个数字的依据。
 */
import type { CargoClass } from './types.js';

/** 综合评分权重（暂定）：收益 40% · 路线 20% · 回程 20% · 车型 10% · 时间 10% */
export const SCORE_WEIGHTS = {
  income: 0.4,
  route: 0.2,
  backhaul: 0.2,
  vehicle: 0.1,
  time: 0.1,
} as const;

/**
 * 每公里净收益的评分参考线（元/公里）
 * 行业经验：13米高栏全国跑，纯利润约 2–8 元/公里视为正常。
 * 我们设定 ≥8 元/公里为满分，≤0 元/公里为 0 分，中间线性。
 */
export const PER_KM_BEST = 8;
export const PER_KM_WORST = 0;

/**
 * 时间匹配评分（按装货时间与"现在"的间隔，小时）
 * 越早能装的分越高——司机决策快、不空等。
 */
export const TIME_SCORE = [
  { hours: 6, score: 100 },
  { hours: 24, score: 70 },
  { hours: 72, score: 45 },
] as const;
export const TIME_SCORE_FALLBACK = 25;

/** 车型完全匹配时给满分，否则按 0 处理（车型不符直接过滤掉更合理，这里保留一个低分兜底） */
export const TRUCK_MATCH_SCORE = 100;
export const TRUCK_MISMATCH_SCORE = 20;

/** 路线匹配：完全命中常跑路线给满分，同向（目的地相同）给部分分 */
export const ROUTE_EXACT_SCORE = 100;
export const ROUTE_SAME_DEST_SCORE = 55;
export const ROUTE_NONE_SCORE = 25;

/** 回程：目的地是回程基地城市给满分 */
export const BACKHAUL_SCORE = 100;
export const BACKHAUL_NONE_SCORE = 20;

/** 推荐默认返回条数 */
export const DEFAULT_TOP_N = 5;
export const DASHBOARD_TOP_N = 3;
/** 单次推荐最大返回条数：防 AI/查询参数传入超大 topN 一次性刷屏 */
export const MAX_TOP_N = 50;

/**
 * 行情价格异常判定系数：低于区间下限 ×0.92、高于上限 ×1.08（各放宽约 8%）。
 * 注意：两个值故意保留字面量，不要改写成 `1 ± 0.08`——浮点结果会是
 * 0.919999… / 1.080000…，恰好落在旧阈值上的价格会被改判，属语义漂移。
 */
export const PRICE_FLAG_LOW_RATIO = 0.92;
export const PRICE_FLAG_HIGH_RATIO = 1.08;

/** 损耗标准（‰）：农产品 5‰、冷藏 10‰、其他 2‰（与演示版一致） */
export const LOSS_STD: Record<CargoClass, number> = {
  农产品: 5,
  冷藏: 10,
  建材: 2,
  重货: 2,
  普货: 2,
  危化: 2,
  快递: 2,
  其他: 2,
};

/**
 * 货源可信度评分权重（合计 100）：
 *   货主认证 15 · 运营确认 30 · 历史成交 15 · 卡友反馈 15 · 价格合理 15 · 信息完整 10
 * 注：运营确认/历史成交/卡友反馈在 P1 阶段数据尚缺，返回 0，P2 补齐后接入。
 */
export const CREDIBILITY_WEIGHTS = {
  verified: 15,
  opsConfirm: 30,
  history: 15,
  feedback: 15,
  price: 15,
  completeness: 10,
} as const;

/** 可信度分级阈值（≥80 高 · ≥60 中 · 否则低） */
export const CREDIBILITY_HIGH = 80;
export const CREDIBILITY_MID = 60;

/** 更新时效：超过 24h 后，每 24h 扣 2 分，上限扣 10 分 */
export const RECENCY_FULL_HOURS = 24;
export const RECENCY_PENALTY_PER_DAY = 2;
export const RECENCY_PENALTY_MAX = 10;
