/**
 * 货运雷达 · Express 应用
 *
 * REST API 组装：仓储 → 服务 → 路由。
 * 阶段一提供纯 JSON API，前端（阶段二）与 API 测试都依赖它。
 * P1 新增：大厅排序、单货源 AI 解释、车辆编辑、前端静态托管。
 */

import express from 'express';
import type { Express, Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { createMockRepositories } from '../data/mock.js';
import { createFileRepositories } from '../data/fileRepository.js';
import { createCargoRepository } from '../data/apiRepository.js';
import { createSmsProvider } from '../data/providers.js';
import { createLlm } from '../ai/arkLlm.js';
import { AmapClient } from '../data/amap.js';
import { RouteEnvironmentService } from './routeService.js';
import { createAppServices, type AppServices, type LoadSort } from './services.js';
import type { Vehicle } from '../core/types.js';
import type { RatingLevel } from '../core/credit.js';
import type { RouteStrategy } from '../core/routeStrategy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** 前端构建产物目录（web/dist），存在则托管 */
const WEB_DIST = path.resolve(__dirname, '../../web/dist');

/**
 * 组装应用（不自动 listen，便于测试注入）。
 * @param services 可选：自定义服务（测试注入）
 * @param env 环境变量（PERSIST / DATA_DIR / AMAP_KEY / CARGO_SOURCE）
 * @param repos 可选：预构建仓储（P6：index.ts 异步构建 SQLite 后传入）。
 *              不传时按 env.PERSIST 同步选择 mock/json。
 */
export function createApp(
  services?: AppServices,
  env: Record<string, string | undefined> = process.env,
  repos?: ReturnType<typeof createMockRepositories>,
): Express {
  const app = express();
  app.use(express.json());

  // P9 请求日志（LOG_REQUESTS=1 开启）：方法 路径 状态码 耗时
  const logRequests = String(env.LOG_REQUESTS ?? '').toLowerCase() === '1' || String(env.LOG_REQUESTS ?? '').toLowerCase() === 'true';
  if (logRequests) {
    app.use((req: Request, res: Response, next: () => void) => {
      const start = Date.now();
      res.on('finish', () => {
        console.log(`[req] ${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms)`);
      });
      next();
    });
  }

  // P5/P6：仓储选择。传入 repos 则直接用（sqlite 由 index.ts 异步构建）；
  // 否则按 PERSIST 同步选择（测试/工具环境不传 repos，sqlite 模式回退 mock 以免双数据源）。
  let reposFinal = repos;
  let sqliteRepo: import('../data/sqliteRepository.js').SqliteRepositories | null = null;
  if (!reposFinal) {
    const persistMode = String(env.PERSIST ?? '').toLowerCase();
    if (persistMode === 'json') {
      reposFinal = createFileRepositories(env.DATA_DIR ?? 'data');
    } else {
      reposFinal = createMockRepositories();
    }
  }
  // 若传入的就是 sqlite 仓储，记录引用以支持司机 API
  const maybeSqlite = reposFinal as Partial<import('../data/sqliteRepository.js').SqliteRepositories>;
  if (typeof maybeSqlite.drivers?.list === 'function') {
    sqliteRepo = maybeSqlite as import('../data/sqliteRepository.js').SqliteRepositories;
  }
  // P3：支持 CARGO_SOURCE=api 切换到真实货源数据源（保持仓储接口不变）
  if (String(env.CARGO_SOURCE ?? '').toLowerCase() === 'api') {
    reposFinal.cargo = createCargoRepository(env);
  }
  const assistant = {
    // P14：配置 ARK_API_KEY 时用真实火山方舟 LLM，否则规则实现
    llm: createLlm(env),
    cargoRepo: reposFinal.cargo,
    vehicleRepo: reposFinal.vehicle,
  };
  const svc = services ?? createAppServices(reposFinal, assistant);
  // P4：路线环境服务（高德，未配置 AMAP_KEY 时内部回退 Mock）
  const routeService = new RouteEnvironmentService(new AmapClient({ apiKey: env.AMAP_KEY }));
  // P11：短信服务商（演示 DevSmsProvider；生产配置后切真实）
  const smsProvider = createSmsProvider(env);

  const SORTS: LoadSort[] = ['ai', 'netIncome', 'perKm', 'distance'];

  // ---------- P8 鉴权中间件 ----------
  // AUTH_REQUIRED=1 时：除白名单外，所有 /api/* 请求需带有效 Bearer token。
  // 默认关闭（本地演示/开发）；上线多用户时开启（见 .env.example）。
  const authRequired = String(env.AUTH_REQUIRED ?? '').toLowerCase() === '1' || String(env.AUTH_REQUIRED ?? '').toLowerCase() === 'true';
  const authWhitelist = [
    '/api/health',
    '/api/auth/register',
    '/api/auth/login',
    '/api/auth/sms/send',
    '/api/auth/sms/login',
    '/api/events',
  ];
  if (authRequired) {
    app.use('/api', (req: Request, res: Response, next: () => void) => {
      // 注意：use('/api') 下 req.path 不含 /api 前缀，用 originalUrl 取完整路径
      const full = req.originalUrl.split('?')[0] ?? '/';
      if (authWhitelist.some(w => full === w || full.startsWith(w + '/'))) {
        next();
        return;
      }
      if (!sqliteRepo) {
        res.status(400).json({ error: '登录功能需要 PERSIST=sqlite 模式' });
        return;
      }
      const auth = req.headers.authorization ?? '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      const driver = token ? sqliteRepo.drivers.driverByToken(token) : null;
      if (!driver) {
        res.status(401).json({ error: '未登录或会话已过期' });
        return;
      }
      next();
    });
  }

  // 健康检查
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, name: '货运雷达', version: '0.1.0' });
  });

  // Dashboard 首页聚合
  app.get('/api/dashboard', async (_req: Request, res: Response) => {
    try {
      res.json(await svc.getDashboard());
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 货源大厅（带成本/评分，可按查询条件过滤 + 排序；P15 支持分页）
  app.get('/api/cargos', async (req: Request, res: Response) => {
    try {
      const q = req.query as Record<string, string | undefined>;
      const sortRaw = String(q.sort ?? 'ai');
      const sort: LoadSort = SORTS.includes(sortRaw as LoadSort) ? (sortRaw as LoadSort) : 'ai';
      const all = await svc.listRanked(q, sort);
      // P15 分页：前端传 page/limit；不传保持原样（返回数组，兼容旧客户端）
      const pageParam = q.page;
      const limitParam = q.limit;
      if (pageParam !== undefined || limitParam !== undefined) {
        const page = Math.max(1, Number(pageParam) || 1);
        const limit = Math.min(100, Math.max(1, Number(limitParam) || 10));
        const start = (page - 1) * limit;
        res.json({ items: all.slice(start, start + limit), total: all.length, page, limit });
        return;
      }
      res.json(all);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 手动发单（P17 车队互助货源池）：POST /api/cargos
  app.post('/api/cargos', async (req: Request, res: Response) => {
    try {
      const b = req.body as Partial<import('../core/types.js').Cargo>;
      if (!b.from || !b.to || !b.cargo || !b.price) {
        res.status(400).json({ error: '发货需填写：出发/目的/货物/运费' });
        return;
      }
      const cargo: import('../core/types.js').Cargo = {
        id: `M${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`,
        from: String(b.from),
        to: String(b.to),
        km: Number(b.km) || 0,
        cargo: String(b.cargo),
        cls: (b.cls as import('../core/types.js').CargoClass) ?? '普货',
        wt: Number(b.wt) || 0,
        truck: String(b.truck ?? '不限'),
        price: Number(b.price),
        pickup: String(b.pickup ?? '面议'),
        owner: String(b.owner ?? '车队货主'),
        phone: String(b.phone ?? ''),
        verified: b.verified !== false,
        pub: Date.now(),
        status: 'open',
      };
      await reposFinal.cargo.add(cargo);
      res.status(201).json(cargo);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 货源详情
  app.get('/api/cargos/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      if (!id) {
        res.status(400).json({ error: '缺少货源 id' });
        return;
      }
      const detail = await svc.getCargoDetail(id);
      if (!detail) {
        res.status(404).json({ error: '货源不存在' });
        return;
      }
      res.json(detail);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 单货源"为什么推荐"：AI 解释
  app.get('/api/cargos/:id/explain', async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      if (!id) {
        res.status(400).json({ error: '缺少货源 id' });
        return;
      }
      const explain = await svc.getCargoExplain(id);
      if (explain === null) {
        res.status(404).json({ error: '货源不存在' });
        return;
      }
      res.json({ explanation: explain });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // AI 货运助手：自然语言 → 推荐
  app.post('/api/assistant', async (req: Request, res: Response) => {
    const text = String(req.body?.text ?? '').trim();
    if (!text) {
      res.status(400).json({ error: '请输入需求，例如：帮我看看回临汾的黄豆粕单' });
      return;
    }
    try {
      res.json(await svc.ask(text));
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 车辆档案
  app.get('/api/vehicle', async (_req: Request, res: Response) => {
    try {
      res.json(await reposFinal.vehicle.get());
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 车辆编辑
  app.put('/api/vehicle', async (req: Request, res: Response) => {
    try {
      const body = req.body as Partial<Vehicle>;
      const current = await reposFinal.vehicle.get();
      const merged: Vehicle = { ...current, ...body };
      res.json(await svc.updateVehicle(merged));
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 底线偏好
  app.get('/api/prefs', async (_req: Request, res: Response) => {
    try {
      res.json(await svc.getPrefs());
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
  app.put('/api/prefs', async (req: Request, res: Response) => {
    try {
      const body = req.body as { minPerKm?: number | null; minNetIncome?: number | null; maxKm?: number | null; preferredStrategy?: RouteStrategy | null };
      const current = await svc.getPrefs();
      const strategy = body.preferredStrategy;
      const merged = {
        minPerKm: body.minPerKm !== undefined ? body.minPerKm : current.minPerKm,
        minNetIncome: body.minNetIncome !== undefined ? body.minNetIncome : current.minNetIncome,
        maxKm: body.maxKm !== undefined ? body.maxKm : current.maxKm,
        preferredStrategy:
          strategy === undefined || strategy === null
            ? (strategy === null ? null : current.preferredStrategy)
            : ['highway', 'national', 'balanced'].includes(strategy)
              ? strategy
              : current.preferredStrategy,
      };
      res.json(await svc.updatePrefs(merged));
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ---------- P2 订单 ----------

  // 订单列表
  app.get('/api/orders', async (_req: Request, res: Response) => {
    try {
      res.json(await svc.listOrders());
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 接单：POST /api/orders { loadId }
  app.post('/api/orders', async (req: Request, res: Response) => {
    try {
      const loadId = String(req.body?.loadId ?? '');
      if (!loadId) {
        res.status(400).json({ error: '缺少 loadId' });
        return;
      }
      const order = await svc.acceptLoad(loadId);
      if (!order) {
        res.status(400).json({ error: '货源不存在或已被接走' });
        return;
      }
      res.status(201).json(order);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 订单详情
  app.get('/api/orders/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      if (!id) {
        res.status(400).json({ error: '缺少订单 id' });
        return;
      }
      const order = await svc.getOrder(id);
      if (!order) {
        res.status(404).json({ error: '订单不存在' });
        return;
      }
      res.json(order);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 完成证据链一步：POST /api/orders/:id/steps/:stepId
  app.post('/api/orders/:id/steps/:stepId', async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const stepId = req.params.stepId;
      if (!id || !stepId) {
        res.status(400).json({ error: '缺少订单或步骤 id' });
        return;
      }
      const order = await svc.completeStep(id, stepId);
      if (!order) {
        res.status(404).json({ error: '订单或步骤不存在' });
        return;
      }
      res.json(order);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 损耗对比：POST /api/orders/:id/loss { loadTons, unloadTons }
  app.post('/api/orders/:id/loss', async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      if (!id) {
        res.status(400).json({ error: '缺少订单 id' });
        return;
      }
      const loadTons = Number(req.body?.loadTons);
      const unloadTons = Number(req.body?.unloadTons);
      const order = await svc.doLoss(id, loadTons, unloadTons);
      if (!order) {
        res.status(400).json({ error: '参数无效（装货需大于卸货且为正数）或订单不存在' });
        return;
      }
      res.json(order);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 生成证据包：GET /api/orders/:id/pack
  app.get('/api/orders/:id/pack', async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      if (!id) {
        res.status(400).json({ error: '缺少订单 id' });
        return;
      }
      const pack = await svc.getEvidencePack(id);
      if (pack === null) {
        res.status(404).json({ error: '订单不存在' });
        return;
      }
      res.json({ pack });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ---------- P3 货主信用 ----------

  // 全部货主信用
  app.get('/api/credits', async (_req: Request, res: Response) => {
    try {
      res.json(await svc.listCredits());
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 评价货主：POST /api/credits/rate { owner, level, tags?, comment? }
  app.post('/api/credits/rate', async (req: Request, res: Response) => {
    try {
      const owner = String(req.body?.owner ?? '');
      const level = String(req.body?.level ?? '') as RatingLevel;
      if (!owner || !['good', 'medium', 'bad'].includes(level)) {
        res.status(400).json({ error: '参数无效：需要 owner 与 level(good/medium/bad)' });
        return;
      }
      const tags = Array.isArray(req.body?.tags) ? (req.body.tags as string[]).filter(t => typeof t === 'string') : [];
      const comment = String(req.body?.comment ?? '');
      const credit = await svc.rateOwner(owner, level, tags, comment);
      if (!credit) {
        res.status(400).json({ error: '货主名不能为空' });
        return;
      }
      res.json(credit);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 移出黑名单：POST /api/credits/:owner/unblacklist
  app.post('/api/credits/:owner/unblacklist', async (req: Request, res: Response) => {
    try {
      const owner = req.params.owner;
      if (!owner) {
        res.status(400).json({ error: '缺少货主名' });
        return;
      }
      const credit = await svc.unblacklistOwner(owner);
      if (!credit) {
        res.status(404).json({ error: '货主不存在' });
        return;
      }
      res.json(credit);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ---------- P3 历史画像 ----------
  app.get('/api/history', async (_req: Request, res: Response) => {
    try {
      res.json(await svc.getHistory());
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ---------- P10 数据统计 ----------
  app.get('/api/stats', async (_req: Request, res: Response) => {
    try {
      res.json(await svc.getStats());
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ---------- P11 记账 ----------

  // 记账列表
  app.get('/api/books', async (_req: Request, res: Response) => {
    try {
      res.json(await reposFinal.book.listAll());
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 记一笔：POST /api/books { from, to, fee, fuel, toll, other, greenSave?, note?, km? }
  app.post('/api/books', async (req: Request, res: Response) => {
    try {
      const b = req.body as Partial<import('../core/types.js').BookEntry>;
      if (!b.from || !b.to) {
        res.status(400).json({ error: '出发与目的城市不能为空' });
        return;
      }
      const entry: import('../core/types.js').BookEntry = {
        id: `B${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`,
        ts: Date.now(),
        from: String(b.from),
        to: String(b.to),
        fee: Number(b.fee) || 0,
        fuel: Number(b.fuel) || 0,
        toll: Number(b.toll) || 0,
        other: Number(b.other) || 0,
        greenSave: Number(b.greenSave) || 0,
        note: String(b.note ?? ''),
        // P11：里程字段（统计/每公里收益用真实值）
        km: b.km !== undefined && b.km !== null && b.km !== 0 ? Number(b.km) : undefined,
      };
      await reposFinal.book.add(entry);
      res.status(201).json(entry);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 收益报表 CSV 导出（P11）：GET /api/export/books.csv
  app.get('/api/export/books.csv', async (_req: Request, res: Response) => {
    try {
      const books = await reposFinal.book.listAll();
      const { booksToCsv } = await import('../core/stats.js');
      const csv = booksToCsv(books);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="freight-radar-books.csv"');
      // 加 BOM 以便 Excel 正确识别中文
      res.send('\uFEFF' + csv);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 收益报表 HTML 导出（P15）：GET /api/export/books.html
  app.get('/api/export/books.html', async (_req: Request, res: Response) => {
    try {
      const [books, vehicle] = await Promise.all([reposFinal.book.listAll(), reposFinal.vehicle.get()]);
      const { booksToHtml } = await import('../core/stats.js');
      const html = booksToHtml(books, { vehicle: `${vehicle.plate} ${vehicle.truck}` });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="freight-radar-report.html"');
      res.send(html);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 更新一笔账（P12：km 补录等）：PATCH /api/books/:id
  app.patch('/api/books/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      if (!id) {
        res.status(400).json({ error: '缺少账目 id' });
        return;
      }
      const patch = req.body as Partial<import('../core/types.js').BookEntry>;
      const updated = await reposFinal.book.update(id, patch);
      if (!updated) {
        res.status(404).json({ error: '账目不存在' });
        return;
      }
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 整条编辑（P13）：PUT /api/books/:id（全字段覆盖）
  app.put('/api/books/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      if (!id) {
        res.status(400).json({ error: '缺少账目 id' });
        return;
      }
      const b = req.body as Partial<import('../core/types.js').BookEntry>;
      if (!b.from || !b.to) {
        res.status(400).json({ error: '出发与目的城市不能为空' });
        return;
      }
      const patch: Partial<import('../core/types.js').BookEntry> = {
        from: String(b.from),
        to: String(b.to),
        fee: Number(b.fee) || 0,
        fuel: Number(b.fuel) || 0,
        toll: Number(b.toll) || 0,
        other: Number(b.other) || 0,
        greenSave: Number(b.greenSave) || 0,
        note: String(b.note ?? ''),
        km: b.km !== undefined && b.km !== null && b.km !== 0 ? Number(b.km) : undefined,
      };
      const updated = await reposFinal.book.update(id, patch);
      if (!updated) {
        res.status(404).json({ error: '账目不存在' });
        return;
      }
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 删除一笔账：DELETE /api/books/:id
  app.delete('/api/books/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      if (!id) {
        res.status(400).json({ error: '缺少账目 id' });
        return;
      }
      await reposFinal.book.remove(id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ---------- P4 路线环境 ----------

  // 路线策略选项
  app.get('/api/route/strategies', (_req: Request, res: Response) => {
    res.json(routeService.strategies);
  });

  // 一趟货的路况全景：GET /api/route/environment?from=广州&to=武汉&strategy=highway
  app.get('/api/route/environment', async (req: Request, res: Response) => {
    try {
      const from = String(req.query.from ?? '');
      const to = String(req.query.to ?? '');
      const strategyRaw = String(req.query.strategy ?? 'highway');
      const strategy: RouteStrategy = ['highway', 'national', 'balanced'].includes(strategyRaw)
        ? (strategyRaw as RouteStrategy)
        : 'highway';
      if (!from || !to) {
        res.status(400).json({ error: '缺少 from/to' });
        return;
      }
      const result = await routeService.routeEnvironment(from, to, strategy);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ---------- P7 行情指数 ----------

  // 各货类行情区间：GET /api/quote?cls=普货&km=500
  app.get('/api/quote', async (req: Request, res: Response) => {
    try {
      const clsRaw = String(req.query.cls ?? '普货') as import('../core/types.js').CargoClass;
      const km = Number(req.query.km ?? 500) || 500;
      const { quoteFor } = await import('../core/quote.js');
      const quote = quoteFor(clsRaw, km);
      res.json({ cls: clsRaw, km, quote });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ---------- P8 多端同步 ----------

  // 上传本地数据（小程序/多端）：POST /api/sync/upload { orders?, credits?, books? }
  // 需登录（AUTH_REQUIRED 开启时自动校验）
  app.post('/api/sync/upload', async (req: Request, res: Response) => {
    try {
      const orders = Array.isArray(req.body?.orders) ? req.body.orders : undefined;
      const credits = req.body?.credits && typeof req.body.credits === 'object' ? req.body.credits : undefined;
      const books = Array.isArray(req.body?.books) ? req.body.books : undefined;
      let saved = 0;
      if (orders) {
        for (const o of orders as Array<{ id?: string }>) {
          if (!o?.id) continue;
          await reposFinal.order.save(o as never);
          saved += 1;
        }
      }
      if (credits) {
        for (const [owner, c] of Object.entries(credits as Record<string, never>)) {
          await reposFinal.credit.saveRaw(owner, c as never);
          saved += 1;
        }
      }
      if (books) {
        for (const b of books as Array<{ id?: string }>) {
          if (!b?.id) continue;
          await reposFinal.book.add(b as never);
          saved += 1;
        }
      }
      res.json({ ok: true, saved });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 下载云端数据（小程序/多端）：GET /api/sync/download
  app.get('/api/sync/download', async (_req: Request, res: Response) => {
    try {
      const [orders, credits, books, vehicle, prefs] = await Promise.all([
        reposFinal.order.listAll(),
        reposFinal.credit.listAll(),
        reposFinal.book.listAll(),
        reposFinal.vehicle.get(),
        reposFinal.prefs.get(),
      ]);
      res.json({ orders, credits, books, vehicle, prefs, ts: Date.now() });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ---------- P6 多司机账号 ----------

  // 司机列表 + 当前司机
  app.get('/api/drivers', (_req: Request, res: Response) => {
    try {
      if (!sqliteRepo) {
        res.json({ drivers: [], current: null, error: '多司机账号需要 PERSIST=sqlite 模式' });
        return;
      }
      res.json({ drivers: sqliteRepo.drivers.list(), current: sqliteRepo.drivers.current() });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 创建司机：POST /api/drivers { name }
  app.post('/api/drivers', (req: Request, res: Response) => {
    try {
      if (!sqliteRepo) {
        res.status(400).json({ error: '多司机账号需要 PERSIST=sqlite 模式' });
        return;
      }
      const name = String(req.body?.name ?? '').trim();
      if (!name) {
        res.status(400).json({ error: '司机姓名不能为空' });
        return;
      }
      const account = sqliteRepo.drivers.create(name);
      res.status(201).json(account);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 切换当前司机：POST /api/drivers/:id/switch
  app.post('/api/drivers/:id/switch', (req: Request, res: Response) => {
    try {
      if (!sqliteRepo) {
        res.status(400).json({ error: '多司机账号需要 PERSIST=sqlite 模式' });
        return;
      }
      const id = req.params.id;
      if (!id) {
        res.status(400).json({ error: '缺少司机 id' });
        return;
      }
      const ok = sqliteRepo.drivers.switch(id);
      if (!ok) {
        res.status(404).json({ error: '司机不存在' });
        return;
      }
      res.json(sqliteRepo.drivers.current());
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ---------- P7 登录鉴权 ----------

  // 注册：POST /api/auth/register { name, password }
  app.post('/api/auth/register', (req: Request, res: Response) => {
    try {
      if (!sqliteRepo) {
        res.status(400).json({ error: '登录功能需要 PERSIST=sqlite 模式' });
        return;
      }
      const name = String(req.body?.name ?? '').trim();
      const password = String(req.body?.password ?? '');
      // P10 密码强度：至少 6 位且包含数字
      if (!name || password.length < 6 || !/\d/.test(password)) {
        res.status(400).json({ error: '姓名不能为空；密码至少 6 位且需包含数字' });
        return;
      }
      const account = sqliteRepo.drivers.register(name, password);
      if (!account) {
        res.status(409).json({ error: '该司机名已存在' });
        return;
      }
      res.status(201).json(account);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 登录：POST /api/auth/login { name, password } → { token, driver }
  app.post('/api/auth/login', (req: Request, res: Response) => {
    try {
      if (!sqliteRepo) {
        res.status(400).json({ error: '登录功能需要 PERSIST=sqlite 模式' });
        return;
      }
      const name = String(req.body?.name ?? '').trim();
      const password = String(req.body?.password ?? '');
      // P10：锁定检查（连续失败 5 次锁 10 分钟）
      const lockWait = sqliteRepo.drivers.loginLockInfo(name);
      if (lockWait > 0) {
        res.status(423).json({ error: `尝试次数过多，请 ${lockWait} 秒后再试`, locked: true, waitSeconds: lockWait });
        return;
      }
      const token = sqliteRepo.drivers.login(name, password);
      if (!token) {
        res.status(401).json({ error: '用户名或密码错误' });
        return;
      }
      const driver = sqliteRepo.drivers.driverByToken(token);
      res.json({ token, driver });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 当前登录状态：GET /api/auth/me（带 Authorization: Bearer <token>）
  app.get('/api/auth/me', (req: Request, res: Response) => {
    try {
      if (!sqliteRepo) {
        res.status(400).json({ error: '登录功能需要 PERSIST=sqlite 模式' });
        return;
      }
      const auth = req.headers.authorization ?? '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      const driver = token ? sqliteRepo.drivers.driverByToken(token) : null;
      if (!driver) {
        res.status(401).json({ error: '未登录或会话已过期' });
        return;
      }
      res.json({ driver });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 登出：POST /api/auth/logout（带 Authorization: Bearer <token>）
  app.post('/api/auth/logout', (req: Request, res: Response) => {
    try {
      if (!sqliteRepo) {
        res.status(400).json({ error: '登录功能需要 PERSIST=sqlite 模式' });
        return;
      }
      const auth = req.headers.authorization ?? '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (token) sqliteRepo.drivers.logout(token);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ---------- P8 手机号验证码登录 ----------

  // 发送验证码：POST /api/auth/sms/send { phone }
  app.post('/api/auth/sms/send', async (req: Request, res: Response) => {
    try {
      if (!sqliteRepo) {
        res.status(400).json({ error: '登录功能需要 PERSIST=sqlite 模式' });
        return;
      }
      const phone = String(req.body?.phone ?? '').trim();
      if (!/^1\d{10}$/.test(phone)) {
        res.status(400).json({ error: '手机号格式不正确' });
        return;
      }
      // P9 限流：60 秒一次 / 每小时最多 5 次
      const limit = sqliteRepo.smsAllow(phone);
      if (!limit.allowed) {
        res.status(429).json({ error: `发送太频繁，请 ${limit.waitSeconds ?? 60} 秒后再试` });
        return;
      }
      const code = sqliteRepo.drivers.sendSmsCode(phone);
      // P11：通过 SmsProvider 发送（演示环境 DevSmsProvider 直接返回验证码；
      // 生产配置 SMS_PROVIDER=aliyun + 密钥后走真实短信）
      const sms = await smsProvider.send(phone, code);
      if (!sms.ok) {
        res.status(500).json({ error: sms.error ?? '短信发送失败' });
        return;
      }
      res.json({ ok: true, devCode: sms.devCode, note: '演示模式：验证码直接返回，生产环境请接短信服务商' });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 验证码登录：POST /api/auth/sms/login { phone, code }
  app.post('/api/auth/sms/login', (req: Request, res: Response) => {
    try {
      if (!sqliteRepo) {
        res.status(400).json({ error: '登录功能需要 PERSIST=sqlite 模式' });
        return;
      }
      const phone = String(req.body?.phone ?? '').trim();
      const code = String(req.body?.code ?? '').trim();
      const token = sqliteRepo.drivers.smsLogin(phone, code);
      if (!token) {
        res.status(401).json({ error: '验证码错误或已过期' });
        return;
      }
      const driver = sqliteRepo.drivers.driverByToken(token);
      res.json({ token, driver });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ---------- P9 扫码登录（模拟微信扫码，预留真实接入） ----------

  // 创建扫码会话：POST /api/auth/scan/create → { qrId }
  app.post('/api/auth/scan/create', (req: Request, res: Response) => {
    try {
      if (!sqliteRepo) {
        res.status(400).json({ error: '登录功能需要 PERSIST=sqlite 模式' });
        return;
      }
      const qrId = sqliteRepo.createScan();
      res.json({ qrId, ttlSeconds: 120 });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 轮询状态：GET /api/auth/scan/status?qrId=xxx
  app.get('/api/auth/scan/status', (req: Request, res: Response) => {
    try {
      if (!sqliteRepo) {
        res.status(400).json({ error: '登录功能需要 PERSIST=sqlite 模式' });
        return;
      }
      const qrId = String(req.query.qrId ?? '');
      const session = sqliteRepo.getScan(qrId);
      if (!session) {
        res.status(404).json({ error: '扫码会话不存在' });
        return;
      }
      res.json({
        status: session.status,
        // 已确认时返回登录 token（客户端用它完成登录）
        token: session.status === 'approved' ? session.token : null,
        driver: session.status === 'approved' && session.driverId ? sqliteRepo.drivers.current() : null,
      });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 模拟手机端确认：POST /api/auth/scan/approve { qrId }
  // （真实版由微信扫码回调触发；演示环境由前端"模拟确认"按钮调用）
  app.post('/api/auth/scan/approve', (req: Request, res: Response) => {
    try {
      if (!sqliteRepo) {
        res.status(400).json({ error: '登录功能需要 PERSIST=sqlite 模式' });
        return;
      }
      const qrId = String(req.body?.qrId ?? '');
      const session = sqliteRepo.approveScan(qrId);
      if (!session) {
        res.status(404).json({ error: '扫码会话不存在' });
        return;
      }
      res.json({ status: session.status, token: session.token });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ---------- P6 实时货源推送（SSE） ----------
  // 客户端连上后，服务端每 4 秒扫描 open 货源，匹配回程/常跑路线时推送提醒
  const sseClients = new Set<Response>();
  const scanAndPush = async () => {
    if (sseClients.size === 0) return;
    try {
      const all = await reposFinal.cargo.listAll();
      const vehicle = await reposFinal.vehicle.get();
      // 遍历所有 open 货源，找匹配回程/常跑的（最多推 5 条）
      const open = all.filter(c => c.status === 'open');
      let pushed = 0;
      for (const c of open) {
        if (pushed >= 5) break;
        const isBackhaul = vehicle.homeCities.includes(c.to);
        const isRoute = vehicle.routes.some(r => r.from === c.from && r.to === c.to);
        if (isBackhaul || isRoute) {
          const msg = `data: ${JSON.stringify({
            type: 'new-cargo',
            from: c.from, to: c.to, cargo: c.cargo, price: c.price,
            backhaul: isBackhaul, routeMatch: isRoute,
          })}\n\n`;
          for (const client of sseClients) client.write(msg);
          pushed += 1;
        }
      }
    } catch {
      /* 忽略推送错误 */
    }
  };
  const pushInterval = setInterval(scanAndPush, 4000);
  // 服务关闭时清理定时器
  const appShutdown = () => clearInterval(pushInterval);
  process.on('exit', appShutdown);
  process.on('SIGINT', () => {
    clearInterval(pushInterval);
    process.exit(0);
  });

  // GET /api/events —— Server-Sent Events 流
  app.get('/api/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    // 连接后立即推送一次当前匹配货源
    void scanAndPush();
  });

  // 前端静态托管（web/dist 存在时）：SPA 回退到 index.html
  if (existsSync(WEB_DIST)) {
    app.use(express.static(WEB_DIST));
    app.get('*', (req: Request, res: Response) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: '接口不存在' });
        return;
      }
      res.sendFile(path.join(WEB_DIST, 'index.html'));
    });
  }

  return app;
}
