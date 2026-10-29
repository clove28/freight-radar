# 已知坑（现象 → 根因 → 规则 → 反例）

> 从 `AGENTS.md` 下沉。每踩一次坑按四段式补一条；过期条目删除或标「已废止（日期）」。
> 这里的每一条都真实发生过，不是理论清单。

## 金额与算法

- **空车型 ≠ 匹配**
  - 现象：空车型的车辆档案对所有货源拿满车型分（权重 10%）。
  - 根因：`truckMatches` 用 `includes`，而 `'x'.includes('')` 恒为 true。
  - 规则：任一侧为空/纯空白直接判不匹配；改过滤/评分时别退回旧写法。
  - 反例：2026-10 `7cb8dfb` 修复前，车型分静默满分。

- **每单成本只算一次**
  - 现象：`rankCargoes` 里先 `calcCost` 再 `scoreCargo`，同一单查两次成本（`costFor` 可能查库/调地图）。
  - 根因：评分函数内部又算了一次成本。
  - 规则：用 `scoreCargoWithCost` 复用同一个 `cost`。
  - 反例：`715ae76` 去重前，地图调用可能返回不一致结果。

- **成本口径必须同源（UAT-04）**
  - 现象：AI 助手显示 `DEMO2` 净收益 3556.26，大厅显示 3777.44（差 221 元）。
  - 根因：`services.ask` 调 `recommend()` 时没注入 `buildCostFor`，AI 侧按 15% 估空驶，大厅用真实空驶规划（车就在临沂 → 0）。
  - 规则：大厅/详情/Dashboard/AI 助手共用同一份 `costFor`；回归断言在 `tests/api.test.ts`（UAT-04）。
  - 反例：`8c8150d` 修复前，AI 推荐的钱比大厅少。

- **阈值不要改写成算式**
  - 现象：把 `0.92` 写成 `1 - 0.08`、`0.15` 写成 `1 - 0.85` 后，边界价格/里程被改判。
  - 根因：浮点表示差导致恰好落在阈值上的值换了边。
  - 规则：`constants.ts` 保留字面量，注释写明原因；要统一取整先加测试。
  - 反例：`aee1e59`、`152caba` 之前散落的魔数。

## LLM 与外部依赖

- **DeepSeek baseURL 会被宿主污染**
  - 现象：`DEEPSEEK_BASE_URL` 被指到 `…/anthropic` 时，本应用按 OpenAI 协议拼 404，**静默回退规则引擎**却仍显示 `engine=deepseek`。
  - 根因：宿主进程（IDE/Agent 运行时/代理）也设同名变量。
  - 规则：`normalizeDeepSeekBase` 清洗；改 LLM 层时保留。
  - 反例：`1b1900a` 修之前，日志显示已接入、实际一次没调通。

- **旧火山模型已下线**
  - 现象：`deepseek-v3` / `r1` 调不通。
  - 规则：默认 DeepSeek 官方 `deepseek-flash`；换模型先探测，失败回退规则引擎而不是 500。
  - 反例：`658c433` 迁移前。

- **限流 ≠ 报错**
  - 现象：`/api/assistant` 命中限额时如果返回 429，演示页面会白屏/报错。
  - 根因：把成本闸门当成鉴权失败。
  - 规则：命中限流回退规则引擎并返回 `limited: true`，接口保持 200。
  - 反例：`06e7bee` 设计如此，别改回 429。

## 前端与文档

- **前端不 build 就没有页面**
  - 现象：打开 3000 是 404 或旧页面。
  - 根因：后端仅在 `web/dist` 存在时托管；根 `npm test/build` 不构建前端。
  - 规则：改前端必须 `cd web && npm run build`。
  - 反例：只改 `web/src` 后看 3000，误以为改动没生效。

- **文档数字多处写死会漂移**
  - 现象：README/AGENTS/验收标准各写一份用例数，至少一处过期。
  - 根因：数字是复制来的，没有单一真值源。
  - 规则：只在一处写基线，其余写「以 `npm test` 输出为准」；`tests/docs.test.ts` 校验文件数、链接、索引与新鲜度。
  - 反例：`AGENTS.md` 曾同时出现「272 用例」和「用例总数不写进文档」。

- **README 门面文档会与实现漂移**
  - 现象：API 表漏了 `POST /api/cargos`、`/api/cargos/:id/feedback`、`/api/service-fee/*`、`/api/route/compare`、`/api/export/books.html`；`../卡友助手.html`、`../小程序版/` 引用不存在。
  - 根因：新接口只改代码不改表；旧演示文件被移走。
  - 规则：改路由同步 API 表；引用仓库外路径要写「不在本仓库」；断链由 `docs.test.ts` 拦截。
  - 反例：2026-10-29 P0 修复前。

- **文档里的「现状」也会过期**
  - 现象：验收标准曾把「README 仍写 RuleBasedLlm」判成实现过时，实际 `ruleLlm.ts` 仍在且是默认引擎。
  - 根因：写文档时没核对代码，把「措辞不完整」升级成「实现错误」。
  - 规则：写「现状/缺口」前先读代码或跑命令；不确定标「未核实」。
  - 反例：2026-10-29 P0 已修正该条措辞。

## 环境与平台

- **PowerShell 5.1 读中文会乱码**
  - 现象：`Get-Content` 读 UTF-8 文件变乱码。
  - 根因：PS 5.1 默认按 ANSI（GBK）解码。
  - 规则：`-Encoding UTF8`；写脚本存 UTF-8 BOM；别把乱码当文件损坏去“修”。
  - 反例：外层看门狗脚本曾因编码被 PS 5.1 读错中文路径。

- **`npm test` 不含 SQLite 集成测试**
  - 现象：改了 `sqliteRepository.ts`，`npm test` 全绿但运行时报错。
  - 根因：SQLite 能力断言在 `npm run test:sqlite`（node:test），不在 Vitest 里。
  - 规则：动 `sqliteRepository.ts` / `auth.ts` 时单独跑 `test:sqlite`。
  - 反例：只看 `npm test` 漏掉 node:sqlite 建表/持久化问题。

- **Docker / compose 默认值会与代码漂移**
  - 现象：compose 默认 `DEEPSEEK_MODEL=deepseek-chat`，代码默认 `deepseek-flash`。
  - 根因：改代码默认值没同步部署模板。
  - 规则：默认值只在一处定义（代码），compose 写 `${DEEPSEEK_MODEL:-deepseek-flash}`；`docs.test.ts` 校验一致。
  - 反例：2026-10-29 P0 修复前。

- **远端历史分叉（2026-10-29 已收敛）**
  - 现象：曾出现 `gitee/main` 最新、`origin/main` 停在 2026-08-29 且与 main 无共同祖先；`gitee/master` 是迁移遗留。
  - 根因：主推 Gitee，GitHub 镜像长期未同步；历史曾整包导入。
  - 处理：2026-10-29 删除 Gitee `master`；GitHub 用 `git push --force-with-lease origin main` 镜像到同一历史，旧 GitHub 历史保存在本地 `backup/github-main` 分支。
  - 规则：**Gitee `main` 是唯一 SSOT**；GitHub 只读镜像，不要往 GitHub 分支提交；镜像用 force-with-lease，别用普通 merge 造双根。
  - 反例：简历贴 GitHub 会看到两个月前的旧代码。
