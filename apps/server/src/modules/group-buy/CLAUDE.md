# group-buy module — 团购（成团 + 团购价）

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../../../CLAUDE.md) → [`apps/server/`](../../../CLAUDE.md) → [`modules/`](../) → **group-buy/**（这里）
> 父级：[apps/server CLAUDE.md](../../../CLAUDE.md) | 同级：[mall](../../mall/) / [notification](../../notification/) / [feed](../../feed/)

> 引入版本：**V0.1.37**（2764 团购 MVP，`/zcf:workflow` 方案2 简化），**V0.1.38**（admin 管理 + 成团团购价下单），V0.1.107 自提核销兼容

---

## 🎯 模块职责

**团购**：商品限时团购价 + 凑人数成团，达目标后享团购价下单。闭环：列团购 → 看详情 → 加入 → 达目标循环 notify → admin 创建团购 → 用户成团下单（团购价快照）。

- **数据来源**：`GroupBuy`（productId + groupPrice + targetCount + currentCount + status + endDate）+ `GroupBuyMember`（groupBuyId + userId，`@@unique` 防重）
- **状态机**：`active`（拼团中） → `reached`（达成，商品仍可下单用团购价）→ `ended`（结束）
- **达目标循环 notify**：`join` 事务内 if currentCount >= targetCount → status='reached' + 调 `notify(type=system, content='团购已成团，立即下单享团购价')` 给 groupBuy 发起者
- **团购价快照**：`mall.createOrder` 带 groupBuyId 落 DistrOrder 时按 groupBuy.groupPrice 锁定，**OrderItem.price = groupPrice**

---

## 🚪 入口与启动

| 文件 | 职责 | 行数 |
| --- | --- | ---: |
| `group-buy.routes.ts` | POST `/api/group-buy`（统一 4 action switch） | ~50 |
| `group-buy.service.ts` | 4 action（list/detail/join/myJoined）+ notify 集成 | ~127 |
| `group-buy.schema.ts` | Zod（GroupBuyPageInput / GroupBuyIdInput） | ~20 |

注册：`src/app.ts` 内 `app.register(groupBuyRoutes, { prefix: '/api/group-buy' })`

---

## 📡 对外接口（4 action）

> 统一 POST `/api/group-buy` body：`{ action, payload }`，需 JWT 鉴权

| action | payload | 返回 | 说明 |
| --- | --- | --- | --- |
| `list` | `{ page?, pageSize? }` | `{ list, total }` | active 团购列表（含 product） |
| `detail` | `{ id }` | `{ id, product, currentCount, targetCount, isJoined, ... }` | 详情 + isJoined 拼状态 |
| `join` | `{ id }` | `{ groupBuyId, currentCount, isReached }` | 加入（currentCount+1，达目标循环 notify） |
| `myJoined` | `{ page?, pageSize? }` | `{ list, total }` | 我参与的团购 |

---

## 🔗 关键集成点

### `join` 达目标循环 notify（关键范式）

```ts
async join(userId, { id }) {
  return prisma.$transaction(async (tx) => {
    // 1. 查团购
    const gb = await tx.groupBuy.findUnique({ where: { id } });
    if (!gb || gb.status !== 'active') throw badRequest('团购已结束');

    // 2. 防重复
    const exist = await tx.groupBuyMember.findUnique({
      where: { groupBuyId_userId: { groupBuyId: id, userId } }
    });
    if (exist) throw badRequest('已参与');

    // 3. 加成员 + currentCount+1（带 status 守卫）
    const [, updated] = await Promise.all([
      tx.groupBuyMember.create({ data: { groupBuyId: id, userId } }),
      tx.groupBuy.update({ 
        where: { id, status: 'active' },  // 防并发
        data: { currentCount: { increment: 1 } }
      })
    ]);

    // 4. 达目标循环 notify
    if (updated.currentCount >= updated.targetCount) {
      await tx.groupBuy.update({ 
        where: { id }, 
        data: { status: 'reached' }
      });
      // 通知发起者（事务外 try/catch 吞错 — notify 集成函数 DRY）
      try {
        await notify({
          userId: gb.userId,
          actorId: userId,
          type: 'system',
          targetType: 'group_buy',
          targetId: id,
          content: '团购已成团，立即下单享团购价',
        });
      } catch {}
    }

    return { groupBuyId: id, currentCount: updated.currentCount, isReached: updated.status === 'reached' };
  });
}
```

### `mall.createOrder` 团购价快照（V0.1.38 深化）

- 接 input.groupBuyId（可选）
- 校验团购存在 + status='reached' + 用户已参与（GroupBuyMember）
- **订单明细**：`OrderItem.price = groupBuy.groupPrice`（**团购价快照**，防团购结束后 OrderItem.price 回涨）
- **订单字段**：`Order.groupBuyId = input.groupBuyId`

### admin +2 action（V0.1.38）

- `upsertGroupBuy({ id?, productId, groupPrice, targetCount, endDate })` 创建/编辑团购
- `listGroupBuys({ status?, page, pageSize })` admin 列表（详见 [`admin/CLAUDE.md`](../admin/CLAUDE.md)）

---

## 📊 数据模型

| 表 | 关键字段 | 说明 |
| --- | --- | --- |
| **GroupBuy** | id / productId / userId（发起者）/ groupPrice(Decimal) / targetCount / currentCount(默认0) / status(active/reached/ended) / endDate / createdAt | 索引 [status, endDate]（list 用）+ [productId] |
| **GroupBuyMember** | id / groupBuyId / userId / joinedAt | `@@unique([groupBuyId, userId])` 防重 |

**Order 加字段**（V0.1.38）：`groupBuyId String?`（外键 ON DELETE SET NULL，关联团购）

---

## 🧪 测试（V0.1.131）

`tests/modules/group-buy/`：
- `group-buy.service.test.ts` — **8 单元测试**（list 1 + detail 1 + join 4 含达目标 notify / myJoined 1 + 失败路径 1）
- `group-buy.routes.test.ts` — **6 路由单测**（V0.1.112 GAP-3.5）

覆盖点：join 事务一致性 + 达目标循环 notify + currentCount 并发守卫 + active vs reached 路由校验

---

## 🔧 关键依赖与配置

- **Prisma**：2 张表（GroupBuy / GroupBuyMember）+ Order +groupBuyId
- **依赖**：
  - `notification.notify()` 集成函数（达目标通知发起者，type=system）
  - `mall.createOrder` 集成（团购价快照）
  - `mall.schema.deliveryType` 兼容（V0.1.107 自提 deliveryType=pickup 可与 groupBuyId 共存）
- **常量**：无（团购价即 basePrice * 折扣由 admin 设定）

---

## 📌 常见问题 (FAQ)

**Q：团购结束后还能用团购价吗？**
A：能。`status='reached'` 后用户可继续下单用团购价（OORderItem.price 快照），`status='ended'` 后必须改 admin 标志。

**Q：能多商品团购吗？**
A：当前 1 团购 = 1 商品（productId 唯一字段）。如需多商品 bundle，V0.1.150+ 改 GroupBuy + GroupBuyItem 多对多。

**Q：退款后团购价怎么处理？**
A：退款走 `mall.refundOrder`，Order.groupBuyId 保留（ON DELETE SET NULL）；团购 currentCount 不减（团购成团不变），退款金额按 orderItem.price (=groupPrice) 退。

**Q：达目标循环 notify 用户没收到怎么办？**
A：notify 失败仅 console.error 不阻塞 join（fail-safe）；前端轮询 `group-buy.detail.isJoined` 看 status 切换。

**Q：能修改已发布团购的 groupPrice 吗？**
A：admin.upsertGroupBuy 可更新，但已下单用户的 OrderItem.price 仍为旧快照（订单数据不可逆）。

---

## 📁 相关文件清单

```
src/modules/group-buy/
├── group-buy.routes.ts          # POST /api/group-buy（4 action switch）
├── group-buy.service.ts         # 4 action + notify 集成
├── group-buy.schema.ts          # Zod
└── CLAUDE.md                    # 本文件

tests/modules/group-buy/
├── group-buy.service.test.ts    # 8 单测
└── group-buy.routes.test.ts     # 6 路由单测

# 集成点
src/modules/mall/order.service.ts              # createOrder 团购价快照
src/modules/notification/notification.service.ts # notify() 集成函数
src/modules/admin/admin.service.ts             # upsertGroupBuy / listGroupBuys

# Prisma
prisma/schema.prisma                        # GroupBuy / GroupBuyMember
prisma/migrations/20260707020000_group_buy/ # 建表（V0.1.37）
prisma/migrations/20260707030000_order_groupbuy/  # Order +groupBuyId（V0.1.38）
```

---

## 📝 变更记录 (Changelog)

- **2026-07-07** — V0.1.37 创建（2764 团购 MVP / /zcf:workflow 方案2+B）：2 表 GroupBuy+GroupBuyMember + 4 action + 达目标循环 notify + 2 新页 group-buy/group-buy-detail + mall entry-grid 入口 + 8 单测
- **2026-07-07** — V0.1.38 团购深化：admin +upsertGroupBuy / listGroupBuys + mall.createOrder 团购价快照 + 1 迁移（Order +groupBuyId）
- **2026-07-10** — V0.1.112 GAP-3.5 +6 routes 单测
- **2026-07-12** — V0.1.131 创建 module 级 CLAUDE.md（**GAP-8 关闭** group-buy 侧）
