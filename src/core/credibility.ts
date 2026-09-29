/**
 * 货运雷达 · 货源可信度评分（纯函数，P1 新增）
 *
 * 思路：平台不能简单告诉司机"这单是真的"，而是把分散的客观数据
 * 聚合成 0–100 的可信度分 + 证据列表，供货源卡/详情/AI 解释使用。
 *
 * 本项目是"决策平台"的信任基础，但**可信度≠真实性保证**：它只是
 * 证据支持度的汇总，AI 只能解释，不能凭空判定真假。
 *
 * 权重（constants.CREDIBILITY_WEIGHTS）：
 *   货主认证 15 · 运营确认 30 · 历史成交 15 · 卡友反馈 15 · 价格合理 15 · 信息完整 10
 * P1 阶段（运营确认/历史成交/卡友反馈数据暂缺）这几项返回 0，P2 补齐后接入。
 *
 * 本模块只做"聚合计算"，不负责存储，不依赖任何数据源实现（与 cost/scoring 同原则）。
 */
import { CREDIBILITY_WEIGHTS, CREDIBILITY_HIGH, CREDIBILITY_MID, RECENCY_FULL_HOURS, RECENCY_PENALTY_PER_DAY, RECENCY_PENALTY_MAX } from './constants.js';
import type { Credit } from './credit.js';
import type { PriceFlag } from './order.js';

/** 可信度计算输入（调用方把现有零件喂进来，本模块不自己查库） */
export interface CredibilityInput {
  /** 货主是否认证（Cargo.verified） */
  verified: boolean;
  /** 货主信用档案（credit.ts），无则 undefined */
  credit?: Credit | undefined;
  /** 价格异常标记（order.priceFlag） */
  priceFlag?: PriceFlag;
  /** 信息完整度（0–1，由调用方按 Cargo 字段齐全度算出） */
  completeness?: number;
  /** 货源发布时间戳（ms），用于更新时效 */
  pub?: number;
  // ── 以下 P2 才有，P1 传入则自动生效，缺省按 0 ──
  /** 运营确认过 */
  opsConfirmed?: boolean;
  /** 历史成交单数 */
  historyCount?: number;
  /** 卡友正反馈数 */
  feedbackPositive?: number;
  /** 卡友负反馈数 */
  feedbackNegative?: number;
}

/** 可信度计算结果（0–100 + 分级 + 证据列表） */
export interface CredibilityResult {
  /** 0–100 分 */
  score: number;
  /** 分级：high / mid / low */
  level: 'high' | 'mid' | 'low';
  /** 证据列表（UI 展示 + AI 解释用，只列事实，不编造） */
  evidence: string[];
  /** 是否含有任何"待确认"项（P1 阶段运营确认等缺省时提示） */
  pending: boolean;
}

/** 信息完整度：计算 Cargo 的关键字段齐全比例（0–1）。由可用的已填字段数决定。 */
export function cargoCompleteness(present: boolean[]): number {
  if (!present.length) return 0;
  const filled = present.filter(Boolean).length;
  return Math.round((filled / present.length) * 1000) / 1000;
}

/** 价格合理性得分（15 分制）：正常 15 · 偏低 8 · 偏高 5 */
function priceScore(flag: PriceFlag | undefined): number {
  if (flag === 'low') return 8;
  if (flag === 'high') return 5;
  return CREDIBILITY_WEIGHTS.price;
}

/** 卡友反馈得分（15 分制）：无反馈 7 分，正反馈加成、负反馈扣分 */
function feedbackScore(positive: number, negative: number): number {
  const w = CREDIBILITY_WEIGHTS.feedback;
  if (positive + negative === 0) return Math.round(w * 0.5);
  const ratio = positive / (positive + negative);
  return Math.round(w * ratio);
}

/** 更新时效惩罚（0–10）：超过 24h 后每 24h 扣 2 分，上限 10 */
function recencyPenalty(pub: number | undefined): number {
  if (pub === undefined) return 0;
  const ageH = (Date.now() - pub) / 3_600_000;
  if (ageH <= RECENCY_FULL_HOURS) return 0;
  const days = Math.floor((ageH - RECENCY_FULL_HOURS) / 24);
  return Math.min(RECENCY_PENALTY_MAX, days * RECENCY_PENALTY_PER_DAY);
}

/** 聚合可信度（纯函数） */
export function computeCredibility(input: CredibilityInput): CredibilityResult {
  const w = CREDIBILITY_WEIGHTS;
  const evidence: string[] = [];

  // 1. 货主认证
  let score = input.verified ? w.verified : 0;
  evidence.push(input.verified ? '✓ 货主已认证' : '✗ 货主未认证');

  // 2. 运营确认（P2）
  let pending = false;
  if (input.opsConfirmed) {
    score += w.opsConfirm;
    evidence.push('✓ 运营已电话确认');
  } else {
    evidence.push('○ 待运营确认（P2 接入）');
    pending = true;
  }

  // 3. 历史成交
  if (input.historyCount !== undefined && input.historyCount > 0) {
    const hs = Math.min(w.history, Math.round(w.history * Math.log(1 + input.historyCount) / Math.log(1 + 5)));
    score += hs;
    evidence.push(`✓ 历史成交 ${input.historyCount} 单`);
  } else {
    evidence.push('○ 暂无成交记录');
    pending = true;
  }

  // 4. 卡友反馈
  const fp = input.feedbackPositive ?? 0;
  const fn = input.feedbackNegative ?? 0;
  if (fp + fn > 0) {
    score += feedbackScore(fp, fn);
    if (fn > 0) evidence.push(`⚠ ${fn} 名司机反馈装货等待较长`);
    else evidence.push(`✓ ${fp} 名卡友反馈良好`);
  } else {
    evidence.push('○ 暂无卡友反馈');
  }

  // 5. 价格合理性
  score += priceScore(input.priceFlag);
  if (input.priceFlag === 'low') evidence.push('⚠ 运费偏低，注意压价');
  else if (input.priceFlag === 'high') evidence.push('⚠ 运费异常偏高，核实货源');
  else evidence.push('✓ 价格处于合理范围');

  // 6. 信息完整度
  const comp = input.completeness ?? 1;
  score += Math.round(w.completeness * comp);

  // 7. 更新时效（惩罚项）
  const penalty = recencyPenalty(input.pub);
  score = Math.max(0, score - penalty);

  // 分级
  const level = score >= CREDIBILITY_HIGH ? 'high' : score >= CREDIBILITY_MID ? 'mid' : 'low';

  return { score: Math.min(100, Math.round(score)), level, evidence, pending };
}

/** 可信度分级文案（UI 用） */
export const CREDIBILITY_LEVEL_LABEL: Record<'high' | 'mid' | 'low', string> = {
  high: '信任度较高',
  mid: '信任度一般',
  low: '信任度较低',
};
