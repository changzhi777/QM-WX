# cart module — 购物车

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../../../CLAUDE.md) → [`apps/server/`](../../../CLAUDE.md) → [`modules/`](../) → **cart/**（这里）
> 父级：[apps/server CLAUDE.md](../../../CLAUDE.md) | 同级：[points](../points/) / [address](../address/) / [coupon](../coupon/) / [distribution](../../distribution/) / [mall](../../mall/)

> 引入版本：**V0.1.22**（2026-07-02，`/zcf:workflow` B-核心 / 方案 1）
> 相关 pic：2765（购物车）

---

## 🎯 模块职责

**购物车**：跨设备持久化的购物车（用户登录态），支持加购、移除、改数量、清空、自动合计。

- **数据来源**：`Cart` 表（`userId + productId` 复合 `@unique`，同商品合并 qty）
- **Decimal 处理**：`Product.price` 是 Decimal，进合计时 `Number(price) * qty`，返前端 `toFixed(2)` 字符串（避免 JSON 序列化丢精度）
- **状态联动**：`list` 跳过已下架商品（`product.status !== 'on'` 不计入 `totalAmount`，但仍展示，前端红字提示）
- **软限流**：`updateQty(qty<=0)` 走 `remove` 路径（同商品减到 0 自动移除，UX 一致）

---

## 🚪 入口与启动

| 文件 | 职责 | 行数 |
| --- | --- | ---: |
| `cart.routes.ts` | POST `/api/cart`（统一 switch action） | 42 |
| `cart.service.ts` | 5 CRUD action | 87 |
| `cart.schema.ts` | Zod（AddInput / RemoveInput / UpdateQtyInput） | 17 |

注册：`src/app.ts` 内 `app.register(cartRoutes, { prefix: '/api/cart' })`

---

## 📡 对外接口（5 action）

> 统一 POST `/api/cart` body：`{ action, payload }`，需 JWT 鉴权（req.user.id 取 userId）

| action | payload | 返回（data）| 说明 |
| --- | --- | --- | --- |
| `add` | `{ productId, qty? }` | `{ productId, qty }` | 加购（同商品 upsert，qty 累加；商品不存在 → notFound，已下架 → badRequest） |
| `remove` | `{ productId }` | `{ ok, deleted }` | 移除单商品（deleteMany 幂等，不存在也 ok） |
| `list` | — | `{ items, totalAmount, count }` | 列表（含商品详情 + 合计金额 + 商品件数；Decimal 转字符串） |
| `updateQty` | `{ productId, qty }` | `{ productId, qty }` | 改数量（`qty <= 0` 自动走 remove 路径） |
| `clear` | — | `{ ok, deleted }` | 清空购物车 |

---

## 🔗 集成点

- **被 mall.createOrder 调用**：下单前 `cart.clear(userId)` 清空（V0.1.22 设计，后续可改"购物车来源订单"统计）
- **被前端调用**：商品详情页「加入购物车」/ 购物车页 onLoad `list` / 结算页「去结算」

---

## 🧪 测试

```bash
# tests/modules/cart/cart.service.test.ts — 6 单元
pnpm test cart
```

覆盖：add upsert 合并 qty / remove deleteMany 幂等 / list 合计 Decimal 转字符串 + 已下架跳过 / updateQty qty<=0 走 remove / clear / 商品不存在 notFound / 已下架 badRequest。

---

## 📌 范式

- **Decimal 序列化**：进 JSON 前 `Number → toFixed(2) → string`，避免 `Decimal` 对象被 `JSON.stringify` 转字符串时丢精度
- **upsert 合并**：加购用 `prisma.cart.upsert`，同 userId+productId 自动累加 qty（无需前端先查再加）
- **状态联动**：list 时检查 `product.status`，下架商品仍展示但不计入合计（前端红字引导用户移除）
- **deleteMany 幂等**：remove / clear 都用 `deleteMany` 而非 `delete`，不存在也返 ok（前端无需先查）

---

## ⚠️ 已知坑

1. **Decimal JSON 序列化**：直接 `JSON.stringify` Prisma Decimal 会变字符串，前端拿到 `Decimal.toString()` 形式需 `parseFloat`；本 module 在 service 出口显式 `toFixed(2)`，**不要**直接返 Decimal 对象
2. **cart.clear 不可逆**：清空是硬删，无回收站；下单成功后自动清空是设计行为，但用户手动 clear 也无 undo（V0.1.22 MVP，YAGNI）
3. **qty=0 行为**：updateQty(qty=0) 走 remove 路径，前端可借此「一键移除」按钮

---

## 🔗 关联

- **mall**：下单前清空购物车（V0.1.22 集成）
- **points**：cart.add 不送积分（与 purchase 任务挂钩，订单完成后送）
- **coupon**：未集成下单使用券（MVP 领看不集成，V0.1.23 暂未对接）
