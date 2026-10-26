/**
 * 货运雷达 · DeepSeek 官方 API 实现
 *
 * 替代火山方舟：直接调 DeepSeek 官方 OpenAI 兼容接口，少一层代理，
 * key 与账单都在 DeepSeek 平台（platform.deepseek.com）自己手里。
 *
 * 配置（环境变量，见 .env.example）：
 *  - DEEPSEEK_API_KEY   DeepSeek 官方 API key（必填，形如 sk-xxx）
 *  - DEEPSEEK_MODEL     模型名，默认 deepseek-chat（可选 deepseek-reasoner）
 *  - DEEPSEEK_BASE_URL  可选，默认 https://api.deepseek.com
 *
 * 复用 ArkLlm 的 OpenAI 兼容实现：同一份请求/解析/回退逻辑，只换端点与厂商标识。
 * 边界不变：LLM 只做自然语言理解与解释，金额/评分/排序仍由业务代码计算。
 */
import { ArkLlm } from './arkLlm.js';

/** DeepSeek 官方端点（OpenAI 兼容，/chat/completions 在其下） */
export const DEEPSEEK_DEFAULT_BASE = 'https://api.deepseek.com';
/** 默认对话模型；需要推理链时改 deepseek-reasoner */
export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-chat';

/** DeepSeek 官方：chat / reasoner 两个模型入口 */
export class DeepSeekLlm extends ArkLlm {
  constructor(opts: { apiKey: string; model?: string; baseUrl?: string; timeoutMs?: number }) {
    super({
      apiKey: opts.apiKey,
      model: opts.model ?? DEEPSEEK_DEFAULT_MODEL,
      baseUrl: opts.baseUrl ?? DEEPSEEK_DEFAULT_BASE,
      timeoutMs: opts.timeoutMs,
      label: 'DeepSeek',
    });
  }
}
