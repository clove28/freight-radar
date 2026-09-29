# Phase 0：项目现状扫描

> 生成时间：2026-08（夜间自动侦察）｜方法：直接读代码 + 路由盘点 + 历史测试记录

## 一、技术栈

| 层 | 技术 | 版本/说明 |
|---|---|---|
| 运行时 | Node.js | 24+（用到 node:sqlite、--env-file） |
| 语言 | TypeScript | strict，ESM（"type":"module"） |
| 后端 | Express 4 + ws | REST + WebSocket |
| 数据库 | node:sqlite（DatabaseSync）+ JSON 文件 | PERSIST 环境变量切换 |
| AI | 火山方舟 DeepSeek（OpenAI 兼容）+ 规则引擎兜底 | ArkLlm / RuleBasedLlm |
| 地图 | 高德 Web 服务 | geocode / driving / weather / poisAround |
| 前端 | React 18 + Vite + TypeScript | 移动优先，6 个底部 tab |
| 测试 | Vitest（191 用例）+ node --test（SQLite 集成 3 用例） | 上次运行全绿 |

## 二、目录结构

```
货运雷达/
├── src/
│   ├── core/        # 确定性业务计算（12 个模块，纯函数为主）
│   ├── data/        # 数据访问层（Repository 接口 + Mock/File/SQLite/Api 实现 + Provider）
│   ├── ai/          # LLM 抽象 + 规则引擎 + 火山方舟 + 助手编排
│   └── server/      # Express app + 服务层 + 路由服务 + 推送 + 启动入口
├── web/             # React 前端（dist 已构建，由 Express 托管）
├── tests/           # 19 个测试文件
├── deploy/          # Docker/阿里云/HTTPS/上线文档
├── docs/v2-research/ # 本侦察报告目录
├── .env             # 真实密钥（gitignore，不入库）
├── start.ps1 / 启动App.bat  # 一键启动
└── Dockerfile / docker-compose.yml
```

## 三、当前项目能否启动

**能。** `start.ps1`（或 `启动App.bat`）→ `npx tsx --env-file=.env src/server/index.ts` → `http://localhost:3000`。前端构建产物 `web/dist` 已存在，由 Express 静态托管 + SPA 回退。AI 引擎走火山方舟（已实测可用），高德真实天气/路线可用，SQLite 持久化启用。

## 四、API 状态（48 个路由）

| 域 | 路由 | 状态 |
|---|---|---|
| 健康 | GET /api/health | ✅ |
| 首页 | GET /api/dashboard | ✅ |
| 货源 | GET/POST /api/cargos、GET /api/cargos/:id、GET /api/cargos/:id/explain | ✅ |
| AI | POST /api/assistant | ✅ |
| 车辆/底线 | GET/PUT /api/vehicle、/api/prefs | ✅ |
| 订单 | GET/POST /api/orders、GET /api/orders/:id、POST steps/:stepId、POST loss、GET pack | ✅ |
| 信用 | GET /api/credits、POST rate、POST :owner/unblacklist | ✅ |
| 账本 | GET/POST/PATCH/PUT/DELETE /api/books、导出 CSV/HTML | ✅ |
| 路线 | GET /api/route/strategies、/api/route/environment | ✅ |
| 行情 | GET /api/quote | ✅ |
| 同步 | POST /api/sync/upload、GET /api/sync/download | ✅ |
| 多司机 | GET/POST /api/drivers、POST :id/switch | ✅ |
| 鉴权 | register/login/me/logout/sms×2/scan×3 | ✅ |
| 事件 | GET /api/events（SSE） | ✅ |
| **运营后台** | — | ❌ 不存在 |
| **服务费/支付** | — | ❌ 不存在 |
| **货源审核** | — | ❌ 不存在 |

## 五、数据来源

1. **货源**：Mock 种子（seed.ts，围绕临汾/襄汾 + 全国主要城市），可切换 JSON 文件 / SQLite 持久化；预留 `CARGO_SOURCE=api` 外部货源 Provider（apiRepository.ts）。
2. **路线/天气/POI**：高德真实 API（key 在 .env），失败回退 Mock。
3. **AI**：火山方舟 DeepSeek-V4（arkLlm.ts），失败回退规则引擎（ruleLlm.ts）。
4. **短信/行情**：Provider 抽象，演示用本地实现，真实实现为骨架。

## 六、已完成能力（P0–P17 全绿）

成本计算、综合评分、司机底线过滤、价格异常检测、货主信用（+1/0/−3 + 黑名单）、订单 + 8 步证据链、损耗对比（农产品5‰/冷藏10‰/其他2‰）、扫码登录、账本统计与报表、AI 助手（火山）、路线策略/天气、多司机、手动发单（车队互助池）。

## 七、明显问题（不修，只记录）

1. **没有平台服务费/支付**——司机"决定承运"后没有付费动作，与 V2 商业模式（约 200 元服务费）不符。
2. **没有运营人员角色**——货源无人审核，与"平台验证"的定位不符。
3. **没有复合"货源可信度"**——只有零散的 verified 布尔、信用分、价格异常，没有汇总成可信度分。
4. **订单模型偏"记录"而非"任务"**——没有联系发货方/装货确认/补给/休息/安全/回单/结算等执行环节。
5. **前端没有运营端/货主端**——只有司机端 6 tab。
6. **角色模型缺失**——auth 只区分"登录与否"，没有司机/货主/运营/客户四类角色与权限。
7. **Mock 是唯一货源**——如实标注，没有伪装真实全国货源。
