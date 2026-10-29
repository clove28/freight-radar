# 架构与代码地图

> 从 `AGENTS.md` 下沉；改代码前先看「依赖方向」和「设计取舍」两节。

## 1. 仓库形状

```
货运雷达/
├── src/           后端 TypeScript（tsx 运行，tsc 构建）
├── web/           前端 React 18 + Vite（独立 npm 包，独立 node_modules / dist）
├── tests/         Vitest 单元/集成 + sqlite.integration.mjs（node:test）
├── docs/          文档（索引见 docs/README.md）
├── deploy/        阿里云 / 局域网 / nginx / 免责声明
├── examples/      mock-cargo-api.mjs（CARGO_SOURCE=api 全链路演示）
└── Dockerfile / docker-compose.yml（单容器：后端托管 web/dist）
```

**两个 npm 包**：根目录是后端（Express/tsx/vitest），`web/` 是前端（React/Vite）。
根 `npm install` / `npm test` 不覆盖前端；改前端必须 `cd web && npm install && npm run build`。
后端只在 `web/dist` 存在时才托管页面（`src/server/app.ts` 的 `WEB_DIST`）。

## 2. 代码地图

```
src/core/     纯函数业务引擎（无框架依赖，禁止引入 AI / Express / SQLite）
  types.ts        领域模型：Cargo / Vehicle / CostEstimate / ScoreBreakdown / DriverQuery …
  constants.ts    评分权重、阈值、损耗标准 —— 所有“拍脑袋数字”的唯一来源
  cost.ts         calcCost / truckMatches / canCarry —— 钱只在这里算
  scoring.ts      rankCargoes / filterCargoes / scoreCargo* / normalizeTopN
  order.ts credit.ts history.ts quote.ts routePlanner.ts routeStrategy.ts weather.ts
  credibility.ts cargoFeedback.ts serviceFee.ts stats.ts auth.ts scanLogin.ts
src/data/     数据访问层（接口 + 多实现，可一键切换）
  repository.ts   接口：Cargo / Vehicle / Book / Order / Prefs / Credit / ServiceFee / Feedback / RoutePlanner
  mock.ts seed.ts fileRepository.ts sqliteRepository.ts apiRepository.ts
  amap.ts         高德客户端（路径 / 天气 / POI，失败内部回退）
  providers.ts    SmsProvider / QuoteProvider（Dev 实现 + 真实实现骨架）
src/ai/       LLM 编排层（只理解与解释）
  llm.ts          LlmPort：parseRequest / explain + 提示词模板
  ruleLlm.ts      规则引擎（默认，零消耗、结果确定）
  arkLlm.ts       OpenAI 兼容实现（超时 / JSON 容错 / 失败回退）
  deepseekLlm.ts  DeepSeek 官方（默认模型 deepseek-flash）
  selectLlm.ts    DEEPSEEK_API_KEY → deepseek；ARK_API_KEY → ark；否则 rule
  assistant.ts    recommend / recommendDefault（只编排，不算钱）
src/server/   HTTP 层
  app.ts          createApp + 全部路由（1134 行，按功能分段）
  services.ts     AppServices（Dashboard / 详情 / 推荐 / 排序 / 订单 / 账本 …）
  index.ts        入口：按 PERSIST 异步建 SQLite 仓储 → createApp → WS
  rateLimit.ts    /api/assistant 成本闸门（按 IP / 全站日限额，命中回退规则引擎）
  pushHub.ts      WebSocket 推送；routeService.ts 路线环境服务
web/          React 18 移动端（前端唯一网络出口：web/src/api/client.ts）
tests/        25 个 *.test.ts（vitest）+ sqlite.integration.mjs（node:test）
examples/     mock-cargo-api.mjs（CARGO_SOURCE=api 演示）
deploy/       阿里云 / 局域网部署、nginx、免责声明
```

## 3. 依赖方向（反向依赖一律禁止）

```
web ──只走 /api──▶ server ──▶ services ──▶ core / data / ai
                                     ai ──▶ core（只读类型与计算函数，不反向）
core ──▶ 谁也不依赖
```

- `core` 不 import `server` / `data` / `ai`；
- 前端不 import 后端源码，不在组件里重算金额/评分；
- 业务层不直接调 LLM 算钱（LLM 只能经 `LlmPort` 出现在 `ai/assistant.ts` 编排里）。

## 4. 请求链路（AI 推荐为例）

```
POST /api/assistant
  → server/app.ts（限流闸门，命中回退规则引擎）
  → server/services.ts ask()：先用 buildCostFor 按真实空驶里程/路线策略建 costFor
  → ai/assistant.ts recommend(deps, text, costFor)
      → LlmPort.parseRequest（默认规则引擎；配 key 走 DeepSeek，失败回退）
      → CargoRepository.listAll（真数据，禁止编造）
      → rankCargoes：filterCargoes → calcCost → scoreCargoWithCost → 排序 → Top N
      → LlmPort.explain（只组织语言，数字来自 cost/score）
  → 返回 { query, scored, explanation, engine }
```

## 5. 设计取舍（改之前先理解，别当历史包袱）

- **钱在代码、不在模型**：LLM 输出是概率性的、不可审计；金额必须可复现、可测试。
- **仓储接口而非 ORM**：Mock / JSON / SQLite / 真实 API 一键切换，大部分测试零数据库。
- **LLM 可选、回退确定**：没 key 也能完整演示；真实 LLM 只提升文案自然度，不改变业务结果。
- **Provider 抽象（LLM / Sms / Quote）**：换供应商只改环境变量 + 实现类，业务层零改动。
- **双包结构（根 + web）**：后端可独立跑；前端构建产物由后端托管，部署单容器。
- **成本口径必须同源**：大厅 / 详情 / Dashboard / AI 助手共用 `buildCostFor`（UAT-04 回归，见 `tests/api.test.ts`）。

## 6. 相关文档

- 环境变量与运行模式：[env.md](env.md)
- 测试契约：[testing.md](testing.md)
- 已知坑：[pitfalls.md](pitfalls.md)
- 验收标准：[验收标准.md](验收标准.md)
