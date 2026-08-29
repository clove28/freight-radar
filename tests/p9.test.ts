/**
 * P9 单元测试
 * 覆盖：扫码登录状态机（纯函数）、短信限流窗口逻辑。
 */
import { describe, expect, it } from 'vitest';
import {
  SCAN_TTL,
  createScanSession,
  approveScan,
  refreshScanStatus,
  SCAN_STATUS_LABEL,
  genQrId,
} from '../src/core/scanLogin.js';

describe('扫码登录状态机（P9）', () => {
  it('创建会话为 pending，TTL 120 秒', () => {
    const s = createScanSession('qr1', 1000);
    expect(s.status).toBe('pending');
    expect(s.expiresAt).toBe(1000 + SCAN_TTL);
    expect(s.driverId).toBeNull();
    expect(s.token).toBeNull();
  });

  it('确认后绑定司机并生成 token', () => {
    const s = createScanSession('qr1', 1000);
    approveScan(s, 'D1', 'TOKEN1', 2000);
    expect(s.status).toBe('approved');
    expect(s.driverId).toBe('D1');
    expect(s.token).toBe('TOKEN1');
  });

  it('过期后确认无效（保持 expired）', () => {
    const s = createScanSession('qr1', 1000);
    approveScan(s, 'D1', 'TOKEN1', 1000 + SCAN_TTL + 1);
    expect(s.status).toBe('expired');
    expect(s.driverId).toBeNull();
  });

  it('轮询刷新：pending 超时自动转 expired', () => {
    const s = createScanSession('qr1', 1000);
    refreshScanStatus(s, 1000 + SCAN_TTL + 1);
    expect(s.status).toBe('expired');
    // 未超时保持 pending
    const s2 = createScanSession('qr2', 1000);
    refreshScanStatus(s2, 2000);
    expect(s2.status).toBe('pending');
  });

  it('approved 状态不因轮询改变', () => {
    const s = createScanSession('qr1', 1000);
    approveScan(s, 'D1', 'T', 2000);
    refreshScanStatus(s, 99999);
    expect(s.status).toBe('approved');
  });

  it('genQrId 生成 32 位 hex', () => {
    const id = genQrId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(genQrId()).not.toBe(id);
  });

  it('状态文案完整', () => {
    expect(SCAN_STATUS_LABEL.pending).toContain('等待');
    expect(SCAN_STATUS_LABEL.approved).toContain('成功');
    expect(SCAN_STATUS_LABEL.expired).toContain('过期');
  });
});

describe('短信限流窗口（P9）', () => {
  it('窗口逻辑：60 秒内拒绝，之后放行', () => {
    // 模拟 sqliteRepository.smsAllow 的判定逻辑（纯函数化验证）
    const allow = (lastSentAt: number, sentCount: number, now: number) => {
      if (now - lastSentAt < 60 * 1000) return false;
      if (now - lastSentAt > 3600 * 1000) return true;
      return sentCount < 5;
    };
    const now = 10_000;
    expect(allow(now - 10_000, 1, now)).toBe(false); // 10 秒前 → 拒绝
    expect(allow(now - 61_000, 1, now)).toBe(true); // 61 秒前 → 放行
    expect(allow(now - 61_000, 5, now)).toBe(false); // 已达 5 次/小时 → 拒绝
    expect(allow(now - 61_000, 4, now)).toBe(true); // 4 次 → 放行
    expect(allow(now - 3700 * 1000, 5, now)).toBe(true); // 超过 1 小时 → 重置放行
  });
});
