# coupon module — 优惠券

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../../../CLAUDE.md) → [`apps/server/`](../../../CLAUDE.md) → [`modules/`](../) → **coupon/**（这里）
> 父级：[apps/server CLAUDE.md](../../../CLAUDE.md) | 同级：[cart](../cart/) / [points](../points/) / [address](../address/) / [distribution](../../distribution/) / [mall](../../mall/)

> 引入版本：**V0.1.23**（2026-07-02 晚，`/zcf:workflow` 个人中心电商版 / 方案 2-A）
> 相关 pic：（电商通用券领取中心）

---

## 🎯 模块职责

**优惠券**：领券中心 + 我的券（未使用/已使用/已过期） + 可用券数（红点）。

- **MVP 范围**：**领看不集成下单**（V0.1.23 暂未对接 `mall.createOrder` 自动选用券，GAP-6 二次上线预留）
- **模板数据源**：`COUPON_TEMPLATES` 常量（4 套：新人 10 元 / 满 100 减 20 / 满 200 减 50 / 跑者 9 折）— 不建模板表（简化）
- **用户实例**：领券时 `Coupon.create` 一条实例（`status: unused`，`expireAt = now + validDays * 86400 * 1000`）
- **防重**：同 `title` 仅能领一次（`findFirst where userId+title`）
- **过期自动标记**：`myCoupons` / `availableCount` 调用前 `updateMany where status:unused expireAt<now → expired`（懒更新）

---

## 🚪 入口与启动

| 文件 | 职责 | 行数 |
| --- | --- | ---: |
| `coupon.routes.ts` | POST `/api/coupon`（统一 switch action） | ~30 |
| `coupon.service.ts` | 4 action + 模板常量 + markExpired 工具 | 84 |
| `coupon.schema.ts` | Zod | — |

注册：`src/app.ts` 内 `app.register(couponRoutes, { prefix: '/api/coupon' })`

---

## 📡 对外接口（4 action）

> 统一 POST `/api/coupon` body：`{ action, payload }`，需 JWT 鉴权

| action | payload | 返回（data）| 说明 |
| --- | --- | --- | --- |
| `templates` | — | `{ templates: [...{ templateId, title, type, amount, minSpend, validDays, received }] }` | 领券中心（4 套模板 + `received` 标记已领） |
| `myCoupons` | `{ status? }` | `{ list: Coupon[], count }` | 我的券（按 status 过滤；调用前自动 markExpired；Date 转 ISO 字符串） |
| `availableCount` | — | `{ count }` | 可用券数（mine 红点 / 首页徽标用） |
| `receive` | `{ templateId }` | `{ id, expireAt }` | 领取（模板查找 + 同 title 防重 + 创建实例 + 算 expireAt） |

---

## 🔗 集成点

- **被 frontend 调用**：mine「优惠券」入口 + 领券中心 tab
- **未被 mall.createOrder 集成**：V0.1.23 暂未对接下单自动选用券（留待 GAP-6 二次上线）；当前下单流程无券抵扣

---

## 🧪 测试

```bash
# tests/modules/coupon/coupon.service.test.ts — 5 单元
pnpm test coupon
```

覆盖：templates 标记已领 / myCoupons status 过滤 + markExpired / availableCount / receive 同 title 防重 badRequest / 模板不存在 notFound。

---

## 📌 范式

- **模板常量 + 实例表**：`COUPON_TEMPLATES` 静态定义（不建模板表，V0.1.23 MVP），用户领取 → 创建 Coupon 实例（title/type/amount/minSpend/expireAt 复制自模板）
- **懒更新过期**：每次 `myCoupons` / `availableCount` 调用前 `markExpired(userId)` 一次性把 unused+过期 → expired；避免定时任务或单独 cron
- **同 title 防重**：用 `title` 而非 `templateId`（模板可改 ID 但 title 不变，兼容模板扩展）；`findFirst where userId+title` + badRequest
- **Date 转 ISO 字符串**：返前端前所有 Date 字段 `.toISOString()`，避免 JSON 序列化 Date 类型不可控
- **不存于 user.points**：券是"未使用优惠"而非余额，独立表 + 状态机管理（unused/used/expired）

---

## ⚠️ 已知坑

1. **MVP 未集成下单**：mall.createOrder 当前未对接券抵扣（GAP-6 二次上线）；用户领了券下单时仍按原价结算（UX 不闭环，需 V0.1.50+ 集成）
2. **模板写死**：`COUPON_TEMPLATES` 数组在 service 文件里硬编码，新增/改券需改代码；V0.1.23 MVP 简化，后续可建 CouponTemplate 表 + admin CRUD
3. **过期时间按服务器时间**：expireAt 用 `Date.now() + validDays * 86400 * 1000`，未跨时区处理（用户在 UTC+9 领取，模板 validDays=30，但 expireAt 是 UTC 30 天后）；V0.1.23 MVP 简化
4. **优惠券不抵扣运费**：amount/minSpend 只算商品金额，未联动运费（V0.1.23 暂未做运费计算）

---

## 🔗 关联

- **mall.createOrder**：GAP-6 二次上线集成（下单时自动选用最优券 + 扣减 amount）
- **cart**：未联动（cart 合计未应用券抵扣）
- **points**：未联动（签到积分不能兑换券）
