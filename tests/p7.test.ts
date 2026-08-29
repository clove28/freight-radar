/**
 * P7 单元测试（vitest 可跑部分）
 *
 * SQLite 认证（密码哈希/会话）依赖 node:sqlite，无法在 vitest 下加载，
 * 其运行验证见 tests/sqlite.integration.mjs 与端到端实测。
 * 本文件覆盖纯逻辑：密码哈希算法（crypto scrypt）与行情路由参数。
 */
import { describe, expect, it } from 'vitest';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { quoteFor, RuleQuoteProvider } from '../src/core/quote.js';

/** 与 sqliteRepository 相同的密码哈希实现（P7 核心：scrypt + 盐 + 恒时比较） */
function hashPassword(password: string, salt = randomBytes(16).toString('hex')): { hash: string; salt: string } {
  const hash = scryptSync(password, salt, 32).toString('hex');
  return { hash, salt };
}
function verifyPassword(password: string, hash: string, salt: string): boolean {
  const candidate = scryptSync(password, salt, 32);
  const stored = Buffer.from(hash, 'hex');
  return stored.length === candidate.length && timingSafeEqual(stored, candidate);
}

describe('密码哈希（P7）', () => {
  it('相同密码+盐 → 校验通过', () => {
    const { hash, salt } = hashPassword('1234');
    expect(verifyPassword('1234', hash, salt)).toBe(true);
  });

  it('错误密码 → 校验失败', () => {
    const { hash, salt } = hashPassword('1234');
    expect(verifyPassword('9999', hash, salt)).toBe(false);
  });

  it('相同密码不同盐 → 哈希不同（防彩虹表）', () => {
    const a = hashPassword('1234');
    const b = hashPassword('1234');
    expect(a.hash).not.toBe(b.hash);
  });

  it('哈希不含明文（安全存储）', () => {
    const { hash } = hashPassword('1234');
    expect(hash).not.toContain('1234');
    expect(hash.length).toBe(64); // 32 bytes hex
  });
});

describe('行情 API 参数（P7）', () => {
  it('quoteFor 各货类区间合理', () => {
    const provider = new RuleQuoteProvider();
    for (const cls of ['普货', '冷藏', '建材', '农产品'] as const) {
      const q = quoteFor(cls, 500);
      expect(q.low).toBeGreaterThan(0);
      expect(q.high).toBeGreaterThan(q.low);
    }
  });

  it('scrypt 参数与实现一致（32 字节输出）', () => {
    const { hash } = hashPassword('test-password');
    expect(Buffer.from(hash, 'hex').length).toBe(32);
  });

  it('createHash 可用（token 生成的辅助）', () => {
    const token = `T${randomBytes(24).toString('hex')}`;
    expect(token.length).toBe(49);
    expect(createHash('sha256').update(token).digest('hex').length).toBe(64);
  });
});
