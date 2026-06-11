# Multi-stage build for @qm-wx/server

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# ===== 依赖安装层 =====
FROM base AS deps
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/server/package.json ./apps/server/
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
COPY --from=build /repo/apps/server/dist ./dist
COPY --from=build /repo/apps/server/prisma ./prisma
COPY --from=build /repo/apps/server/node_modules ./node_modules
COPY --from=build /repo/packages/shared/dist ./node_modules/@qm-wx/shared/dist

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
