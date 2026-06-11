# 03 重构架构设计 V2（Node + TS 自建后端）

> 项目：青沐生命科技微信小程序
> 文档版本：v2.0 · 2026-06-11
> 状态：✅ 当前权威架构（**02-architecture.md 已废弃**，仅作业务规则参考保留）
> 替代关系：本文件是 02 架构的**完全重写版**，业务闭环不变，技术栈从"微信云开发"改为"Node + TypeScript 自建后端"。

---

## 1. 为何从云开发切到 Node + TS

| 维度 | 云开发（已弃） | Node + TS（当前） |
| --- | --- | --- |
| 运维成本 | 极低（云开发托管） | 中（要 ECS / 备案 / SSL / 监控） |
| 跨端 API | 仅小程序云函数 | 任意客户端（小程序 / Web / OpenAPI） |
| Admin 后台 | 难（云开发控制台粗糙） | 易（独立 Vue/React 后台） |
| 鉴权控制 | 半受控（OPENID 注入） | 全自控（JWT + 微信 code2Session） |
| 长期成本 | 按调用量计费 | 服务器固定成本（可控） |
| 团队技术资产 | 平台绑定 | 通用 Node/TS 资产 |

**结论**：为了**跨端扩展能力 + admin 后台 + 团队技术资产沉淀**，自建后端更合算。代价是首期 devops 工作量上升。

---

## 2. 设计原则

1. **服务端权威**：身份（openid）、积分、余额、订单状态只能由后端产生和变更，前端永远只是展示与发起
2. **能力边界内设计**：不依赖微信未开放的能力（读群消息、向群发消息、抖音发布）
3. **功能开关**：未就绪的模块（钱包、支付、会员购买、智能体）通过后端 `app_config` 表 + 小程序 `feature-gate` 组件远程隐藏
4. **契约先行**：前后端共用 `packages/shared` 的 Zod schema + TS 类型，**禁止**后端一改前端炸
5. **单一数据源**：业务规则（会员权益、积分规则）只在后端定义，前端 `constants.ts` 镜像展示用
6. **KISS / YAGNI / DRY / SOLID**

---

## 3. 总体架构

```
┌─────────────────────── 客户端 ───────────────────────┐
│  apps/miniprogram/  微信小程序（原生 TS）             │
│  apps/admin/         管理后台（二期，Vue3 + Element）  │
│  第三方调用方（小程序 WebView / OpenAPI）              │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS + JSON
                       │ Authorization: Bearer <JWT>
┌──────────────────────▼──────────────────────────────┐
│  apps/server/  Node.js + TypeScript                 │
│  ────────────────────────────────────────────────  │
│  Fastify 4.x  →  6 个 module 路由（action 模式）      │
│  user / sport / mall / content / wallet / admin      │
│  ────────────────────────────────────────────────  │
│  中间件：JWT 鉴权 · wx code2Session · 错误处理         │
│          Zod 校验 · 限流（Redis）· 日志（Pino）       │
│  ────────────────────────────────────────────────  │
│  业务层：6 个 service / repository / domain model     │
│  ────────────────────────────────────────────────  │
│  数据层：Prisma 5.x（PostgreSQL）+ Redis 7 + BullMQ  │
└──────────────────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│  PostgreSQL 16    主库（业务数据）                     │
│  Redis 7          会话 / 限流 / 排行榜                │
│  BullMQ           队列（周报聚合 / 邮件 / 通知）        │
│  对象存储 OSS      商品图 / 头像 / 战报图              │
└──────────────────────────────────────────────────────┘
```

---

## 4. Monorepo 结构

```
QM-WX/
├── pnpm-workspace.yaml          # workspace 定义
├── package.json                 # 根 package（顶层脚本）
├── tsconfig.base.json           # 共享 TS 配置
├── .eslintrc.cjs                # 顶层 lint
├── .prettierrc                  # 顶层格式化
├── .gitignore
├── docs/                        # 设计文档（本文件在此）
├── reviews/                     # 历史评审（02 已废弃）
├── tests/                       # 跨包 E2E（Playwright 之类）
│
├── apps/
│   ├── miniprogram/             # 微信小程序
│   │   ├── miniprogram/         # 实际小程序代码（官方要求 miniprogram/ 入口）
│   │   │   ├── app.{ts,js,json,wxss}
│   │   │   ├── sitemap.json
│   │   │   ├── pages/  components/  services/  utils/  config/
│   │   │   └── images/tabbar/
│   │   ├── project.config.json  # 微信开发者工具配置
│   │   ├── project.private.config.json
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── server/                  # Node + TS 后端
│   │   ├── src/
│   │   │   ├── modules/         # 6 个 module（user/sport/mall/content/wallet/admin）
│   │   │   │   └── user/
│   │   │   │       ├── user.routes.ts
│   │   │   │       ├── user.service.ts
│   │   │   │       ├── user.repository.ts
│   │   │   │       └── user.schema.ts   # Zod
│   │   │   ├── common/          # 中间件 / 工具 / 错误 / 配置
│   │   │   ├── infra/           # Prisma client / Redis / BullMQ
│   │   │   ├── config/          # env 校验（Zod）
│   │   │   └── server.ts        # 启动入口
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   ├── tests/               # Vitest 单元 / 集成
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── admin/                   # 二期管理后台（暂缓）
│
├── packages/
│   ├── shared/                  # 前后端共享
│   │   ├── src/
│   │   │   ├── schemas/         # Zod schemas
│   │   │   ├── types/           # TS 类型（从 Zod 推导）
│   │   │   ├── constants/       # 会员等级 / 商品分类 / 积分规则（与服务端对齐）
│   │   │   └── api-contracts/   # 端点路径常量
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── ui/                      # （二期）小程序与 admin 共用 UI 组件（暂缓）
│
└── scripts/                     # 工程脚本（数据库迁移 / 部署等）
```

> **重要约定**：所有 monorepo 内部引用用 `workspace:*` 协议（pnpm 原生支持）。

---

## 5. apps/server 后端规范

### 5.1 技术栈

| 维度 | 选型 | 备注 |
| --- | --- | --- |
| 框架 | **Fastify 4.x** | schema 驱动、原生 TS、@fastify/jwt |
| 语言 | TypeScript 5.x（strict） | 全栈 TS |
| ORM | **Prisma 5.x** | 迁移 + Studio 都很香 |
| 数据库 | PostgreSQL 16 | JSONB 灵活字段 |
| 缓存 | Redis 7（ioredis 客户端） | 会话、限流、ZSET 榜单 |
| 队列 | BullMQ | 周报聚合 / 邮件 / 通知 |
| 验证 | Zod | Fastify schema 首选 |
| 鉴权 | @fastify/jwt + 微信 `code2Session` | 见 §5.4 |
| 日志 | Pino（Fastify 内置） | 高性能 |
| 测试 | Vitest + supertest | |
| Lint | ESLint + @typescript-eslint + Prettier | |

### 5.2 6 个 Module 的契约

按 02 §7 移植，从 13 个零散云函数合并为 6 个后端 module：

| Module | 路由前缀 | 职责 | 关键 action |
| --- | --- | --- | --- |
| `user` | `/api/user` | 登录/资料/实名/绑定 APP | `login` / `updateProfile` / `bindApps` |
| `sport` | `/api/sport` | 打卡/统计/积分/群 | `checkin` / `myStats` / `createGroup` / `joinGroup` / `quitGroup` / `groupRanking` |
| `mall` | `/api/mall` | 商品/购物车/订单 | `listProducts` / `productDetail` / `createOrder` / `myOrders` / `cancelOrder` |
| `content` | `/api/content` | 赛事/酒店/景区/餐饮/乡村振兴 | `list` / `detail` / `enroll`（仅登记意向） |
| `wallet` | `/api/wallet` | 余额/流水/支付 | `get` / `unifiedOrder` / `transactions`（**开关关闭时 403**） |
| `admin` | `/api/admin` | 内容/商品/配置 | `upsertContent` / `upsertProduct` / `setConfig`（**白名单校验**） |

### 5.3 API 协议

**统一调用**：`POST /api/{module}`，body：

```ts
{ action: string, payload: unknown }
```

**统一返回**：
```ts
{ code: 0, data: T }              // 成功
{ code: 4xx | 5xx, msg: string }  // 失败
```

**Zod 校验**：每个 module 在 `*.schema.ts` 导出 `actionSchema`（Zod discriminated union），Fastify 路由用 `schema: { body: actionSchema }` 自动校验。

### 5.4 鉴权流程

**微信小程序登录**（替代云开发的 OPENID 注入）：

```
小程序端
  wx.login() → code
  → POST /api/user { action: "login", payload: { code, nickname?, avatarUrl? } }

后端
  → 调微信 code2Session: GET https://api.weixin.qq.com/sns/jscode2session
      ?appid=...&secret=...&js_code=...&grant_type=authorization_code
  → 得 openid + session_key
  → users 表 upsert（首登送注册积分）
  → 签发 JWT（access 2h + refresh 30d，refresh 存 Redis）
  → 返回 { user, accessToken, refreshToken, config: { featureFlags, memberLevels, pointsRules } }
```

**鉴权中间件**：

```ts
// common/middleware/auth.ts
fastify.decorateRequest('user', null);
fastify.addHook('onRequest', async (req) => {
  if (req.routeOptions.config?.public) return;
  await req.jwtVerify();   // 验 JWT
  req.user = await userRepo.findByOpenid(req.user.openid);
});
```

**功能开关**：

```ts
// common/middleware/feature-gate.ts
// 从 app_config 表读 feature_flags，按 endpoint 装饰器决定是否 403
```

### 5.5 微信集成工具

`common/integrations/wx/`：

- `code2session.ts` — 调 jscode2session
- `decrypt-phone.ts` — 解密手机号（button open-type="getPhoneNumber"）
- `pay.ts` — 统一下单 / 回调验签 / 退款（详见 [reviews/running-group-stats/05-payment.md](../reviews/running-group-stats/05-payment.md) 业务规则）
- `subscribe-message.ts` — 订阅消息推送
- `accesstoken-cache.ts` — access_token 缓存（Redis 7000s）

---

## 6. 数据库（PostgreSQL schema）

> 移植 02 §4 的云数据库集合为 PostgreSQL 表。**核心原则不变**：所有表写入由后端 service 完成，前端无直连。

| 表 | 对应 02 集合 | 关键字段 | 索引 |
| --- | --- | --- | --- |
| `users` | users | `openid (unique)`, `nickname`, `phone`, `member_level`, `points`, `stats jsonb` | `openid` |
| `checkins` | checkins | `user_id`, `group_id`, `distance`, `duration_sec`, `pace`, `points`, `date` | `(user_id, date)`, `(group_id, date)` |
| `groups` | groups | `opengid`, `name`, `owner_id`, `member_count` | `opengid` |
| `group_members` | group_members | `group_id`, `user_id`, `role`, `joined_at` | `(group_id, user_id) unique` |
| `products` | products | `name`, `category`, `price`, `status` | `category` |
| `orders` | orders | `user_id`, `items jsonb`, `total_amount`, `status`, `payment jsonb` | `(user_id, created_at desc)` |
| `points_records` | points_records | `user_id`, `change`, `type`, `ref_id`, `balance` | `(user_id, created_at desc)` |
| `wallets` | wallets | `user_id`, `balance`, `status` | `user_id unique` |
| `wallet_transactions` | wallet_transactions | `user_id`, `amount`, `type`, `order_id` | `(user_id, created_at desc)` |
| `contents` | contents | `type`, `title`, `detail jsonb`, `status` | `(type, status, sort)` |
| `enrollments` | enrollments | `user_id`, `content_id`, `form_data jsonb`, `status` | `(user_id, content_id)` |
| `app_config` | app_config | `_id (key)`, `value jsonb` | `_id` |
| `group_reports` | (新增) | `group_id`, `period`, `summary jsonb`, `image_url` | `(group_id, period)` |

**权限**：所有表 `REVOKE ALL` 对 `app_user`，仅后端 service 角色有写权限。**前端永不直连 DB**。

---

## 7. apps/miniprogram 小程序

> 沿用 02 §3 目录结构，但去掉云开发假设；后端调用改为 `wx.request` 调自家 API。

```
apps/miniprogram/miniprogram/
├── app.ts          # onLaunch 调 /api/user login；缓存 token
├── app.json        # 4 个 tabBar + 分包
├── app.wxss        # 仅设计变量 + 通用类（< 300 行）
├── sitemap.json
├── config/
│   └── env.ts      # baseUrl 区分 dev/staging/prod
├── utils/
│   ├── auth.ts     # ensureLogin / getUser / logout
│   ├── format.ts   # 配速/距离/日期
│   └── constants.ts
├── services/
│   ├── api.ts      # call(module, action, payload) 唯一封装
│   ├── user.ts  sport.ts  mall.ts  content.ts  wallet.ts
├── components/
│   ├── ranking-list/  product-card/  cell/  empty-state/  feature-gate/
├── pages/
│   ├── index/  sport/  group-detail/
│   ├── mall/  product-detail/  order-confirm/  order-list/
│   ├── mine/  profile/  bind-app/  wallet/  membership/
│   └── content-list/  content-detail/
└── images/tabbar/*.png
```

**与 02 区别**：
- `services/api.js` → `services/api.ts`（TS）
- `wx.cloud.callFunction` → `wx.request` 调 `wx.$api.call('sport', 'checkin', {...})`
- 旧云函数引用（如 `cloudfunctions/save-checkin`）全部删除
- 目录 `statistics → mall / group → sport / settings → mine` 沿用 02 改名映射

---

## 8. packages/shared 共享层

**强制：所有 API 端点的请求/响应类型都在这里定义。**

```
packages/shared/src/
├── schemas/                  # Zod schemas（端点级）
│   ├── user.schema.ts        # LoginInput, UpdateProfileInput, UserOutput
│   ├── sport.schema.ts
│   ├── mall.schema.ts
│   ├── content.schema.ts
│   └── wallet.schema.ts
├── types/                    # 从 Zod 推导的 TS 类型
│   └── index.ts              # z.infer<typeof XxxSchema>
├── constants/                # 枚举
│   ├── member-levels.ts      # 会员等级（与 app_config 镜像）
│   ├── points-rules.ts
│   └── feature-flags.ts
└── api-contracts/            # 端点路径常量
    └── endpoints.ts          # ENDPOINTS.user.login = '/api/user'
```

**导出**：
```ts
// 后端 Fastify schema
import { LoginInputSchema } from '@qm-wx/shared/schemas/user.schema';
fastify.post('/api/user', { schema: { body: LoginInputSchema } }, handler);

// 小程序端
import type { User } from '@qm-wx/shared/types';
import { ENDPOINTS } from '@qm-wx/shared/api-contracts';
const { user } = await api.call<User>(ENDPOINTS.user.login, payload);
```

---

## 9. 鉴权 & 安全

| 风险点 | 措施 |
| --- | --- |
| openid 伪造 | **永远不**信任前端传的 openid；`code2Session` 由后端发起，openid 存 JWT |
| 余额篡改 | balance 字段**永不**接受前端写入；只在支付回调 / 订单扣减时由 service 修改 |
| 积分作弊 | points 字段**永不**接受前端写入；服务端按 `points_rules` 计算 + 写流水 |
| SQL 注入 | Prisma 参数化（不可能注入，但保持习惯） |
| XSS | 小程序天然无 DOM XSS；富文本内容用白名单 sanitizer |
| 限流 | Redis + `@fastify/rate-limit`（按 IP + openid 维度） |
| 越权 | 所有 endpoint 默认 `auth: required`；公开端点显式声明 `auth: public` |
| 日志 | Pino 结构化日志，**禁止**打印 openid / 手机号 / token |

---

## 10. 部署与基础设施

### 10.1 服务器清单（最低起步）

| 资源 | 规格 | 用途 |
| --- | --- | --- |
| ECS (应用) | 2C4G × 1 | apps/server |
| PostgreSQL | RDS 2C4G × 1 | 主库 |
| Redis | 1G × 1 | 缓存 / 队列 |
| 对象存储 OSS | 标准 | 图片 / 文件 |
| CDN | 国内 | 静态资源 + 加速 |
| 域名 + SSL | 1 个一级 + SSL | API 域名（如 `api.qingmu.example`） |
| 备案 | 阿里云 / 腾讯云 | ICP 备案（小程序强制） |

### 10.2 CI / CD

- **GitHub Actions**（推荐） / GitLab CI
- 流程：lint → typecheck → test → build docker → push 镜像 → SSH 部署
- 数据库迁移：`prisma migrate deploy` 在 deploy 步骤里跑

### 10.3 监控

- 日志：Pino → Loki / 阿里云 SLS
- 错误：Sentry（前后端共用）
- 性能：OpenTelemetry → Jaeger / 阿里云 ARMS

### 10.4 微信生态申请清单

- [ ] 微信小程序 AppID（已有 `wx426885831a05f18e`，验证可用性）
- [ ] 商户号（营业执照 + 对公账户，1-5 工作日）
- [ ] JSAPI 支付（关联 AppID）
- [ ] 服务号（可选，用于订阅消息跨场景）
- [ ] 订阅消息模板（周报推送等）
- [ ] ICP 备案

---

## 11. 渐进式迁移（与 04 任务对齐）

| Phase | 04 任务 | V2 后端对应工作 |
| --- | --- | --- |
| **Phase 0** | T0-1~6 | (1) 跑通 pnpm workspace + Fastify "hello world" + Prisma migrate dev 跑通空 schema  (2) 建 `app_config` 表 + `feature_flags` seed  (3) `packages/shared` 初版 + 端点常量  (4) `services/api.ts` 封装 + JWT 中间件 |
| **Phase 1** | T1-1~5 | `user` module 上线（含 `code2Session`、用户 CRUD、白名单） |
| **Phase 2** | T2-1~6 | `sport` module（checkin、群、榜单）+ BullMQ 周报 + 订阅消息 |
| **Phase 3** | T3-1~6 | `mall` + `content` module + admin 基础（录入商品/内容） |
| **Phase 4** | T4-1~5 | `wallet` module + 微信支付接入 + 商户号回调 |
| **Phase 5** | T5-1~5 | 品牌色 / 隐私协议 / 数据库权限复查 / 体验版回归 |

---

## 12. 与 02 架构的对照（废弃说明）

| 02 § | 主题 | V2 变更 |
| --- | --- | --- |
| §2 总体架构 | 6 个云函数 | 6 个 Fastify module（路由分组一致） |
| §3 目录结构 | `miniprogram/` 平铺 | 收到 `apps/miniprogram/miniprogram/`（官方要求） |
| §4 数据库 | 云数据库集合 | PostgreSQL 表（结构同源） |
| §5.1 登录 | `cloud.getWXContext().OPENID` | `wx.login` → `code2Session` → JWT |
| §5.2 跑群 | 同 | 同（业务规则不变） |
| §5.3 打卡积分 | `db.command.inc` 服务端算分 | service 层算分 + Prisma `$transaction` 原子写 |
| §5.4 下单 | 支付开关 | 同（业务规则不变，集成方式从 `cloudPay` 改 `wxpay-axios-plugin`） |
| §6 钱包支付 | 申请清单 | 同（外加 ECS / 备案清单，§10） |
| §7 API 契约 | `wx.cloud.callFunction({action})` | `POST /api/{module} {action, payload}`（路径化方便跨端） |
| §8 工程规范 | 保留 UI 骨架 | 同（UI 仍复用 02 的 WXML 结构） |

**业务规则 100% 沿用 02**，技术实现 100% 重写。

---

## 13. 风险登记（V2 特有）

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 域名备案延期 | 无法上线 API | 提前 1-2 周办理 |
| 首期 devops 成本 | 拖慢 V1 进度 | 阶段 0 不上 K8s，裸跑 Docker Compose |
| 微信支付接入复杂度 | 钱包延期 | V1 仅"积分兑换 + 意向单"，支付开关关闭 |
| 小程序要求 HTTPS | API 必须 HTTPS | 上线前配好 SSL |
| Prisma 迁移风险 | 数据丢失 | 每次迁移备份 + 灰度 |

---

🤙 *架构是骨架，业务是肌肉。两边都不能少。*

详细业务规则仍以 [reviews/running-group-stats/](../reviews/running-group-stats/) 的 01/03/04/05/06/07/08 为准；本文只管"怎么搭起来"。
