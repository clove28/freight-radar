# 测试契约与新增测试 SOP

> 从 `AGENTS.md` 下沉。核心原则：**钱和数字必须有断言；文档由测试守着**。

## 1. 命令

| 目的 | 命令 |
| --- | --- |
| 全部 Vitest | `npm test`（= `vitest run`） |
| 单文件 | `npx vitest run tests/scoring.test.ts` |
| 监听 | `npm run test:watch` |
| SQLite 集成（node:test） | `npm run test:sqlite` |
| 一次跑完 | `npm run test:all` |
| 类型 + 构建 | `npx tsc --noEmit` / `npm run build` |

**验收门（提交前）**：`npx tsc --noEmit && npm test && npm run build`；改前端再 `cd web && npm run build`。

## 2. 什么必须有断言

- 成本公式、净收益、每公里收益（`tests/cost.test.ts`）；
- 评分权重、档位、过滤、排序、topN 归一化（`tests/scoring.test.ts`）；
- AI 编排与解释真实性、LLM 降级（`tests/assistant.test.ts`、`tests/p14.test.ts`）；
- API 路由、错误码、鉴权/锁定（`tests/api.test.ts`、`tests/p7.test.ts`、`tests/p10.test.ts`）；
- 限流闸门（`tests/rate-limit.test.ts`）；
- 成本口径一致性（`tests/api.test.ts` 的 UAT-04 用例：大厅 = AI 助手）。

## 3. 新增测试文件 SOP

1. 在 `tests/` 下建 `*.test.ts`；
2. **同步 README 两处**：README「二、技术栈」的「N 个测试文件」改成实际数、「八、测试」表格加一行；
3. `tests/docs.test.ts` 会强制校验：声明文件数 = 实际收集数、每个测试文件都登记、引用的 `tests/` 路径存在、README 不再残留旧数字；
4. 用例总数不在多处写死，统一「以 `npm test` 输出为准」。

## 4. 测试写法约定

- 纯逻辑靠**注入**，不靠 mock 框架：时间用 `now` 参数（`loginAttemptAllowed` / `RateLimiter` / `recencyPenalty`），外部依赖用 deps 注入（`recommend(deps, text, costFor)`、`createApp(services | env | repos)`）。
- `node:sqlite` 不走 Vite 转换（`vitest.config.ts` 的 `server.deps.external[/node:/]`），SQLite 能力测试单独走 `npm run test:sqlite`；`createApp` 不传 repos 时 sqlite 模式回退 Mock，避免双数据源。
- 测试用固定种子（`src/data/seed.ts`），不要为了让某条 UI 好看而改种子。
- 涉及金额的断言用精确值或两位小数误差，不要用「断言不抛错」代替业务断言。

## 5. 文档新鲜度校验（`tests/docs.test.ts`）

除 README 测试表外，还校验：

- `AGENTS.md` 行数 ≤ 120（保持入口规模）；
- `AGENTS.md`、`README.md` 里的相对链接都存在；
- `docs/README.md` 索引覆盖 `docs/` 下所有 `.md`；
- `docs/HANDOFF.md` 的「最后更新」≤ 30 天；`docs/README.md` 园艺日期 ≤ 90 天；
- README 不再引用不存在的旧演示蓝本；
- `docker-compose.yml` 的默认模型名与 `src/ai/deepseekLlm.ts` 一致。

> 跑测期间不要改源码：vitest 启动即读文件，改到一半的中间态会被加载，报出根本不存在的回归。先写完改动，再一条命令连跑三道门。

## 6. 相关文档

- 验收标准（UAT / 非功能 / 上线门）：[验收标准.md](验收标准.md)
- 已知坑（测试相关）：[pitfalls.md](pitfalls.md)
