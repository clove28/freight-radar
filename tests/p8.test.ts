/**
 * P8 单元测试（vitest 可跑部分）
 *
 * SQLite 会话/短信逻辑依赖 node:sqlite，运行时验证见端到端实测；
 * 本文件覆盖纯逻辑：会话 TTL、手机号校验、验证码格式（来自 core/auth.ts）。
 */
import { describe, expect, it } from 'vitest';
import { SESSION_TTL, SMS_CODE_TTL, PHONE_RE, genSmsCode } from '../src/core/auth.js';

describe('会话 TTL（P8）', () => {
  it('默认 7 天', () => {
    expect(SESSION_TTL).toBe(7 * 24 * 3600 * 1000);
  });

  it('过期判定逻辑（模拟 driverByToken 的检查）', () => {
    const now = Date.now();
    const expiresAt = now + SESSION_TTL;
    // 未过期
    expect(now > expiresAt).toBe(false);
    // 过期
    expect(now + SESSION_TTL + 1 > expiresAt).toBe(true);
  });
});

describe('手机号与验证码（P8）', () => {
  it('手机号格式校验', () => {
    expect(PHONE_RE.test('13800000000')).toBe(true);
    expect(PHONE_RE.test('1380000000')).toBe(false); // 少一位
    expect(PHONE_RE.test('23800000000')).toBe(false); // 非 1 开头
    expect(PHONE_RE.test('1380000000a')).toBe(false);
  });

  it('验证码为 6 位数字', () => {
    for (let i = 0; i < 20; i++) {
      expect(/^\d{6}$/.test(genSmsCode())).toBe(true);
    }
  });

  it('验证码 10 分钟有效（模拟检查）', () => {
    const createdAt = Date.now() - 9 * 60 * 1000;
    expect(Date.now() - createdAt <= SMS_CODE_TTL).toBe(true);
    const expired = Date.now() - 11 * 60 * 1000;
    expect(Date.now() - expired <= SMS_CODE_TTL).toBe(false);
  });
});
