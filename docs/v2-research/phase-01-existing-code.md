# Phase 1：已有代码能力盘点

> 逐模块评估：🟢 保留 ｜ 🟡 修改后保留 ｜ 🔴 废弃 ｜ ⚪ 暂时不动

## 一、core 层（确定性业务计算）

### types.ts — 🟢 保留
- 当前作用：领域模型（Cargo/Vehicle/CostEstimate/ScoreBreakdown/ScoredCargo/DriverQuery/Recommendation/BookEntry/DashboardData + 8 类货物）。
- 状态：完整。Cargo 已含 owner/phone/verified/pub 字段，天然为真实货源 API 对齐。
- 为什么保留：纯类型、无框架依赖，是"确定性计算核心"的地基。
- 需要修改：V2 需新增 User/Driver/Shipper/Ops 角色类型、CargoVerification、CargoFeedback、ServiceFee、SafetyEvent 等新类型（放新文件，不动本文件既有定义）。

### constants.ts — 🟢 保留
- 当前作用：评分权重（40/20/20/10/10）、每公里收益参考线（8 元满分）、时间分档、损耗标准（5‰/10‰/2‰）。
- 状态：完整、集中可调参。
- 为什么保留：所有"拍脑袋数字"集中于此，正是产品原则。
- 需要修改：V2 增加可信度权重、服务费常量（约 200 元）、安全阈值等新常量。

### cost.ts — 🟢 保留（核心资产，禁止重写）
- 当前作用：纯函数成本引擎。油费=里程/100×油耗×油价；高速费=里程×系数；其他=档案杂费；空驶=空驶里程/100×油耗×油价；总成本=四项之和；净收益=运费−总成本；每公里=净收益/总里程。
- 状态：完整、可注入空驶里程/路线策略/天气系数（向后兼容）。
- 为什么保留：V2"决策平台"的核心引擎，公式已与真实业务对齐。
- 需要修改：仅扩展（如绿通减免已预留 greenSave；未来加服务费扣减项），不动现有公式。

### scoring.ts — 🟢 保留（核心资产，禁止重写）
- 当前作用：五维评分（收益/路线/回程/车型/时间）+ 业务过滤（载重、车型、起终点、关键字、运距、回程、每公里底线）+ 排序。
- 状态：完整。司机底线 minPerKm 已在 filterCargoes 中生效。
- 为什么保留：评分=程序计算，LLM 只解释，原则贯彻得好。
- 需要修改：V2 把"可信度分"作为第 6 维或降权项接入（creditPenalty 已有雏形），不改权重结构。

### order.ts — 🟡 修改后保留
- 当前作用：Order 模型 + 8 步证据链（装货称重/装车/篷布封条/途中打卡/卸货过磅/卸完/损耗对比/证据包）+ 损耗对比 calcLoss + 价格异常 priceFlag（<5 元/km 偏低、>12 元/km 虚高）。
- 状态：完整可用，但**证据链是"司机自证"视角**（拍照留证），不是"平台服务保障"视角。
- 为什么修改：V2 要把 Order 升级为"运输任务"，证据链前移到"货源发布→平台审核→联系发货方→装货确认"，后延到"回单/结算"。
- 需要修改：新增 TransportTask 概念、Order 与 ServiceFee/OperationRecord 关联、证据类型扩展（照片→通话记录/确认单/回单）。**不重写现有 8 步**，而是在其基础上扩展阶段。

### credit.ts — 🟢 保留
- 当前作用：三档评价（+1/0/−3）、黑名单（<0 分）、徽标、降权（黑名单 −30、差评 −15）。
- 状态：完整。
- 为什么保留：是"卡友反馈 + 可信度"的种子模块。
- 需要修改：V2 从"货主信用"泛化为"交易主体信用"（货主/司机/运营三方），并并入 CargoFeedback（结构化反馈：装货等待时长、装卸难易、入口信息等）。

### history.ts / stats.ts / quote.ts / weather.ts — ⚪ 暂时不动
- 作用：接单历史、月度统计（净收益/单数/里程/每公里）、行情区间（规则估算 + API 骨架）、天气（高德 + 修正系数）。
- 状态：可用。行情/天气均已预留真实 Provider 接口。
- V2 定位：历史数据是"可信度"与"下次决策"的输入，先不动，等可信度体系接入后作为数据源。

### routeStrategy.ts / routePlanner.ts — 🟢 保留
- 作用：高速/国道/平衡路线策略系数；空驶里程规划（当前城市→装货地，Mock 距离估算 + 高德 driving 真实值）。
- 状态：可用。
- 为什么保留：路线/距离必须来自程序（高德），正是"AI 不编里程"原则的支撑。
- 需要修改：V2 运输执行阶段需要"路线途经点/服务区/预计到达"能力，建议在 routePlanner 上扩展（接高德货车导航规划）。

### scanLogin.ts / auth.ts — ⚪ 暂时不动
- 作用：扫码登录状态机（create/status/approve）；scrypt 密码哈希 + session token + 登录锁定。
- 状态：可用。
- 需要修改：V2 引入角色模型后，登录/注册需带角色（司机/货主/运营），token 需带角色声明。

## 二、data 层

### repository.ts — 🟢 保留
- 当前作用：Cargo/Vehicle/Book/Order/Prefs/Credit 六仓储接口 + RoutePlanner 接口 + RepositorySet 聚合 + DriverPrefs（minPerKm/minNetIncome/maxKm/preferredStrategy）。
- 状态：完整、抽象干净。
- 为什么保留：是"Mock→真实 API"切换的关键抽象，上层不依赖实现。
- 需要修改：V2 新增 CargoVerificationRepository、CargoFeedbackRepository、ServiceFeeRepository、SafetyEventRepository、OperationRecordRepository、UserRepository（角色）等接口。

### mock.ts / seed.ts — ⚪ 暂时不动
- 当前作用：内存仓储 + 固定种子（货源/车辆/账本/信用）。
- 状态：可用、可复现。
- 为什么不动：MVP 阶段唯一数据源，如实标注 Mock，不伪装真实。

### providers.ts — 🟢 保留
- 当前作用：SmsProvider（Dev/Aliyun 骨架）、QuoteProvider（规则/Api 骨架），按环境变量选择。
- 状态：接口+本地实现+真实骨架齐备。
- 为什么保留：Provider 模式正是 V2 数据源策略（Mock/External/Enterprise）的模板，应推广到货源与支付。

### fileRepository.ts / sqliteRepository.ts / apiRepository.ts — 🟢 保留
- 作用：JSON 文件持久化、SQLite 持久化（表与仓储对齐）、外部货源 API（CARGO_SOURCE=api 时启用，含故障注入演示）。
- 状态：可用。
- 需要修改：SQLite 表随 V2 新模型扩展；apiRepository 升级为 CargoProvider 三实现（Mock/ExternalApi/Enterprise）。

### amap.ts — 🟢 保留
- 作用：高德 geocode（返回 adcode）/driving/weather/poisAround，失败回退 Mock。
- 状态：真实可用（实测真实天气返回）。
- V2 定位：路线/里程/天气/POI 的"程序事实源"，运输执行与补给规划的地基。

## 三、server 层

### app.ts — 🟢 保留（不重写）
- 作用：Express 应用 + 48 路由 + AUTH_REQUIRED 中间件 + SSE + 静态托管。
- 状态：可用。
- 需要修改：V2 按新业务闭环增量加路由（货源审核、服务费、运输执行、安全、运营端），**不重写现有路由**。

### services.ts / routeService.ts / pushHub.ts — 🟢 保留
- 作用：排序/评分/推荐服务编排；路线/天气聚合；WS/SSE 推送。
- 状态：可用。
- 需要修改：services 层新增可信度计算、服务费状态机、运输任务编排；推送扩展运输执行事件。

## 四、ai 层

### llm.ts / ruleLlm.ts / arkLlm.ts — 🟢 保留
- 作用：LlmPort 抽象；规则引擎（确定性兜底）；火山方舟适配（OpenAI 兼容，失败回退规则）。
- 状态：完整可用（火山已实测）。
- 为什么保留：LLM 抽象 + 兜底正是"AI 不负责事实"原则的载体。
- 需要修改：LlmPort 增加"结构化数据 + 指令"上下文注入协议（给 AI 喂程序算好的数字，AI 只解释）。

### assistant.ts — 🟡 修改后保留
- 作用：NL 解析 DriverQuery → 程序过滤/评分/排序 → AI 生成解释。
- 状态：可用，已实现"AI 不编数字"（解释基于 ScoredCargo 真实数据）。
- 需要修改：V2 场景扩展（"这单值得跑吗"= 已支持的解释增强；"明天回武汉"= 已支持的查询增强；"一路怎么安排"= 需新增运输计划生成，接路线/服务区/时间窗数据）。

## 五、web 前端

- App.tsx 6 tab（首页/货源大厅/订单/账本/AI助手/我的）——🟢 保留。
- Dashboard/LoadHall/LoadDetail/Assistant/Books/Orders/OrderDetail/VehiclePage/Credits/PostCargo/Login——🟢 保留。
- **缺失**：运营后台页面、货主端页面、服务费支付页、运输执行完整流程页（补给/休息/安全）——V2 按优先级补。

## 六、盘点结论

- 🟢 保留：cost/scoring/types/constants/credit/routePlanner/repository/providers/amap/app/services/ai 抽象 = **确定性计算核心 + 数据抽象 + AI 边界，全部保留**。
- 🟡 修改：order（证据链升级为平台服务保障）、assistant（场景扩展）、SQLite（新表）。
- 🔴 废弃：无。
- ⚪ 暂时不动：history/stats/quote/weather/scanLogin/auth/mock/seed。
