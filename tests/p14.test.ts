/**
 * P14 LLM 单元测试（火山方舟 → DeepSeek 官方迁移后仍覆盖原有契约）
 * 覆盖：JSON 解析容错（```json 包裹/前后杂文）、字段白名单、失败回退、
 *       以及「按环境变量选厂商」的优先级（DeepSeek 官方优先于火山兼容配置）。
 * （真实网络调用在端到端验证，这里用 mock fetch）
 */
import { describe, expect, it, vi } from 'vitest';
import { ArkLlm } from '../src/ai/arkLlm.js';
import { DeepSeekLlm, normalizeDeepSeekBase } from '../src/ai/deepseekLlm.js';
import { createLlm, describeProvider, pickProvider } from '../src/ai/selectLlm.js';
import { RuleBasedLlm } from '../src/ai/ruleLlm.js';

describe('ArkLlm JSON 解析容错', () => {
  it('解析纯 JSON', async () => {
    const llm = new ArkLlm({ apiKey: 'test' });
    const out = llm['tryParseJson']('{"to":"临汾","backhaulOnly":true}');
    expect(out).toEqual({ to: '临汾', backhaulOnly: true });
  });

  it('解析 ```json 包裹', async () => {
    const llm = new ArkLlm({ apiKey: 'test' });
    const out = llm['tryParseJson']('```json\n{"from":"广州","to":"武汉"}\n```');
    expect(out).toEqual({ from: '广州', to: '武汉' });
  });

  it('解析前后有杂文', async () => {
    const llm = new ArkLlm({ apiKey: 'test' });
    const out = llm['tryParseJson']('好的，这是解析结果：\n{"cargo":"黄豆粕","maxKm":500}\n希望对你有帮助');
    expect(out).toEqual({ cargo: '黄豆粕', maxKm: 500 });
  });

  it('非法 JSON 返回 null', async () => {
    const llm = new ArkLlm({ apiKey: 'test' });
    expect(llm['tryParseJson']('这不是 JSON')).toBeNull();
    expect(llm['tryParseJson']('{}')).toEqual({});
  });
});

describe('ArkLlm 字段白名单', () => {
  it('只保留合法字段，过滤未知字段', async () => {
    const llm = new ArkLlm({ apiKey: 'test' });
    // 模拟 LLM 返回含未知字段与非法类型的 JSON
    const fake = {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '{"to":"临汾","hack":"x","topN":"abc"}' } }] }),
    } as Response;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fake));
    const r = await llm.parseRequest('帮我找回临汾的货');
    expect(r.query.to).toBe('临汾');
    expect(r.query).not.toHaveProperty('hack');
    expect(r.query.topN).toBeUndefined(); // 非数字被过滤
    vi.unstubAllGlobals();
  });
});

describe('ArkLlm 失败回退', () => {
  it('请求失败时回退规则实现（功能不断）', async () => {
    const llm = new ArkLlm({ apiKey: 'bad-key' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const r = await llm.parseRequest('帮我找从临沂到临汾的单');
    expect(llm.fellBack).toBe(true);
    // 规则实现也能解析基本条件
    expect(r.query.from).toBe('临沂');
    expect(r.query.to).toBe('临汾');
    vi.unstubAllGlobals();
  });

  it('HTTP 非 2xx 也回退', async () => {
    const llm = new ArkLlm({ apiKey: 'bad-key' });
    const fake = { ok: false, status: 401, json: async () => ({ error: { message: 'InvalidKey' } }) } as Response;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fake));
    const r = await llm.parseRequest('随便什么');
    expect(llm.fellBack).toBe(true);
    expect(llm.lastError).toContain('InvalidKey');
    vi.unstubAllGlobals();
  });
});

describe('createLlm 环境变量选择', () => {
  it('有 ARK_API_KEY 用 ArkLlm（火山，兼容保留）', () => {
    const llm = createLlm({ ARK_API_KEY: 'ark-xxx' });
    expect(llm).toBeInstanceOf(ArkLlm);
  });

  it('无 key 用规则实现', () => {
    const llm = createLlm({});
    expect(llm).toBeInstanceOf(RuleBasedLlm);
  });

  it('可配置模型', () => {
    const llm = createLlm({ ARK_API_KEY: 'ark-xxx', ARK_MODEL: 'doubao-pro-32k' });
    expect((llm as ArkLlm)['model']).toBe('doubao-pro-32k');
  });
});

describe('DeepSeek 官方 API（替代火山方舟）', () => {
  it('配 DEEPSEEK_API_KEY 即走官方端点与默认模型', () => {
    const llm = createLlm({ DEEPSEEK_API_KEY: 'sk-test' }) as DeepSeekLlm;
    expect(llm).toBeInstanceOf(DeepSeekLlm);
    expect(llm['baseUrl']).toBe('https://api.deepseek.com');
    expect(llm['model']).toBe('deepseek-chat');
  });

  it('两个 key 同时存在时 DeepSeek 优先于火山', () => {
    const env = { DEEPSEEK_API_KEY: 'sk-test', ARK_API_KEY: 'ark-xxx' };
    expect(pickProvider(env)).toBe('deepseek');
    expect(createLlm(env)).toBeInstanceOf(DeepSeekLlm);
  });

  it('可换模型与端点（reasoner / 自建代理）', () => {
    const llm = createLlm({
      DEEPSEEK_API_KEY: 'sk-test',
      DEEPSEEK_MODEL: 'deepseek-reasoner',
      DEEPSEEK_BASE_URL: 'https://proxy.example.com',
    }) as DeepSeekLlm;
    expect(llm['model']).toBe('deepseek-reasoner');
    expect(llm['baseUrl']).toBe('https://proxy.example.com');
  });

  it('请求失败时文案标明是 DeepSeek（不再冒充火山）', async () => {
    const llm = new DeepSeekLlm({ apiKey: 'sk-bad' });
    const fake = { ok: false, status: 401, json: async () => ({ error: { message: 'Authentication Fails' } }) } as Response;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fake));
    await expect(llm['chat']('sys', 'user')).rejects.toThrow(/DeepSeek请求失败/);
    expect(llm['lastError']).toContain('Authentication Fails');
    vi.unstubAllGlobals();
  });

  it('DeepSeek 挂了仍回退规则引擎，功能不断', async () => {
    const llm = createLlm({ DEEPSEEK_API_KEY: 'sk-bad' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const r = await llm.parseRequest('帮我找从临沂到临汾的单');
    expect((llm as DeepSeekLlm).fellBack).toBe(true);
    expect(r.query.from).toBe('临沂');
    vi.unstubAllGlobals();
  });

  it('describeProvider 如实报告当前引擎', () => {
    expect(describeProvider({ DEEPSEEK_API_KEY: 'sk-test' })).toEqual({
      provider: 'deepseek',
      label: 'DeepSeek 官方',
      model: 'deepseek-chat',
    });
    expect(describeProvider({ ARK_API_KEY: 'ark-x' }).provider).toBe('ark');
    expect(describeProvider({}).provider).toBe('rule');
  });
});

describe('DeepSeek baseURL 清洗（防宿主注入串台）', () => {
  it('空值回落官方根地址', () => {
    expect(normalizeDeepSeekBase(undefined)).toBe('https://api.deepseek.com');
    expect(normalizeDeepSeekBase('   ')).toBe('https://api.deepseek.com');
  });

  it('宿主注入的 Anthropic 兼容路径被忽略（实测踩过：会 404 后静默回退）', () => {
    expect(normalizeDeepSeekBase('https://api.deepseek.com/anthropic')).toBe('https://api.deepseek.com');
    expect(normalizeDeepSeekBase('https://api.deepseek.com/anthropic/')).toBe('https://api.deepseek.com');
  });

  it('去掉尾部斜杠，保留 /v1 与自建代理路径', () => {
    expect(normalizeDeepSeekBase('https://api.deepseek.com/')).toBe('https://api.deepseek.com');
    expect(normalizeDeepSeekBase('https://api.deepseek.com/v1')).toBe('https://api.deepseek.com/v1');
    expect(normalizeDeepSeekBase('https://proxy.example.com/api/')).toBe('https://proxy.example.com/api');
  });

  it('环境变量里的脏值不会污染实例', () => {
    const llm = createLlm({ DEEPSEEK_API_KEY: 'sk-test', DEEPSEEK_BASE_URL: 'https://api.deepseek.com/anthropic' }) as DeepSeekLlm;
    expect(llm['baseUrl']).toBe('https://api.deepseek.com');
  });
});
