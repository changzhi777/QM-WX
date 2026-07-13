# content Module — AI 上下文

> 📍 面包屑：[根目录](../../../../CLAUDE.md) > [apps/server](../../../CLAUDE.md) > modules > **content**

## 职责

内容/赛事服务（含报名+成绩）。5 类内容（marathon/hotel/scenic/food/rural）走同一套表+action，list/detail 公开（游客可看），enroll 需登录。支持余额支付（V0.1.117）+ wxpay 真集成（V0.1.119）+ 赛事成绩用户自报+排行榜（V0.1.134）。

## 入口

- **路由注册**：`app.ts` 注册 `contentRoutes`，namespace `/api/content`
- **路由前缀**：`POST /api/content`
- **鉴权**：list/detail 公开（`config: { public: true }`），enroll/赛事成绩需登录（内部 `requireLogin(req)`）

## Action 清单

| action | 方法 | 功能 | 备注 |
|--------|------|------|------|
| `list` | `{type?, page, pageSize}` | 内容列表（按 type 过滤+分页） | Cache.wrap 60s，公开端点 |
| `detail` | `id` | 内容详情（price/fee Decimal 序列化） | Cache.wrap 300s，公开端点 |
| `enroll` | `userId + {id, formData}` | 报名/登记意向（余额支付+wxpay） | V0.1.117 余额支付+V0.1.119 wxpay 真集成 |
| `myEnrollments` | `userId + {type?, page, pageSize}` | 我的报名记录（含 Content 详情） | V0.1.113 赛事闭环 |
| `submitRaceResult` | `userId + {enrollmentId, finishTimeSec, finisherPhotoUrl?}` | 用户自报成绩（pace 自动计算） | V0.1.134，upsert 按 enrollmentId |
| `getRaceLeaderboard` | `contentId + limit?` | 排行榜（前 limit 名，含 user 信息） | V0.1.134，批量关联 User 避免 N+1 |
| `getMyRaceResult` | `userId + contentId` | 我的成绩（null 表示未录入） | V0.1.134 |

## 数据模型（Prisma）

| Model | 关键字段/索引 | 用途 |
|-------|---------------|------|
| **Content** | `type` (enum), `status`, `price/fee` (Decimal?), `actionType`, `detail` (Json) | 内容主表，5 类统一 |
| **Enrollment** | `userId`, `contentId`, `type`, `status` (submitted/confirmed), `formData`, `orderId?` | 报名记录，V0.1.119 加 orderId 关联 Order |
| **Order** | `contentType='enroll'`, `contentId`, `status`, `prepayId` | V0.1.119 区分赛事订单 |
| **RaceResult** | `enrollmentId @@unique`, `userId`, `contentId`, `finishTimeSec`, `paceSecPerKm`, `rank`, `bibNumber` | V0.1.134 新表，@@unique enrollmentId 1:1 |
| **User** | `id`, `nickname`, `avatarUrl` | 排行榜用户信息 |

**关键索引**：Content `[type, status]`, Enrollment `[userId, contentId, status]`, RaceResult `@@unique([enrollmentId])` + `[contentId, finishTimeSec]`。

## 集成点

- **被调用方**：前端 `pages/content-detail/`（内容详情）、`pages/my-enrollments/`（我的报名）、`pages/admin-race-result/`（admin 录成绩）
- **调用方**：
  - `wxpay.notify`（V0.1.119）：contentType='enroll' 回调 → enrollment confirmed（不走钱包，fee 是商家收入）
  - `admin.service`（`invalidateContentsCache/invalidateContentDetail`）：写内容后失效缓存
  - `wallet.repo`（`ensureWalletInTx`）：enroll 余额扣费（V0.1.117）
  - `wxpay.service`（`unifiedOrder`）：enroll wxpay 创建订单（V0.1.119）
  - `jobs/queue`（`enqueueCloseOrder`）：enroll 入队超时关单
- **缓存**：
  - list：Cache.wrap 60s，key 含 `type:page:pageSize`
  - detail：Cache.wrap 300s，key 含 `id`
  - 写后失效：`invalidateContentsCache()` 抹 `content:*` 全命名空间，`invalidateContentDetail(id)` 精准删单个
- **BullMQ**：enroll 创建 Order 后 `enqueueCloseOrder(order.id)` 入队 30min 关单
- **notify**：无

## 测试

| 文件 | 用例数 | 覆盖 action |
|------|--------|-------------|
| `tests/modules/content/content.service.test.ts` | 28 | list(7) + detail(5) + enroll(5) + myEnrollments(2) + submitRaceResult(5) + getRaceLeaderboard(3) + getMyRaceResult(2) + 失效(2) |
| `tests/modules/content/content.routes.test.ts` | 5 | 公开端点(2) + enroll 鉴权(1) + enroll 正常(1) + 未知 action(1) |

**覆盖率**：约 85%（含 list/detail 缓存命中/miss 分支 + enroll 余额/wxpay 双路径 + 赛事成绩校验链）。

## 关键范式与坑

1. **公开端点内部鉴权范式（V0.1.x 全局）**
   - route 标 `config: { public: true }` 跳过全局 JWT 中间件
   - enroll 等需登录 action 内部调 `requireLogin(req)`（抛 401 若未登录）
   - 原因：单 POST 入口 + action dispatch，无法让 auth 中间件按 action 分流

2. **Decimal 序列化进缓存（V0.1.10 范式）**
   - Prisma Decimal 经 `JSON.stringify` 会损坏（变对象或精度丢失）
   - 进缓存前显式 `price?.toString() ?? null`，保证缓存 hit/miss 返回类型一致
   - 同 mall/product 范式

3. **enroll wxpay 真集成（V0.1.119）**
   - 创建 Order（`contentType='enroll'`, `contentId`, `status='pending_pay'`, `payChannel='wxpay'`）
   - 创建 Enrollment（`status='submitted'`, `orderId` 关联）
   - 入队超时关单（`enqueueCloseOrder(order.id)`）
   - 调 `unifiedOrder` → 失败则清理 enrollment + cancel Order（防孤儿单+用户被防重拦截卡死）
   - 返回 `payParams`（`timeStamp/nonceStr/package/signType/paySign`）给前端 `wx.requestPayment`
   - 回调时 `contentType='enroll'` 跳钱包入账，直接 enrollment confirmed（fee 是商家收入，不退还给赛事方）

4. **余额支付事务范式（V0.1.117，复用 wallet.ensureWalletInTx）**
   - `needPay = fee>0 && featureFlags.payment`
   - 事务内：`ensureWalletInTx(tx, userId)` + `decrement` + `WalletTransaction(type='content_enroll', status='confirmed')`

5. **赛事成绩校验链（V0.1.134 submitRaceResult）**
   - enrollment 存在且属于 user → notFound
   - enrollment.status === 'confirmed' → 未支付/未确认 badRequest
   - content.type === 'marathon' → 仅赛事可录
   - content.detail.distanceKm 必须有 → 计算 `paceSecPerKm = finishTimeSec / distanceKm`
   - upsert 按 `@@unique enrollmentId`（一对一可改）

6. **排行榜批量关联避免 N+1（V0.1.134 getRaceLeaderboard）**
   - 先 `RaceResult.findMany({take: limit})`
   - 提取 `userIds = Array.from(new Set(results.map(r => r.userId)))`
   - `User.findMany({where: {id: {in: userIds}}})` 批量查
   - `Map(user.id => user)` 拼装

7. **写后失效缓存（V0.1.10）**
   - `invalidateContentsCache()`：`Cache.delByPattern('content:*')` 抹全命名空间（list 全分页 + detail 全 id）
   - `invalidateContentDetail(id)`：精准删单个 `content:detail:{id}`（不等 300s TTL）
   - 失败静默（内容写操作不应被缓存清理失败阻塞）

8. **防重复报名（enroll）**
   - `findFirst({where: {userId, contentId, status: {in: ['submitted', 'confirmed']}})` → conflict

9. **actionType='none' 拒绝报名**
   - 仅展示内容（如景点介绍）不接受报名 → forbidden

## 版本演进

- **V0.1.10** — list/detail 加 Cache.wrap（60s/300s TTL）+ Decimal 序列化 + 写后失效
- **V0.1.113** — myEnrollments action（赛事报名闭环前端页支撑）
- **V0.1.117** — enroll 余额支付（ensureWalletInTx 事务 + WalletTransaction type='content_enroll'）
- **V0.1.118** — enroll wxpay 失败处理（try/catch 清理 enrollment + cancel Order）
- **V0.1.119** — enroll wxpay 真集成（Order +contentType='enroll' + unifiedOrder + 回调跳钱包）
- **V0.1.123** — admin +listReviews action（评价管理，与 content 弱相关）
- **V0.1.134** — 赛事成绩 3 action（submitRaceResult 用户自报含 pace 计算 + getRaceLeaderboard 批量关联 User + getMyRaceResult），新表 RaceResult #56
