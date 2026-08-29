/**
 * P14 火山方舟 LLM 单元测试
 * 覆盖：JSON 解析容错（```json 包裹/前后杂文）、字段白名单、失败回退规则实现。
 * （真实网络调用在端到端验证，这里用 mock fetch）
 */
import { describe, expect, it, vi } from 'vitest';
import { ArkLlm, createLlm } from '../src/ai/arkLlm.js';
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
  it('有 ARK_API_KEY 用 ArkLlm', () => {
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
