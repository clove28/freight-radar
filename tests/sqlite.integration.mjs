/**
 * P6 SQLite 能力集成测试（Node 原生 test runner，零 TS 依赖）
 *
 * 目的：验证 node:sqlite（Node 内置）在本环境的建表/读写/持久化能力，
 * 作为 SqliteRepositories（src/data/sqliteRepository.ts）的运行时保障。
 *
 * 运行：node --test tests/sqlite.integration.mjs
 *       （Node 25 node:sqlite 无需 flag；Node 22 需 --experimental-sqlite）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// 动态加载 node:sqlite（Node 25 直接支持）
const { DatabaseSync } = await import('node:sqlite');

const dir = mkdtempSync(path.join(tmpdir(), 'fr-sqlite-int-'));

test('node:sqlite 建表与读写', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE t(id TEXT PRIMARY KEY, data TEXT)');
  db.prepare('INSERT INTO t(id, data) VALUES (?, ?)').run('a', JSON.stringify({ x: 1 }));
  const row = db.prepare('SELECT data FROM t WHERE id = ?').get('a');
  assert.equal(JSON.parse(row.data).x, 1);
  db.close();
});

test('SQLite 文件持久化：写入 → 新连接读取（模拟重启）', () => {
  const file = path.join(dir, 'freight-radar.db');
  const db1 = new DatabaseSync(file);
  db1.exec('CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, data TEXT)');
  db1.prepare('INSERT OR REPLACE INTO orders(id, data) VALUES (?, ?)').run('O1', JSON.stringify({ id: 'O1', status: 'accepted' }));
  db1.close();

  const db2 = new DatabaseSync(file);
  const row = db2.prepare('SELECT data FROM orders WHERE id = ?').get('O1');
  assert.equal(JSON.parse(row.data).status, 'accepted');
  db2.close();
  assert.ok(existsSync(file), 'db 文件应存在');
});

test('多司机隔离（driver_id 键）', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE vehicle (driver_id TEXT PRIMARY KEY, data TEXT)');
  db.prepare('INSERT INTO vehicle VALUES (?, ?)').run('D1', JSON.stringify({ plate: '晋L·11111' }));
  db.prepare('INSERT INTO vehicle VALUES (?, ?)').run('D2', JSON.stringify({ plate: '晋L·22222' }));
  const a = JSON.parse(db.prepare('SELECT data FROM vehicle WHERE driver_id = ?').get('D1').data);
  const b = JSON.parse(db.prepare('SELECT data FROM vehicle WHERE driver_id = ?').get('D2').data);
  assert.equal(a.plate, '晋L·11111');
  assert.equal(b.plate, '晋L·22222');
  db.close();
});

test.after(() => {
  rmSync(dir, { recursive: true, force: true });
});
