# feed module — 运动动态

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../../../CLAUDE.md) → [`apps/server/`](../../../CLAUDE.md) → [`modules/`](../) → **feed/**（这里）
> 父级：[apps/server CLAUDE.md](../../../CLAUDE.md) | 同级：[favorite](../favorite/) / [notification](../notification/) / [follow](../follow/) / [family](../../family/)

> 引入版本：**V0.1.30**（2026-07-03，pic 2 社交向核心）+ **V0.1.36**（话题 + 视频 + 红心广场）
> 相关 pic：2771（2771 社交深化 — 话题 + 视频 + 红心广场）

---

## 🎯 模块职责

**运动动态**：发布图文动态（可关联打卡 checkinId + 跑量 distanceKm + 话题 topic + 视频 videoUrl）+ 点赞 + 评论 + 红心广场（热门排序）+ 话题页（按 topic 聚合）。

- **数据来源**：
  - **`Feed`** 表（content/images[]/checkinId?/distanceKm?/topic?/videoUrl?/likeCount(默认0)/commentCount(默认0)）
  - **`FeedLike`** 表（`@@unique([feedId,userId])` 防重）
  - **`FeedComment`** 表
- **`$transaction` 维护计数**：like/unlike/comment 都在事务内 `FeedLike.create/delete + Feed.likeCount ±1`（原子保证计数准确）
- **`V0.1.36` 增强**：
  - `list` 加 `sort=latest|hot` + `topic` 过滤（红心广场按 likeCount desc）
  - `publish` 接受 `topic` + `videoUrl`（外部 mp4 链接 + `<video>` 标签）
  - `hotTopics`：groupBy topic 按 feed 数量 desc，take 10
- **notify 集成**：like/comment 事务后调 `notify()` 通知动态作者（V0.1.31 复用，try/catch 吞错不阻塞主链路）

---

## 🚪 入口与启动

| 文件 | 职责 | 行数 |
| --- | --- | ---: |
| `feed.routes.ts` | POST `/api/feed`（统一 switch action） | ~50 |
| `feed.service.ts` | 7 action（list/myFeeds/publish/like/unlike/comment/hotTopics） | 210 |
| `feed.schema.ts` | Zod（PublishFeedInput / FeedPageInput） | — |

注册：`src/app.ts` 内 `app.register(feedRoutes, { prefix: '/api/feed' })`

---

## 📡 对外接口（7 action）

> 统一 POST `/api/feed` body：`{ action, payload }`，需 JWT 鉴权

| action | payload | 返回（data）| 说明 |
| --- | --- | --- | --- |
| `list` | `{ page, pageSize, sort?, topic? }`（V0.1.36 +sort +topic） | `{ list, total, page, pageSize, hasMore }` | 动态流（含作者 + liked 状态；sort=hot 按 likeCount desc） |
| `myFeeds` | `{ page, pageSize }` | `{ list, total, page, pageSize, hasMore }` | 我的动态（含 topic/videoUrl） |
| `publish` | `PublishFeedInput`（V0.1.36 +topic +videoUrl） | `{ id }` | 发布动态（可关联 checkinId + distanceKm） |
| `like` | `{ feedId }` | `{ ok, liked: true }` | 点赞（事务内 create FeedLike + Feed.likeCount+1；幂等；notify） |
| `unlike` | `{ feedId }` | `{ ok, liked: false }` | 取消点赞（事务内 delete + likeCount-1；幂等） |
| `comment` | `{ feedId, content }` | `{ id }` | 评论（事务内 create FeedComment + Feed.commentCount+1；notify + content 50 字截断） |
| `hotTopics`（V0.1.36） | — | `{ topics: [{ topic, count }] }` | 热门话题（groupBy topic 取 10） |

---

## 🔑 关键范式：`$transaction` 维护计数

```ts
async like(userId, feedId) {
  const feed = await prisma.feed.findUnique({ where: { id: feedId } });
  if (!feed) throw Errors.notFound('动态不存在');

  const existing = await prisma.feedLike.findUnique({ where: { feedId_userId: { feedId, userId } } });
  if (!existing) {
    await prisma.$transaction(async (tx) => {
      await tx.feedLike.create({ data: { feedId, userId } });
      await tx.feed.update({ where: { id: feedId }, data: { likeCount: { increment: 1 } } });
    });
    // 通知作者（自己赞自己跳过；通知失败不阻塞点赞）
    try { await notify({ userId: feed.userId, actorId: userId, type: 'like', targetType: 'feed', targetId: feedId }); } catch {}
  }
  return { ok: true, liked: true };
}
```

**范式累计第 1 次**：Feed.likeCount/commentCount 必须事务内 update（避免并发漂移 — 否则点赞后 Feed.count 可能不一致）。

---

## 🧪 测试

```bash
# tests/modules/feed/feed.service.test.ts — 10 单元（V0.1.30 + V0.1.36 增强）
pnpm test feed
```

覆盖：list 含作者 + liked + sort + topic / myFeeds / publish / like 事务计数 + notify / unlike 事务计数 / comment 事务计数 + notify + 50 字截断 / hotTopics groupBy。

> ⚠️ **坑修复**：feed.service.test.ts 首版 vi.mock hoisting 错（`Cannot access 'mocks' before initialization`）→ 改 `vi.hoisted(() => require('...').createPrismaMock(...))`（V0.1.30 沉淀）

---

## 📌 范式

- **`$transaction` 回调维护计数**：like/unlike/comment 事务内 create/delete + Feed.count ±1 — 避免并发漂移（V0.1.30 范式第 1 次）
- **`@@unique([feedId, userId])` 防重**：FeedLike 复合 unique，重复点赞不增加 count（前端可能多次点击，但后端幂等）
- **notify 集成（DRY）**：复用 V0.1.31 notification.notify() 集成函数；自己赞自己跳过（notify 内部 `if userId === actorId return`）；调用方 try/catch 吞错
- **`topic` 过滤**：`where: topic ? { topic } : {}`（空查询返所有）；前端话题页传 topic 字符串
- **`sort=hot` orderBy as const**：`orderBy: { likeCount: 'desc' as const }` — Prisma orderBy 需要字面量类型断言（V0.1.36 坑）
- **groupBy 热门话题**：`prisma.feed.groupBy({ by: ['topic'], where: { topic: { not: null } }, _count: { _all: true }, orderBy: { _count: { topic: 'desc' } }, take: 10 })`（V0.1.36 范式）

---

## ⚠️ 已知坑

1. **FeedLike `@@unique` + 事务**：先 findUnique 检查，再事务内 create — 看似冗余但确保幂等（重复点赞不增加 count）
2. **vi.mock hoisting 坑**：feed.service.test.ts 测试 mock 必须用 `vi.hoisted` 包装（V0.1.30 沉淀）— `Cannot access 'mocks' before initialization`
3. **videoUrl 外部链接**：仅存 URL 字段，前端用 `<video src={videoUrl}>` 播放；不上传视频到自家服务器（V0.1.36 决策 B，外部链接）
4. **Feed 删动态级联**：删除 Feed → FeedLike + FeedComment 自动级联删（onDelete CASCADE）
5. **`commentCount` 显示**：返回的 Feed.commentCount 是缓存字段，前端可乐观更新；服务端是权威源

---

## 🔗 关联

- **notification.notify()**：like/comment 集成（V0.1.31 复用）
- **Checkin**：publish 可关联 checkinId + distanceKm（从打卡延伸）
- **前端 pages/feed**：动态卡 + 发布弹层 + 点赞乐观更新 + 评论弹层 + FAB + 分页 onReachBottom
- **前端 pages/hot**：红心广场（sort=hot + hotTopics 横滚）
- **前端 pages/topic**：话题页（?topic=xxx 聚合）
- **前端 onShareAppMessage**：转发微信群（V0.1.36 裂变）
