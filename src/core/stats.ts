/**
 * 货运雷达 · 数据统计（P10）
 *
 * 从账本（BookEntry）与订单沉淀统计视图：
 *  - 月度收益趋势（近 N 个月：净收益/单数）
 *  - 线路收益分布（Top 线路：单数/平均每公里净收益）
 *  - 每公里收益趋势（按月平均，判断收益走势）
 *
 * 纯函数，输入原始数据输出统计结果；不依赖任何框架。
 */
import type { BookEntry } from './types.js';

/** 月度收益点 */
export interface MonthPoint {
  /** 月份标签，如 "2026-08" */
  label: string;
  /** 净收益（元） */
  income: number;
  /** 单数 */
  orders: number;
  /** 平均每公里净收益（元/km） */
  perKm: number;
}

/** 线路统计 */
export interface RouteStat {
  from: string;
  to: string;
  /** 单数 */
  count: number;
  /** 该线路总净收益（元） */
  totalIncome: number;
  /** 平均每公里净收益（元/km） */
  avgPerKm: number;
}

/** 统计视图 */
export interface StatsView {
  /** 近 N 个月收益趋势（含当月） */
  monthly: MonthPoint[];
  /** 线路收益分布（按单数降序 Top 5） */
  routes: RouteStat[];
  /** 所有线路平均每公里净收益 */
  avgPerKmAll: number;
  /** 本月净收益（与 Dashboard 一致，便于对照） */
  monthIncome: number;
  /** 本月运费合计（P13） */
  monthFee: number;
  /** 本月总里程（P13，真实 km 优先） */
  monthKm: number;
  /** 本月成本合计（油+过路+其他，P13） */
  monthCost: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** 账本单的净收益 */
export function bookIncome(b: BookEntry): number {
  return b.fee - b.fuel - b.toll - b.other;
}

/** 账本单里程：优先真实 km（P11），否则稳定伪距离估算 */
export function bookKm(b: BookEntry): number {
  if (b.km !== undefined && b.km !== null && b.km > 0) return b.km;
  return estKm(b.from, b.to);
}

/** 城市间里程估算（账本未存 km 时兜底，用稳定伪距离） */
export function estKm(a: string, b: string): number {
  let x = 0;
  for (let i = 0; i < a.length; i++) x = (x * 31 + a.charCodeAt(i)) >>> 0;
  let y = 0;
  for (let i = 0; i < b.length; i++) y = (y * 31 + b.charCodeAt(i)) >>> 0;
  return 60 + ((x * 7 + y * 13) % 900) + 40;
}

/** 近 N 个月（含当月）标签列表，从旧到新 */
export function monthLabels(n: number, now = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/** 由账本生成统计视图（纯函数） */
export function buildStats(books: BookEntry[], months = 6, now = new Date()): StatsView {
  const labels = monthLabels(months, now);

  // 月度聚合
  const monthly: MonthPoint[] = labels.map(label => {
    const [y, m] = label.split('-').map(Number);
    const inMonth = books.filter(b => {
      const d = new Date(b.ts);
      return d.getFullYear() === y && d.getMonth() + 1 === m;
    });
    const totalIncome = inMonth.reduce((s, b) => s + bookIncome(b), 0);
    const km = inMonth.reduce((s, b) => s + bookKm(b), 0);
    return {
      label,
      income: Math.round(totalIncome),
      orders: inMonth.length,
      perKm: km > 0 ? round2(totalIncome / km) : 0,
    };
  });

  // 线路聚合
  const routeMap = new Map<string, RouteStat>();
  for (const b of books) {
    const key = `${b.from}→${b.to}`;
    const income = bookIncome(b);
    const km = bookKm(b);
    const cur = routeMap.get(key);
    if (cur) {
      cur.count += 1;
      cur.totalIncome += income;
    } else {
      routeMap.set(key, { from: b.from, to: b.to, count: 1, totalIncome: income, avgPerKm: 0 });
    }
  }
  const routes = [...routeMap.values()]
    .map(r => ({ ...r, totalIncome: Math.round(r.totalIncome), avgPerKm: r.count > 0 ? round2(r.totalIncome / (r.count * estKm(r.from, r.to))) : 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // 总平均每公里
  const allKm = books.reduce((s, b) => s + bookKm(b), 0);
  const allIncome = books.reduce((s, b) => s + bookIncome(b), 0);

  // P13：本月汇总（运费/成本/里程）
  const nowY = now.getFullYear();
  const nowM = now.getMonth() + 1;
  const thisMonthBooks = books.filter(b => {
    const d = new Date(b.ts);
    return d.getFullYear() === nowY && d.getMonth() + 1 === nowM;
  });
  const monthFee = thisMonthBooks.reduce((s, b) => s + b.fee, 0);
  const monthKm = thisMonthBooks.reduce((s, b) => s + bookKm(b), 0);
  const monthCost = thisMonthBooks.reduce((s, b) => s + b.fuel + b.toll + b.other, 0);

  return {
    monthly,
    routes,
    avgPerKmAll: allKm > 0 ? round2(allIncome / allKm) : 0,
    monthIncome: monthly[monthly.length - 1]?.income ?? 0,
    monthFee: Math.round(monthFee),
    monthKm: Math.round(monthKm),
    monthCost: Math.round(monthCost),
  };
}

/**
 * 账本导出 CSV（P11，司机对账用）
 * 列：日期/路线/里程/运费/油费/过路费/其他/绿通节省/净收益/每公里收益/备注
 */
export function booksToCsv(books: BookEntry[]): string {
  const esc = (s: string | number): string => {
    const str = String(s);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines: string[] = ['日期,路线,里程(km),运费(元),油费(元),过路费(元),其他(元),绿通节省(元),净收益(元),每公里收益(元/km),备注'];
  // 按时间倒序（最新在前）
  const sorted = [...books].sort((a, b) => b.ts - a.ts);
  for (const b of sorted) {
    const d = new Date(b.ts);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const km = b.km ?? estKm(b.from, b.to);
    const income = bookIncome(b);
    lines.push([
      date,
      `${b.from}→${b.to}`,
      km,
      b.fee,
      b.fuel,
      b.toll,
      b.other,
      b.greenSave,
      income,
      km > 0 ? round2(income / km) : 0,
      b.note,
    ].map(esc).join(','));
  }
  return lines.join('\n');
}

/**
 * 账本导出自包含 HTML 报表（P15，给货主/老板看）
 * 内嵌样式，浏览器打开即可打印/存 PDF（Cmd/Ctrl+P → 另存为 PDF）。
 * 中文无损（HTML/UTF-8），无需外部字体/库。
 */
export function booksToHtml(books: BookEntry[], opts: { vehicle?: string; period?: string } = {}): string {
  // HTML 转义（防注入 + 中文安全）
  const esc = (s: string | number): string =>
    String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const sorted = [...books].sort((a, b) => b.ts - a.ts);
  const totalFee = books.reduce((s, b) => s + b.fee, 0);
  const totalIncome = books.reduce((s, b) => s + bookIncome(b), 0);
  const totalKm = books.reduce((s, b) => s + bookKm(b), 0);
  const rows = sorted.map(b => {
    const km = b.km ?? estKm(b.from, b.to);
    const income = bookIncome(b);
    return `<tr>
      <td>${new Date(b.ts).toLocaleDateString('zh-CN')}</td>
      <td class="route">${esc(b.from)} → ${esc(b.to)}</td>
      <td>${km}</td>
      <td>${b.fee}</td>
      <td>${b.fuel}</td>
      <td>${b.toll}</td>
      <td>${b.other}</td>
      <td>${km > 0 ? round2(income / km) : 0}</td>
      <td class="income">${income >= 0 ? '+' : ''}${income}</td>
      <td>${esc(b.note)}</td>
    </tr>`;
  }).join('');
  const date = new Date().toLocaleDateString('zh-CN');
  // 自包含 HTML，无外部资源
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>货运雷达 · 收益报表</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;background:#f2f3f5;color:#1c1c1e;padding:24px}
  .report{max-width:900px;margin:0 auto;background:#fff;border-radius:14px;padding:28px 30px;box-shadow:0 2px 20px rgba(0,0,0,.08)}
  h1{font-size:22px;font-weight:800;color:#ea580c;border-bottom:2px solid #ea580c;padding-bottom:10px;margin-bottom:14px}
  .meta{font-size:12px;color:#8a8a90;margin-bottom:16px}
  .summary{display:flex;gap:24px;flex-wrap:wrap;background:#fff7ed;border-radius:12px;padding:16px;margin-bottom:20px}
  .summary .k{font-size:11px;color:#8a8a90}
  .summary .v{font-size:22px;font-weight:800;color:#ea580c}
  .summary .v.pos{color:#16a34a}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{background:#f1f2f4;text-align:left;padding:9px 8px;font-weight:800;border-bottom:2px solid #e0e0e0}
  td{padding:8px;border-bottom:1px solid #eee}
  .route{font-weight:700}
  .income{font-weight:800}
  tr:nth-child(even){background:#fafafa}
  .foot{margin-top:20px;font-size:11px;color:#8a8a90;text-align:center}
  @media print{body{background:#fff;padding:0}.report{box-shadow:none;border-radius:0;max-width:none}}
</style></head><body>
<div class="report">
  <h1>🚛 货运雷达 · 收益报表</h1>
  <div class="meta">生成时间：${date}${opts.period ? ' ｜ 统计周期：' + esc(opts.period) : ''}${opts.vehicle ? ' ｜ 车辆：' + esc(opts.vehicle) : ''}</div>
  <div class="summary">
    <div><div class="k">总单数</div><div class="v">${books.length}</div></div>
    <div><div class="k">总运费(元)</div><div class="v">${Math.round(totalFee)}</div></div>
    <div><div class="k">总净收益(元)</div><div class="v pos">${totalIncome >= 0 ? '+' : ''}${Math.round(totalIncome)}</div></div>
    <div><div class="k">总里程(km)</div><div class="v">${Math.round(totalKm)}</div></div>
  </div>
  <table>
    <thead><tr><th>日期</th><th>路线</th><th>里程</th><th>运费</th><th>油费</th><th>过路费</th><th>其他</th><th>元/km</th><th>净收益</th><th>备注</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="foot">数据由货运雷达生成 ｜ 打印或"另存为 PDF"给货主/老板对账 ｜ 净收益 = 运费 −（油费+过路费+其他）</div>
</div></body></html>`;
}
