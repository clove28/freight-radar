# HANDOFF（当前交接）

> 最后更新：2026-10-29（> 30 天未更新会被 `tests/docs.test.ts` 判红）
> 规则：上下文到 ~50% 或一次会话收尾时更新本文件；新会话先读它，再读 `AGENTS.md`。

## 1. 当前目标

D0（文档与工程基建）已完成；D1（需求与记录）本次收尾；下一阶段 P2（工程增强）与 P17（真实化冲刺）。
> 命名约定：产品阶段用 `P0–P17`；文档/协作阶段用 `D0/D1`，避免混淆。

## 2. 已完成（近期）

| 时间 | 内容 | 提交 |
| --- | --- | --- |
| 2026-10-29 | 新增仓库级 `AGENTS.md`（协作契约） | `51caa85` |
| 2026-10-29 | 新增验收标准 v1.0（UAT / 非功能 / 上线门 / 一票否决） | `6793a81` |
| 2026-10-29 | 修复 UAT-04：AI 助手与大厅金额口径统一（注入真实空驶里程/策略） | `8c8150d` |
| 2026-10-29 | 验收标准快照更新（UAT-04 已回归） | `24544c4` |
| 2026-10-29 | D0（文档/基建）：AGENTS 瘦身为入口 + docs 索引/architecture/env/testing/pitfalls + README API 表/死链/AI 流程修复 + 文档新鲜度校验 + engines/LICENSE/CI + tag | 见 `git log --oneline -10` |
| 2026-10-29 | 删除 Gitee 遗留分支 `master`；GitHub 镜像 force 同步完成（旧历史留本地 `backup/github-main`） | 见本次 docs 提交 |
| 2026-10-29 | D1（需求/记录）：PRD（用户故事 / P0–P17 / 非目标 / P17 DoD）、竞品分析迁入 + 采纳表、验收记录 4 份、分支/PR 规范、`.editorconfig` | 见 `git log --oneline -4` |

## 3. 未完成 / 下一步（按顺序）

1. **P2** AI 助手合并司机底线偏好（`services.ask` 合并 `prefs` 后再 `recommend`），补回归测试（验收标准 §10-2）。
2. **P2** 评分排序评测集：用真实/构造订单证明权重更优（竞品分析 #7）。
3. **P2** token / 成本可观测（成本面板或日志聚合，竞品分析 #6）。
4. **P2** Docker 部署验证（需有 Docker 的机器/服务器）。
5. **P17** 按 [PRD.md](PRD.md) §6 逐项 DoD 开工：真实货源 API → 短信/行情 → HTTPS → 微信扫码 → 小程序真机 → 服务端 PDF。
6. ✅ 已完成：GitHub 镜像同步、Gitee `master` 清理（2026-10-29）。

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

`git log --oneline -10`（D0 / D1 的提交均可见；产品阶段 P0–P17 见 [PRD.md](PRD.md)）。
