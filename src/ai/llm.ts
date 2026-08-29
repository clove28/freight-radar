/**
 * 货运雷达 · LLM 端口（AI 接入点）
 *
 * 设计原则（见项目总控要求）：
 *  - AI 只负责：自然语言理解、需求结构化、推荐解释、决策辅助；
 *  - 确定性计算（成本/净收益/每公里/评分/排序）一律由业务代码完成；
 *  - LLM 输出必须建立在真实/模拟数据之上，禁止虚构货源与金额。
 *
 * 本文件定义"LLM 能力"接口。阶段一提供 RuleBasedLlm（规则实现，零外部依赖），
 * 将来可无缝替换为真实 LLM 实现（OpenAI/DeepSeek/云函数），业务流程不变。
 */
import type { DriverQuery, Recommendation, ScoredCargo, Vehicle } from '../core/types.js';

/** LLM 需要提供的两种能力 */
export interface LlmPort {
  /** AI 引擎标识（P15：'deepseek' / 'rule'，前端展示用） */
  readonly engine?: string;

  /**
   * 自然语言 → 结构化查询条件。
   * 实现方（规则或真实 LLM）只做"理解"，不做任何计算。
   */
  parseRequest(text: string): Promise<{ query: DriverQuery; raw: string }>;

  /**
   * 基于真实计算结果的推荐解释。
   * 传入的都是评分/成本引擎算好的数据，LLM 只负责组织语言，
   * 不允许自行计算或编造数字。
   */
  explain(
    top: ScoredCargo[],
    query: DriverQuery,
    vehicle: Vehicle,
  ): Promise<string>;
}

/** 给真实 LLM 的提示词模板（阶段一保留，接入真实 LLM 时直接使用） */
export const PARSE_PROMPT = `你是货运调度助手。把司机的一句话需求解析为 JSON，只输出 JSON，不要解释。
可选字段（都没有就省略）：
- from: 出发地城市
- to: 目的地城市
- cargo: 货物名称或类别
- maxKm: 最大运距（公里）
- minPerKm: 最低每公里净收益
- backhaulOnly: 只看回程货（true/false）
- truck: 车型要求
- topN: 返回条数（默认5）
司机说："{text}"`;

export const EXPLAIN_PROMPT = `你是货运调度助手。根据以下【真实计算结果】向司机解释推荐理由，用中文，3-5句话，口语化、简洁。
要求：
1. 只能引用下方数据，严禁编造任何数字。
2. 突出"预计净收益"和"每公里净收益"。
3. 若某单是回程货，要特别强调。
4. 不要逐条复述，抓重点。

车辆：{vehicle}
查询条件：{query}
推荐结果：{results}`;
