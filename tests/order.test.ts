/**
 * P2 新增模块单元测试
 * 覆盖：订单创建/证据链/损耗对比/证据包、价格异常检测、底线偏好过滤。
 */
import { describe, expect, it } from 'vitest';
import {
  buildEvidencePack,
  calcLoss,
  createOrder,
  priceFlag,
  ORDER_STEPS,
} from '../src/core/order.js';

describe('calcLoss 损耗对比（确定性）', () => {
  it('正常损耗：自然损耗司机无责', () => {
    const r = calcLoss('农产品', 30, 29.98)!;
    expect(r).not.toBeNull();
    expect(r.lossKg).toBe(20); // (30-29.98)*1000
    expect(r.ratePerMille).toBeCloseTo(0.7, 1);
    expect(r.overLimit).toBe(false); // 0.7‰ < 农产品5‰
    expect(r.verdict).toContain('无责');
  });

  it('超损：超过行业参考标记责任待定', () => {
    const r = calcLoss('农产品', 30, 29)!;
    expect(r.lossKg).toBe(1000);
    expect(r.ratePerMille).toBeCloseTo(33.3, 1);
    expect(r.overLimit).toBe(true); // 33.3‰ > 5‰
    expect(r.verdict).toContain('责任待定');
  });

  it('冷藏标准 10‰', () => {
    const r = calcLoss('冷藏', 20, 19.9)!;
    expect(r.stdPerMille).toBe(10);
    expect(r.overLimit).toBe(false);
  });

  it('非法参数返回 null', () => {
    expect(calcLoss('普货', 0, 10)).toBeNull();
    expect(calcLoss('普货', 10, 10.5)).toBeNull(); // 卸货大于装货
    expect(calcLoss('普货', -1, 0)).toBeNull();
  });
});

describe('createOrder / 证据链', () => {
  const order = createOrder({
    id: 'O1', loadId: 'L1', from: '广州', to: '武汉', cargo: '日用百货',
    cls: '普货', wt: 28, truck: '13米高栏', price: 7600, km: 1050, owner: '张老板',
  });

  it('订单包含 8 步证据链且初始未完成', () => {
    expect(order.steps.length).toBe(8);
    expect(order.steps.every(s => !s.done)).toBe(true);
    expect(order.status).toBe('accepted');
  });

  it('ORDER_STEPS 定义完整（8 步）', () => {
    expect(ORDER_STEPS.map(s => s.id)).toEqual(['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8']);
  });

  it('证据包包含关键信息', () => {
    const pack = buildEvidencePack(order);
    expect(pack).toContain('广州 → 武汉');
    expect(pack).toContain('7600');
    expect(pack).toContain('证据链');
  });

  it('证据包含损耗结论', () => {
    const withLoss = { ...order, loss: calcLoss('普货', 28, 27.95) };
    const pack = buildEvidencePack(withLoss);
    expect(pack).toContain('损耗对比');
    expect(pack).toContain('无责');
  });
});

describe('priceFlag 价格异常检测', () => {
  it('正常价格', () => {
    expect(priceFlag(7600, 1050)).toBe('normal'); // ≈7.2 元/km
  });
  it('低价异常', () => {
    expect(priceFlag(3000, 1050)).toBe('low'); // ≈2.9 元/km
  });
  it('高价异常', () => {
    expect(priceFlag(15000, 1000)).toBe('high'); // 15 元/km
  });
  it('零里程返回 normal（防除零）', () => {
    expect(priceFlag(100, 0)).toBe('normal');
  });
});
