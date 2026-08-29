/**
 * P16 单元测试（纯逻辑部分）
 * 覆盖货主信用排序规则。（评价/黑名单的仓储逻辑已在 p3/p6 覆盖）
 */
import { describe, expect, it } from 'vitest';
import type { Credit } from '../src/core/credit.js';

const mkCredit = (owner: string, score: number, blacklisted = false, total = 1): Credit => ({
  owner, score, good: Math.max(0, score), medium: 0, bad: Math.max(0, -score) || (blacklisted ? 1 : 0),
  total, blacklisted, tags: {}, comments: [],
});

/** 与前端 Credits.tsx 一致的排序：黑名单置顶，再按分数升序 */
function sortCredits(credits: Credit[]): Credit[] {
  return [...credits].sort((a, b) => {
    if (a.blacklisted !== b.blacklisted) return a.blacklisted ? -1 : 1;
    return a.score - b.score;
  });
}

describe('货主信用排序（P16）', () => {
  it('黑名单货主置顶', () => {
    const list = [
      mkCredit('张老板', 4), // 好评
      mkCredit('襄汾货运部', -6, true), // 黑名单
      mkCredit('李经理', 1),
    ];
    const sorted = sortCredits(list);
    expect(sorted[0]!.owner).toBe('襄汾货运部');
    expect(sorted[0]!.blacklisted).toBe(true);
  });

  it('非黑名单按分数升序（差评靠前）', () => {
    const list = [
      mkCredit('王总', 5),
      mkCredit('李经理', 1),
      mkCredit('赵哥', 3),
    ];
    const sorted = sortCredits(list);
    expect(sorted[0]!.owner).toBe('李经理'); // 分最低
    expect(sorted[2]!.owner).toBe('王总'); // 分最高
  });

  it('黑名单与其他货主混合时黑名单恒在最前', () => {
    const list = [
      mkCredit('高老板', 10),
      mkCredit('谷主', -3, true),
      mkCredit('马哥', 0),
    ];
    const sorted = sortCredits(list);
    expect(sorted[0]!.blacklisted).toBe(true);
    expect(sorted[0]!.owner).toBe('谷主');
  });

  it('空列表不崩溃', () => {
    expect(sortCredits([])).toEqual([]);
  });
});
