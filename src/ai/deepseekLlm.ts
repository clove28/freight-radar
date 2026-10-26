/**
 * 货运雷达 · DeepSeek 官方 API 实现
 *
 * 替代火山方舟：直接调 DeepSeek 官方 OpenAI 兼容接口，少一层代理，
 * key 与账单都在 DeepSeek 平台（platform.deepseek.com）自己手里。
 *
 * 配置（环境变量，见 .env.example）：
 *  - DEEPSEEK_API_KEY   DeepSeek 官方 API key（必填，形如 sk-xxx）
 *  - DEEPSEEK_MODEL     模型名，默认 deepseek-flash（要更强推理改 deepseek-v4-pro）
 *  - DEEPSEEK_BASE_URL  可选，默认 https://api.deepseek.com
 *
 * 复用 ArkLlm 的 OpenAI 兼容实现：同一份请求/解析/回退逻辑，只换端点与厂商标识。
 * 边界不变：LLM 只做自然语言理解与解释，金额/评分/排序仍由业务代码计算。
 */
import { ArkLlm } from './arkLlm.js';

/** DeepSeek 官方端点（OpenAI 兼容，/chat/completions 在其下） */
export const DEEPSEEK_DEFAULT_BASE = 'https://api.deepseek.com';
/**
 * 默认对话模型。
 *
 * 官方文档（2026-10）当前口径是 `deepseek-flash` 与 `deepseek-v4-pro`；
 * 旧名 `deepseek-chat` 仍可调用（实际由 V4.1-Flash 提供服务、按 Flash 计费），
 * 但新配置一律用文档里的名字，避免以后旧名真的下线。
 */
export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-flash';

/**
 * 清洗 baseURL：只认 OpenAI 兼容根地址。
 *
 * 为什么需要：`DEEPSEEK_BASE_URL` 是个通用名字，宿主进程（IDE、Agent 运行时、
 * 代理工具）也可能设同名的变量。实测踩过——某些宿主把它指到
 * `https://api.deepseek.com/anthropic`（Anthropic 兼容端点，供 Claude 协议客户端用），
 * 本应用按 OpenAI 协议拼 `/anthropic/chat/completions`，结果 404 → 静默回退规则引擎，
 * 表面上「engine=deepseek」，实际一次都没调通。
 *
 * 规则：带 /anthropic 的一律退回官方根地址；其余仅去掉尾部多余的斜杠，
 * 这样用户自己配的 /v1 或自建代理路径仍然生效。
 */
export function normalizeDeepSeekBase(raw?: string): string {
  const v = (raw ?? '').trim();
  if (!v) return DEEPSEEK_DEFAULT_BASE;
  const trimmed = v.replace(/\/+$/, '');
  if (!trimmed) return DEEPSEEK_DEFAULT_BASE;
  if (/\/anthropic(\/|$)/i.test(trimmed)) return DEEPSEEK_DEFAULT_BASE;
  return trimmed;
}

/** DeepSeek 官方：chat / reasoner 两个模型入口 */
export class DeepSeekLlm extends ArkLlm {
  constructor(opts: { apiKey: string; model?: string; baseUrl?: string; timeoutMs?: number }) {
    super({
      apiKey: opts.apiKey,
      model: opts.model ?? DEEPSEEK_DEFAULT_MODEL,
      baseUrl: normalizeDeepSeekBase(opts.baseUrl),
      timeoutMs: opts.timeoutMs,
      label: 'DeepSeek',
    });
  }
}
