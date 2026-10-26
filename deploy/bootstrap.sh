#!/usr/bin/env bash
# 货运雷达 · 云服务器一键部署（免域名、免备案，用 IP:3000 直连）
#
# 在服务器上（控制台「远程连接」的网页终端）以 root 运行：
#   curl -fsSL https://gitee.com/clove28/freight-radar/raw/main/deploy/bootstrap.sh -o /tmp/bootstrap.sh
#   bash /tmp/bootstrap.sh
#
# 它会做四件事：装 Docker → 拉代码 → 生成 .env → 构建并启动，最后自检并打印访问地址。
# 可重复执行：已有 .env 不会覆盖，已有代码会 fetch 到最新 main。
#
# 可覆盖的环境变量：
#   REPO_URL（默认 Gitee） APP_DIR（默认 /opt/freight-radar） BRANCH（默认 main）
#   DEEPSEEK_API_KEY / AMAP_KEY —— 非交互环境下用它们生成 .env
set -euo pipefail

REPO_URL="${REPO_URL:-https://gitee.com/clove28/freight-radar.git}"
APP_DIR="${APP_DIR:-/opt/freight-radar}"
BRANCH="${BRANCH:-main}"
APP_PORT="${APP_PORT:-3000}"

info() { printf '\033[36m[bootstrap]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[bootstrap]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[31m[bootstrap]\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "请用 root 运行：sudo bash $0"

# ---------- 1. 基础依赖 ----------
if command -v apt-get >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  for bin in git curl ca-certificates; do
    command -v "$bin" >/dev/null 2>&1 || { info "安装 $bin ..."; apt-get update -qq && apt-get install -y -qq "$bin"; }
  done
else
  warn "非 apt 系统：请自行确保 git / curl / docker 可用"
fi

# ---------- 2. Docker ----------
if ! command -v docker >/dev/null 2>&1; then
  info "安装 Docker（约 1 分钟）..."
  curl -fsSL https://get.docker.com | sh
fi
if command -v systemctl >/dev/null 2>&1; then
  systemctl enable docker >/dev/null 2>&1 || true
  systemctl start docker  >/dev/null 2>&1 || true
fi
docker compose version >/dev/null 2>&1 || die "docker compose 插件不可用，请升级 Docker 到 20.10+"

# ---------- 3. 代码 ----------
mkdir -p "$(dirname "$APP_DIR")"
if [ -d "$APP_DIR/.git" ]; then
  info "更新代码到 origin/$BRANCH ..."
  git -C "$APP_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
  info "拉取代码 ..."
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

# ---------- 4. .env ----------
if [ -f .env ]; then
  info ".env 已存在，保留不动（要改就 vim .env 后重跑本脚本）"
else
  DS_KEY="${DEEPSEEK_API_KEY:-}"
  AM_KEY="${AMAP_KEY:-}"
  if [ -t 0 ]; then
    info "生成 .env（直接回车＝跳过，之后可 vim .env 再补）"
    read -r -p "  DeepSeek API key（sk- 开头，可留空）: " DS_KEY || true
    read -r -p "  高德 AMAP_KEY（可留空，留空走 Mock 估算）: " AM_KEY || true
  fi
  cat > .env <<EOF
PERSIST=sqlite
DATA_DIR=/app/data
DEEPSEEK_API_KEY=${DS_KEY}
DEEPSEEK_MODEL=deepseek-chat
AMAP_KEY=${AM_KEY}
# 演示用：关闭登录墙，面试官点开就能看。
# 注意 docker-compose.yml 里 AUTH_REQUIRED 默认是 1，所以这里必须显式写 0。
# 如果担心别人刷你的 DeepSeek 额度，改成 1（代价：所有人要先注册/登录）。
AUTH_REQUIRED=0
EOF
  chmod 600 .env
  [ -n "$DS_KEY" ] || warn "没填 DeepSeek key：AI 助手会走规则引擎（功能完整，文案是固定模板）"
fi

# ---------- 5. 构建并启动 ----------
info "构建并启动（首次 2-4 分钟，会编译前端）..."
docker compose up -d --build

# ---------- 6. 自检 ----------
info "等待服务就绪 ..."
ready=""
for _ in $(seq 1 45); do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1; then ready=1; break; fi
  sleep 2
done
if [ -z "$ready" ]; then
  docker compose logs --tail 60
  die "健康检查失败（见上方日志）。常见原因：端口被占用 / 构建失败 / 内存不足（<1G 建议加 swap）"
fi

PUBLIC_IP="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"
[ -n "$PUBLIC_IP" ] || PUBLIC_IP="<服务器公网IP>"

printf '\n\033[32m========== 部署完成 ==========\033[0m\n'
printf '访问地址： \033[1;36mhttp://%s:%s\033[0m\n' "$PUBLIC_IP" "$APP_PORT"
printf '健康检查： \033[1;36mhttp://%s:%s/api/health\033[0m\n' "$PUBLIC_IP" "$APP_PORT"
printf '\n如果浏览器打不开，按顺序检查：\n'
printf '  1) 云控制台「防火墙/安全组」是否放行了 TCP %s\n' "$APP_PORT"
printf '  2) 本机是否在跑： docker compose ps\n'
printf '  3) 看日志：       docker compose logs -f\n'
printf '\n提示：这是 HTTP 明文地址，手机浏览器可能提示「不安全」，点继续访问即可；\n'
printf '      微信内置浏览器可能直接拦截，发给别人时建议注明「请用手机浏览器打开」。\n'
