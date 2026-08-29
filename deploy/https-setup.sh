#!/usr/bin/env bash
# ============================================================
#  货运雷达 · HTTPS 一键配置（Let's Encrypt 免费证书 + Nginx 反代）
#  用法：登录服务器 → bash deploy/https-setup.sh 你的域名
#  例如：bash deploy/https-setup.sh freight.example.com
#  前提：域名 A 记录已指向本服务器公网 IP；80/443 端口已放行
#  作用：签证书 → 配置 Nginx（前端+API+WebSocket）→ 启动
# ============================================================
set -e
DOMAIN="$1"
if [ -z "$DOMAIN" ]; then
  echo "用法: bash deploy/https-setup.sh 你的域名"
  exit 1
fi
echo "=============================================="
echo "  🔒 配置 HTTPS for $DOMAIN"
echo "=============================================="

# 1. 停掉可能占 80 端口的应用，让 certbot 签证书
echo "[1/5] 暂停应用释放 80 端口..."
sudo docker compose stop >/dev/null 2>&1 || true

# 2. 装 certbot 并签免费证书
echo "[2/5] 安装 certbot 并签发证书..."
if ! command -v certbot >/dev/null 2>&1; then
  sudo apt-get update -qq && sudo apt-get install -y -qq certbot >/dev/null
fi
sudo certbot certonly --standalone -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos -m "admin@$DOMAIN" --keep-until-expiring

# 3. 把域名写进 nginx 配置模板（替换占位符）
echo "[3/5] 生成 Nginx 配置..."
SED_DOMAIN=$(echo "$DOMAIN" | sed 's/\./\\\\./g')
sed "s/your-domain\\.com/$SED_DOMAIN/g" deploy/nginx.conf.example > /tmp/freight-radar-nginx.conf

# 4. 起 nginx 反代（挂载证书 + 配置）
echo "[4/5] 启动 Nginx 反代..."
sudo docker run -d --name freight-nginx \
  -p 80:80 -p 443:443 \
  -v /tmp/freight-radar-nginx.conf:/etc/nginx/conf.d/default.conf:ro \
  -v /etc/letsencrypt/:/etc/letsencrypt/:ro \
  --restart unless-stopped \
  nginx:alpine >/dev/null 2>&1 || sudo docker restart freight-nginx

# 5. 重启应用（内部仍 3000，由 nginx 反代出去）
echo "[5/5] 重启应用..."
sudo docker compose up -d --build

echo ""
echo "=============================================="
echo "  ✅ HTTPS 配置完成！"
echo "  访问:   https://$DOMAIN"
echo "  说明:   Nginx 反代 前端+API+WebSocket"
echo "  证书:   Let's Encrypt 免费（自动续期，见下）"
echo "=============================================="
echo ""
echo "  续期：certbot renew 需定时，用 cron："
echo "  0 3 * * *  certbot renew --quiet && docker restart freight-nginx"
