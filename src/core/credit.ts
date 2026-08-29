/**
 * 货运雷达 · 货主信用体系（P3）
 *
 * 三档评价：👍 靠谱 +1 ｜ 😐 一般 0 ｜ 👎 不靠谱 −3
 * 信用分 < 0 → 自动进入黑名单。
 * 信用用于：货源卡徽标、AI 推荐解释、黑名单货源降权（服务层应用）。
 *
 * 本模块只定义"评价与信用计算"的确定性规则，不负责存储（见 CreditRepository）。
 */

/** 评价档位 */
export type RatingLevel = 'good' | 'medium' | 'bad';

/** 货主信用档案 */
export interface Credit {
  owner: string;
  /** 信用分 = good×1 + medium×0 + bad×(−3) */
  score: number;
  good: number;
  medium: number;
  bad: number;
  total: number;
  blacklisted: boolean;
  /** 标签频次，如 {"按时装货": 3} */
  tags: Record<string, number>;
  /** 最近备注 */
  comments: string[];
}

/** 信用徽标等级（UI 用） */
export type CreditBadge = 'good' | 'mid' | 'bad' | 'none';

/** 评价权重（确定性规则） */
export const RATING_SCORE: Record<RatingLevel, number> = { good: 1, medium: 0, bad: -3 };

/** 黑名单阈值：信用分 < 0 */
export const BLACKLIST_THRESHOLD = 0;

/** 新建空信用档案 */
export function mkCredit(owner: string): Credit {
  return { owner, score: 0, good: 0, medium: 0, bad: 0, total: 0, blacklisted: false, tags: {}, comments: [] };
}

/** 提交一次评价，返回更新后的信用（纯函数：入参档案会被修改并返回） */
export function applyRating(credit: Credit, level: RatingLevel, tags: string[] = [], comment = ''): Credit {
  credit[level] += 1;
  credit.total += 1;
  credit.score += RATING_SCORE[level];
  for (const t of tags) credit.tags[t] = (credit.tags[t] ?? 0) + 1;
  if (comment.trim()) {
    credit.comments.push(`${new Date().toLocaleString('zh-CN')}：${comment.trim()}`);
    if (credit.comments.length > 10) credit.comments.shift();
  }
  credit.blacklisted = credit.score < BLACKLIST_THRESHOLD;
  return credit;
}

/** 移出黑名单（信用分归零，保留评价记录） */
export function unblacklist(credit: Credit): Credit {
  credit.blacklisted = false;
  credit.score = 0;
  return credit;
}

/** 信用徽标（有评价记录时才有徽标） */
export function creditBadge(credit: Credit | undefined): CreditBadge {
  if (!credit || credit.total === 0) return 'none';
  if (credit.blacklisted) return 'bad';
  if (credit.score >= 3) return 'good';
  return 'mid';
}

/** 徽标文案 */
export const CREDIT_BADGE_LABEL: Record<CreditBadge, string> = {
  good: '👍 靠谱',
  mid: '🟡 一般',
  bad: '⚠ 黑名单',
  none: '',
};

/** 货主信用分 → 评分的降权系数（服务层用于黑名单货源降权，不改核心权重） */
export function creditPenalty(credit: Credit | undefined): number {
  if (!credit) return 0;
  if (credit.blacklisted) return -30; // 黑名单货主，强降权
  if (credit.bad > 0 && credit.score <= 0) return -15;
  return 0;
}
