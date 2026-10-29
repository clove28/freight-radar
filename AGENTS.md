# AGENTS.md

> **入口文件**：改代码前先读本文件；细节都在 `docs/`，按需展开（渐进式披露，别在本文件里堆规则）。
> 产品说明见 [README.md](README.md)｜文档索引见 [docs/README.md](docs/README.md)｜当前交接见 [docs/HANDOFF.md](docs/HANDOFF.md)。

## 0. 一句话

货运雷达 = 面向个体货车司机的 **AI 货运决策系统**（找货 → 成本 → 净收益 → 评分 → 推荐 → 接单 → 记账 → 画像）。
TS strict + Express + `node:sqlite` + React 18/Vite + Vitest；LLM = DeepSeek（无 key 回退规则引擎）；地图 = 高德（无 key 回退 Mock）。

## 1. 命令（仓库根执行）

```bash
npm run dev                 # 内存 Mock，:3000
PERSIST=sqlite npm run dev  # 持久化（PowerShell: $env:PERSIST='sqlite'; npm run dev）
npm test                    # vitest（25 个 *.test.ts）
npm run test:sqlite         # node:test，独立于 npm test
npx tsc --noEmit            # 类型检查
npm run build               # 后端构建
cd web && npm install && npm run build   # 前端是独立包
```

**验收门**：`npx tsc --noEmit && npm test && npm run build`（改前端再加 `cd web && npm run build`）。
用例数/文件数以 `npm test` 输出为准；完整判定见 [docs/验收标准.md](docs/验收标准.md)。

## 2. 红线（违反即回滚，最高优先级）

1. **LLM 碰不得钱**：成本/净收益/每公里/评分/排序只由 `src/core/` 确定性计算；LLM 只做「自然语言 → 结构化条件」和「基于真实结果写解释」。
2. **LLM 禁止编造**：货源、运费、里程、收益必须来自数据层；提示词里只喂真实结果。
3. **不改成本/评分/排序的算法语义**：权重、档位、公式属于产品契约；要改先出方案 + 影响面 + 测试。
4. **外部依赖必须回退**：LLM 失败 → 规则引擎，高德失败 → Mock；限流命中 → 规则引擎并返回 `limited`，任何路径不许 5xx/白屏。
5. **密钥只走环境变量**：`.env` 不入库，仓库只有 `.env.example`；密码 scrypt 哈希。
6. **金额只由后端算**：前端只做格式化（`web/src/utils/format.ts`），禁止组件内重算金额/评分。

## 3. 协作规则

- **分支**：>1 文件或改语义 → `feat/` / `fix/` / `docs/` 分支；小修可直接 `main`；阶段收尾打 `v0.x.0` tag。
- **提交**：`feat:` / `fix:` / `refactor:` / `test:` / `docs:` / `build:` 前缀，单主题；提交前三道门全绿。
- **推送后核对**：`git status -sb` 无 `[ahead N]`，且 `git ls-remote --heads gitee main` = `git rev-parse HEAD`。只报 commit hash 不算交付。
- **上下文管理**：到 ~50% 或会话收尾时，更新 [docs/HANDOFF.md](docs/HANDOFF.md)（当前目标/已完成/下一步/环境/坑）；新会话先读它。
- **subagent**：只读调研、竞品搜索、批量扫描、独立验收取证可并行；**改金额/评分语义与最终验收判定不外包**；写文件任务串行、按目录分片；子代理结论必须附证据，主线程复核后才落文档。
- **文档变更**：新增文档必须登记 [docs/README.md](docs/README.md)；数字/相对链接/索引由 `tests/docs.test.ts` 校验；不要在多处写死用例数。
- **只改本仓库**：旧演示蓝本不在本仓库；外层工作区 `D:\字研班\货车` 的定时任务/headless 权限坑见外层 `AGENTS.md`。内层有未提交改动时不要提交（可能是别人的半成品）。

## 4. 去哪看（按需展开，别在入口堆细节）

| 想知道 | 看 |
| --- | --- |
| 代码地图 / 依赖方向 / 设计取舍 / 请求链路 | [docs/architecture.md](docs/architecture.md) |
| 环境变量 / 持久化 / 启动模式 / Node 版本 | [docs/env.md](docs/env.md) |
| 测试契约 / 新增测试 SOP / 文档校验项 | [docs/testing.md](docs/testing.md) |
| 已知坑（现象 → 根因 → 规则 → 反例） | [docs/pitfalls.md](docs/pitfalls.md) |
| 验收 / 上线判定 / 一票否决 | [docs/验收标准.md](docs/验收标准.md) |
| 当前进度 / 交接 / 下一步 | [docs/HANDOFF.md](docs/HANDOFF.md) |

## 5. 维护本文件（文档园艺）

- 本文件只放**稳定入口**：目标 ≤ 120 行；细节变长就下沉到 `docs/` 并更新第 4 节索引。
- 踩坑按「现象 → 根因 → 规则 → 反例」写进 [docs/pitfalls.md](docs/pitfalls.md)，过期条目删除或标「已废止（日期）」。
- 每季度复核一次（园艺日期记在 [docs/README.md](docs/README.md)）；数字只在一处写死。
- 金额语义相关改动：先改验收标准，再改代码，最后补测试。
