# apps/server — 后端服务

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../CLAUDE.md) → **apps/server/**（这里）
> 架构依据：[docs/ARCHITECTURE-V2.md](../../docs/ARCHITECTURE-V2.md)
> 最新进展：**V0.1.x Cache 10 热路径 + OpenAPI 3.1 契约**（2026-06-17）— Phase 4.1 微信支付完整闭环（2026-06-14）

---

## 🎯 职责

Node.js + TypeScript 后端（Fastify 4），对外提供 **14 个 module** + **domain 层** + **jobs** + **CLI 工具**。
**唯一权威**：openid、积分、余额、订单状态、微信支付回调都在这里产生和变更。

---

## 🏃 快速上手

```bash
# 1. 装依赖（monorepo 根）
cd ../.. && pnpm install

# 2. 起 PostgreSQL + Redis（推荐 docker compose）
docker compose up -d

# 3. 准备环境变量
cp .env.example .env
# 编辑 .env，至少填 DATABASE_URL / REDIS_URL / JWT_SECRET / WX_APPID / WX_SECRET
# 沙箱可空 WX_MCH_*；真生产必填（见 docs/PHASE-4-2-PREP.md）

# 4. 初始化数据库
pnpm prisma:generate
pnpm prisma:migrate

# 5. 跑起来
pnpm dev
# 访问 http://localhost:3000/health 应返回 { status: 'ok', uptime, env, timestamp }
```

---

## 📂 目录结构

```
apps/server/
├── src/
│   ├── app.ts                        # buildApp() — Fastify 装配（无 listen，无 jobs）
│   ├── server.ts                     # 启动入口（buildApp + listen + BullMQ + 优雅关闭）
│   ├── config/
│   │   └── env.ts                    # 环境变量 Zod 校验（含 WX_MCH_* 6 字段）
│   ├── common/
│   │   ├── errors.ts                 # BusinessError 统一类
│   │   ├── logger.ts                 # Pino 日志封装
│   │   ├── openapi-spec.ts           # OpenAPI 3.1 spec（V0.1.4/13，/openapi.json）
│   │   ├── docs.ts                   # API 文档辅助
│   │   ├── middleware/
│   │   │   ├── auth.ts               # JWT 鉴权插件（public 路由跳过）+ requireLogin helper
│   │   │   └── feature-gate.ts       # 功能开关守卫（requireFeature）
│   │   └── integrations/wx/
│   │       └── code2session.ts       # 微信 code2Session（session_key 缓存 Redis）
│   ├── infra/
│   │   ├── prisma.ts                 # PrismaClient 单例
│   │   ├── redis.ts                  # ioredis 单例
│   │   └── cache.ts                  # Cache.wrap 抽象（V0.1.x，接入 10 热路径）
│   ├── domain/                       # 跨 module 业务规则（Phase 4.1）
│   │   └── order-state.ts            # Order 状态机：7 态 + TRANSITIONS 白名单 + assertTransition
│   ├── modules/                      # 14 个业务 module（见下方详表）
│   │   └── ...（11 V1 + wxpay + 3 V2 stub）
│   ├── jobs/                         # BullMQ 定时任务
│   │   ├── queue.ts                  # startJobs / stopJobs / enqueueCloseOrder
│   │   ├── scheduler.ts              # BullMQ repeatable（cron）
│   │   ├── weekly-report.job.ts      # 每周日 20:00 聚合周报
│   │   ├── close-order.job.ts        # 30 分钟超时关单（Phase 4.1）
│   │   └── refresh-certs.job.ts      # 微信平台证书定时刷新（V0.1.1）
│   └── ...（refund.service / wallet.repo 内部）
├── scripts/                          # CLI 工具（Phase 4.1）
│   └── reconcile.ts                  # `pnpm reconcile -- YYYY-MM-DD` 微信账单比对
├── prisma/
│   ├── schema.prisma                 # 22 张表（V1 12 + V2 10）
│   │                                # Order 表加 4 字段：payChannel / prepayId / wxTransactionId / paidAt
│   ├── seed.ts                       # 初始数据（feature_flags 等）
│   ├── sql/permissions.sql           # 角色权限参考
│   └── migrations/                   # Prisma 迁移历史
├── tests/
│   ├── modules/                      # 单元测试（vi.mock Prisma/Redis）— 42 files / 365 tests
│   │   ├── user/sport/mall/content/wallet/weekly-report/admin/app-config...
│   │   ├── wxpay/{service,notify}.test.ts          (8 tests)
│   │   ├── mall/{order,refund}.service.test.ts     (14 tests)
│   │   ├── wallet/{service,repo}.test.ts            (12 tests)
│   │   ├── jobs/{queue,close-order.job}.test.ts     (15 tests)
│   │   ├── domain/order-state.test.ts               (20 tests)
│   │   └── ...（V2 stub / 公共模块）
│   ├── e2e/                          # 端到端测试（真 PG/Redis, RUN_E2E=1）— 37 e2e / 7 files
│   │   ├── sport-flow.e2e.test.ts        (3 tests)
│   │   ├── weekly-report.e2e.test.ts     (2 tests)
│   │   ├── mall-flow.e2e.test.ts         (3 tests) — 已适配 V1 状态机收紧
│   │   ├── wxpay-notify.e2e.test.ts      (2 tests) — notify + 幂等
│   │   ├── refund-flow.e2e.test.ts       (3 tests) — Phase 4.1
│   │   ├── close-order.e2e.test.ts       (5 tests) — Phase 4.1
│   │   └── openapi.e2e.test.ts           (19 tests) — OpenAPI 3.1 spec CI gate（V0.1.4/13）
│   ├── helpers/                      # 测试基建（方案 B 引入）
│   │   ├── mockErrors.ts             # BusinessError mock 工厂
│   │   ├── mockPrisma.ts             # createPrismaMock 工厂（models + txModels）
│   │   └── README.md                 # Redis mock 分层约定
│   └── fixtures/                     # 测试 fixtures（user/product/order/group）
├── Dockerfile                        # 多阶段构建（deps → build → runner）
├── vitest.config.ts                  # alias src/xxx.js → ./src/xxx.ts
├── tsconfig.json                     # 开发用（含 sourceMap）
├── tsconfig.build.json               # 构建用（rootDir="src", paths → dist）
└── .env.example                      # 环境变量模板（含 WX_MCH_* 6 字段 + WX_REFUND_NOTIFY_URL）
```

---

## 🚪 API 协议

**统一前缀**：`/api/{module}`
**RESTful action**：各 module 自定义 action 路由（POST body 含 action/payload，或 REST path）。
**统一返回**：`{ code: 0, data } | { code: 4xx/5xx, msg }`。
**鉴权**：除 `config.public: true` 路由外，全部需 JWT Bearer token。

### 14 个 Module 清单（V1 11 + V2 3）

| Module | 路由前缀 | Service | Schema | 测试 | 状态 |
| --- | --- | --- | --- | --- | --- |
| **auth** | `/api/auth` | — (route 内联) | — | — | ✅ 微信登录 + code2Session |
| **user** | `/api/user` | ✅ 150 行 | ✅ 83 行 | 3 单元 | ✅ login + profile + update |
| **sport** | `/api/sport` | ✅ 311 行 | ✅ 72 行 | 12 单元 + 3 e2e | ✅ 打卡/统计/群榜单/建群 |
| **mall** | `/api/mall` | ✅ 88 行 + refund.service 116 行 | ✅ 64 行 | 7 单元 + 1 e2e | ✅ 商品列表/分类/下单/取消 + 退款 |
| **content** | `/api/content` | ✅ 93 行 | ✅ 36 行 | 8 单元 | ✅ 内容列表/详情/报名（公开） |
| **wallet** | `/api/wallet` | ✅ 114 行 + wallet.repo 64 行 | ✅ 29 行 | 12 单元 | ✅ 余额/充值/消费/退款 + ensureWalletInTx |
| **weekly-report** | `/api/weekly-report` | ✅ 185 行 | ✅ 14 行 | 2 e2e | ✅ 周报聚合 + BullMQ 定时 |
| **upload** | `/api/upload` | — (route 内联) | — | — | ✅ 文件上传（@fastify/multipart） |
| **admin** | `/api/admin` | ✅ 250 行（含 refundOrder） | — | — | ✅ 白名单校验 + 商品/内容/订单/配置/退款管理 + 缓存失效 |
| **app-config** | (内嵌) | — | — | — | ✅ AppConfig 表 + 功能开关 |
| **wxpay** | `/api/wxpay` | ✅ 350 行（含 refund / queryBill / downloadBill） | ✅ 80 行 | 8 单元 + 2 e2e | ✅ **Phase 4 + 4.1** 微信支付 V3 完整闭环 |
| **device** | `/api/device` | ✅ 66 行 | ✅ 39 行 | 7 路由层 | 🚧 V2 stub — 设备绑定 |
| **recipe** | `/api/recipe` | ✅ 66 行 | ✅ 67 行 | 7 路由层 | 🚧 V2 stub — 菜谱 |
| **ludong** | `/api/ludong` | ✅ 57 行 | ✅ 45 行 | 6 路由层 | 🚧 V2 stub — 律动对接 |

### 数据库表（22 张）

| # | 表名 | Module | V1/V2 |
|---|--- |--- |--- |
| 1 | User | user | V1 |
| 2 | Checkin | sport | V1 |
| 3 | Group / GroupMember | sport | V1 |
| 4 | Product | mall | V1 |
| 5 | Order / OrderItem | mall | V1 |
| 6 | PointsRecord | wallet | V1 |
| 7 | Wallet / WalletTransaction | wallet | V1 |
| 8 | Content / Enrollment | content | V1 |
| 9 | AppConfig | app-config | V1 |
| 10 | GroupReport | weekly-report | V1 |
| 11 | DeviceBinding | device | V2 |
| 12 | RawActivity | device | V2 |
| 13 | Recipe | recipe | V2 |
| 14 | FoodCache | recipe | V2 |
| 15 | Meal | recipe | V2 |
| 16 | IdMapping | ludong | V2 |
| 17 | SyncOutbox | ludong | V2 |
| 18 | InboundEvent | ludong | V2 |

---

## 📦 依赖

- **运行时**：`fastify@4` `@fastify/cors` `@fastify/helmet` `@fastify/jwt` `@fastify/multipart` `@fastify/rate-limit` `@fastify/static` `@prisma/client` `ioredis` `bullmq` `zod` `dotenv` `pino-pretty`
- **开发**：`tsx` `vitest` `@vitest/coverage-v8` `prisma` `supertest` `typescript`
- **共享**：`@qm-wx/shared`（workspace 协议）

---

## 🧪 测试

```bash
# 单元测试（vi.mock，不连 DB）— 365 passed（42 files）
pnpm test

# 端到端（真 PG/Redis）— 402 passed（365 单元 + 37 e2e / 7 files）
RUN_E2E=1 pnpm test

# 覆盖率
pnpm test:coverage                 # v8 provider → html/lcov
```

**测试策略**：
- **单元测试**（`tests/modules/*.test.ts`）：vi.mock Prisma/Redis，跑得快
- **域测试**（`tests/domain/*.test.ts`）：纯函数 + 状态机白名单
- **E2E 测试**（`tests/e2e/*.e2e.test.ts`）：用 `buildApp()` + supertest inject，跑真 PG/Redis
- **`RUN_E2E=1` 环境变量**控制 e2e 启停（默认 skip，CI 启用）
- **`tests/helpers/{mockErrors,mockPrisma}.ts`**（方案 B 引入）：统一 mock 工厂
- **`tests/fixtures/{user,product,order,group}.fixture.ts`**：makeX() 工厂模式

**关键设计模式**：
- `buildApp()`（`app.ts`）：抽离装配逻辑，e2e 复用路由注册，避开 listen + jobs
- `parseOrBadRequest`（`sport.routes.ts`）：inline try/catch 把 ZodError 转 BusinessError（fastify 4 的 setErrorHandler 在 inject 模式不可靠）

---

## 🐳 Docker

```bash
# 构建
docker build -t qm-wx-server .

# 运行（通过 docker compose）
docker compose --profile prod up -d --build

# 或独立运行
docker run -p 3000:3000 --env-file .env qm-wx-server
```

镜像启动时会自动 `prisma migrate deploy`（Dockerfile CMD）。

---

## 📌 当前状态

- ✅ Fastify 启动 + 优雅关闭（SIGINT/SIGTERM）
- ✅ **14** 个 module 路由（**11** 个有 service 实现 + 3 V2 stub）
  - **Phase 4.1 新加**：wxpay（V3 完整闭环，含 refund / queryBill / downloadBill）
- ✅ JWT 鉴权 + 功能开关中间件 + 公开端点（content/mall/wxpay）
- ✅ 微信 code2Session（session_key 缓存 Redis）
- ✅ Prisma 22 张表 + 迁移（Order 加 4 字段：payChannel / prepayId / wxTransactionId / paidAt）
- ✅ **Domain 层**：order-state 状态机（7 态 + TRANSITIONS 白名单 + assertTransition 5 处替换）
- ✅ **BullMQ jobs**：周报（每周日 20:00）+ **超时关单（30min delayed，Phase 4.1）**
- ✅ **Wallet repo**：ensureWallet / ensureWalletInTx 复用入口
- ✅ **CLI**：`pnpm reconcile -- YYYY-MM-DD` 微信账单比对（5 类 diff + 退出码 0/1/2）
- ✅ Dockerfile 多阶段构建
- ✅ **402** 测试（365 单元 + 37 e2e）/ 覆盖 88%+
- ✅ CI/CD（GitHub Actions ci.yml + deploy-staging.yml，拆 5 parallel job）
- ✅ **wxpay** refund + notify + 幂等 + 关单保护全链路
- ✅ **缓存基础设施**（V0.1.x）：`infra/cache.ts` Cache.wrap 接入 10 热路径（sport/mall/content/user/weekly-report）
- ✅ **OpenAPI 3.1 spec**（V0.1.4/13）：`/openapi.json` + `openapi.e2e` CI gate（9 paths + 5 schemas）
- ✅ 切真生产文档（[`docs/PHASE-4-2-PREP.md`](../../docs/PHASE-4-2-PREP.md)）

---

🤙 `pnpm dev` 起来看见 `/health: ok` 就是活着的。Phase 4.1 完整闭环已落，等外部依赖切真。
