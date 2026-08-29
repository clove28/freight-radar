# 货运雷达 · 部署镜像（阿里云/任意 Docker 主机）
# 构建：docker build -t freight-radar .
# 运行：docker compose up -d --build（推荐，见 docker-compose.yml）
#   或 docker run -p 3000:3000 --env-file .env -v fr-data:/app/data freight-radar

# ---- 构建前端 ----
FROM node:24-alpine AS web-build
WORKDIR /app/web
COPY web/package.json web/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---- 构建后端 ----
FROM node:24-alpine AS server-build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src/ ./src/

# ---- 运行 ----
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# node:sqlite 在 Node 24 已内置，无需 flag；若不稳可加 NODE_OPTIONS(--experimental-sqlite)
COPY --from=server-build /app/node_modules ./node_modules
COPY --from=server-build /app/src ./src
COPY --from=server-build /app/tsconfig.json ./
COPY --from=web-build /app/web/dist ./web/dist
COPY package.json ./

EXPOSE 3000
ENV PERSIST=sqlite
ENV DATA_DIR=/app/data
VOLUME /app/data

# 用 node 直接跑 tsx 入口（容器环境变量由 docker-compose/--env-file 注入，镜像内不依赖 .env 文件）
CMD ["node", "node_modules/tsx/dist/cli.mjs", "src/server/index.ts"]
