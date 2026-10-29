# HANDOFF（当前交接）

> 最后更新：2026-10-29（> 30 天未更新会被 `tests/docs.test.ts` 判红）
> 规则：上下文到 ~50% 或一次会话收尾时更新本文件；新会话先读它，再读 `AGENTS.md`。

## 1. 当前目标

P0「文档与工程基建收敛」已完成；下一步进入 **P1**：PRD、竞品分析归档、验收记录、分支/PR 规范。

## 2. 已完成（近期）

| 时间 | 内容 | 提交 |
| --- | --- | --- |
| 2026-10-29 | 新增仓库级 `AGENTS.md`（协作契约） | `51caa85` |
| 2026-10-29 | 新增验收标准 v1.0（UAT / 非功能 / 上线门 / 一票否决） | `6793a81` |
| 2026-10-29 | 修复 UAT-04：AI 助手与大厅金额口径统一（注入真实空驶里程/策略） | `8c8150d` |
| 2026-10-29 | 验收标准快照更新（UAT-04 已回归） | `24544c4` |
| 2026-10-29 | P0：AGENTS 瘦身为入口 + docs 索引/architecture/env/testing/pitfalls + README API 表/死链/AI 流程修复 + 文档新鲜度校验 + engines/LICENSE/CI + tag | 见 `git log --oneline -6` |

## 3. 未完成 / 下一步（按顺序）

1. **P1** `docs/PRD.md`：用户故事（US-01…）+ P0–P17 需求表（目标/UAT 映射/优先级理由/状态）+ 非目标 + 变更记录。
2. **P1** `docs/research/competitive-2026-10.md`：把外层借鉴文档迁入，补「借鉴点 → 采纳/否决 → 落地 commit」表。
3. **P1** `docs/验收记录/`：按验收标准 §12 补 4 份（P3 / P14 / P16 / UAT-04）。
4. **P1** 分支/PR 模板；阶段收尾打 `v0.x.0` tag。
5. **P2** 前端最小测试、ESLint/Prettier 二选一（或删除相关声明）、`.editorconfig`。
6. **待确认（需人类决策）**：GitHub 镜像同步（force-push 或 allow-unrelated-histories 合并）、Gitee `master` 废弃分支清理。

## 4. 环境

- Node：本地 v25.2.0；Dockerfile `node:24-alpine`；`engines >= 22.5`。
- 启动：`npm run dev`（内存 Mock）；`.\start.ps1`（读 `.env`：SQLite + DeepSeek + 高德）。
- 验证：`npx tsc --noEmit && npm test && npm run build`；`npm run test:sqlite`；前端 `cd web && npm run build`。
- key：仓库内无任何 key；真实 AI/地图走环境变量（见 [env.md](env.md)、`.env.example`）。

## 5. 现在会咬人的 3 条坑

1. **成本口径必须同源**：大厅/详情/Dashboard/AI 助手共用 `buildCostFor`；UAT-04 回归在 `tests/api.test.ts`，别回退。
2. **前端不 build 就没页面**：只改 `web/src` 必须 `cd web && npm run build`，否则 3000 托管的是旧构建。
3. **文档会漂移**：数字/链接/索引由 `tests/docs.test.ts` 拦；先改代码，再改文档，最后跑门。

## 6. 先读哪几份

`AGENTS.md`（红线/命令）→ 本文件 → [architecture.md](architecture.md)（分层）→ [验收标准.md](验收标准.md) §2 / §10。

## 7. 最近提交

`git log --oneline -6`（P0 的 2–3 个提交在本次收尾后可见）。
