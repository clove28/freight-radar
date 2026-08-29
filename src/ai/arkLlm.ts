/**
 * 货运雷达 · 火山方舟 LLM 实现（Ark，P14）
 *
 * 用真实大模型（DeepSeek/豆包等，火山方舟 OpenAI 兼容接口）替代规则实现，
 * 只做两件事（与 LlmPort 契约一致）：
 *  - parseRequest：自然语言 → JSON 结构化查询条件
 *  - explain：基于真实计算数据生成推荐解释
 *
 * 边界（总控要求）：
 *  - LLM 不参与任何金额/成本/评分计算（确定性计算全在业务代码）
 *  - LLM 输出必须基于传入的真实数据，禁止虚构货源与金额
 *
 * 配置：
 *  - ARK_API_KEY  火山方舟 API key（必填）
 *  - ARK_MODEL    模型名/Endpoint ID（默认 deepseek-v3，可换 doubao 等）
 *  - ARK_BASE_URL 可选（默认 https://ark.cn-beijing.volces.com/api/v3）
 *
 * 容错：请求失败/超时/解析失败时自动回退 RuleBasedLlm，保证功能不断。
 */
import type { DriverQuery, ScoredCargo, Vehicle } from '../core/types.js';
import type { LlmPort } from './llm.js';
import { PARSE_PROMPT, EXPLAIN_PROMPT } from './llm.js';
import { RuleBasedLlm } from './ruleLlm.js';

const DEFAULT_BASE = 'https://ark.cn-beijing.volces.com/api/v3';
const DEFAULT_MODEL = 'deepseek-v3';

/** OpenAI 兼容 chat 请求 */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

export class ArkLlm implements LlmPort {
  /** AI 引擎标识（前端展示） */
  readonly engine = 'deepseek';
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private fallback: RuleBasedLlm;
  /** 最近一次 LLM 错误（调试/UI 提示用） */
  lastError = '';
  /** 是否已发生回退 */
  fellBack = false;

  constructor(opts: { apiKey: string; model?: string; baseUrl?: string; timeoutMs?: number }) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? DEFAULT_MODEL;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE;
    this.timeoutMs = opts.timeoutMs ?? 15000;
    this.fallback = new RuleBasedLlm();
  }

  private timeoutMs: number;

  /** 调火山方舟 chat completions（OpenAI 兼容） */
  private async chat(system: string, user: string): Promise<string> {
    const started = Date.now();
    console.log(`[LLM] → ${this.baseUrl}/chat/completions | model=${this.model} | ${user.slice(0, 30)}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ] as ChatMessage[],
          temperature: 0.2,
          max_tokens: 1024,
        }),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      this.lastError = (e as Error).name === 'AbortError' ? `请求超时（${this.timeoutMs}ms）` : `网络错误：${(e as Error).message}`;
      throw new Error(this.lastError);
    }
    clearTimeout(timer);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as ChatResponse;
      this.lastError = body.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`火山方舟请求失败：${this.lastError}`);
    }
    const body = (await res.json()) as ChatResponse;
    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      this.lastError = '空响应';
      throw new Error('火山方舟返回空响应');
    }
    console.log(`[LLM] ← OK ${Date.now() - started}ms | ${content.slice(0, 40)}`);
    return content;
  }

  /** 尝试解析 LLM 输出的 JSON（容忍 ```json 包裹与前后杂文） */
  private tryParseJson<T>(raw: string): T | null {
    const cleaned = raw
      .replace(/```json\s*/g, '')
      .replace(/```/g, '')
      .trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }

  async parseRequest(text: string): Promise<{ query: DriverQuery; raw: string }> {
    try {
      const out = await this.chat('你只输出 JSON。', PARSE_PROMPT.replace('{text}', text));
      const parsed = this.tryParseJson<DriverQuery>(out);
      if (!parsed || typeof parsed !== 'object') throw new Error('JSON 解析失败');
      // 白名单校验：只保留合法字段
      const query: DriverQuery = {};
      if (typeof parsed.from === 'string') query.from = parsed.from;
      if (typeof parsed.to === 'string') query.to = parsed.to;
      if (typeof parsed.cargo === 'string') query.cargo = parsed.cargo;
      if (typeof parsed.maxKm === 'number') query.maxKm = parsed.maxKm;
      if (typeof parsed.minPerKm === 'number') query.minPerKm = parsed.minPerKm;
      if (typeof parsed.backhaulOnly === 'boolean') query.backhaulOnly = parsed.backhaulOnly;
      if (typeof parsed.truck === 'string') query.truck = parsed.truck;
      if (typeof parsed.topN === 'number') query.topN = parsed.topN;
      return { query, raw: 'LLM 解析：' + text };
    } catch (e) {
      // 回退规则实现（LLM 挂了功能不断）
      this.fellBack = true;
      return this.fallback.parseRequest(text);
    }
  }

  async explain(top: ScoredCargo[], query: DriverQuery, vehicle: Vehicle): Promise<string> {
    if (!top.length) {
      return '暂时没有符合你条件的货源。可以放宽运距或运费要求，或者换换目的地再试试。';
    }
    try {
      const results = top.map((s, i) => ({
        rank: i + 1,
        from: s.cargo.from,
        to: s.cargo.to,
        cargo: s.cargo.cargo,
        wt: s.cargo.wt,
        price: s.cargo.price,
        cost: s.cost.totalCost,
        netIncome: s.cost.netIncome,
        perKm: s.cost.perKm,
        score: s.score.total,
        backhaul: s.isBackhaul,
      }));
      const prompt = EXPLAIN_PROMPT
        .replace('{vehicle}', `${vehicle.plate} ${vehicle.truck}，百公里油耗${vehicle.fuelPer100km}L，油价${vehicle.fuelPrice}元/L`)
        .replace('{query}', JSON.stringify(query))
        .replace('{results}', JSON.stringify(results, null, 1));
      const out = await this.chat('你是货运调度助手，基于给定数据解释，禁止编造数字。', prompt);
      const cleaned = out.trim();
      return cleaned.length ? cleaned : this.fallback.explain(top, query, vehicle);
    } catch {
      this.fellBack = true;
      return this.fallback.explain(top, query, vehicle);
    }
  }
}

/** 按环境变量选择 LLM：有 ARK_API_KEY 用真实 Ark，否则规则实现 */
export function createLlm(env: Record<string, string | undefined> = process.env): LlmPort {
  const key = env.ARK_API_KEY;
  if (key) {
    return new ArkLlm({ apiKey: key, model: env.ARK_MODEL, baseUrl: env.ARK_BASE_URL });
  }
  return new RuleBasedLlm();
}
