/**
 * 货运雷达 · 路线策略（P4）
 *
 * 司机可选择走高速 / 国道省费 / 平衡，不同策略影响：
 *  - 高速费系数（高速 1.0，国道 0，平衡 0.6）
 *  - 油耗系数（高速匀速省油 0.95，国道红绿灯多 1.15，平衡 1.05）
 *  - 预计时长（高速快，国道慢）
 *
 * 这些系数注入 calcCost（向后兼容：不传策略时用默认高速）。
 */

export type RouteStrategy = 'highway' | 'national' | 'balanced';

export const ROUTE_STRATEGIES: Array<{ value: RouteStrategy; label: string; desc: string }> = [
  { value: 'highway', label: '🛣️ 高速优先', desc: '快、省油，但过路费高' },
  { value: 'balanced', label: '⚖️ 平衡', desc: '部分高速，省钱与速度兼顾' },
  { value: 'national', label: '🛤️ 国道省费', desc: '免过路费，但慢、油耗高' },
];

/** 策略 → 高速费系数（相对车辆档案 tollPerKm） */
export function tollFactor(strategy: RouteStrategy): number {
  switch (strategy) {
    case 'highway': return 1.0;
    case 'balanced': return 0.6;
    case 'national': return 0;
  }
}

/** 策略 → 油耗系数（相对车辆档案 fuelPer100km） */
export function fuelFactor(strategy: RouteStrategy): number {
  switch (strategy) {
    case 'highway': return 0.95;
    case 'balanced': return 1.05;
    case 'national': return 1.15;
  }
}

/** 策略 → 预计时长修正系数（相对 60km/h 基准） */
export function durationFactor(strategy: RouteStrategy): number {
  switch (strategy) {
    case 'highway': return 0.75; // 高速更快
    case 'balanced': return 1.0;
    case 'national': return 1.6; // 国道更慢
  }
}

/** 策略标签 */
export function strategyLabel(strategy: RouteStrategy): string {
  return ROUTE_STRATEGIES.find(s => s.value === strategy)?.label ?? strategy;
}
