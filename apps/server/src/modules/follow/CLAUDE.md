# follow module — 关注关系

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../../../CLAUDE.md) → [`apps/server/`](../../../CLAUDE.md) → [`modules/`](../) → **follow/**（这里）
> 父级：[apps/server CLAUDE.md](../../../CLAUDE.md) | 同级：[feed](../feed/) / [notification](../notification/) / [family](../family/) / [favorite](../favorite/)

> 引入版本：**V0.1.32**（2026-07-03，pic 2 社交向深化）
> 相关 pic：（通用用户主页 + 关注/粉丝）

---

## 🎯 模块职责

**关注关系**：关注 / 取关 / 批量查关注状态 / 我的关注列表 / 我的粉丝列表 / 用户主页一次拿全（user + counts + isFollowing + isSelf）。

- **数据来源**：`Follow` 表（followerId + followeeId + `@@unique` 防重；索引 [followerId]+[followeeId]；onDelete CASCADE 任一用户删级联）
- **User 双 relation（范式累计第 2 次）**：`following @relation("Follower")` + `followers @relation("Followee")` — 必须 `@relation("name")` 消歧义（V0.1.31 NotifActor 后第 2 次；V0.1.34 FamilyOwner 第 3 次）
- **不能关注自己**：前置校验 `if (followerId === input.userId) throw Errors.badRequest`
- **复用 notify(type=follow)**：V0.1.31 集成函数第 3 个 type 复用（继 like/comment 之后）
- **`myCounts` 用户主页一次拿全**：4 个并行查询（user + followingCount + followerCount + isFollowing/existing），**避免多次请求**

---

## 🚪 入口与启动

| 文件 | 职责 | 行数 |
| --- | --- | ---: |
| `follow.routes.ts` | POST `/api/follow`（统一 switch action） | ~50 |
| `follow.service.ts` | 6 action（follow/unfollow/isFollowing/myFollowing/myFollowers/myCounts） | 145 |

注册：`src/app.ts` 内 `app.register(followRoutes, { prefix: '/api/follow' })`

---

## 📡 对外接口（6 action）

> 统一 POST `/api/follow` body：`{ action, payload }`，需 JWT 鉴权（userId = 当前用户，viewerId 用于 myCounts）

| action | payload | 返回（data）| 说明 |
| --- | --- | --- | --- |
| `follow` | `{ userId }` | `{ ok, following: true }` | 关注（upsert 幂等；不能关注自己 badRequest；通知被关注者 type=follow） |
| `unfollow` | `{ userId }` | `{ ok, following: false }` | 取关（deleteMany 幂等） |
| `isFollowing` | `{ userIds: [] }` | `{ results: [{ userId, following }] }` | 批量查关注状态（Set 拼装，详情页/列表页按钮用） |
| `myFollowing` | `{ page, pageSize }` | `{ list, total, page, pageSize, hasMore }` | 我关注的人（分页含 user 头像/昵称） |
| `myFollowers` | `{ page, pageSize }` | `{ list, total, page, pageSize, hasMore }` | 我的粉丝（分页含 user） |
| `myCounts` | `{ userId, viewerId }` | `{ user, followingCount, followerCount, isFollowing, isSelf }` | 用户主页一次拿全（**避免多次请求**） |

---

## 🔑 关键范式：`myCounts` 用户主页一次拿全

```ts
async myCounts(userId, viewerId) {
  const [user, followingCount, followerCount, existing] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id, nickname, avatarUrl } }),
    prisma.follow.count({ where: { followerId: userId } }),
    prisma.follow.count({ where: { followeeId: userId } }),
    viewerId && viewerId !== userId
      ? prisma.follow.findUnique({ where: { followerId_followeeId: { followerId: viewerId, followeeId: userId } } })
      : null,
  ]);
  if (!user) throw Errors.notFound('用户不存在');
  return { user, followingCount, followerCount, isFollowing: !!existing, isSelf: viewerId === userId };
}
```

**可查任意 userId**：不限于自己；`viewerId` 是当前登录者（用于算 `isFollowing` + `isSelf`）。

**前端用户主页**（pages/user）：调 `myCounts` 一次拿全 → 渲染头像 + 关注/粉丝数 + 关注按钮（乐观更新） + `isSelf` 自己不显示按钮。

---

## 🧪 测试

```bash
# tests/modules/follow/follow.service.test.ts — 10 单元
pnpm test follow
```

覆盖：follow 不能关注自己 badRequest / follow 通知 type=follow / follow upsert 幂等 / unfollow deleteMany / isFollowing 批量 Set / myFollowing 分页含 user / myFollowers 分页 / myCounts isSelf / myCounts notFound / mock notify 隔离范式。

> ⚠️ **测试 mock 范式**：用 `vi.mock('src/modules/notification/notification.service.js', () => ({ notify: vi.fn() }))` 隔离 notify（**V0.1.32 复用 V0.1.31 mock 范式**）— 断言集成调用，替代 try/catch 吞 TypeError 碰巧通过的脆弱写法

---

## 📌 范式

- **User 双 relation `@relation("name")`**：`following @relation("Follower")` + `followers @relation("Followee")` — **范式累计第 2 次**（V0.1.31 NotifActor / V0.1.32 Follower / V0.1.34 FamilyOwner）
- **`myCounts` 一次拿全**：4 个并行查询（`Promise.all`）+ `viewerId` 参数 → 用户主页避免 3-4 次请求
- **复用 notify(type=follow)**：V0.1.31 集成函数第 3 个 type；自己关注自己已在前置校验拦截（follow 入口 `if followerId === input.userId` badRequest）
- **批量关注状态（isFollowing）**：Set 拼装 `set.has(followeeId)`；详情页/列表页按钮状态用
- **upsert 幂等（follow）**：依赖 `@@unique([followerId, followeeId])` 防重 — 重复关注不报错
- **deleteMany 幂等（unfollow）**：不存在也返 ok — 前端无需先查
- **`onDelete CASCADE`**：Follow 任一用户删 → 关系级联（User.relation CASCADE）

---

## ⚠️ 已知坑

1. **User 双 relation 必须 `@relation("name")`**：否则 prisma generate 报 P1012 Ambiguous relation — **范式累计第 2 次**（V0.1.31 NotifActor / V0.1.32 Follower / V0.1.34 FamilyOwner）
2. **myCounts 必须传 viewerId**：不传则 isFollowing=null + isSelf=undefined（需前端处理空状态）
3. **不能关注自己**：前置校验 badRequest（不依赖 DB unique 约束抛错 — 前置拦截避免无效事务）
4. **mock notify 隔离**：follow.service.test.ts 必须 mock notification.service.js（V0.1.32 复用 V0.1.31 mock 范式）

---

## 🔗 关联

- **notification.notify()**：V0.1.32 复用（type=follow 第 3 个 type）
- **feed.feed-head onTapUser**：点作者头像跳用户主页，关注闭环入口（V0.1.32 集成）
- **前端 pages/user**：用户主页（头像+昵称+关注/粉丝数+关注按钮乐观更新+isSelf 自己不显示）
- **前端 follow/unfollow 乐观更新**：失败回滚
