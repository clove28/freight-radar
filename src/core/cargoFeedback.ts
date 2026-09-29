/**
 * 货运雷达 · 结构化卡友反馈（P1 新增）
 *
 * 卡友反馈是"货源可信度"的数据源之一：司机跑完/看过一趟货后，反馈
 * 装货等待时长、装卸难易、入口/停车经验。平台把这些**客观经历**
 * 汇总，而不是凭空判断"这货靠不靠谱"。
 *
 * 本模块只定义反馈模型与"正面/负面"的确定性判定（程序负责），
 * 存储见 CargoFeedbackRepository；可信度聚合见 core/credibility.ts。
 *
 * 注意：反馈是"经验证据"，不是"真实性保证"。平台只汇总，不替司机做决定。
 */

/** 装卸难易 */
export type Difficulty = 'easy' | 'medium' | 'hard';

/** 一条卡友反馈 */
export interface CargoFeedback {
  id: string;
  /** 关联货源 */
  cargoId: string;
  /** 反馈司机 */
  driverId: string;
  /** 装货等待时长（小时，null=未填） */
  loadWaitHours: number | null;
  /** 装货难易 */
  loadDifficulty: Difficulty | null;
  /** 卸货难易 */
  unloadDifficulty: Difficulty | null;
  /** 入口提示（卡友经验："从东门进，货车走辅道"） */
  entranceTips: string;
  /** 停车提示 */
  parkingTips: string;
  /** 备注 */
  comment: string;
  createdAt: number;
}

/** 反馈是否为正面（确定性规则）：装货等待≤3h 且装卸都不难 → 正面 */
export function feedbackIsPositive(f: CargoFeedback): boolean {
  if (f.loadWaitHours !== null && f.loadWaitHours > 3) return false;
  if (f.loadDifficulty === 'hard' || f.unloadDifficulty === 'hard') return false;
  return true;
}

/** 一组反馈的正面/负面计数（供可信度计算） */
export function feedbackCounts(list: CargoFeedback[]): { positive: number; negative: number } {
  let positive = 0;
  let negative = 0;
  for (const f of list) {
    if (feedbackIsPositive(f)) positive += 1;
    else negative += 1;
  }
  return { positive, negative };
}

/** 难易标签（UI 用） */
export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: '容易',
  medium: '一般',
  hard: '难',
};
