/**
 * 前端 API 契约类型（DTO）
 *
 * 前端不复制任何业务计算，只消费后端返回的 JSON。
 * 这些类型与后端 src/core/types.ts 一一对应，保持契约一致。
 * 后端是单一事实来源；此处仅声明"前端视角"的响应结构。
 */

/** 货物大类 */
export type CargoClass =
  | '农产品' | '冷藏' | '建材' | '重货' | '普货' | '危化' | '快递' | '其他';

/** 货源（对应后端 Cargo） */
export interface Cargo {
  id: string;
  from: string;
  to: string;
  km: number;
  cargo: string;
  cls: CargoClass;
  wt: number;
  truck: string;
  price: number;
  pickup: string;
  owner: string;
  phone: string;
  verified: boolean;
  pub: number;
  status: 'open' | 'taken';
}

/** 成本估算（对应后端 CostEstimate） */
export interface CostEstimate {
  fuel: number;
  toll: number;
  other: number;
  emptyCost: number;
  totalCost: number;
  netIncome: number;
  perKm: number;
}

/** 评分（对应后端 ScoreBreakdown） */
export interface ScoreBreakdown {
  income: number;
  route: number;
  backhaul: number;
  vehicle: number;
  time: number;
  total: number;
}

/** 评分后的货源（对应后端 ScoredCargo） */
export interface ScoredCargo {
  cargo: Cargo;
  cost: CostEstimate;
  score: ScoreBreakdown;
  isBackhaul: boolean;
  isRouteMatch: boolean;
}

/** 车辆档案（对应后端 Vehicle） */
export interface Vehicle {
  id: string;
  plate: string;
  truck: string;
  maxLoad: number;
  fuelPer100km: number;
  fuelPrice: number;
  tollPerKm: number;
  otherCostPerTrip: number;
  currentCity: string;
  homeCities: string[];
  routes: SavedRoute[];
}

/** 常跑路线 */
export interface SavedRoute {
  id: string;
  from: string;
  to: string;
}

/** Dashboard 视图（对应后端 DashboardView） */
export interface DashboardView {
  vehicle: Vehicle;
  currentCity: string;
  todayIncome: number;
  monthIncome: number;
  monthOrders: number;
  monthKm: number;
  backhaulOpen: number;
  activeOrders: number;
  topLoads: ScoredCargo[];
  avgPerKm: number;
  openCount: number;
  topLoad: ScoredCargo | null;
}

/** AI 助手请求 */
export interface AssistantRequest {
  text: string;
}

/** AI 助手响应（对应后端 Recommendation） */
export interface Recommendation {
  query: {
    from?: string;
    to?: string;
    cargo?: string;
    maxKm?: number;
    minPerKm?: number;
    backhaulOnly?: boolean;
    truck?: string;
    topN?: number;
  };
  parsed: boolean;
  raw: string;
  scored: ScoredCargo[];
  explanation: string;
  /** AI 引擎标识（P15） */
  engine?: string;
}

/** AI 解释响应 */
export interface ExplainResponse {
  explanation: string;
}

/** 大厅排序方式 */
export type LoadSort = 'ai' | 'netIncome' | 'perKm' | 'distance';

/** 大厅查询参数 */
export interface CargoQuery {
  from?: string;
  to?: string;
  cargo?: string;
  truck?: string;
  maxKm?: number;
  minPerKm?: number;
  minNetIncome?: number;
  backhaulOnly?: boolean;
  topN?: number;
  sort?: LoadSort;
  /** P15 分页 */
  page?: number;
  limit?: number;
}

/** P15 分页响应 */
export interface PagedCargos {
  items: ScoredCargoView[];
  total: number;
  page: number;
  limit: number;
}

/** 货源可信度（对应后端 CredibilityResult，P1） */
export interface CredibilityResult {
  score: number;
  level: 'high' | 'mid' | 'low';
  evidence: string[];
  pending: boolean;
}

/** 平台服务费信息（P1，虚拟额度，不可提现/转账/兑换） */
export interface ServiceFeeBalance {
  balance: number;
  amount: number;
  rechargeAmount: number;
}

/** 装卸难易（卡友反馈） */
export type FeedbackDifficulty = 'easy' | 'medium' | 'hard';

/** 卡友反馈（P1，对应后端 CargoFeedback） */
export interface CargoFeedback {
  id: string;
  cargoId: string;
  driverId: string;
  loadWaitHours: number | null;
  loadDifficulty: FeedbackDifficulty | null;
  unloadDifficulty: FeedbackDifficulty | null;
  entranceTips: string;
  parkingTips: string;
  comment: string;
  createdAt: number;
}

/** 货源列表项：带价格异常标记与货主信用（对应后端 ScoredCargoView） */
export interface ScoredCargoView extends ScoredCargo {
  priceFlag: 'low' | 'high' | 'normal';
  priceFlagLabel: string;
  /** 行情区间文案（P5） */
  quoteNote: string;
  /** 货主信用徽标 */
  creditBadge: 'good' | 'mid' | 'bad' | 'none';
  /** 是否黑名单货主 */
  blacklisted: boolean;
  /** 信用降权后的最终分 */
  adjustedTotal: number;
  /** 货源可信度（P1） */
  credibility: CredibilityResult;
}

/** 货主信用（对应后端 Credit） */
export interface Credit {
  owner: string;
  score: number;
  good: number;
  medium: number;
  bad: number;
  total: number;
  blacklisted: boolean;
  tags: Record<string, number>;
  comments: string[];
}

/** 历史画像（对应后端 HistoryInsights） */
export interface HistoryInsights {
  topRoutes: Array<{ from: string; to: string; count: number }>;
  avgPerKm: number;
  completionRate: number;
  lossOverRate: number;
  finishedCount: number;
  totalNetIncome: number;
}

/** 路线策略（P4） */
export type RouteStrategy = 'highway' | 'national' | 'balanced';

/** 路线环境全景（P4，对应后端 RouteEnvironmentResult） */
/** 高速 vs 国道 对比（对应后端 RouteCompareResult） */
export interface RouteCompare {
  from: string;
  to: string;
  highway: { plan: { distanceKm: number; durationMin: number; toll: number; real: boolean }; fuel: number; totalCost: number };
  national: { plan: { distanceKm: number; durationMin: number; toll: number; real: boolean }; fuel: number; totalCost: number };
  cheaper: 'highway' | 'national';
  real: boolean;
}

export interface RouteEnvironment {
  from: string;
  to: string;
  plan: {
    distanceKm: number;
    durationMin: number;
    toll: number;
    real: boolean;
    steps?: string[];
  };
  strategy: RouteStrategy;
  strategyLabel: string;
  fromWeather: {
    weather: { city: string; weather: string; temp: number; windScale: string; humidity: number; real: boolean };
    impact: { fuelFactor: number; tireAdjustBar: number; slowDown: boolean; advice: string };
  };
  toWeather: { city: string; weather: string; temp: number; windScale: string; humidity: number; real: boolean };
  pois: Array<{ name: string; address: string; type: string; distance: number }>;
  real: boolean;
}

/** 司机账号（P6） */
export interface DriverAccount {
  id: string;
  name: string;
  createdAt: number;
  /** 角色（P1D）：driver 司机 / ops 运营 / shipper 货主 / customer 客户 */
  role?: string;
}

/** 司机列表响应 */
export interface DriverListResponse {
  drivers: DriverAccount[];
  current: DriverAccount | null;
  error?: string;
}

/** 统计视图（P10，对应后端 StatsView） */
export interface StatsView {
  monthly: Array<{ label: string; income: number; orders: number; perKm: number }>;
  routes: Array<{ from: string; to: string; count: number; totalIncome: number; avgPerKm: number }>;
  avgPerKmAll: number;
  monthIncome: number;
  /** P13：本月运费/里程/成本 */
  monthFee: number;
  monthKm: number;
  monthCost: number;
}

/** 登录响应（P7） */
export interface AuthResponse {
  token: string;
  driver: DriverAccount;
}

/** 记账条目（P11，对应后端 BookEntry） */
export interface BookEntry {
  id: string;
  ts: number;
  from: string;
  to: string;
  fee: number;
  fuel: number;
  toll: number;
  other: number;
  greenSave: number;
  note: string;
  km?: number;
}

/** 订单状态 */
export type OrderStatus = 'accepted' | 'onway' | 'delivered' | 'finished';

/** 订单步骤 */
export interface OrderStep {
  id: string;
  label: string;
  phase: 'load' | 'onway' | 'unload' | 'finish';
  icon: string;
  done: boolean;
}

/** 损耗结果 */
export interface LossResult {
  loadTons: number;
  unloadTons: number;
  lossKg: number;
  ratePerMille: number;
  stdPerMille: number;
  overLimit: boolean;
  verdict: string;
}

/** 订单（对应后端 Order） */
export interface Order {
  id: string;
  loadId: string;
  from: string;
  to: string;
  cargo: string;
  cls: CargoClass;
  wt: number;
  truck: string;
  price: number;
  km: number;
  owner: string;
  createdAt: number;
  status: OrderStatus;
  steps: OrderStep[];
  loss: LossResult | null;
}

/** 司机底线偏好（对应后端 DriverPrefs） */
export interface DriverPrefs {
  minPerKm: number | null;
  minNetIncome: number | null;
  maxKm: number | null;
  /** 常用路线策略（P5） */
  preferredStrategy: RouteStrategy | null;
}

/** 证据包响应 */
export interface EvidencePackResponse {
  pack: string;
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  accepted: '已接单',
  onway: '运输中',
  delivered: '已送达',
  finished: '已完成',
};
