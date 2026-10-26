/**
 * 货运雷达 · 服务入口
 * 启动 HTTP + WebSocket 服务：npm run dev（开发热重载）/ npm start
 *
 * P6：PERSIST=sqlite|1 时，异步构建 SQLite 仓储（Node 内置 node:sqlite）
 * 后传入 createApp，重启数据不丢，并支持多司机账号。
 * P7：WS 实时推送（/api/ws）与 HTTP 同端口。
 */
import { createServer } from 'node:http';
import { createApp } from './app.js';
import { describeProvider } from '../ai/selectLlm.js';
import { PushHub } from './pushHub.js';
import type { RepositorySet } from '../data/repository.js';

const PORT = Number(process.env.PORT ?? 3000);

async function buildRepos(): Promise<{ repos?: RepositorySet }> {
  const mode = String(process.env.PERSIST ?? '').toLowerCase();
  if (mode === 'sqlite' || mode === '1' || mode === 'true') {
    const { createSqliteRepositories } = await import('../data/sqliteRepository.js');
    return { repos: createSqliteRepositories(process.env.DATA_DIR ?? 'data') };
  }
  return {};
}

async function main(): Promise<void> {
  const { repos } = await buildRepos();
  const app = createApp(undefined, process.env, repos);
  const server = createServer(app);

  // P7：WebSocket 实时推送（/api/ws），依赖仓储扫描货源
  const pushHub = repos ? new PushHub(server, repos) : null;

  server.listen(PORT, () => {
    console.log(`🚛 货运雷达 API 已启动: http://localhost:${PORT}`);
    console.log(`   Dashboard:  http://localhost:${PORT}/api/dashboard`);
    console.log(`   货源大厅:    http://localhost:${PORT}/api/cargos`);
    console.log(`   AI 助手:    POST http://localhost:${PORT}/api/assistant`);
    console.log(`   实时推送:    ws://localhost:${PORT}/api/ws ${pushHub ? '(已启用)' : '(需持久化模式)'}`);
    console.log(`   数据模式:   ${repos ? 'SQLite 持久化' : '内存 Mock'}${process.env.AMAP_KEY ? ' + 高德真实数据' : ' + 高德 Mock'}`);
    console.log(`   AI 引擎:    ${describeProvider(process.env).label}（模型：${describeProvider(process.env).model}）`);
  });

  const shutdown = () => {
    pushHub?.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void main();
