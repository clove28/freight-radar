#!/usr/bin/env bash
# ============================================================
#  货运雷达 · 阿里云一键部署脚本
#  用法：登录阿里云服务器 → 把本脚本和整个项目上传到 /opt/freight-radar →
#        cd /opt/freight-radar && bash deploy/alicloud-setup.sh
#  作用：装 Docker → 建 .env → docker compose 一键构建+启动 → 打印访问信息
#  说明：需要 root 或 sudo；首次会下载镜像，约 2-5 分钟
# ============================================================
set -e

echo "=============================================="
echo "  🚛 货运雷达 · 阿里云部署"
echo "=============================================="

# 1. 装 Docker（Ubuntu/Debian）
if ! command -v docker >/dev/null 2>&1; then
  echo "[1/4] 安装 Docker ..."
  curl -fsSL https://get.docker.com | bash
else
  echo "[1/4] Docker 已安装"
fi
sudo systemctl enable --now docker >/dev/null 2>&1 || true

# 2. 建 .env（如已存在则跳过，避免覆盖你的 key）
cd "$(dirname "$0")/.."
if [ ! -f .env ]; then
  echo "[2/4] 创建 .env（docker compose 会自动读取同目录 .env）..."
  cp .env.example .env
  echo "      已生成 .env，请用 nano .env 填入 ARK_API_KEY / AMAP_KEY"
  echo "      填好后重新运行本脚本，或: docker compose up -d --build"
else
  echo "[2/4] .env 已存在，保留"
fi

# 3. docker compose 构建+启动（后台）
echo "[3/4] docker compose 构建启动（首次较慢）..."
sudo docker compose up -d --build

# 4. 健康检查
echo "[4/4] 等待服务就绪..."
for i in $(seq 1 30); do
  if curl -s http://localhost:3000/api/health | grep -q '"ok":true'; then
    echo ""
    echo "=============================================="
    echo "  ✅ 货运雷达 部署成功！"
    echo "  访问: http://localhost:3000（本机）"
    echo "  外网: http://<服务器公网IP>:3000"
    echo "  日志: sudo docker compose logs -f"
    echo "  数据: 持久化在数据卷 fr-data"
    echo "  AI:   火山 DeepSeek / 高德（需 .env 已填）"
    echo "=============================================="
    exit 0
  fi
  sleep 2
done
echo "❌ 服务未在 60 秒内就绪，查看日志: sudo docker compose logs -f"
exit 1
