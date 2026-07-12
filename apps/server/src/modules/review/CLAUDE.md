# review module — 评价系统（电商闭环最后一块）

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../../../CLAUDE.md) → [`apps/server/`](../../../CLAUDE.md) → [`modules/`](../) → **review/**（这里）
> 父级：[apps/server CLAUDE.md](../../../CLAUDE.md) | 同级：[mall](../../mall/) / [cart](../cart/) / [address](../address/) / [coupon](../coupon/) / [order](../../mall/refund.service.ts)

> 引入版本：**V0.1.113**（2026-07-10，电商闭环最后一块）
> 相关：评价回复 `addReviewReply` admin action + Reply 表（V0.1.118）

---

## 🎯 模块职责

**评价系统**：用户对**已购买**商品评价（rating 1-5 + content + images），聚合评分统计与个人评价管理。补齐「下单→支付→收货→评价」电商闭环第 4 步（订单→评价）。

- **数据来源**：`Review` 表（`@@unique([userId, productId, orderId])` 三元组防重，onDelete Cascade）+ `User.reviews` + `Product.reviews` + `Order.reviews` 关系
- **关键校验链** `create`（5 步，缺一不可）：
  1. 订单存在（`prisma.order.findUnique`）
  2. 订单属于当前用户（`order.userId === userId`，防越权）
  3. 订单 status ∈ `{paid, shipped, done}`（已支付才能评，pending_pay / cancelled / refunded 拒绝）
  4. 商品在订单内（`prisma.orderItem.findFirst({where: {orderId, productId}}` 防评价未购买商品）
  5. 防重（`@@unique` 兜底 + 提前查友好报错「已评价过该商品」）
- **评分聚合 `productStats`**：
  - `aggregate avg(rating)` → `avg`（保留 1 位小数）
  - `count(rating)` → `total`
  - `groupBy({by: 'rating'})` → 1~5 星分布 Map，**缺星补 0**（避免前端 `undefined`，前端直接 `stats.distribution[1]` 取值）
- **鉴权**：`remove` 仅本人（`review.userId === userId`，否则 forbidden）

---

## 🚪 入口与启动

| 文件 | 职责 | 行数 |
| --- | --- | ---: |
| `review.routes.ts` | POST `/api/review`（统一 switch action） | 49 |
| `review.service.ts` | 5 action（create/listByProduct/productStats/myReviews/remove）+ 校验链 | 158 |
| `review.schema.ts` | Zod schemas（CreateReview / ProductReviewList / ProductId / ReviewPage / ReviewId） | 41 |

注册：`src/app.ts` 内 `app.register(reviewRoutes, { prefix: '/api/review' })`

---

## 📡 对外接口（5 action）

> 统一 POST `/api/review` body：`{ action, payload }`，需 JWT 鉴权（req.user.id 取 userId）

| action | payload | 返回（data） | 说明 |
| --- | --- | --- | --- |
| `create` | `{ productId, orderId, rating(1-5), content?, images? }` | `{ id }` | 创建评价；走 5 步校验链；rating 范围 1-5（z.number().int().min(1).max(5)） |
| `list` | `{ productId, page?, pageSize? }` | `{ list, total, page, pageSize }` | 商品评价列表（含 user 头像/昵称）；分页 |
| `stats` | `{ productId }` | `{ productId, avg, total, distribution: {1: n, 2: n, 3: n, 4: n, 5: n} }` | 商品评分汇总（avg + 1-5 星分布，**缺星补 0**）|
| `myReviews` | `{ page?, pageSize? }` | `{ list, total, ... }` | 我的评价列表（含 product 概览） |
| `remove` | `{ id }` | `{ ok }` | 删除评价（**鉴权：仅本人**，否则 forbidden） |

---

## 📊 数据模型

| 表 | 关键字段 | 说明 |
| --- | --- | --- |
| **Review** | `userId` + `productId` + `orderId` + `rating`(Int 1-5) + `content?`(String) + `images[]`(String[]) + `createdAt` + `updatedAt` | 三元组 `@@unique([userId, productId, orderId])` 防重；索引 `[productId, createdAt]` + `[userId, createdAt]`（商品评价列表 + 我的评价列表走索引避免全表扫描） |
| **Reply**（V0.1.118） | `reviewId` + `adminOpenid` + `content` + `createdAt` | admin 评价回复（Review 1:N Reply，cascade delete） |

**User / Product / Order 加 relation**：`reviews Review[]`（V0.1.113）

---

## 🔗 集成点

### 前端用户旅程
1. **下单**：`mall.createOrder` 创建 Order / OrderItem（V0.1.22）
2. **支付**：wxpay.notify paid → Order status=paid + 钱包入账（如有）（V0.1.13）
3. **收货**：admin/shop 改 status=done 或用户点击「确认收货」（待 V0.1.132+）
4. **评价**：order-list done/paid/shipped 商品「去评价」入口 → pages/review-publish 选星 → review.create

### mall 入口联动（前端）
- `order-list` 商品 card 状态 ∈ {paid, shipped, done} 显示「去评价」按钮，navigateTo `/pages/review-publish/index?productId=...&orderId=...&productName=...`
- `pages/review-publish` 选星 1-5 + content 500 字 + images 最多 9 张（chooseMedia → uploadFile 持久化到后端），提交 review.create
- `product-detail` 评价段：loadReviews 并行调 `review.stats`（汇总 avg/count） + `review.list`（前 3 条预览），暂无评价兜底「暂无评价」

### admin 评价管理（V0.1.123）
- `admin.listReviews`（schema/service/routes，评价管理查所有评价）
- `admin.addReviewReply`（V0.1.118，admin 回复评价 — `Reply` 表，cascade）
- qm-admin 评价管理页支撑

---

## 🧪 测试

`tests/modules/review/`（V0.1.113）：
- `review.service.test.ts` — **14 单元测试**
- `review.routes.test.ts` — **7 路由单测**

| describe | 用例数 | 覆盖点 |
| --- | ---: | --- |
| `create` | 5 | 订单不存在 notFound / 订单不属于 forbidden / 订单未支付 badRequest / 商品不在订单 badRequest / 已评价防重 badRequest |
| `listByProduct` | 1 | 含 user 头像/昵称 |
| `productStats` | 3 | 基础 avg/count + 5 星满贯 + 缺星补 0（含 groupBy mock） |
| `myReviews` | 2 | 分页 |
| `remove` | 3 | 不存在 notFound / 他人 forbidden / 本人成功 |

**mock 策略**：`vi.mock('src/infra/prisma.js')`，不连 DB

---

## 🔧 关键依赖与配置

- **Prisma 表**：1 张（Review，V0.1.118 +Reply = 2 张）+ User/Product/Order 加 relation
- **依赖**：`mall`（订单状态校验）/ `common/errors`（notFound/forbidden/badRequest）
- **常量**：`REVIEWABLE_ORDER_STATUS = ['paid', 'shipped', 'done']`（与 Phase 4.1 状态机一致）
- **权限**：本模块不开放 public，需 JWT 鉴权
- **规则**：rating 范围严格 1-5（z.number().int().min(1).max(5)，前端 5 星 picker 范围对齐）
- **缺星补 0 范式**：避免前端 `undefined` → `stats.distribution[1]` 直接取值，UX 一致

---

## 📌 常见问题 (FAQ)

**Q：订单取消后还能评吗？**
A：不能。`REVIEWABLE_ORDER_STATUS` 限定 paid/shipped/done，cancelled / refunded 直接 badRequest。

**Q：能评未购买的商品吗？**
A：不能。第 4 步校验「商品在订单内」，未购买的 productId → badRequest。

**Q：能重复评价吗？**
A：不能。`@@unique([userId, productId, orderId])` 兜底，第 5 步提前查友好报错「已评价过该商品」。

**Q：1 个订单有 N 个商品，每个都能评吗？**
A：能。每个商品独立 `@@unique`，订单多商品 = 多次评价（每个商品 1 次）。

**Q：rating 0 或 6 能保存吗？**
A：不能。Zod schema 严格 1-5。

**Q：images 字段有什么限制？**
A：后端无限制（数组）；前端 9 张上限（参考电商 UX）。内容存 OSS/本地的 URL 列表。

**Q：admin 回复评价存在哪？**
A：`Reply` 表（V0.1.118），`admin.addReviewReply` action，Review 删除级联 Reply。

---

## 📁 相关文件清单

```
src/modules/review/
├── review.routes.ts            # POST /api/review（5 action switch）
├── review.service.ts           # 5 action + 5 校验链 + groupBy 缺星补 0
├── review.schema.ts            # Zod schemas
└── CLAUDE.md                   # 本文件

tests/modules/review/
├── review.service.test.ts      # 14 单元测试
└── review.routes.test.ts       # 7 路由单测

# 集成点（外部 module）
src/modules/admin/admin.service.ts   # V0.1.118 addReviewReply + V0.1.123 listReviews
src/modules/mall/order.service.ts    # Order status 校验源（REVIEWABLE_ORDER_STATUS 一致）

# Prisma
prisma/schema.prisma                       # Review / Reply 模型
prisma/migrations/20260710050000_review/          # V0.1.113 建表 SQL
prisma/migrations/20260710060000_review_reply/   # V0.1.118 +Reply
```

---

## 📝 变更记录 (Changelog)

- **2026-07-10** — 创建（V0.1.113 电商闭环最后一块）：Review 表 + 5 action + 5 校验链 + groupBy 缺星补 0 + 14 service 单测 + 7 route 单测
- **2026-07-11** — V0.1.118 +Reply 表 + admin.addReviewReply + Review 1:N Reply cascade（评价回复功能）
- **2026-07-11** — V0.1.123 admin.listReviews action（qm-admin 评价管理页支撑）
