/**
 * 货运雷达 · LLM 选择器
 *
 * 按环境变量决定用哪个 AI 引擎（业务代码只依赖 LlmPort，换厂商零改动）：
 *   1. DEEPSEEK_API_KEY  → DeepSeek 官方 API（首选）
 *   2. ARK_API_KEY       → 火山方舟（历史配置，保留兼容；已不再是默认路线）
 *   3. 都没有             → RuleBasedLlm 规则引擎（功能完整，只是解释文案没那么自然）
 *
 * 任一真实实现失败都会在内部回退规则引擎，所以「配了 key 也不怕挂」。
 */
import type { LlmPort } from './llm.js';
import { ArkLlm } from './arkLlm.js';
import { DeepSeekLlm, DEEPSEEK_DEFAULT_MODEL } from './deepseekLlm.js';
import { RuleBasedLlm } from './ruleLlm.js';

/** 当前生效的 AI 引擎类型（启动日志 / 前端展示用） */
export type LlmProvider = 'deepseek' | 'ark' | 'rule';

/** 只判断该用哪个，不实例化（启动日志用，避免多 new 一个） */
export function pickProvider(env: Record<string, string | undefined> = process.env): LlmProvider {
  if (env.DEEPSEEK_API_KEY) return 'deepseek';
  if (env.ARK_API_KEY) return 'ark';
  return 'rule';
}

/** 当前引擎的展示信息（模型名也可能来自环境变量） */
export function describeProvider(env: Record<string, string | undefined> = process.env): { provider: LlmProvider; label: string; model: string } {
  const provider = pickProvider(env);
  if (provider === 'deepseek') {
    return { provider, label: 'DeepSeek 官方', model: env.DEEPSEEK_MODEL ?? DEEPSEEK_DEFAULT_MODEL };
  }
  if (provider === 'ark') {
    return { provider, label: '火山方舟', model: env.ARK_MODEL ?? 'deepseek-v3' };
  }
  return { provider, label: '规则引擎', model: '（无模型，确定性规则）' };
}

/** 按环境变量创建 LLM 实例 */
export function createLlm(env: Record<string, string | undefined> = process.env): LlmPort {
  const provider = pickProvider(env);
  if (provider === 'deepseek') {
    return new DeepSeekLlm({
      apiKey: env.DEEPSEEK_API_KEY as string,
      model: env.DEEPSEEK_MODEL,
      baseUrl: env.DEEPSEEK_BASE_URL,
    });
  }
  if (provider === 'ark') {
    return new ArkLlm({
      apiKey: env.ARK_API_KEY as string,
      model: env.ARK_MODEL,
      baseUrl: env.ARK_BASE_URL,
    });
  }
  return new RuleBasedLlm();
}
