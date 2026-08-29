/**
 * 货运雷达 · 领域模型
 *
 * 所有核心数据类型定义于此。业务计算（成本、评分、过滤）只依赖这些纯类型，
 * 不依赖任何框架或数据库实现，保证核心逻辑可独立测试、可迁移。
 */

/** 货物大类（决定损耗标准、车型要求等） */
export type CargoClass =
  | '农产品'
  | '冷藏'
  | '建材'
  | '重货'
  | '普货'
  | '危化'
  | '快递'
  | '其他';

/** 货源状态 */
export type LoadStatus = 'open' | 'taken';

/**
 * 货源（一单货）
 * 对应"货运大厅"里的一条货源。字段与真实货运平台 API 对齐，
 * 便于后续接入满帮/运满满等真实数据源。
 */
export interface Cargo {
  id: string;
  /** 出发地 */
  from: string;
  /** 目的地 */
  to: string;
  /** 运输距离（公里） */
  km: number;
  /** 货物名称，如"黄豆粕" */
  cargo: string;
  /** 货物大类 */
  cls: CargoClass;
  /** 货物重量（吨） */
  wt: number;
  /** 车型要求，如"13米高栏" */
  truck: string;
  /** 运费（元/趟） */
  price: number;
  /** 装货时间标签，如"今天 14:00" */
  pickup: string;
  /** 货主 */
  owner: string;
  /** 联系电话（演示数据为模拟号） */
  phone: string;
  /** 货主是否认证 */
  verified: boolean;
  /** 发布时间戳 */
  pub: number;
  /** 状态 */
  status: LoadStatus;
}

/**
 * 车辆档案（司机自己的车）
 * 成本计算所需的全部车辆参数都从这来，不硬编码在计算函数里。
 */
export interface Vehicle {
  id: string;
  /** 车牌 */
  plate: string;
  /** 车型，如"13米高栏" */
  truck: string;
  /** 核定载重（吨） */
  maxLoad: number;
  /** 百公里油耗（升/百公里） */
  fuelPer100km: number;
  /** 油价（元/升），司机可手动更新 */
  fuelPrice: number;
  /** 高速费系数（元/公里），可随地区调整 */
  tollPerKm: number;
  /** 其他固定成本（元/趟）：食宿、停车、装车杂费等 */
  otherCostPerTrip: number;
  /** 当前所在城市（决定回程/空驶判断） */
  currentCity: string;
  /** 回程基地城市列表（家/常回的地方） */
  homeCities: string[];
  /** 常跑路线 */
  routes: SavedRoute[];
}

/** 常跑路线（司机保存的熟悉线路） */
export interface SavedRoute {
  id: string;
  from: string;
  to: string;
}

/**
 * 成本估算结果（确定性计算，由业务代码完成）
 * 油费 = 里程/100 × 百公里油耗 × 油价
 * 总成本 = 油费 + 高速费 + 其他费用 + 空驶成本
 * 净收益 = 运费 − 总成本
 * 每公里净收益 = 净收益 / 总行驶里程
 */
export interface CostEstimate {
  /** 油费（元） */
  fuel: number;
  /** 高速费（元） */
  toll: number;
  /** 其他费用（元） */
  other: number;
  /** 空驶成本（元）：去装货地的空驶油费 */
  emptyCost: number;
  /** 总成本 = 油费+高速费+其他+空驶成本 */
  totalCost: number;
  /** 预计净收益 = 运费 − 总成本 */
  netIncome: number;
  /** 每公里净收益（元/公里） */
  perKm: number;
}

/**
 * 综合评分结果（0–100）
 * 收益 40% · 路线匹配 20% · 回程概率 20% · 车型匹配 10% · 时间匹配 10%
 */
export interface ScoreBreakdown {
  /** 收益分 0–100 */
  income: number;
  /** 路线匹配分 0–100 */
  route: number;
  /** 回程概率分 0–100 */
  backhaul: number;
  /** 车型匹配分 0–100 */
  vehicle: number;
  /** 时间匹配分 0–100 */
  time: number;
  /** 加权总分 0–100 */
  total: number;
}

/** 评分后的货源（带成本与评分，供推荐列表与 AI 解释使用） */
export interface ScoredCargo {
  cargo: Cargo;
  cost: CostEstimate;
  score: ScoreBreakdown;
  /** 该单为回程货 */
  isBackhaul: boolean;
  /** 是否匹配常跑路线 */
  isRouteMatch: boolean;
}

/** AI 助手从自然语言中提取的结构化查询条件 */
export interface DriverQuery {
  from?: string;
  to?: string;
  cargo?: string;
  /** 最大运距（公里），司机可指定"不要太远" */
  maxKm?: number;
  /** 最低每公里净收益（元/公里） */
  minPerKm?: number;
  /** 只看回程货 */
  backhaulOnly?: boolean;
  /** 只看某车型 */
  truck?: string;
  /** 最多返回几条 */
  topN?: number;
}

/** AI 推荐结果（查询条件 + 排序后的货源 + 解释） */
export interface Recommendation {
  query: DriverQuery;
  /** 是否理解了自然语言（true=规则解析成功；false=回退为默认推荐） */
  parsed: boolean;
  /** 规则解析的原文说明（调试/展示用） */
  raw?: string;
  scored: ScoredCargo[];
  /** AI 生成的推荐解释（基于真实计算数据，不虚构数字） */
  explanation: string;
  /** AI 引擎标识（P15：'deepseek' / 'rule'，前端展示用） */
  engine?: string;
}

/** 记账条目 */
export interface BookEntry {
  id: string;
  ts: number;
  from: string;
  to: string;
  fee: number;
  fuel: number;
  toll: number;
  other: number;
  /** 绿通节省（元） */
  greenSave: number;
  note: string;
  /** 里程（公里，P11：记账时保存，统计/每公里收益用真实值） */
  km?: number;
}

/** Dashboard 首页聚合数据 */
export interface DashboardData {
  vehicle: Vehicle;
  currentCity: string;
  /** 今日净收益（演示数据由账本汇总） */
  todayIncome: number;
  /** 本月净收益 */
  monthIncome: number;
  /** 本月单数 */
  monthOrders: number;
  /** 本月总里程 */
  monthKm: number;
  /** 回程货在线数量 */
  backhaulOpen: number;
  /** 在途订单数 */
  activeOrders: number;
  /** AI 推荐 Top 3 */
  topLoads: ScoredCargo[];
  /** 平均每公里净收益（本月） */
  avgPerKm: number;
}
