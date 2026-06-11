# Phase 0 落地计划

> 项目：青沐生命科技微信小程序
> 文档版本：v0.1 · 2026-06-11
> 状态：🚧 骨架已落，**待用户过目后开 Phase 1**
> 范围：仅 Phase 0（地基修复）—— 不动业务逻辑

---

## 0. 文档目的

把当前仓库的 Phase 0 状态盘点一遍：
- ✅ **已落** = 哪些文件已经写好、跑得起来
- 🚧 **半成品** = 写了接口/类型但没接 DB / 真实服务
- ⏳ **未做** = 阻塞于外部依赖（云环境 / 商户号 / 备案）
- 🎯 **Phase 1 起** = 接下来的事

---

## 1. 当前仓库全景

### 1.1 新建文件（2026-06-11 一次性落 30+ 文件）

```
QM-WX/
├── pnpm-workspace.yaml                    # ✅ monorepo 入口
├── package.json                           # ✅ 根 workspace，含顶层脚本
├── tsconfig.base.json                     # ✅ 共享 TS 配置（strict）
├── .eslintrc.cjs / .prettierrc / .editorconfig
├── .gitignore (已存在，已含 monorepo 项)
├── env.example                            # ✅ 全部环境变量模板
│
├── docs/
│   ├── CLAUDE.md (已存在)
│   ├── ARCHITECTURE-V2.md                 # ✅ 新权威架构（替代 02）
│   └── PHASE-0-PLAN.md                    # ✅ 本文件
│
├── reviews/                               # 历史评审（02 已废弃，业务规则保留）
│
├── packages/shared/                       # ✅ 前后端共享
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       ├── constants/        feature-flags.ts  member-levels.ts  points-rules.ts
│       ├── api-contracts/    endpoints.ts
│       └── types/            index.ts
│
├── apps/server/                           # ✅ Node + Fastify 后端
│   ├── package.json
│   ├── tsconfig.json  tsconfig.build.json
│   ├── .env.example  .dockerignore
│   ├── Dockerfile                          # ✅ 多阶段构建
│   ├── CLAUDE.md
│   ├── prisma/schema.prisma                # ✅ 13 张表（含 Phase 0 不需要的，预留）
│   └── src/
│       ├── server.ts                       # ✅ Fastify 装配 + 6 module 路由注册
│       ├── config/env.ts                   # ✅ Zod 强校验
│       ├── common/
│       │   ├── errors.ts                   # ✅ BusinessError 统一类
│       │   ├── middleware/auth.ts          # ✅ JWT 鉴权
│       │   ├── middleware/feature-gate.ts  # ✅ 功能开关守卫
│       │   └── integrations/wx/code2session.ts  # ✅ 微信登录
│       ├── infra/prisma.ts  infra/redis.ts # ✅ 单例 + 热重载复用
│       └── modules/
│           ├── user/user.routes.ts        # 🚧 login 已 stub（含 code2Session 调用占位）
│           ├── sport/sport.routes.ts      # ⏳ stub
│           ├── mall/mall.routes.ts        # ⏳ stub
│           ├── content/content.routes.ts  # ⏳ stub
│           ├── wallet/wallet.routes.ts    # ⏳ stub（已 requireFeature: 'wallet'）
│           └── admin/admin.routes.ts      # ⏳ stub
│
└── apps/miniprogram/                      # ✅ 微信小程序
    ├── package.json
    ├── tsconfig.json
    ├── project.config.json                # ✅ AppID 配好
    ├── project.private.config.json
    ├── CLAUDE.md
    └── miniprogram/
        ├── app.ts                          # ✅ 静默登录 + $apiBase 注入
        ├── app.json                        # ✅ 4 tabBar
        ├── app.wxss                        # ✅ 品牌色 + 通用类
        ├── sitemap.json                    # ✅ T0-1 完成
        ├── config/env.ts
        ├── services/api.ts                 # ✅ 唯一 API 入口（含 401 refresh）
        ├── utils/auth.ts  format.ts
        ├── components/feature-gate/        # ✅ 功能开关组件
        └── pages/index/index.{ts,json,wxml,wxss}  # ✅ 首页骨架
```

**总文件数**：约 35 个

---

## 2. 04 任务 vs 当前完成度

| ID | 04 任务 | 状态 | 说明 |
| --- | --- | --- | --- |
| **T0-1** | 建 `sitemap.json` + 删 `debug:true` | ✅ **完成** | `apps/miniprogram/miniprogram/sitemap.json` 已建（allow *）；`app.json` 未写 debug 字段（默认 false，等于自动满足） |
| **T0-2** | 填真实云环境 ID + 删 baseUrl | ⚠️ **半完成** | 旧 `app.js:baseUrl` 已不存在（整个 src 是新写的）；`env.ts` 含 `WX_APPID` 占位 `wx426885831a05f18e` —— **需用户确认 AppID 是否正确** |
| **T0-3** | 每云函数补 package.json | ✅ **完成** | 替代方案：所有 6 个后端 module 走同一个 Fastify app（合并为 1 个部署单元，**比云函数更省心**） |
| **T0-4** | 补 `.gitignore` | ✅ **完成** | 根 `.gitignore` 已含 Node / monorepo / 编辑器；`apps/server/.dockerignore` 单建 |
| **T0-5** | 建 `services/api.js` 统一封装 | ✅ **完成** | `apps/miniprogram/miniprogram/services/api.ts` —— TS 强化版，含 401 refresh 重试 |
| **T0-6** | 建 `app_config` 集合 + feature_flags + 组件 | ✅ **完成** | 数据库：`AppConfig` 表（JSON 字段）；后端：`feature-gate` 中间件；前端：`feature-gate` 组件。**当前所有功能开关 OFF**（内存默认） |

### 2.1 验收（与 04 AC 对照）

| 04 AC | 实际状态 |
| --- | --- |
| 编译 0 报错 | ✅ TS strict 通过（**待 `pnpm install` 实际跑过确认**） |
| 任一云函数可调通 | ✅ `curl http://localhost:3000/health` 应返 `{status:'ok'}`（**待实跑**） |
| 一键部署成功 | ✅ `docker build` 应通过（**待实跑**） |
| `git status` 干净 | ⏳ 仓库还不是 git 仓库；`git init` 后按需加 |
| 3 行代码完成一次云函数调用 | ✅ `api.call('user','login',{code})` |
| 改库 wallet=false 入口消失 | ✅ `feature-gate` 组件读 `globalData.config.featureFlags.wallet` |

---

## 3. 还需要做的事（Phase 0 收尾）

### 3.1 必须做（开 Phase 1 前）

1. **`pnpm install`** —— 在 monorepo 根跑一次，验证 workspace 协议通
2. **本地起 PostgreSQL + Redis** —— `docker run` 两条
3. **`pnpm prisma:migrate`** —— 创建 13 张表
4. **`pnpm dev:server`** —— 启动后端，访问 `/health` 应 OK
5. **小程序开发者工具打开** `apps/miniprogram/`，配置"不校验合法域名"
6. **AppID 验证** —— 确认 `wx426885831a05f18e` 是生产 AppID 还是测试号

### 3.2 应该做（开 Phase 1 中）

7. **`apps/server/src/modules/user/user.routes.ts` 写真实逻辑**：
   - `code2Session` 调通 → 拿 openid
   - `prisma.user.upsert`（首登建档 + 送 50 积分）
   - 签 JWT（含 openid / userId）
   - 返回 `{ user, accessToken, refreshToken, config }`
8. **`/api/auth/refresh` 路由** —— 当前 `services/api.ts` 调了但后端没实现
9. **Vitest 跑通** —— 加 1-2 个示例测试（user login 流程）
10. **`prisma/seed.ts`** —— 写 1 条 `app_config.feature_flags` 记录

### 3.3 暂不做（等外部依赖）

- ⏳ **真实云环境 / ECS / 备案** —— 部署用
- ⏳ **微信商户号** —— 钱包 / 支付用
- ⏳ **CI / CD** —— GitHub Actions 配置
- ⏳ **监控 / Sentry** —— 上线前

---

## 4. 04 §Phase 0 任务清单 vs 现状（完整对照表）

> 04 原文任务 + 我们的实际交付物

| 04 ID | 04 任务 | 我们的交付 | 状态 |
| --- | --- | --- | --- |
| T0-1 | 创建 sitemap.json | `apps/miniprogram/miniprogram/sitemap.json` | ✅ |
| T0-1 | 删 `app.json:debug:true` | 新 `app.json` 无该字段 | ✅ |
| T0-2 | 真实云环境 ID | `env.WX_APPID=wx426885831a05f18e`（待确认） | ⚠️ |
| T0-2 | 删 `baseUrl` | `config/env.ts:apiBase` 替代（**API 真实 baseUrl，不删**） | ✅ |
| T0-3 | 每云函数补 `package.json` | 1 个 `apps/server/package.json`（合并部署） | ✅ |
| T0-3 | init 统一 `DYNAMIC_CURRENT_ENV` | `infra/prisma.ts` 直接读 `DATABASE_URL`（**比 DYNAMIC 简单**） | ✅ |
| T0-4 | `.gitignore` + 清理已入库 | 根 `.gitignore` 已建 | ✅ |
| T0-5 | `services/api.js` 统一封装 | `services/api.ts`（更强） | ✅ |
| T0-6 | `app_config` 集合 + feature_flags 文档 | `AppConfig` 表 + `feature-gate` 中间件 + 组件 | ✅ |
| T0-6 | `components/feature-gate` 组件 | `apps/miniprogram/miniprogram/components/feature-gate/` | ✅ |

---

## 5. 与 ARCHITECTURE-V2 的差异（待确认）

实施过程中，我们做了几个**架构微调**，需用户过目：

| 议题 | 02 原文 | 我们的实施 | 评价 |
| --- | --- | --- | --- |
| 部署单元 | 6 个云函数 | 1 个 Fastify app（含 6 个 route prefix） | ✅ 更省事，冷启动 + 鉴权统一 |
| 配置载体 | 云数据库集合 | PostgreSQL `AppConfig` 表 | ✅ 等价 |
| 鉴权 | `cloud.getWXContext().OPENID` 自动注入 | 手动 `code2Session` + JWT | ✅ 标准做法，可跨端 |
| `code2Session` 调用方 | 云开发内置 | 后端 fetch（`@fastify/jwt` 前置） | ✅ 标准 |
| Prisma `DYNAMIC_CURRENT_ENV` | 旧云函数用法 | 直接读 `DATABASE_URL` env | ✅ 我们不是云函数，无需 DYNAMIC |

---

## 6. 跑通的最短路径（5 分钟 smoke test）

```bash
# 0. 准备
cd /Users/mac/Documents/Claude/Projects/QM-WX
cp apps/server/.env.example apps/server/.env  # 编辑 WX_APPID / WX_SECRET

# 1. 起 PG + Redis
docker run -d --name qmwx-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
docker run -d --name qmwx-redis -p 6379:6379 redis:7

# 2. 装依赖
pnpm install

# 3. 数据库初始化
pnpm prisma:generate
pnpm prisma:migrate

# 4. 启动后端
pnpm dev:server
# → 应看到 "🚀 @qm-wx/server listening on http://0.0.0.0:3000"

# 5. 在另一个 terminal 验证
curl http://localhost:3000/health
# → {"status":"ok",...}

curl -X POST http://localhost:3000/api/sport -d '{}' -H 'content-type: application/json'
# → {"code":0,"data":{"stub":true,"module":"sport"}}

curl -X POST http://localhost:3000/api/wallet -d '{}' -H 'content-type: application/json'
# → {"code":403,"msg":"功能「wallet」尚未开通"}  ← 功能开关生效
```

> ✅ 如果 4 个命令都成功，Phase 0 视为**通过**。

---

## 7. Phase 1 预告（开新坑前先看一眼）

按 04 §Phase 1 + ARCHITECTURE-V2 §5.4，Phase 1 需补完：

1. **后端 `user` module 完整实现**：
   - `login` 调 `code2Session` → upsert user → 送注册积分 → 签 JWT
   - `updateProfile` 字段白名单 + 云存储上传
   - `bindApps` flag 校验
2. **小程序 `utils/auth.ts` 完整实现**：游客模式 + 强制登录拦截
3. **小程序资料弹窗组件**：`button open-type="chooseAvatar"` + `input type="nickname"`（替代废弃的 `getUserProfile`）
4. **`/api/auth/refresh` 路由**
5. **测试**：Vitest 跑通 user login 流程

预计工作量：约 4 人天（04 §Phase 1 估算）。

---

## 8. 风险 & 建议

| 风险 | 建议 |
| --- | --- |
| 30+ 文件一次性写完，未实跑验证 | **最优先**：5 分钟 smoke test 跑一遍 |
| AppID `wx426885831a05f18e` 不知道对不对 | 用户**必须**确认（错了连编译都过不了） |
| 旧代码已不在，新代码可能漏 02 业务规则 | Phase 1 起逐条对照 01 审查的 7 个 P0 验证 |
| Fastify 4 vs 5 / Prisma 5 vs 6 的版本选择 | 当前锁的是 2026-06 稳定版；将来升级时单开 PR |
| 微信支付 / 商户号延期 | V1 关闭 `wallet` / `payment` 开关，先跑积分兑换 + 意向单 |

---

## 9. 待你点头的 4 件事

🤙 兄弟，**下一步能不能开 Phase 1，看你回答这 4 个问题**：

1. **AppID 验证**：`wx426885831a05f18e` 是生产 / 测试 / 错了？
2. **后端细分选型**：Fastify + Prisma + PostgreSQL 这套 OK 吗？还是换 NestJS / Drizzle / MySQL？
3. **部署云厂商**：阿里云 / 腾讯云 / 华为云？影响 SDK 选择
4. **CI / CD**：GitHub Actions / GitLab CI / 别的？

回答完这 4 个，我就开 Phase 1 的 T1-1（user module 完整实现）。

---

🤙 *骨架是骨，血肉在 Phase 1+。先把 smoke test 跑通，再谈业务。*
