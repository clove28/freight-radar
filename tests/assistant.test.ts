/**
 * AI 编排与规则 LLM 单元测试
 * 验证：
 *  1. 自然语言 → 结构化条件（规则解析）；
 *  2. 推荐流程：LLM 不计算，结果全部来自业务代码与真实 Mock 数据；
 *  3. 解释文案包含真实数据中的数字（不虚构）。
 */
import { describe, expect, it } from 'vitest';
import { RuleBasedLlm } from '../src/ai/ruleLlm.js';
import { recommend, recommendDefault } from '../src/ai/assistant.js';
import { createMockRepositories } from '../src/data/mock.js';
import { MockRoutePlanner } from '../src/core/routePlanner.js';
import { rankCargoes } from '../src/core/scoring.js';
import type { Cargo } from '../src/core/types.js';

describe('RuleBasedLlm.parseRequest 自然语言理解', () => {
  const llm = new RuleBasedLlm();

  it('解析"从临沂到临汾"', async () => {
    const { query } = await llm.parseRequest('帮我找从临沂到临汾的单');
    expect(query.from).toBe('临沂');
    expect(query.to).toBe('临汾');
  });

  it('解析"从广州回临汾"为回程+双向城市', async () => {
    const { query, raw } = await llm.parseRequest('我明天从广州回临汾');
    expect(query.from).toBe('广州');
    expect(query.to).toBe('临汾');
    expect(query.backhaulOnly).toBe(true);
    expect(raw).toContain('回程');
  });

  it('解析"从广州回武汉"（非回程基地）不回程', async () => {
    const { query } = await llm.parseRequest('从广州回武汉');
    expect(query.from).toBe('广州');
    expect(query.to).toBe('武汉');
    expect(query.backhaulOnly).toBeUndefined();
  });

  it('解析"回临汾"为回程+目的地', async () => {
    const { query, raw } = await llm.parseRequest('看看回临汾的单');
    expect(query.backhaulOnly).toBe(true);
    expect(query.to).toBe('临汾');
    expect(raw).toContain('回程');
  });

  it('解析货物关键字', async () => {
    const { query } = await llm.parseRequest('有没有拉黄豆粕的活');
    expect(query.cargo).toBe('黄豆粕');
  });

  it('解析运距上限', async () => {
    const { query } = await llm.parseRequest('500公里以内的活');
    expect(query.maxKm).toBe(500);
  });

  it('解析每公里净收益下限', async () => {
    const { query } = await llm.parseRequest('每公里不低于3块');
    expect(query.minPerKm).toBe(3);
  });

  it('解析车型', async () => {
    const { query } = await llm.parseRequest('13米高栏能干的');
    expect(query.truck).toBe('13米高栏');
  });

  it('解析条数', async () => {
    const { query } = await llm.parseRequest('给我5条');
    expect(query.topN).toBe(5);
  });

  it('空文本不崩溃，返回默认', async () => {
    const { query } = await llm.parseRequest('看看有什么活');
    expect(query).toEqual({});
  });
});

describe('recommend 推荐流程', () => {
  const repos = createMockRepositories();
  const deps = {
    llm: new RuleBasedLlm(),
    cargoRepo: repos.cargo,
    vehicleRepo: repos.vehicle,
  };

  it('完整闭环：NL → 过滤 → 成本 → 评分 → TopN → 解释', async () => {
    const r = await recommend(deps, '帮我看看回临汾的单，每公里不低于3块，给5条');
    expect(r.parsed).toBe(true);
    expect(r.query.to).toBe('临汾');
    expect(r.scored.length).toBeGreaterThan(0);
    expect(r.scored.length).toBeLessThanOrEqual(5);
    // 每个推荐都带成本与评分（业务代码算的）
    for (const s of r.scored) {
      expect(s.cost.netIncome).toBeDefined();
      expect(s.score.total).toBeGreaterThanOrEqual(0);
      expect(s.score.total).toBeLessThanOrEqual(100);
    }
    // 解释文案引用真实数字
    const first = r.scored[0]!;
    expect(r.explanation).toContain(String(first.cargo.price));
    expect(r.explanation).toContain(String(first.cost.netIncome));
  });

  it('回程货排在推荐列表前面', async () => {
    const r = await recommend(deps, '看看有什么活');
    const first = r.scored[0]!;
    // 只要 topN>1，第一个是回程货（mock 数据里回程/常跑单评分最高）
    expect(first.isBackhaul).toBe(true);
  });

  it('注入 costFor 后与大厅同一口径：结果等于 rankCargoes(同一 costFor)', async () => {
    // 复现 UAT-04：车辆当前在临沂，DEMO2 也从临沂出发 → 真实空驶里程应为 0，
    // AI 助手必须和大厅一样用这份 costFor，否则同一单会算出不同净收益。
    const [cargos, vehicle] = await Promise.all([deps.cargoRepo.listAll(), deps.vehicleRepo.get()]);
    const planner = new MockRoutePlanner();
    const emptyKm = new Map<string, number>();
    for (const c of cargos) emptyKm.set(c.id, await planner.estimateEmptyKm(vehicle.currentCity, c.from));
    const costFor = (c: Cargo) => ({ emptyKm: emptyKm.get(c.id) });

    const text = '帮我看看从临沂回临汾的黄豆粕，每公里不低于3块';
    const r = await recommend(deps, text, costFor);
    const { query } = await new RuleBasedLlm().parseRequest(text);
    const expected = rankCargoes(cargos, vehicle, query, costFor);

    expect(r.scored.map(s => s.cargo.id)).toEqual(expected.map(s => s.cargo.id));
    expect(r.scored.map(s => s.cost.netIncome)).toEqual(expected.map(s => s.cost.netIncome));

    const demo2 = r.scored.find(s => s.cargo.id === 'DEMO2');
    expect(demo2).toBeDefined();
    expect(demo2!.cost.emptyCost).toBe(0); // 车就在装货城市，空驶成本必须为 0
  });

  it('不传 costFor 时保持旧行为：仍按运距 15% 估算空驶', async () => {
    const r = await recommend(deps, '看看有什么活');
    expect(r.scored.length).toBeGreaterThan(0);
    // 默认推荐里必然有单不是从当前城市出发 → 仍有空驶成本，兼容旧调用方
    expect(r.scored.some(s => s.cost.emptyCost > 0)).toBe(true);
  });

  it('无匹配条件时返回空列表与友好提示', async () => {
    const r = await recommend(deps, '每公里不低于100块的单'); // 没有任何单能到每公里100元
    expect(r.scored.length).toBe(0);
    expect(r.explanation).toContain('暂时没有');
  });
});

describe('recommendDefault Dashboard 默认推荐', () => {
  it('返回 topN 与车辆', async () => {
    const repos = createMockRepositories();
    const deps = {
      llm: new RuleBasedLlm(),
      cargoRepo: repos.cargo,
      vehicleRepo: repos.vehicle,
    };
    const { scored, vehicle } = await recommendDefault(deps, 3);
    expect(scored.length).toBe(3);
    expect(vehicle.plate).toBe('晋L·XXXXX');
  });
});
