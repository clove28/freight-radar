# 竞品分析与采纳记录（2026-10）

> 来源：外层的调研笔记 `D:\字研班\货车\货运雷达-借鉴与完善建议.md`（2026-10 整理），P1 时迁入本仓库并补「采纳决策 + 落地证据」。
> 注意：GitHub star 数为调研时的量级，本机未复核；外部链接可能失效，结论以本仓库代码为准。

## 1. 调研对象

| 项目 | 一句话 | 最值得借鉴的点 |
| --- | --- | --- |
| [carco5/retrieval-grounded-dispatch-agent](https://github.com/carco5/retrieval-grounded-dispatch-agent) | 检索增强的货运调度 Agent | 定价权限放工具里；混合检索用评测选型；Skill 按需加载；本地可跑 |
| [cargoffer/bolsa_de_carga-mcp](https://github.com/cargoffer/bolsa_de_carga-mcp) | 把货运市场封装成 MCP Server | 用 MCP 让外部 Agent 操作货源市场 |
| [JohanFJ101/dispatchiq](https://github.com/JohanFJ101/dispatchiq) | 车队调度看板 + 本地 LLM 副驾驶 | 本地 LLM 数据不出机器；React+TS+Vite 技术栈 |
| [MCP-1st-Birthday/fleetmind-dispatch-ai](https://huggingface.co/spaces/MCP-1st-Birthday/fleetmind-dispatch-ai) | 车队调度 AI，封装 29 个 MCP 工具 | 调度能力「工具化 + MCP 化」 |
| [glyphrun/agentic-frameworks](https://github.com/glyphrun/agentic-frameworks) | 40+ Agent 框架横向对比 | 选型全景（面试用） |
| [ziro](https://pypi.org/project/ziro/) | LangGraph 对话 Agent | 持久记忆、RAG、渐进式工具加载、Skill 库 |

## 2. 改进点与采纳决策

| # | 借鉴点 | 决策 | 理由 | 落地证据 |
| --- | --- | --- | --- | --- |
| 1 | 核心能力抽成「工具」（function calling） | **部分采纳** | 「钱在工具里、不在模型里」已由 `src/core` 承担；暂不引入 LLM function calling，避免把确定性编排交给模型 | `src/core/cost.ts`、`src/ai/assistant.ts`、UAT-04 回归 |
| 2 | 混合检索 RAG（向量 + BM25） | **否决** | 当前数据量小、查询是结构化条件，没有检索场景；引入向量库只增加复杂度 | — |
| 3 | MCP 化（把算价/查货封装成 MCP Server） | **待定（P17 后评估）** | 当前没有外部 Agent 调用需求；P17 真实化完成后再评估 | — |
| 4 | Skill 按需加载 | **部分采纳** | 落到文档层：AGENTS 入口 + docs 按需展开；LLM 提示词按任务分层（parse/explain） | `AGENTS.md`、`docs/`、`src/ai/llm.ts` |
| 5 | 本地/隐私回退（Ollama） | **待定** | 已有 `LlmPort`，接本地模型只是新增实现；但需要 GPU/模型选型，暂不做 | `src/ai/selectLlm.ts`（扩展点） |
| 6 | 全链路可观测 + 成本追踪 | **部分采纳** | 已有：限流闸门、LLM 调用日志、启动引擎标识、`X-RateLimit-Remaining`；缺 token 用量统计面板 | `src/server/rateLimit.ts`、`src/ai/arkLlm.ts` 日志 |
| 7 | 评分排序评测集（Eval） | **部分采纳** | 公式/权重/过滤有 281 条断言；仍缺「真实订单评测集」来证明排序更优 | `tests/cost.test.ts`、`tests/scoring.test.ts`；评测集列为 P2 候选 |
| 8 | 多 Agent 编排 | **否决** | 单条流程（理解 → 计算 → 解释）已够用，拆多 Agent 只增复杂度 | — |

## 3. 结论与下一步

- **投入小、收益大**：评测集（#7）、token/成本可观测（#6）——列为 P2 候选。
- **P17 后再评估**：MCP（#3）、本地模型回退（#5）。
- **保持否决**：RAG（#2）、多 Agent（#8）——当前场景不需要，面试可讲「为什么不做」。
- **不重复调研**：本文件是活文档，结论变化就改表并注明日期。

## 4. 变更记录

| 日期 | 变更 |
| --- | --- |
| 2026-10-29 | 从外层笔记迁入仓库；补 8 条采纳决策与落地证据；标注 star 未复核、链接可能失效 |
