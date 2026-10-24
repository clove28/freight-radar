/**
 * README 与 tests/ 目录的一致性（纯静态校验，不触达业务代码）
 *
 * 背景：README 曾长期写着「51 / 57 个用例」，而实际已是 23 文件 / 233 用例。
 * 这类数字写死在文档里必然再漂移，所以这里只锁定两件可机检的事：
 *   1. README 声明的测试文件数 === `npm test` 实际收集的文件数；
 *   2. 「八、测试」表格完整覆盖 tests/ 下每个测试文件，且不引用不存在的路径。
 * 用例总数仍以 `npm test` 输出为准（README 已标注），不再由文档单方面宣称。
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const testsDir = join(rootDir, 'tests');
const readme = readFileSync(join(rootDir, 'README.md'), 'utf8');

/** vitest 默认 include 的是 `*.test.ts`；`sqlite.integration.mjs` 走单独的 node --test */
function vitestFileCount(): number {
  return readdirSync(testsDir).filter((name) => name.endsWith('.test.ts')).length;
}

/** README 里出现的所有 `tests/<文件名>` 引用（去重） */
function referencedPaths(): string[] {
  return [...new Set([...readme.matchAll(/tests\/[A-Za-z0-9._-]+/g)].map((m) => m[0]))];
}

describe('README 与测试目录一致', () => {
  it('声明的测试文件数与 npm test 实际收集数一致', () => {
    const stated = readme.match(/(\d+)\s*个测试文件/);
    expect(stated?.[1]).toBe(String(vitestFileCount()));
  });

  it('每个测试文件都登记在「八、测试」表格里', () => {
    const refs = new Set(referencedPaths());
    const missing = readdirSync(testsDir)
      .filter((name) => name.endsWith('.test.ts'))
      .map((name) => `tests/${name}`)
      .filter((path) => !refs.has(path));
    expect(missing).toEqual([]);
  });

  it('引用的 tests/ 路径都真实存在（含 sqlite 集成测试）', () => {
    const broken = referencedPaths().filter((path) => !existsSync(join(rootDir, path)));
    expect(broken).toEqual([]);
  });

  it('不再残留过期用例数字，并注明以 npm test 输出为准', () => {
    expect(readme).not.toMatch(/51\s*个用例/);
    expect(readme).not.toMatch(/57\s*用例/);
    expect(readme).toMatch(/以\s*`npm test`\s*实际输出为准/);
  });
});
