# Multi-stage build for @qm-wx/server

FROM node:20-bookworm-slim AS base
# 国内 apt 源加速（deb.debian.org 在国内极慢）+ Prisma engine 需 openssl/libssl3
RUN (sed -i 's|deb.debian.org|mirrors.tencentyun.com|g; s|security.debian.org|mirrors.tencentyun.com|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null; \
     sed -i 's|deb.debian.org|mirrors.tencentyun.com|g; s|security.debian.org|mirrors.tencentyun.com|g' /etc/apt/sources.list 2>/dev/null; true) \
 && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# ===== 依赖安装层 =====
FROM base AS deps
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/server/package.json ./apps/server/
COPY apps/miniprogram/package.json ./apps/miniprogram/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

# ===== 构建层 =====
FROM deps AS build
WORKDIR /repo
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server
RUN pnpm --filter @qm-wx/shared build
RUN cd apps/server && pnpm prisma generate
RUN pnpm --filter @qm-wx/server build

# ===== 运行层 =====
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
# V0.1.139 防 OOM：Node heap 老生代限 1G（默认 1.5G，在 4G 小内存机吃光会挤死 sshd）
ENV NODE_OPTIONS="--max-old-space-size=1024"
# 复制整个 repo：pnpm 的 node_modules 是 .pnpm + 软链结构，局部 COPY 会致软链断裂缺包
# （全量 COPY 含 .pnpm，软链目标存在；镜像略大但可靠，后续可 pnpm deploy 精简）
COPY --from=build /repo /app
WORKDIR /app/apps/server

EXPOSE 3000

# docker compose 自愈：30s 探一次，连续 3 次失败 → 重启容器
# start-period 40s 给 prisma migrate deploy + Fastify 启动留缓冲
# 用 node 内置 http（bookworm-slim 不带 wget/curl，零外部依赖）
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
