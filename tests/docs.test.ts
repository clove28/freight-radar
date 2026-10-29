/**
 * 文档与仓库一致性（纯静态校验，不触达业务代码）
 *
 * 背景：README 曾长期写死过期用例数（51 / 57），API 表漏过路由、旧演示文件引用失效，
 * AGENTS 单文件一度到 180 行并出现「用例数写死」与「不写死用例数」自相矛盾。
 * 这些靠人眼守不住，所以这里锁定可机检的事：
 *   1. README 声明的测试文件数 === tests/ 实际 *.test.ts 数；
 *   2. 「八、测试」表格覆盖 tests/ 下每个测试文件，且引用的路径存在；
 *   3. README 不再残留旧用例数字，并注明「以 npm test 输出为准」；
 *   4. AGENTS.md 保持入口规模（≤120 行）、相对链接可点；
 *   5. docs/README.md 索引覆盖 docs/ 下所有 markdown；
 *   6. HANDOFF 与园艺日期不过期（30 / 90 天）；
 *   7. compose 默认模型名与代码一致；README 不引用已不存在的旧蓝本。
 * 用例总数仍以 `npm test` 输出为准（本文件不递归跑 vitest）。
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, resolve } from 'node:path';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const testsDir = join(rootDir, 'tests');
const docsDir = join(rootDir, 'docs');
const readme = readFileSync(join(rootDir, 'README.md'), 'utf8');
const agents = readFileSync(join(rootDir, 'AGENTS.md'), 'utf8');

/** vitest 默认 include 的是 `*.test.ts`；`sqlite.integration.mjs` 走单独 node --test */
function vitestFileCount(): number {
  return readdirSync(testsDir).filter((name) => name.endsWith('.test.ts')).length;
}

/** README 里出现的所有 `tests/<文件名>` 引用（去重） */
function referencedPaths(): string[] {
  return [...new Set([...readme.matchAll(/tests\/[A-Za-z0-9._-]+/g)].map((m) => m[0]))];
}

/** markdown 里的相对链接（排除外链 / 锚点） */
function relativeLinks(markdown: string): string[] {
  return [...markdown.matchAll(/\]\(([^)\s]+)/g)]
    .map((m) => m[1] ?? '')
    .filter((link) => link !== '' && !/^(https?:|mailto:|#)/.test(link))
    .map((link) => link.replace(/^<|>$/g, '').split('#')[0] ?? '');
}

/** 返回在 baseDir 下解析不到的链接 */
function brokenLinks(markdown: string, baseDir: string): string[] {
  return relativeLinks(markdown).filter((link) => !existsSync(resolve(baseDir, link)));
}

/** 递归列出 dir 下所有 markdown（相对 baseDir，统一用 /） */
function listMarkdown(dir: string, baseDir: string = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listMarkdown(full, baseDir));
    else if (name.endsWith('.md')) out.push(relative(baseDir, full).replace(/\\/g, '/'));
  }
  return out;
}

/** 从文档里取「最后更新/最后园艺：YYYY-MM-DD」距今天数 */
function daysSince(markdown: string, label: string): number {
  const matched = markdown.match(new RegExp(`${label}[：:]\\s*(\\d{4}-\\d{2}-\\d{2})`));
  expect(matched, `${label} 未找到 YYYY-MM-DD`).not.toBeNull();
  const ts = Date.parse(`${matched![1]!}T00:00:00+08:00`);
  expect(Number.isNaN(ts), `${label} 日期无法解析`).toBe(false);
  return (Date.now() - ts) / 86_400_000;
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

describe('AGENTS.md 保持入口规模且链接可点', () => {
  it('行数 ≤ 120（细节应下沉到 docs/）', () => {
    expect(agents.split(/\r?\n/).length).toBeLessThanOrEqual(120);
  });

  it('相对链接都指向存在的文件', () => {
    expect(brokenLinks(agents, rootDir)).toEqual([]);
  });
});

describe('docs/ 索引与新鲜度', () => {
  it('docs/README.md 索引覆盖 docs/ 下所有 markdown', () => {
    const index = readFileSync(join(docsDir, 'README.md'), 'utf8');
    const unindexed = listMarkdown(docsDir).filter((file) => file !== 'README.md' && !index.includes(file));
    expect(unindexed).toEqual([]);
  });

  it('docs/README.md 的相对链接都指向存在的文件', () => {
    const index = readFileSync(join(docsDir, 'README.md'), 'utf8');
    expect(brokenLinks(index, docsDir)).toEqual([]);
  });

  it('HANDOFF 不超过 30 天未更新', () => {
    const handoff = readFileSync(join(docsDir, 'HANDOFF.md'), 'utf8');
    expect(daysSince(handoff, '最后更新')).toBeLessThanOrEqual(30);
  });

  it('文档园艺日期不超过 90 天', () => {
    const index = readFileSync(join(docsDir, 'README.md'), 'utf8');
    expect(daysSince(index, '最后园艺')).toBeLessThanOrEqual(90);
  });
});

describe('配置与门面文档不再漂移', () => {
  it('README 的相对链接都指向存在的文件', () => {
    expect(brokenLinks(readme, rootDir)).toEqual([]);
  });

  it('README 不再引用已不存在的旧演示蓝本', () => {
    expect(readme).not.toContain('../卡友助手.html');
    expect(readme).not.toContain('../小程序版');
  });

  it('docker-compose 默认模型名与代码默认值一致', () => {
    const compose = readFileSync(join(rootDir, 'docker-compose.yml'), 'utf8');
    const llm = readFileSync(join(rootDir, 'src/ai/deepseekLlm.ts'), 'utf8');
    const model = llm.match(/DEEPSEEK_DEFAULT_MODEL\s*=\s*'([^']+)'/)?.[1];
    expect(model).toBeTruthy();
    expect(compose).toContain(`DEEPSEEK_MODEL=\${DEEPSEEK_MODEL:-${model}}`);
  });
});
