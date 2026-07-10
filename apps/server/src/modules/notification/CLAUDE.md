# notification module — 消息中心

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../../../CLAUDE.md) → [`apps/server/`](../../../CLAUDE.md) → [`modules/`](../) → **notification/**（这里）
> 父级：[apps/server CLAUDE.md](../../../CLAUDE.md) | 同级：[feed](../feed/) / [follow](../follow/) / [family](../family/) / [favorite](../favorite/)

> 引入版本：**V0.1.31**（2026-07-03，pic 2 社交向收尾）
> 相关 pic：2771（消息中心 + 红点）

---

## 🎯 模块职责

**消息中心**：通知列表（分页含 actor 头像/昵称）+ 未读数（红点）+ 标记已读（单条/全部）。

- **数据来源**：`Notification` 表（userId(接收者) + actorId(触发者) + type(like|comment|follow|system) + targetType?/targetId?/content?/isRead）
- **导出集成函数 `notify()`**（**关键**）：
  - 自己赞自己跳过（`if (userId === actorId) return`）
  - 调用方 try/catch 包裹（通知失败不阻塞主业务）
  - DRY：被 `feed.like / feed.comment / follow.follow` 复用
  - **不在 notify 内部 try/catch**：让调用方决定容错策略（feed/follow 都 try/catch 吞错）
- **type 扩展点**：后续 `follow / goal_complete / 系统公告` 都可复用 `notify()`（已支持 `follow` V0.1.32）
- **未读数性能**：`unreadCount` 用 count 查询（轻量，mine 红点 / 首页徽标）

---

## 🚪 入口与启动

| 文件 | 职责 | 行数 |
| --- | --- | ---: |
| `notification.routes.ts` | POST `/api/notification`（统一 switch action） | ~30 |
| `notification.service.ts` | 4 action + 导出 `notify()` 集成函数 | 96 |

注册：`src/app.ts` 内 `app.register(notificationRoutes, { prefix: '/api/notification' })`

---

## 📡 对外接口（4 action）

> 统一 POST `/api/notification` body：`{ action, payload }`，需 JWT 鉴权

| action | payload | 返回（data）| 说明 |
| --- | --- | --- | --- |
| `list` | `{ page, pageSize }` | `{ list: [...含 actor], total, page, pageSize, hasMore }` | 我的通知（分页；含 actor 头像/昵称） |
| `unreadCount` | — | `{ count }` | 未读数（轻量；红点/徽标用） |
| `markRead` | `{ notificationId }` | `{ ok }` | 标记单条已读（鉴权：仅本人，forbidden 他人） |
| `markAllRead` | — | `{ ok, updated }` | 全部已读（updateMany 幂等） |

---

## 🔑 关键导出：`notify(input)` 集成函数

> **DRY 范式第 1 次**：跨 module 通知触发，被 feed.like / feed.comment / follow.follow 复用。

```ts
/**
 * 发通知集成函数（被 feed.like / feed.comment 复用，DRY）
 *
 * 设计：
 * - 自己触发自己跳过（自己赞自己 / 自己评论自己 → 不发通知）
 * - 不在这里 try/catch：调用方决定容错策略（feed 集成时 try/catch 吞错，避免通知失败拖累点赞/评论主链路）
 *
 * 扩展点：后续 follow / goal_complete / 系统公告 都可复用此函数
 */
export async function notify(input: NotifyInput) {
  if (input.userId === input.actorId) return; // 自己触发自己，跳过
  await prisma.notification.create({ data: input });
}
```

**调用点**（3 处）：
- `feed.service.like`：`notify({ userId: feed.userId, actorId: userId, type: 'like', targetType: 'feed', targetId: feedId })`（事务外，try/catch 吞错）
- `feed.service.comment`：同上，type='comment'，content 50 字截断
- `follow.service.follow`：`notify({ userId: input.userId, actorId: followerId, type: 'follow' })`（V0.1.32 复用）

**范式累计第 1 次**：跨 module 通知触发用导出集成函数（避免每个 module 各自写通知逻辑，DRY）。

---

## 🧪 测试

```bash
# tests/modules/notification/notification.service.test.ts — 8 单元
pnpm test notification
```

覆盖：list 含 actor 分页 hasMore / unreadCount / markRead 鉴权 forbidden / markRead 已读幂等 / markAllRead updateMany / notify 自己跳过 / notify 正常调用。

> ⚠️ **测试 mock 范式**：feed.service.test.ts 用 `vi.mock('src/modules/notification/notification.service.js', () => ({ notify: vi.fn() }))` 隔离 + 断言集成调用（替代原 try/catch 吞 TypeError 碰巧通过的脆弱写法）

---

## 📌 范式

- **导出集成函数 `notify()`**：跨 module 通知触发统一入口；自己赞自己跳过；调用方 try/catch 决定容错
- **User 双 relation**：`notifications Notification[]` + `notifActions Notification[] @relation("NotifActor")` — 双 relation 必须 `@relation("name")` 消歧义（**范式累计第 1 次**，V0.1.31 沉淀，后续 V0.1.32 Follower / V0.1.34 FamilyOwner 都同款）
- **`markRead` 鉴权**：先 findUnique 拿 `n.userId`，对比当前 userId，不等 → forbidden；已读幂等（`if !n.isRead` 才 update）
- **`markAllRead` updateMany**：避免 findMany + 循环 update 的 N+1；updateMany 一次完成
- **`unreadCount` 轻量**：count 查询不返 list；前端只关心数字（红点）

---

## ⚠️ 已知坑

1. **User 双 relation 必须 `@relation("name")`**：notifications + notifActions(@relation("NotifActor")) — 否则 prisma generate 报 P1012 Ambiguous relation（**范式累计第 1 次**，V0.1.31 沉淀）
2. **不在 notify 内 try/catch**：让调用方决定容错；如果写在内部，调用方无法区分"通知失败"和"业务失败"（V0.1.31 设计）
3. **actor 不存在时**：feed 被删后 actor 引用可能为 null；当前 Notification 表 onDelete RESTRICT（actor），删除 User 会失败；V0.1.31 MVP 限制
4. **type 扩展**：新增 type（goal_complete / system）需在 schema 加 enum + 前端展示文案适配；当前 schema 已用 enum 扩展（`type: like|comment|follow|system`）

---

## 🔗 关联

- **feed.service.like / comment**：V0.1.31 集成 notify（type=like/comment，targetType=feed）
- **follow.service.follow**：V0.1.32 复用 notify（type=follow）
- **前端 pages/notification**：列表卡 + 全部已读 + 点击乐观标记已读 + 跳 feed + 分页 + 下拉刷新（V0.1.31 新页）
- **前端 mine 入口**：未读徽标（调 unreadCount，99+ 截断）
