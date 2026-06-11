# apps/server — 后端服务

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../CLAUDE.md) → **apps/server/**（这里）
> 架构依据：[docs/ARCHITECTURE-V2.md](../../docs/ARCHITECTURE-V2.md)

---

## 🎯 职责

Node.js + TypeScript 后端，对外提供 6 个 module 的 HTTP API。**唯一权威**：openid、积分、余额、订单状态都在这里产生和变更。

---

## 🏃 快速上手

```bash
# 1. 装依赖（monorepo 根）
cd ../.. && pnpm install

# 2. 准备环境变量
cp .env.example .env
# 编辑 .env，至少填 DATABASE_URL / REDIS_URL / JWT_SECRET / WX_APPID / WX_SECRET

# 3. 起 PostgreSQL + Redis（推荐 Docker）
docker run -d --name qmwx-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
docker run -d --name qmwx-redis -p 6379:6379 redis:7

# 4. 初始化数据库
pnpm prisma:generate
pnpm prisma:migrate

# 5. 跑起来
pnpm dev
# 访问 http://localhost:3000/health 应返回 { status: 'ok' }
```

---

## 📂 目录约定

```
src/
├── server.ts                    # 启动入口（Fastify 装配）
├── config/
│   └── env.ts                   # 环境变量 Zod 校验
├── common/
│   ├── errors.ts                # BusinessError 统一类
│   ├── middleware/              # auth / feature-gate
│   └── integrations/wx/         # 微信生态集成
├── infra/                       # Prisma / Redis / BullMQ
└── modules/                     # 6 个业务 module
    ├── user/        (Phase 1)
    ├── sport/       (Phase 2)
    ├── mall/        (Phase 3)
    ├── content/     (Phase 3)
    ├── wallet/      (Phase 4, 当前 requireFeature: 'wallet')
    └── admin/       (Phase 3)
```

---

## 🚪 API 协议

**统一调用**：`POST /api/{module}`，body `{ action, payload }`。
**统一返回**：`{ code: 0, data } | { code: 4xx/5xx, msg }`。

| Module | 路由 | 状态 |
| --- | --- | --- |
| user | `/api/user` | Phase 1 实现（login 已 stub） |
| sport | `/api/sport` | Phase 2 stub |
| mall | `/api/mall` | Phase 3 stub |
| content | `/api/content` | Phase 3 stub |
| wallet | `/api/wallet` | Phase 4 stub（**当前 requireFeature: 'wallet' 关闭**） |
| admin | `/api/admin` | Phase 3 stub（白名单校验） |

---

## 📦 依赖

- **运行时**：`fastify` `@fastify/*` `@prisma/client` `ioredis` `bullmq` `zod`
- **开发**：`tsx` `vitest` `prisma` `supertest`
- **共享**：`@qm-wx/shared`（workspace 协议）

---

## 🧪 测试

```bash
pnpm test                # 单次跑
pnpm test:watch          # watch
pnpm test:coverage       # 覆盖率
```

测试文件命名 `*.test.ts` / `*.spec.ts`，与被测文件同目录。

---

## 🐳 Docker

```bash
docker build -t qm-wx-server .
docker run -p 3000:3000 --env-file .env qm-wx-server
```

镜像启动时会自动 `prisma migrate deploy`。

---

## 📌 当前状态

- ✅ Fastify 启动骨架（health check OK）
- ✅ 6 个 module 路由 stub（返回 `{ stub: true }`）
- ✅ JWT 鉴权中间件（user module 的 login 标记 public）
- ✅ 功能开关中间件（wallet module 强制 requireFeature）
- ✅ 微信 code2Session 工具（缓存 session_key 到 Redis）
- ✅ Prisma schema（13 张表，对应 02 §4 的所有集合）
- ✅ Dockerfile 多阶段构建
- 🚧 Phase 0 任务 T0-1~6 全部待实施

---

🤙 别改业务，先把骨架跑通。`pnpm dev` 起来看见 `/health: ok` 就是 Phase 0 的第一道门。
