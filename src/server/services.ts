/**
 * 货运雷达 · 应用服务层
 *
 * 组织 Dashboard 聚合、货源详情、AI 推荐、订单、底线偏好等业务用例。
 * 不直接触碰 HTTP，便于测试与复用。
 *
 * 约定：本层只做"组装、排序、过滤合并"，核心计算一律复用
 * src/core 下的既有模块（cost/scoring/order），不在本层复制公式。
 */
import type { DashboardData, DriverQuery, ScoredCargo, Vehicle } from '../core/types.js';
import type { RepositorySet, DriverPrefs, RoutePlanner } from '../data/repository.js';
import { rankCargoes, type CostOptionsFor } from '../core/scoring.js';
import { calcCost, type CostOptions } from '../core/cost.js';
import { recommend } from '../ai/assistant.js';
import type { AssistantDeps } from '../ai/assistant.js';
import {
  buildEvidencePack,
  calcLoss,
  createOrder,
  priceFlagLabel,
  type Order,
  type PriceFlag,
} from '../core/order.js';
import { priceFlagByQuote } from '../core/quote.js';
import { creditBadge, creditPenalty, type Credit, type RatingLevel } from '../core/credit.js';
import { DEMO_RECHARGE_AMOUNT, SERVICE_FEE_AMOUNT } from '../core/serviceFee.js';
import { feedbackCounts, type CargoFeedback } from '../core/cargoFeedback.js';
import { cargoCompleteness, computeCredibility, type CredibilityResult } from '../core/credibility.js';
import { buildHistoryInsights, type HistoryInsights } from '../core/history.js';
import { buildStats, type StatsView } from '../core/stats.js';
import { MockRoutePlanner } from '../core/routePlanner.js';
import type { RouteStrategy } from '../core/routeStrategy.js';

/** 大厅排序方式（服务层排序，不动核心） */
export type LoadSort = 'ai' | 'netIncome' | 'perKm' | 'distance';

/** Dashboard 扩展视图：在核心类型之上补充 UI 需要的派生字段 */
export interface DashboardView extends DashboardData {
  /** 当前开放货源总数（推荐货源数量展示用） */
  openCount: number;
  /** AI 最推荐单（净收益/每公里突出展示） */
  topLoad: ScoredCargo | null;
}

/** 货源列表项：核心 ScoredCargo + P2 派生字段（价格异常标记）+ P3 信用 + P5 行情 */
export interface ScoredCargoView extends ScoredCargo {
  priceFlag: PriceFlag;
  priceFlagLabel: string;
  /** 行情区间文案（P5，如"普货 500km 参考 6.9–11.3 元/km"） */
  quoteNote: string;
  /** 货主信用徽标（good/mid/bad/none） */
  creditBadge: string;
  /** 是否黑名单货主 */
  blacklisted: boolean;
  /** 信用降权后的最终分（P3：黑名单/差评货主降权） */
  adjustedTotal: number;
  /** 货源可信度（P1：0–100 分 + 证据 + 分级，详见 core/credibility.ts） */
  credibility: CredibilityResult;
}

export interface AppServices {
  getDashboard(): Promise<DashboardView>;
  getCargoDetail(id: string): Promise<ScoredCargoView | null>;
  getCargoExplain(id: string): Promise<string | null>;
  listRanked(query: Record<string, string | undefined>, sort?: LoadSort): Promise<ScoredCargoView[]>;
  ask(text: string): Promise<Awaited<ReturnType<typeof recommend>>>;

  // P2 订单
  listOrders(): Promise<Order[]>;
  acceptLoad(loadId: string): Promise<Order | null>;
  getOrder(id: string): Promise<Order | null>;
  completeStep(orderId: string, stepId: string): Promise<Order | null>;
  doLoss(orderId: string, loadTons: number, unloadTons: number): Promise<Order | null>;
  getEvidencePack(orderId: string): Promise<string | null>;

  // P2 底线偏好
  getPrefs(): Promise<DriverPrefs>;
  updatePrefs(prefs: DriverPrefs): Promise<DriverPrefs>;
  updateVehicle(vehicle: Vehicle): Promise<Vehicle>;

  // P3 货主信用
  listCredits(): Promise<Record<string, Credit>>;
  rateOwner(owner: string, level: RatingLevel, tags?: string[], comment?: string): Promise<Credit | null>;
  unblacklistOwner(owner: string): Promise<Credit | undefined>;

  // P1 平台服务费（虚拟额度，不可提现/转账/兑换）
  getServiceFeeBalance(): Promise<number>;
  rechargeServiceFee(amount?: number): Promise<number>;

  // P1 结构化卡友反馈
  listCargoFeedback(cargoId: string): Promise<CargoFeedback[]>;
  submitCargoFeedback(cargoId: string, input: Omit<CargoFeedback, 'id' | 'cargoId' | 'driverId' | 'createdAt'>): Promise<CargoFeedback>;

  // P3 历史画像
  getHistory(): Promise<HistoryInsights>;

  // P10 数据统计
  getStats(): Promise<StatsView>;
}

const DRIVER_ID = 'd1'; // P1：单司机演示；P8 多司机后从当前会话取

export function createAppServices(repos: RepositorySet, assistant: AssistantDeps, planner: RoutePlanner = new MockRoutePlanner()): AppServices {
  /**
   * P3 空驶真实化：为一批货源预计算空驶里程（异步 routePlanner），
   * 返回同步查表 costFor，供 rankCargoes/calcCost 使用。
   * P5：注入司机偏好的路线策略（若查询未显式指定）。
   */
  async function buildCostFor(cargos: import('../core/types.js').Cargo[], vehicle: Vehicle, strategy?: RouteStrategy): Promise<CostOptionsFor> {
    const prefs = await repos.prefs.get();
    const effStrategy = strategy ?? prefs.preferredStrategy ?? undefined;
    const map = new Map<string, CostOptions>();
    await Promise.all(
      cargos.map(async c => {
        const emptyKm = await planner.estimateEmptyKm(vehicle.currentCity, c.from);
        map.set(c.id, { emptyKm, ...(effStrategy ? { routeStrategy: effStrategy } : {}) });
      }),
    );
    return (c: import('../core/types.js').Cargo) => map.get(c.id);
  }

  /** 把底线偏好合并进查询条件（AI 助手/大厅的默认过滤） */
  async function applyPrefs(q: DriverQuery): Promise<DriverQuery> {
    const prefs = await repos.prefs.get();
    return {
      ...q,
      minPerKm: q.minPerKm ?? prefs.minPerKm ?? undefined,
      maxKm: q.maxKm ?? prefs.maxKm ?? undefined,
    };
  }

  /** ScoredCargo + 信用 → ScoredCargoView（行情价格异常 + 信用徽标 + 降权分） */
  async function applyCredit(s: ScoredCargo, credits: Record<string, Credit>): Promise<ScoredCargoView> {
    // P5：按货类/里程行情区间判断价格异常（替代固定阈值）
    const { flag, quote } = priceFlagByQuote(s.cargo.price, s.cargo.km, s.cargo.cls);
    const credit = credits[s.cargo.owner];
    const badge = creditBadge(credit);
    const penalty = creditPenalty(credit);
    // P1：可信度聚合（货源完整度 + 认证 + 信用 + 价格 + 时效 + 卡友反馈）
    const completeness = cargoCompleteness([
      !!s.cargo.pickup,
      !!s.cargo.phone,
      !!s.cargo.truck,
      s.cargo.wt > 0,
      !!s.cargo.owner,
    ]);
    // P1：卡友反馈汇入可信度（装货等待/装卸难易）
    const fb = await repos.cargoFeedback.listByCargo(s.cargo.id);
    const counts = feedbackCounts(fb);
    const credibility = computeCredibility({
      verified: s.cargo.verified,
      credit,
      priceFlag: flag,
      completeness,
      pub: s.cargo.pub,
      feedbackPositive: counts.positive,
      feedbackNegative: counts.negative,
    });
    return {
      ...s,
      priceFlag: flag,
      priceFlagLabel: priceFlagLabel(flag),
      quoteNote: quote.note,
      creditBadge: badge,
      blacklisted: !!(credit && credit.blacklisted),
      adjustedTotal: Math.max(0, s.score.total + penalty),
      credibility,
    };
  }

  async function getDashboard(): Promise<DashboardView> {
    const [vehicle, books, cargos, credits] = await Promise.all([
      repos.vehicle.get(),
      repos.book.listAll(),
      repos.cargo.listAll(),
      repos.credit.listAll(),
    ]);

    // P3：用真实空驶里程计算 Top 推荐
    const costFor = await buildCostFor(cargos, vehicle);
    const scored = await Promise.all(
      rankCargoes(cargos, vehicle, { topN: 3 }, costFor)
        .map(s => applyCredit(s, credits)),
    );

    const now = new Date();
    const thisMonth = books.filter(b => {
      const d = new Date(b.ts);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    const today = books.filter(b => {
      const d = new Date(b.ts);
      return d.toDateString() === now.toDateString();
    });
    const monthIncome = thisMonth.reduce((s, b) => s + b.fee - b.fuel - b.toll - b.other, 0);
    const todayIncome = today.reduce((s, b) => s + b.fee - b.fuel - b.toll - b.other, 0);

    const openCargos = cargos.filter(c => c.status === 'open');
    const backhaulOpen = openCargos.filter(c => vehicle.homeCities.includes(c.to)).length;
    const orders = await repos.order.listAll();
    const activeOrders = orders.filter(o => o.status !== 'finished').length;

    // 本月平均每公里净收益（用账本数据粗算）
    const totalKm = thisMonth.reduce((s, b) => s + distEstimate(b.from, b.to), 0);
    const avgPerKm = totalKm > 0 ? Math.round((monthIncome / totalKm) * 100) / 100 : 0;

    return {
      vehicle,
      currentCity: vehicle.currentCity,
      todayIncome,
      monthIncome,
      monthOrders: thisMonth.length,
      monthKm: totalKm,
      backhaulOpen,
      activeOrders,
      topLoads: scored,
      avgPerKm,
      openCount: openCargos.length,
      topLoad: scored[0] ?? null,
    };
  }

  async function getCargoDetail(id: string): Promise<ScoredCargoView | null> {
    const [cargo, vehicle, credits] = await Promise.all([
      repos.cargo.getById(id),
      repos.vehicle.get(),
      repos.credit.listAll(),
    ]);
    if (!cargo) return null;
    const costFor = await buildCostFor([cargo], vehicle);
    const ranked = rankCargoes([cargo], vehicle, { topN: 1 }, costFor);
    if (!ranked.length) return null;
    const sc = ranked[0]!;
    return await applyCredit({ ...sc, cost: sc.cost }, credits);
  }

  /** 单货源"为什么推荐"：复用 LLM 解释能力，输入为真实计算数据 */
  async function getCargoExplain(id: string): Promise<string | null> {
    const detail = await getCargoDetail(id);
    if (!detail) return null;
    const vehicle = await repos.vehicle.get();
    return assistant.llm.explain([detail], {}, vehicle);
  }

  async function listRanked(query: Record<string, string | undefined>, sort: LoadSort = 'ai'): Promise<ScoredCargoView[]> {
    const [cargos, vehicle, prefs, credits] = await Promise.all([
      repos.cargo.listAll(),
      repos.vehicle.get(),
      repos.prefs.get(),
      repos.credit.listAll(),
    ]);
    const q: DriverQuery = {
      from: query.from,
      to: query.to,
      cargo: query.cargo,
      maxKm: query.maxKm ? Number(query.maxKm) : undefined,
      minPerKm: query.minPerKm ? Number(query.minPerKm) : undefined,
      backhaulOnly: query.backhaulOnly === '1' || query.backhaulOnly === 'true',
      truck: query.truck,
      topN: query.topN ? Number(query.topN) : 10,
    };
    const withPrefs = await applyPrefs(q);
    const costFor = await buildCostFor(cargos, vehicle);
    let ranked = rankCargoes(cargos, vehicle, withPrefs, costFor);
    // 底线：单趟最低净收益（DriverQuery 无此字段，服务层二次过滤）
    if (query.minNetIncome !== undefined || prefs.minNetIncome !== null) {
      const floor = Number(query.minNetIncome ?? prefs.minNetIncome ?? 0);
      ranked = ranked.filter(s => s.cost.netIncome >= floor);
    }
    // 排序：默认 ai 已在 rankCargoes 内按总分排好；其余在服务层按真实计算字段排
    if (sort === 'netIncome') ranked.sort((a, b) => b.cost.netIncome - a.cost.netIncome);
    else if (sort === 'perKm') ranked.sort((a, b) => b.cost.perKm - a.cost.perKm);
    else if (sort === 'distance') ranked.sort((a, b) => a.cargo.km - b.cargo.km);
    return Promise.all(ranked.map(s => applyCredit(s, credits)));
  }

  async function updateVehicle(vehicle: Vehicle): Promise<Vehicle> {
    await repos.vehicle.save(vehicle);
    return repos.vehicle.get();
  }

  // ---------- P2 订单 ----------

  async function listOrders(): Promise<Order[]> {
    const orders = await repos.order.listAll();
    return orders.sort((a, b) => b.createdAt - a.createdAt);
  }

  /** 接单：校验货源存在且开放，生成订单并标记货源已接走 */
  async function acceptLoad(loadId: string): Promise<Order | null> {
    const cargo = await repos.cargo.getById(loadId);
    if (!cargo || cargo.status !== 'open') return null;
    // P1：接单前先扣减速平台服务费（虚拟额度），余额不足则抛出（API 层转 400）
    const orderId = `O${Date.now().toString(36).toUpperCase()}`;
    const chargeRes = await repos.serviceFee.charge(DRIVER_ID, orderId, SERVICE_FEE_AMOUNT);
    if (!chargeRes.ok) {
      throw new Error(chargeRes.reason ?? '虚拟服务额度不足，请先充值演示');
    }
    const order = createOrder({
      id: orderId,
      loadId,
      from: cargo.from,
      to: cargo.to,
      cargo: cargo.cargo,
      cls: cargo.cls,
      wt: cargo.wt,
      truck: cargo.truck,
      price: cargo.price,
      km: cargo.km,
      owner: cargo.owner,
    });
    cargo.status = 'taken';
    await repos.cargo.save(cargo);
    await repos.order.save(order);
    return order;
  }

  async function getServiceFeeBalance(): Promise<number> {
    return repos.serviceFee.getBalance(DRIVER_ID);
  }

  async function rechargeServiceFee(amount: number = DEMO_RECHARGE_AMOUNT): Promise<number> {
    return repos.serviceFee.addCredit(DRIVER_ID, amount);
  }

  async function listCargoFeedback(cargoId: string): Promise<CargoFeedback[]> {
    return repos.cargoFeedback.listByCargo(cargoId);
  }

  async function submitCargoFeedback(cargoId: string, input: Omit<CargoFeedback, 'id' | 'cargoId' | 'driverId' | 'createdAt'>): Promise<CargoFeedback> {
    const f: CargoFeedback = {
      id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      cargoId,
      driverId: DRIVER_ID,
      createdAt: Date.now(),
      ...input,
    };
    return repos.cargoFeedback.add(f);
  }

  async function getOrder(id: string): Promise<Order | null> {
    return repos.order.getById(id);
  }

  /** 完成证据链一步 */
  async function completeStep(orderId: string, stepId: string): Promise<Order | null> {
    const order = await repos.order.getById(orderId);
    if (!order) return null;
    const step = order.steps.find(s => s.id === stepId);
    if (!step) return null;
    step.done = true;
    await repos.order.save(order);
    return order;
  }

  /** 损耗对比：写入订单并标记 w7 完成 */
  async function doLoss(orderId: string, loadTons: number, unloadTons: number): Promise<Order | null> {
    const order = await repos.order.getById(orderId);
    if (!order) return null;
    const loss = calcLoss(order.cls, loadTons, unloadTons);
    if (!loss) return null;
    order.loss = loss;
    const w7 = order.steps.find(s => s.id === 'w7');
    if (w7) w7.done = true;
    if (order.status !== 'finished') order.status = 'delivered';
    await repos.order.save(order);
    return order;
  }

  async function getEvidencePack(orderId: string): Promise<string | null> {
    const order = await repos.order.getById(orderId);
    if (!order) return null;
    const w8 = order.steps.find(s => s.id === 'w8');
    if (w8 && !w8.done) {
      w8.done = true;
      order.status = 'finished';
      await repos.order.save(order);
    }
    return buildEvidencePack(order);
  }

  // ---------- P2 底线偏好 ----------

  async function getPrefs(): Promise<DriverPrefs> {
    return repos.prefs.get();
  }

  async function updatePrefs(prefs: DriverPrefs): Promise<DriverPrefs> {
    await repos.prefs.save(prefs);
    return repos.prefs.get();
  }

  // ---------- P3 货主信用 ----------

  async function listCredits(): Promise<Record<string, Credit>> {
    return repos.credit.listAll();
  }

  async function rateOwner(owner: string, level: RatingLevel, tags: string[] = [], comment = ''): Promise<Credit | null> {
    if (!owner.trim()) return null;
    return repos.credit.rate(owner.trim(), level, tags, comment);
  }

  async function unblacklistOwner(owner: string): Promise<Credit | undefined> {
    return repos.credit.unblacklist(owner);
  }

  // ---------- P3 历史画像 ----------

  async function getHistory(): Promise<HistoryInsights> {
    const [orders, vehicle] = await Promise.all([repos.order.listAll(), repos.vehicle.get()]);
    const costFor = await buildCostFor(
      orders.map(o => ({ id: o.loadId, from: o.from, to: o.to, km: o.km, cargo: o.cargo, cls: o.cls, wt: o.wt, truck: o.truck, price: o.price, pickup: '', owner: o.owner, phone: '', verified: true, pub: o.createdAt, status: 'taken' })),
      vehicle,
    );
    return buildHistoryInsights(orders, vehicle, costFor);
  }

  // ---------- P10 数据统计 ----------

  async function getStats(): Promise<StatsView> {
    const books = await repos.book.listAll();
    return buildStats(books);
  }

  return {
    getDashboard,
    getCargoDetail,
    getCargoExplain,
    listRanked,
    ask: (text: string) => recommend(assistant, text),
    listOrders,
    acceptLoad,
    getOrder,
    completeStep,
    doLoss,
    getEvidencePack,
    getPrefs,
    updatePrefs,
    updateVehicle,
    listCredits,
    rateOwner,
    unblacklistOwner,
    getServiceFeeBalance,
    rechargeServiceFee,
    listCargoFeedback,
    submitCargoFeedback,
    getHistory,
    getStats,
  };
}

/** 演示用的城市间距离估算（账本统计用，仅作粗略展示） */
function distEstimate(from: string, to: string): number {
  let x = 0;
  for (let i = 0; i < from.length; i++) x = (x * 31 + from.charCodeAt(i)) >>> 0;
  let y = 0;
  for (let i = 0; i < to.length; i++) y = (y * 31 + to.charCodeAt(i)) >>> 0;
  return 60 + ((x * 7 + y * 13) % 900) + 40;
}
