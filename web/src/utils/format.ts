/**
 * 通用工具：金额/数字格式化
 * 纯展示函数，不参与任何业务计算。
 */

/** 千分位格式化 */
export const fmtNum = (n: number): string =>
  String(Math.round(n * 100) / 100).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** 金额：¥1,234 */
export const fmtMoney = (n: number): string => `¥${fmtNum(n)}`;

/** 每公里收益：¥3.83/km */
export const fmtPerKm = (n: number): string => `¥${fmtNum(n)}/km`;

/** 当前城市的高亮名（无逻辑，仅展示） */
export const city = (name: string): string => name;
