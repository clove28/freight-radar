import { describe, expect, it } from 'vitest';
import { tryCharge, mkServiceFee, SERVICE_FEE_AMOUNT, DEMO_RECHARGE_AMOUNT, isPaid } from '../src/core/serviceFee.js';
import { MockServiceFeeRepository } from '../src/data/mock.js';

describe('serviceFee 核心（纯函数）', () => {
  it('额度足：扣费成功', () => {
    const r = tryCharge(500, 200);
    expect(r.ok).toBe(true);
    expect(r.balance).toBe(300);
  });

  it('额度不足：拒绝并给原因', () => {
    const r = tryCharge(100, 200);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('不足');
  });

  it('mkServiceFee 创建已支付记录', () => {
    const f = mkServiceFee('f1', 'O1', 200);
    expect(f.state).toBe('paid');
    expect(f.amount).toBe(200);
    expect(isPaid(f)).toBe(true);
  });

  it('常量正确', () => {
    expect(SERVICE_FEE_AMOUNT).toBe(200);
    expect(DEMO_RECHARGE_AMOUNT).toBe(500);
  });
});

describe('MockServiceFeeRepository（虚拟服务额度）', () => {
  it('默认 500，扣 200 得 300', async () => {
    const r = new MockServiceFeeRepository();
    expect(await r.getBalance('d1')).toBe(500);
    const res = await r.charge('d1', 'O1', 200);
    expect(res.ok).toBe(true);
    expect(res.balance).toBe(300);
    expect(await r.getBalance('d1')).toBe(300);
  });

  it('扣至 100 后再扣 200 → 不足', async () => {
    const r = new MockServiceFeeRepository();
    await r.charge('d1', 'O1', 200);
    await r.charge('d1', 'O2', 200);
    const res = await r.charge('d1', 'O3', 200); // 500-400=100 < 200
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('不足');
  });

  it('演示充值', async () => {
    const r = new MockServiceFeeRepository();
    await r.addCredit('d1', 500);
    expect(await r.getBalance('d1')).toBe(1000);
  });

  it('记录服务费', async () => {
    const r = new MockServiceFeeRepository();
    await r.charge('d1', 'O1', 200);
    const fees = await r.listFees('d1');
    expect(fees.length).toBe(1);
    expect(fees[0]!.orderId).toBe('O1');
  });
});
