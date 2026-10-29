# 环境与运行模式

> 从 `AGENTS.md` 下沉；`.env.example` 是变量清单，本文件解释「怎么用、为什么」。

## 1. 版本要求

- Node **≥ 22.5**（`node:sqlite` 需要；本机实测 v25.2.0，Dockerfile 用 `node:24-alpine`）。
- `package.json` 已声明 `engines`，`.nvmrc` 建议 Node 24（与 Docker 一致）。
- 依赖：根目录 `npm install`；前端 `cd web && npm install`。

## 2. 启动方式

| 场景 | 命令 | 说明 |
| --- | --- | --- |
| 开发（内存 Mock） | `npm run dev` | :3000，重启丢数据；无 key 也能完整演示 |
| 持久化开发 | `PERSIST=sqlite npm run dev` | 本机 SQLite（`node:sqlite`）；PowerShell：`$env:PERSIST='sqlite'; npm run dev` |
| 完整模式（读 `.env`） | `.\start.ps1` | SQLite + DeepSeek + 高德，需根目录 `.env` |
| 前端开发 | `cd web && npm run dev` | :5173，`/api` 代理到 :3000 |
| 前端构建（部署/演示） | `cd web && npm run build` | 产物 `web/dist`，由后端托管 |
| 公网演示 | `start-public.ps1` / `start-public.cmd` | Cloudflare 临时隧道，0 元演示 |

## 3. 环境变量

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

## 4. 运行模式要点

- **登录 / 多司机 / 扫码 / 多端同步 / WebSocket 都依赖 SQLite 模式**；纯 Mock 下这些能力不可用（接口返回提示性错误，或连接直接不启动）。
- 引擎标识：`describeProvider()` 的 label / model 会打到启动日志，前端 AI 徽标也用它；改引擎时同步展示。
- `AUTH_REQUIRED=1` 时白名单：`/api/health`、`/api/auth/*`、`/api/events`；其余需 `Authorization: Bearer <token>`。
- 限流只对真实 LLM 生效（规则引擎不花钱），命中回退规则引擎并返回 `limited: true`，不报 5xx。
- `AUTH_REQUIRED=1` + 纯 Mock：业务接口返回 400「登录功能需要 PERSIST=sqlite 模式」，这是预期行为。

## 5. 密钥与安全

- `.env` 已被 gitignore，仓库只有 `.env.example`；密钥只放环境变量。
- 生产 / 公网必须 `AUTH_REQUIRED=1`，并设置 `ASSISTANT_PER_IP_PER_MIN`、`ASSISTANT_DAILY_TOTAL`。
- 密码 scrypt 哈希；会话 TTL 7 天；登录连续失败 5 次锁 10 分钟（423）。

## 6. 部署相关

- Docker：`docker build -t freight-radar .`；`docker compose up -d --build`（单容器，`PERSIST=sqlite`、`AUTH_REQUIRED` 默认 1）。
- 公网：`deploy/阿里云部署步骤.md`（免域名方案）、`deploy/nginx.conf.example`、`deploy/https-setup.sh`。
- 局域网：`deploy/局域网使用方案.md`；免责声明：`deploy/免责声明.txt`（上线必备）。

## 7. 相关文档

- 启动/构建命令速查：[../AGENTS.md](../AGENTS.md)
- 部署验收门：[验收标准.md](验收标准.md) §4.4 / §6
- 环境相关坑：[pitfalls.md](pitfalls.md)
