# review module — 评价系统（电商闭环最后一块 + V0.1.137 鞋评双分发）

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../../../CLAUDE.md) → [`apps/server/`](../../../CLAUDE.md) → [`modules/`](../) → **review/**（这里）
> 父级：[apps/server CLAUDE.md](../../../CLAUDE.md) | 同级：[mall](../../mall/) / [cart](../cart/) / [address](../address/) / [coupon](../coupon/) / [order](../../mall/refund.service.ts) / [shoes](../shoes/)（V0.1.137 鞋评关联）

> 引入版本：**V0.1.113**（2026-07-10，电商闭环最后一块）+ **V0.1.118** +replyContent/repliedAt 字段（**非 Reply 表**）+ **V0.1.123** admin listReviews + **V0.1.137** 鞋评双分发

---

## 🎯 模块职责

**评价系统**：用户对**已购买商品**评价（rating 1-5 + content + images）+ **V0.1.137 扩展：跑鞋评价**（合成 productId=shoe:${shoeId} 绕过三元组约束）。聚合评分统计与个人评价管理。补齐「下单→支付→收货→评价」电商闭环第 4 步（订单→评价）。

- **数据来源**：`Review` 表（`@@unique([userId, productId, orderId])` 三元组防重，onDelete Cascade）+ `User.reviews` + `Product.reviews` + `Order.reviews` 关系
- **关键校验链** `create`（5 步，缺一不可）：
  1. 订单存在（`prisma.order.findUnique`）
  2. 订单属于当前用户（`order.userId === userId`，防越权）
  3. 订单 status ∈ `{paid, shipped, done}`（已支付才能评，pending_pay / cancelled / refunded 拒绝）
  4. 商品在订单内（`prisma.orderItem.findFirst({where: {orderId, productId}})` 防评价未购买商品）
  5. 防重（`@@unique` 兜底 + 提前查友好报错「已评价过该商品」）
- **评分聚合 `productStats`**：
  - `aggregate avg(rating)` → `avg`（保留 1 位小数）
  - `count(rating)` → `total`
  - `groupBy({by: 'rating'})` → 1~5 星分布 Map，**缺星补 0**（避免前端 `undefined`）
- **鉴权**：`remove` 仅本人（`review.userId === userId`，否则 forbidden）
- **V0.1.137 鞋评双分发**：`listByTarget({targetType: 'product' | 'shoe', targetId})` 按 targetType 走分支；`targetStats` 同样双分发；create 时根据 targetType 决定是否走订单校验链（shoe 类型跳过订单校验，直接合成 productId）

---

## 🚪 入口与启动

| 文件 | 职责 | 行数 |
| --- | --- | ---: |
| `review.routes.ts` | POST `/api/review`（统一 switch action，V0.1.137 +2 case listByTarget/targetStats） | ~70 |
| `review.service.ts` | 7 action（V0.1.113 5 + V0.1.137 +2）+ 校验链 + 鞋评合成 | ~210 |
| `review.schema.ts` | Zod schemas（CreateReview / ProductReviewList / ProductId / ReviewPage / ReviewId / V0.1.137 ListByTarget + targetType enum 'product' \| 'shoe'） | ~55 |

注册：`src/app.ts` 内 `app.register(reviewRoutes, { prefix: '/api/review' })`

---

## 📡 对外接口（7 action，V0.1.137 +2）

> 统一 POST `/api/review` body：`{ action, payload }`，需 JWT 鉴权（req.user.id 取 userId）

| action | payload | 返回（data） | 说明 |
| --- | --- | --- | --- |
| `create` | `{ productId, orderId, rating(1-5), content?, images? }` | `{ id }` | 创建商品评价；走 5 步校验链；rating 1-5 |
| `list` | `{ productId, page?, pageSize? }` | `{ list, total, page, pageSize }` | 商品评价列表（含 user 头像/昵称）；分页 |
| `stats` | `{ productId }` | `{ productId, avg, total, distribution }` | 商品评分汇总（avg + 1-5 星分布缺星补 0） |
| `myReviews` | `{ page?, pageSize? }` | `{ list, total, ... }` | 我的评价列表（含 product 概览） |
| `remove` | `{ id }` | `{ ok }` | 删除评价（**鉴权：仅本人**，否则 forbidden） |
| **`listByTarget`**（V0.1.137） | `{ targetType: 'product' \| 'shoe', targetId, page?, pageSize? }` | `{ list, total, page, pageSize }` | 双分发列表：product 走 productId 查 / shoe 走合成 productId=`shoe:${targetId}` 查；含 user 头像/昵称 |
| **`targetStats`**（V0.1.137） | `{ targetType: 'product' \| 'shoe', targetId }` | `{ targetId, avg, total, distribution }` | 双分发评分汇总（同 productStats 但支持 shoe targetType） |

---

## 📊 数据模型

| 表 | 关键字段 | 说明 |
| --- | --- | --- |
| **Review** | `userId` + `productId` + `orderId` + `rating`(Int 1-5) + `content?` + `images[]` + `createdAt` + **`replyContent?`**（V0.1.118）+ **`repliedAt?`**（V0.1.118） | 三元组 `@@unique([userId, productId, orderId])` 防重；索引 `[productId, createdAt]` + `[userId, createdAt]`；**V0.1.137 鞋评**：productId 合成 `shoe:${shoeId}`（绕过三元组的 orderId 必填约束 — orderId 可空或合成值）|

> ⚠️ **文档历史 bug 修正（V0.1.138 init #7）**：原 V0.1.118 changelog 多处声明「**新表 Reply** / Review 1:N Reply cascade delete」**实测为文档错误**。`schema.prisma` Review model 是 `replyContent String? + repliedAt DateTime?` 字段，migration `20260710060000_review_reply` 仅 `ALTER TABLE "Review" ADD COLUMN`，**从未建独立 Reply 表**。本次校准修正。

**User / Product / Order 加 relation**：`reviews Review[]`（V0.1.113）

---

## 🔗 V0.1.137 鞋评双分发关键设计

**问题**：现有 `@@unique([userId, productId, orderId])` 三元组约束强依赖 orderId，跑鞋评价没有订单概念，无法复用 Review 表。

**解决方案**：合成 productId
- 跑鞋评价的 productId = `shoe:${shoeId}`（如 `shoe:abc123`）
- 跑鞋评价的 orderId = 合成值（如 `shoe-order-${shoeId}-${userId}` 或 null，配合三元组约束）
- content 加 `[shoe-review]` tag 前缀（前端区分展示）

**双分发逻辑**：
```ts
async function listByTarget({ targetType, targetId, ... }) {
  const productId = targetType === 'shoe'
    ? `shoe:${targetId}`     // 合成
    : targetId;               // 直通
  return prisma.review.findMany({ where: { productId }, ... });
}
```

**create 鞋评路径**：targetType='shoe' 时跳过订单校验链（步骤 1-4），只保留防重校验（步骤 5）+ 直接合成 productId 落库。

---

## 🔗 集成点

### 前端用户旅程（商品评价）
1. **下单**：`mall.createOrder` 创建 Order / OrderItem（V0.1.22）
2. **支付**：wxpay.notify paid → Order status=paid（V0.1.13）
3. **收货**：admin 改 status=done 或用户点击「确认收货」
4. **评价**：order-list done/paid/shipped 商品「去评价」入口 → pages/review-publish 选星 → review.create

### 前端用户旅程（跑鞋评价 V0.1.137）
1. **买鞋 / 绑鞋**：用户添加跑鞋到 shoes 列表（V0.1.26 shoes.add）
2. **穿鞋打卡**：sport.checkin 关联 shoeId，累计里程（V0.1.26 incrementShoeKm）
3. **跑鞋评价**：pages/shoes-detail「写鞋评」入口 → pages/review-publish?type=shoe&targetId=${shoeId} → review.create targetType='shoe'

### mall 入口联动（前端商品评价）
- `order-list` 商品 card 状态 ∈ {paid, shipped, done} 显示「去评价」按钮
- `pages/review-publish` 选星 1-5 + content 500 字 + images 最多 9 张
- `product-detail` 评价段：loadReviews 并行调 `review.stats` + `review.list`（前 3 条预览）

### admin 评价管理
- `admin.listReviews`（V0.1.123）：评价管理查所有评价
- `admin.addReviewReply`（V0.1.118）：admin 回复评价 — 写 Review.replyContent/repliedAt 字段（**非 Reply 表**）
- qm-admin 评价管理页支撑

---

## 🧪 测试

`tests/modules/review/`：
- `review.service.test.ts` — V0.1.113 14 单元测试 + V0.1.137 +N（listByTarget/targetStats 双分发）
- `review.routes.test.ts` — V0.1.113 7 路由单测 + V0.1.137 +2 case

| describe | 用例数 | 覆盖点 |
| --- | ---: | --- |
| `create` | 5 | 订单不存在 notFound / 订单不属于 forbidden / 订单未支付 badRequest / 商品不在订单 badRequest / 已评价防重 badRequest |
| `listByProduct` | 1 | 含 user 头像/昵称 |
| `productStats` | 3 | 基础 avg/count + 5 星满贯 + 缺星补 0 |
| `myReviews` | 2 | 分页 |
| `remove` | 3 | 不存在 notFound / 他人 forbidden / 本人成功 |
| **`listByTarget`（V0.1.137）** | 2 | targetType=product 直通 + targetType=shoe 合成 productId |
| **`targetStats`（V0.1.137）** | 1 | 双分发评分汇总 |

**mock 策略**：`vi.mock('src/infra/prisma.js')`，不连 DB

---

## 🔧 关键依赖与配置

- **Prisma 表**：1 张（Review，V0.1.118 加 replyContent/repliedAt 字段；**非 Reply 表**）
- **依赖**：`mall`（订单状态校验）/ `shoes`（V0.1.137 鞋评关联，shoes.list/detail 返 shoeId）/ `common/errors`
- **常量**：`REVIEWABLE_ORDER_STATUS = ['paid', 'shipped', 'done']`（与 Phase 4.1 状态机一致）
- **权限**：本模块不开放 public，需 JWT 鉴权
- **规则**：rating 范围严格 1-5（z.number().int().min(1).max(5)）
- **缺星补 0 范式**：避免前端 `undefined`
- **V0.1.137 鞋评合成 productId**：`shoe:${shoeId}` 字符串模板绕过三元组约束；schema targetType enum 'product' | 'shoe'

---

## 📌 常见问题 (FAQ)

**Q：订单取消后还能评吗？**
A：不能。`REVIEWABLE_ORDER_STATUS` 限定 paid/shipped/done。

**Q：能重复评价吗？**
A：不能。`@@unique([userId, productId, orderId])` 兜底。

**Q：1 个订单有 N 个商品，每个都能评吗？**
A：能。每个商品独立 `@@unique`，订单多商品 = 多次评价。

**Q：V0.1.137 鞋评怎么绕过三元组约束？**
A：合成 productId = `shoe:${shoeId}`，orderId 用合成占位值。三元组 [userId, `shoe:${shoeId}`, 占位 orderId] 唯一性保证一个用户对一只鞋只评一次。

**Q：V0.1.137 鞋评要走订单校验链吗？**
A：不走。targetType='shoe' 时跳过 5 步校验链的前 4 步（订单相关），只保留防重 + rating 校验。

**Q：admin 回复评价存在哪？**
A：**Review 表的 replyContent / repliedAt 字段**（V0.1.118，**非独立 Reply 表** — 文档历史 bug，V0.1.138 init #7 修正）。

---

## 📁 相关文件清单

```
src/modules/review/
├── review.routes.ts            # POST /api/review（7 action switch，V0.1.137 +2 case）
├── review.service.ts           # 7 action + 5 校验链 + V0.1.137 鞋评合成 + groupBy 缺星补 0
├── review.schema.ts            # Zod schemas（V0.1.137 + targetType enum + ListByTarget）
└── CLAUDE.md                   # 本文件

tests/modules/review/
├── review.service.test.ts      # 14 + N 单元测试
└── review.routes.test.ts       # 7 + 2 路由单测

# 集成点（外部 module）
src/modules/admin/admin.service.ts   # V0.1.118 addReviewReply（写 replyContent）+ V0.1.123 listReviews
src/modules/mall/order.service.ts    # Order status 校验源
src/modules/shoes/shoes.service.ts   # V0.1.137 鞋评关联（shoes.list/detail 返 shoeId 给前端）

# Prisma
prisma/schema.prisma                       # Review model（含 V0.1.118 replyContent/repliedAt 字段）
prisma/migrations/20260710050000_review/          # V0.1.113 建表 SQL
prisma/migrations/20260710060000_review_reply/   # V0.1.118 ALTER TABLE ADD COLUMN（非建表）
```

---

## 📝 变更记录 (Changelog)

- **2026-07-10** — 创建（V0.1.113 电商闭环最后一块）：Review 表 + 5 action + 5 校验链 + groupBy 缺星补 0 + 14 service 单测 + 7 route 单测
- **2026-07-11** — V0.1.118 +replyContent/repliedAt 字段（**修正：非 Reply 表，是 Review 表字段**）+ admin.addReviewReply
- **2026-07-11** — V0.1.123 admin.listReviews action（qm-admin 评价管理页支撑）
- **2026-07-13** — V0.1.137 鞋评双分发：合成 productId=`shoe:${shoeId}` 绕过 @@unique 三元组 + content 加 [shoe-review] tag + listByTarget/targetStats 双分发 + schema targetType enum + routes +2 case + 单测
- **2026-07-13** — V0.1.138 init #7 校准：修 V0.1.118 Reply 表文档 bug（实测 schema/migration 均显示 Reply 是 Review 字段非独立表）+ V0.1.137 段补全
