# Phase 8：V2 技术架构

> 原则：**在现有分层上"加宽"，不"推翻"**。现有 core/data/server 分层已经正确，V2 增加角色边界、应用服务编排、数据源 Provider 家族与 AI 事实注入层。

## 一、推荐分层架构

```
Frontend（三个端）
  ├── 司机端 App（现有 web/ 演进）
  ├── 运营端 Web（新增 ops-web/）
  └── 货主端（P3 新增，可先并入运营端）

        ↓ HTTPS/WebSocket

API 层（Express，现有 app.ts 扩展）
  ├── /api/driver/*   司机端（现有路由大部分归入）
  ├── /api/ops/*      运营端（新增：审核/异常/反馈/证据链）
  ├── /api/shipper/*  货主端（P3）
  └── 角色中间件（token 带 role，路由级守卫）

        ↓

Application Service 层（新增 src/application/，编排用例）
  ├── CargoVerificationService  审核用例
  ├── TransportTaskService      运输执行/提醒编排
  ├── ServiceFeeService         虚拟额度状态机
  ├── CredibilityService        可信度聚合（调用 core 纯函数）
  └── SafetyService             安全守护定时/升级
  （现有 src/server/services.ts 保持，逐步把用例编排迁入）

        ↓

Domain / Core 层（现有 src/core/，只增不改）
  ├── cost.ts / scoring.ts（禁改）
  ├── 新增 credibility.ts     可信度纯函数（权重进 constants.ts）
  ├── 新增 serviceFee.ts      虚拟额度状态机纯函数
  ├── 新增 transportPlan.ts   休息/加油/补给时间窗纯函数
  └── 新增 safety.ts          确认/升级流程纯函数

        ↓

Repository 层（现有 src/data/repository.ts，新增接口）
  ├── 现有：Cargo/Vehicle/Book/Order/Prefs/Credit
  └── 新增：User/DriverRepo/CargoVerification/CargoFeedback/ServiceFee/OperationRecord/SafetyEvent

        ↓

Data Provider 层（货源数据源家族）
  CargoProvider（新增统一接口，现有 apiRepository 演进）
    ├── MockCargoProvider      现有 mock.ts + seed.ts（MVP 默认）
    ├── ExternalApiCargoProvider  现有 apiRepository.ts 骨架（预留）
    └── EnterpriseCargoProvider   企业合作货源（未来）
  要求：上层业务逻辑不依赖 Mock；切换只改 Provider 注入。

        ↓

外部服务（现有 + 扩展）
  ├── 高德（路线/天气/POI/服务区）—— 现有 amap.ts
  ├── 火山方舟 LLM —— 现有 arkLlm.ts
  ├── 短信 Provider —— 现有 providers.ts
  └── 支付（P7+ 预留接口，MVP 不接）
```

## 二、AI Service 的位置（明确）

```
AI Service（现有 src/ai/，位置正确，不移动）

  事实注入层（新增，V2 核心补强）
  ├── 程序把结构化事实序列化为 JSON：ScoredCargo / 可信度证据 / 路线计划 / 卡友反馈摘要
  ├── LLM 输入 = 系统指令 + 事实 JSON + 用户自然语言
  └── LLM 输出 = 解释文本（不产生新事实）

  兜底：LLM 失败 → RuleBasedLlm（现有，保留）
```

关键点：AI **不位于**"计算路径"上，只位于"解释路径"上。任何 AI 故障不影响成本/评分/排序结果。

## 三、关键设计决策

1. **可信度算法放 core/**：`credibility.ts` 纯函数（输入：verified/信用分/运营确认/历史成交/反馈/价格合理性/完整度 → 输出 0–100 分 + 证据列表）。与 cost/scoring 同风格，可单测、可解释。
2. **服务费用"虚拟额度"**：`ServiceFee` 状态机（unpaid→paid→consumed）+ `DriverCreditBalance`。**硬约束：额度不可提现/转账/兑换现金**，仅为闭环占位，P7 换真实支付时替换 Provider。
3. **订单与运输任务分离**：Order（交易+证据）不变；TransportTask（执行计划+提醒）新建。两者 1:1 关联，互不污染。
4. **运营留痕**：所有运营写操作强制写 OperationRecord（谁/何时/改了什么），既是审计也是"平台验证"的信任依据。
5. **角色守卫**：auth token 增加 role 声明；`/api/ops/*` 全部要求 role=ops。货主端 P3 前可并入运营端操作。
6. **不做的事（明确写死）**：不爬取第三方平台、不伪装真实全国货源、不接真实支付/健康数据、不做虚拟货币。

## 四、部署形态（不变）

现有 Dockerfile + docker-compose + SQLite 单机部署即可支撑 P0–P5（单实例足够）。多实例/队列化等运营量大后再考虑，**现在不做微服务化**。
