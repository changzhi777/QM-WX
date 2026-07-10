# favorite module — 收藏（Content / Product 通用）

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../../../CLAUDE.md) → [`apps/server/`](../../../CLAUDE.md) → [`modules/`](../) → **favorite/**（这里）
> 父级：[apps/server CLAUDE.md](../../../CLAUDE.md) | 同级：[training](../training/) / [shoes](../shoes/) / [goal](../goal/) / [feed](../../feed/)

> 引入版本：**V0.1.29**（2026-07-03，pic 3 向社交向首功能，最 KISS）
> 相关 pic：（通用收藏 tab）

---

## 🎯 模块职责

**收藏**：通用目标（content 内容 / product 商品）+ 列表（含详情）+ 批量红心状态查询。

- **数据来源**：`Favorite` 表（userId + targetType(content|product) + targetId + `@@unique([userId, targetType, targetId])` 防重）
- **目标通用**：`targetType` 枚举 `content | product`（**不**建多表 — 单一收藏表，targetId 跨表引用，V0.1.29 MVP 简化）
- **N+1 规避（核心）**：`list` 返详情用 **`findMany where id:in` + `Map` 关联**（先查 favorites，再批量查 Content/Product）
- **批量红心（性能）**：`isFavorited` 接受 `targetType + targetIds[]`，**一次查**返 `{targetId: boolean}` 数组（详情页/列表页用）
- **upsert 幂等**：add 用 `prisma.favorite.upsert`，重复收藏不报错
- **deleteMany 幂等**：remove 用 `deleteMany`，不存在也返 ok

---

## 🚪 入口与启动

| 文件 | 职责 | 行数 |
| --- | --- | ---: |
| `favorite.routes.ts` | POST `/api/favorite`（统一 switch action） | ~30 |
| `favorite.service.ts` | 4 action（list/add/remove/isFavorited） | 140 |

注册：`src/app.ts` 内 `app.register(favoriteRoutes, { prefix: '/api/favorite' })`

---

## 📡 对外接口（4 action）

> 统一 POST `/api/favorite` body：`{ action, payload }`，需 JWT 鉴权

| action | payload | 返回（data）| 说明 |
| --- | --- | --- | --- |
| `list` | `{ targetType? }` | `{ favorites: [...{ detail }] }` | 我的收藏（按 targetType 过滤；批量关联 Content/Product 详情；目标已删 detail=null） |
| `add` | `{ targetType, targetId }` | `{ ok }` | 收藏（upsert 幂等，重复收藏不报错） |
| `remove` | `{ targetType, targetId }` | `{ ok }` | 取消收藏（deleteMany 幂等） |
| `isFavorited` | `{ items: [{ targetType, targetId }] }` | `{ results: [{ ...item, favorited }] }` | 批量红心状态查询（一次查全） |

---

## 🔑 关键范式：N+1 规避（list 详情关联）

```ts
async list(userId, input) {
  const favorites = await prisma.favorite.findMany({ where: { userId, ...(input.targetType ? { targetType } : {}) } });
  const contentIds = favorites.filter(f => f.targetType === 'content').map(f => f.targetId);
  const productIds = favorites.filter(f => f.targetType === 'product').map(f => f.targetId);
  const [contents, products] = await Promise.all([
    prisma.content.findMany({ where: { id: { in: contentIds } }, select: { id, title, cover, summary, type, location, date } }),
    prisma.product.findMany({ where: { id: { in: productIds } }, select: { id, name, price, images, category, status } }),
  ]);
  const contentMap = new Map(contents.map(c => [c.id, c]));
  const productMap = new Map(products.map(p => [p.id, p]));
  return { favorites: favorites.map(f => ({ ..., detail: f.targetType === 'content' ? contentMap.get(f.targetId) : productMap.get(f.targetId) })) };
}
```

**对比 N+1**：每条 favorite 一次 `findUnique` 查 Content/Product → 100 条收藏 = 101 次查询；本范式 = **3 次查询**（1 favorites + 1 contents + 1 products）。

**范式累计第 3 次**（family.myFamily/familyRanking 2026-07-04 V0.1.34 同款 groupBy 优化 / sport.groupMembers V0.1.42 同款）。

---

## 🧪 测试

```bash
# tests/modules/favorite/favorite.service.test.ts — 6 单元
pnpm test favorite
```

覆盖：list 含详情批量关联 / list targetType 过滤 / add upsert 幂等 / remove 幂等 / isFavorited 批量红心 / 目标已删 detail=null。

---

## 📌 范式

- **N+1 规避（list 详情）**：`findMany where id:in` + Map 关联 — **范式累计第 3 次**（family.myFamily/familyRanking V0.1.34 / sport.groupMembers V0.1.42）
- **批量红心（isFavorited）**：详情页/列表页常用 — 一次查 N 条收藏状态，前端按 targetId 索引
- **upsert 幂等**：add 用 `prisma.favorite.upsert`，依赖 `@@unique([userId, targetType, targetId])` 防重 — 重复收藏不报错
- **deleteMany 幂等**：remove 用 `deleteMany`，不存在也返 ok — 前端无需先查
- **目标已删 detail=null**：前端按 detail 隐藏或提示"该内容已下架"
- **`@@unique` 三列复合**：`(userId, targetType, targetId)` — 同一用户同类型同目标只一条

---

## ⚠️ 已知坑

1. **目标已删 detail=null**：Content/Product 删除后 favorite 记录保留，但 detail=null；前端需处理"已删"展示
2. **未级联删除**：Content/Product 删除时未级联清理 favorite（用户可能看到"已删"条目）；V0.1.29 MVP YAGNI（待清理脚本）
3. **批量上限**：isFavorited 接受 `items[]`，未限制最大长度（极端情况 1000+ 会一次性查 N 条）；前端按需 limit（详情页 5-10 条，列表页 20-50 条够用）
4. **未接 Cache**：list/isFavorited 未接 Redis（每次实时查 DB）— 当前 favorite 表不大（百万以下），性能可接受

---

## 🔗 关联

- **content / mall**：被收藏目标（Content/Product 跨表引用）
- **前端 pages/favorite**：tab 内容/商品 + 列表卡 + 取消收藏（V0.1.29 新页）
- **前端商品/内容详情页**：调 isFavorited 拿红心状态
