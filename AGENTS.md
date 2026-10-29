# AGENTS.md

> 本文件是**仓库级协作契约**：任何 AI（Claude / Codex / Cursor / DSH 等）在本目录改代码前先读它。
> 这里只写「不读代码就会踩的坑」和「不能碰的边界」；产品定位、API 清单、路线图见 [README.md](README.md)。
> 外层工作区 `D:\字研班\货车`（DSH 定时任务、headless 权限、看门狗）的运维坑见 `D:\字研班\货车\AGENTS.md`，本文件不重复。

## 0. 一句话与核心闭环

货运雷达 = 面向个体大货车司机的 **AI 货运决策系统**，不是货源展示站。

核心闭环：找货 → 算成本 → 算净收益 / 每公里 → 综合评分 → 排序推荐 → AI 解释 → 接单 → 证据链 / 损耗 → 记账 → 历史画像。

技术栈：TypeScript strict + Express + Node 内置 `node:sqlite` + React 18/Vite + Vitest；
LLM = DeepSeek 官方 API（无 key 回退规则引擎）；地图 = 高德（无 key 回退 Mock）。

## 1. 命令（一律在仓库根 `货运雷达/` 执行）

| 目的 | 命令 |
| --- | --- |
| 安装后端依赖 | `npm install` |
| 开发（内存 Mock，:3000） | `npm run dev` |
| 持久化开发（重启不丢） | `PERSIST=sqlite npm run dev`（PowerShell：`$env:PERSIST='sqlite'; npm run dev`） |
| 跑全部测试 | `npm test`（= `vitest run`） |
| 只跑某个文件 | `npx vitest run tests/scoring.test.ts` |
| 类型检查 | `npx tsc --noEmit`（= `npm run typecheck`） |
| 构建后端 | `npm run build`（tsc → `dist/`） |
| SQLite 集成测试 | `npm run test:sqlite`（node:test，**不在 `npm test` 里**） |
| 一次跑完 | `npm run test:all`（vitest + SQLite 集成） |
| 前端依赖 / 开发 / 构建 | `cd web && npm install` / `npm run dev`（:5173，代理 /api）/ `npm run build`（→ `web/dist`） |

**验收门（提交前三条全绿，缺一不可）**

```bash
npx tsc --noEmit && npm test && npm run build
```

改前端再补一条 `cd web && npm run build`。
2026-10-29 实测：`tsc` 通过、**25 文件 / 269 用例全绿**、前后端 build 均通过（数字会变，以实际输出为准）。

> 完整验收标准（UAT 场景、非功能门、上线门、一票否决、基线快照）见 [`docs/验收标准.md`](docs/验收标准.md)；
> 本节只列提交级验收门，阶段/上线验收以那份文件为准。

**两个容易踩的工程事实**

- 这是**一个仓库两个 npm 包**：根目录是后端（Express/tsx/vitest），`web/` 是独立包（React/Vite）。根 `npm install` / `npm test` **不覆盖**前端；改前端必须进 `web/`。
- 后端只在 `web/dist` 存在时才托管页面（`app.ts` 的 `WEB_DIST`）。只起后端不 build 前端，打开 3000 是 404。

## 2. 代码地图（真实路径，2026-10 现状）

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
  app.ts          createApp + 全部路由（1000+ 行，按功能分段）
  services.ts     AppServices（Dashboard / 详情 / 推荐 / 排序 / 订单 / 账本 …）
  index.ts        入口：按 PERSIST 异步建 SQLite 仓储 → createApp → WS
  rateLimit.ts    /api/assistant 成本闸门（按 IP / 全站日限额，命中回退规则引擎）
  pushHub.ts      WebSocket 推送；routeService.ts 路线环境服务
web/          React 18 移动端（前端唯一网络出口：web/src/api/client.ts）
tests/        25 个 *.test.ts（vitest）+ sqlite.integration.mjs（node:test）
examples/     mock-cargo-api.mjs（CARGO_SOURCE=api 全链路演示）
deploy/       阿里云 / 局域网部署、nginx、免责声明
```

**依赖方向**：`server → services → core / data / ai`；`ai → core`；`core` 谁也不依赖；`web → 只通过 /api`。
反向依赖（`core` import `server`/`data`、前端 import 后端源码、业务层直接调 LLM 算钱）一律禁止。

## 3. 红线（违反即回滚，优先级最高）

1. **LLM 碰不得钱**：成本、净收益、每公里、评分、排序只能由 `src/core/` 确定性代码算。LLM 只做两件事：自然语言 → 结构化条件；基于真实结果写解释。禁止给 LLM 加“帮我估个价 / 算个分”的能力。
2. **LLM 禁止编造数据**：货源、运费、里程、收益必须来自数据层；提示词里只喂真实结果，不给模型凭空生成货源的机会。
3. **不改变成本 / 评分 / 排序的算法语义**：`SCORE_WEIGHTS`、评分档位、成本公式属于产品契约。要改先出方案 + 影响面 + 测试，不要在“顺手优化”里悄悄改；每日自动化只做加固与可读性。
4. **外部依赖必须有回退**：LLM 失败 → `RuleBasedLlm`；高德失败 → Mock；缺 key → 各自降级。任何路径都不能让接口 500 / 白屏；限流命中同理，回退规则引擎并标记 `limited`。
5. **密钥只进环境变量**：`.env` 已被 gitignore，仓库里只有 `.env.example`；火山 / 高德 / 短信 / 行情 key 不得写进代码或测试。密码用 scrypt 哈希（`sqliteRepository`），不得明文。
6. **金额展示在前端只做格式化**：`web/src/utils/format.ts`；禁止在 React 组件里重算金额或评分。

## 4. 设计取舍（改之前先理解，别当历史包袱）

- **钱在代码、不在模型**：LLM 输出是概率性的、不可审计；金额必须可复现、可测试。
- **仓储接口而非 ORM**：Mock / JSON / SQLite / 真实 API 一键切换，大部分测试零数据库。
- **LLM 可选、回退确定**：没 key 也能完整演示；真实 LLM 只提升文案自然度，不改变业务结果。
- **Provider 抽象（LLM / Sms / Quote）**：换供应商只改环境变量 + 实现类，业务层零改动。
- **双包结构（根 + web）**：后端可独立跑；前端构建产物由后端托管，部署单容器。

## 5. 测试契约（最容易把 CI 弄红的地方）

- 涉及「钱和数字」的改动必须有断言：成本公式、权重、过滤、限流、鉴权、LLM 降级。
- **新增 `tests/*.test.ts` 必须同步 README 两处**：README「二、技术栈」的「N 个测试文件」改成实际数、「八、测试」表格加一行。`tests/docs.test.ts` 强制校验这三点（还校验 README 不再残留旧用例数字、引用的 `tests/` 路径真实存在）。
- 用例总数不写进文档（会漂移），统一「以 `npm test` 实际输出为准」。
- 纯逻辑测试靠**注入**，不靠 mock 框架：时间用 `now` 参数（`loginAttemptAllowed` / `RateLimiter` / `recencyPenalty`），外部依赖用 deps 注入（`recommend(deps, text)`、`createApp(services | env | repos)`）。
- `node:sqlite` 不走 Vite 转换（`vitest.config.ts` 的 `server.deps.external[/node:/]`），SQLite 能力测试单独走 `npm run test:sqlite`；`createApp` 不传 repos 时 sqlite 模式会回退 Mock，避免测试出现双数据源。
- **跑测期间不要改源码**：vitest 启动即读文件，改到一半的中间态会被加载，报出根本不存在的回归。先写完改动，再用一条命令连跑三道门。

## 6. 运行模式与环境变量

| 变量 | 作用 | 缺省 |
| --- | --- | --- |
| `PERSIST` | `sqlite` / `1` = SQLite；`json` = JSON 文件；空 = 内存 Mock | 内存 |
| `DATA_DIR` | 持久化目录 | `./data` |
| `PORT` | 端口 | 3000 |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` / `DEEPSEEK_BASE_URL` | DeepSeek 官方 AI 引擎 | 无 key → 规则引擎；模型 `deepseek-flash` |
| `ARK_API_KEY` / `ARK_MODEL` / `ARK_BASE_URL` | 火山方舟（历史兼容，非默认） | 未配 |
| `AMAP_KEY` | 高德真实路线 / 天气 / POI | 无 key → Mock |
| `CARGO_SOURCE=api` + `CARGO_API_URL` / `CARGO_API_KEY` / `CARGO_API_TIMEOUT` | 真实货源数据源 | Mock |
| `AUTH_REQUIRED=1` | 除白名单外全部 API 需 Bearer token（需 sqlite） | 关闭（演示） |
| `LOG_REQUESTS=1` | 请求日志 | 关闭 |
| `SMS_PROVIDER=aliyun` + `ALIYUN_SMS_*` | 真实短信（骨架） | DevSms（直接返回 devCode） |
| `QUOTE_API_URL` / `QUOTE_API_KEY` | 真实行情 | 规则估算 |
| `ASSISTANT_PER_IP_PER_MIN` / `ASSISTANT_DAILY_TOTAL` | 真 LLM 成本闸门 | 5 / 200 |

- 登录、多司机、扫码、多端同步都**依赖 SQLite 模式**；WebSocket 推送也只在持久化模式启用。纯 Mock 下这些能力不可用（接口返回提示性错误，或连接直接不启动）。
- 引擎标识：`describeProvider()` 的 label / model 会打到启动日志，前端 AI 徽标也用它；改引擎时别忘同步展示。

## 7. 编码约定

- TS strict + `noUncheckedIndexedAccess` + `noImplicitOverride`；ESM 导入**必须带 `.js` 后缀**（`moduleResolution: Bundler`）。
- 新阈值 / 权重进 `constants.ts`；**不要**把 `0.15` 改写成 `1 - 0.85`、`0.92` 改写成 `1 - 0.08`——浮点语义会漂移，注释里写明了原因。
- 金额取整各有既定精度（`cost.ts` 两位、`quote.ts` 一位、`credibility.ts` 三位），不要为“统一”随手改，除非有测试覆盖。
- `app.ts` 按功能分段（健康 / 聚合 / 货源 / AI / 车辆 / 订单 / 信用 / 账本 / 路线 / 同步 / 账号 / 事件），新路由挂到对应段；错误响应统一 `{ error }`，状态码语义：400 参数、401 未登录、404 不存在、423 锁定、429 限流、500 内部。
- 前端：React 18 + react-router-dom；页面不直接 `fetch`，统一走 `web/src/api/client.ts`（自动带 token、10s 超时、错误归一）；组件 PascalCase、函数 / 变量 camelCase。
- 注释解释**为什么**（尤其是 `constants.ts`、`deepseekLlm.ts` 里“别改”的理由），不写流水账。

## 8. 提交、推送与自动化

- 前缀：`feat:` / `fix:` / `refactor:` / `test:` / `docs:` / `build:`；单次单主题；提交前三条门全绿。
- 分支与远端：`main` ↔ `gitee/main`（Gitee 主推），`origin` 是 GitHub 镜像。
- **push 后必须核对远端哈希**（只报 commit hash 不算完成）：

  ```bash
  git status -sb                    # 不能出现 [ahead N]
  git ls-remote --heads gitee main  # 应等于 git rev-parse HEAD
  ```

- 外层关系：`D:\字研班` 把本目录作为 gitlink 子仓库跟踪，每日 22:30 的外层任务会记录指针；只改内层代码时不要动外层仓库。
- 无人值守自动化（21:00 内层 / 22:30 外层 / Windows 计划任务 `DSH-DailyCatchup`）的闸门、预算与权限坑见 `D:\字研班\货车\AGENTS.md`；**看到内层有未提交改动时不要提交，那可能是别人的半成品**。
- 只改本仓库：README 提到的旧演示蓝本（`../卡友助手.html` / `../小程序版/`）当前不在 `D:\字研班` 下，改动不要依赖它们；以本仓库为唯一落地实现。

## 9. 已知坑（每一条都真实踩过）

- **空车型 ≠ 匹配**：`truckMatches` 曾用 `includes`，空串让所有货源车型分静默满分（权重 10%）。现在空串直接判不匹配；改过滤 / 评分时别退回旧写法。
- **每单成本只算一次**：`rankCargoes` 里先 `calcCost` 再 `scoreCargo` 会把成本算两遍（`costFor` 可能查库 / 调地图）。应使用 `scoreCargoWithCost` 复用同一个 cost。
- **DeepSeek baseURL 会被宿主污染**：`DEEPSEEK_BASE_URL` 被指到 `…/anthropic` 时，本应用按 OpenAI 协议拼出 404，**静默回退规则引擎**却仍显示 `engine=deepseek`。`normalizeDeepSeekBase` 已清洗，改 LLM 层时保留。
- **旧火山模型已下线**：`deepseek-v3` / `r1` 调不通；现在默认 DeepSeek 官方 `deepseek-flash`。换模型前先探测，失败必须回退规则引擎而不是 500。
- **限流 ≠ 报错**：`/api/assistant` 命中限额时回退规则引擎并返回 `limited: true`，这是设计；不要改成 429——演示链接公开后页面仍要有内容。
- **前端不 build 就没有页面**：后端仅在 `web/dist` 存在时托管；改了前端必须 `cd web && npm run build`，否则看的是旧构建。
- **README 数字漂移会红**：`tests/docs.test.ts` 锁定测试文件数与表格；新增测试文件必须同时改 README 两处，用例总数以实际输出为准。
- **PowerShell 5.1 读中文会乱码**：仓库文本统一 UTF-8（无 BOM）；PS 5.1 下 `Get-Content` 要加 `-Encoding UTF8`，写脚本要存 UTF-8 BOM（详见外层 AGENTS.md）。别把乱码当成文件损坏去“修”。
- **`npm test` 不含 SQLite 集成测试**：SQLite 能力断言在 `npm run test:sqlite`；改动 `sqliteRepository.ts` 时要单独跑它。
- **演示数据在 `src/data/seed.ts`**：不要为了让某条 UI 好看而改种子，会连带大量测试断言。

## 10. 接手 5 分钟自检

1. `git status -sb`：干净、没有 `[ahead N]`。
2. `npm test`：应为全绿；红了先判断是不是基线本来就红（用 `git stash` 对照，见外层 AGENTS.md）。
3. `npx tsc --noEmit` + `npm run build`。
4. `npm run dev` 后请求 `http://localhost:3000/api/health`；要看页面先 `cd web && npm run build`。
5. 确认这次只动一个主题，并想清楚「是否触碰成本 / 评分 / 排序语义」。

## 11. 维护本文件

- 踩坑后按「现象 → 根因 → 规则 → 反例」补进第 9 节，别只修代码不留知识。
- 与 README 的分工：README 讲「产品是什么、怎么用、API 有什么」；本文件讲「怎么改才不闯祸」。
- 改本文件属于 `docs:` 提交；涉及金额语义的改动，必须同时改测试与 README 的相关描述。
