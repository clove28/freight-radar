/**
 * 货运雷达 · AI 推荐编排（核心闭环：找货 → 算成本 → 算收益 → 评分 → 推荐）
 *
 * 流程严格遵循总控要求：
 *   用户自然语言输入
 *   → LLM 提取结构化条件（只理解，不计算）
 *   → 数据访问层查询 Cargo（真实/Mock 数据，禁止凭空生成）
 *   → 业务代码过滤（车型/载重/回程/运距/司机底线）
 *   → 业务代码计算成本与净收益（cost.ts）
 *   → 业务代码计算综合评分（scoring.ts）
 *   → 取 Top N
 *   → LLM 基于结构化结果生成解释（只组织语言，不编造数字）
 */
import type { DriverQuery, Recommendation, ScoredCargo, Vehicle } from '../core/types.js';
import type { LlmPort } from './llm.js';
import type { CargoRepository, VehicleRepository } from '../data/repository.js';
import { rankCargoes, type CostOptionsFor } from '../core/scoring.js';

/** 服务依赖（便于测试注入） */
export interface AssistantDeps {
  llm: LlmPort;
  cargoRepo: CargoRepository;
  vehicleRepo: VehicleRepository;
}

/**
 * 司机底线偏好（与大厅共用；null/undefined 表示不设限）。
 * 单独定义最小结构，避免 AI 层直接依赖数据层类型。
 */
export interface AssistantPrefs {
  minPerKm?: number | null;
  minNetIncome?: number | null;
  maxKm?: number | null;
}

/**
 * 主入口：给一句话，返回推荐结果。
 *
 * @param costFor 可选：每单成本选项（P3 真实空驶里程 / P5 路线策略）。
 *   与大厅、详情、Dashboard 共用同一份口径——不传时退化为按运距 15% 估算空驶，
 *   会让同一货源在「AI 推荐」与「大厅」里算出不同的净收益（UAT-04 回归）。
 * @param prefs 可选：司机底线偏好。与大厅同源过滤：`minPerKm` / `maxKm` 在排序前
 *   合并进查询（显式说出的条件优先），`minNetIncome` 在排序后二次过滤。
 */
export async function recommend(
  deps: AssistantDeps,
  text: string,
  costFor?: CostOptionsFor,
  prefs?: AssistantPrefs,
): Promise<Recommendation> {
  // 1. LLM 只做理解（显式条件优先于司机默认底线）
  const parsed = await deps.llm.parseRequest(text);
  const query: DriverQuery = {
    ...parsed.query,
    minPerKm: parsed.query.minPerKm ?? prefs?.minPerKm ?? undefined,
    maxKm: parsed.query.maxKm ?? prefs?.maxKm ?? undefined,
  };

  // 2. 数据访问层查询（真数据，不虚构）
  const [cargos, vehicle] = await Promise.all([
    deps.cargoRepo.listAll(),
    deps.vehicleRepo.get(),
  ]);

  // 3–6. 业务代码：过滤 → 成本 → 评分 → Top N
  // minNetIncome 与大厅一致：排序后二次过滤（rankCargoes 内部已按 minPerKm/maxKm 过滤）
  const scored = rankCargoes(cargos, vehicle, query, costFor).filter(
    (s) => prefs?.minNetIncome == null || s.cost.netIncome >= prefs.minNetIncome,
  );

  // 7. LLM 基于真实结果生成解释
  const explanation = await deps.llm.explain(scored, query, vehicle);

  return { query, parsed: true, raw: parsed.raw, scored, explanation, engine: deps.llm.engine };
}

/** 无自然语言时的默认推荐（Dashboard 用）：只按评分取 Top N */
export async function recommendDefault(
  deps: AssistantDeps,
  topN = 3,
): Promise<{ scored: ScoredCargo[]; vehicle: Vehicle }> {
  const [cargos, vehicle] = await Promise.all([
    deps.cargoRepo.listAll(),
    deps.vehicleRepo.get(),
  ]);
  const scored = rankCargoes(cargos, vehicle, { topN });
  return { scored, vehicle };
}
