# address module — 收货地址

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../../../CLAUDE.md) → [`apps/server/`](../../../CLAUDE.md) → [`modules/`](../) → **address/**（这里）
> 父级：[apps/server CLAUDE.md](../../../CLAUDE.md) | 同级：[cart](../cart/) / [points](../points/) / [coupon](../coupon/) / [distribution](../../distribution/) / [mall](../../mall/)

> 引入版本：**V0.1.23**（2026-07-02 晚，`/zcf:workflow` 个人中心电商版 / 方案 1）
> 相关 pic：（电商类通用收货地址表单）

---

## 🎯 模块职责

**收货地址管理**：CRUD + 唯一默认地址（用户下单时优先选默认地址）。

- **数据来源**：`Address` 表（`userId + isDefault + name + phone + province/city/district/detail + isDefault`）
- **唯一默认保证**：`setDefault` / `create(isDefault=true)` / `update(isDefault=true)` 三处都事务内 `updateMany userId+isDefault:true → isDefault:false` 后再设当前（保证每用户至多 1 条默认）
- **排序规则**：`list` 返 `[{ isDefault: 'desc' }, { updatedAt: 'desc' }]`（默认地址置顶 + 最近编辑优先）

---

## 🚪 入口与启动

| 文件 | 职责 | 行数 |
| --- | --- | ---: |
| `address.routes.ts` | POST `/api/address`（统一 switch action） | ~30 |
| `address.service.ts` | 5 action（list/create/update/remove/setDefault） | 53 |
| `address.schema.ts` | Zod（AddressInput） | — |

注册：`src/app.ts` 内 `app.register(addressRoutes, { prefix: '/api/address' })`

---

## 📡 对外接口（5 action）

> 统一 POST `/api/address` body：`{ action, payload }`，需 JWT 鉴权

| action | payload | 返回（data）| 说明 |
| --- | --- | --- | --- |
| `list` | — | `Address[]` | 我的所有地址（默认置顶 + 按 updatedAt desc） |
| `create` | `AddressInput` | `Address` | 新增（`isDefault=true` 时事务内清他处默认） |
| `update` | `{ id, ...AddressInput }` | `Address` | 更新（先校验 `id+userId` 存在；`isDefault` 联动清他处） |
| `remove` | `{ id }` | `{ ok, deleted }` | 删除（deleteMany 幂等） |
| `setDefault` | `{ id }` | `{ ok }` | 设为默认（事务内清他处默认 + 设当前；先校验存在） |

---

## 🔗 集成点

- **被 mall.createOrder 调用**：下单时优先选 `isDefault=true` 地址，否则取最新一条
- **被前端调用**：mine「地址管理」+ 订单结算页「选择地址」

---

## 🧪 测试

```bash
# tests/modules/address/address.service.test.ts — 4 单元
pnpm test address
```

覆盖：list 排序 / create 默认清他处 / update 校验存在 / remove 幂等 / setDefault 事务清他处。

---

## 📌 范式

- **`updateMany` 清他处默认**：`setDefault` / `create(isDefault=true)` / `update(isDefault=true)` 都用 `updateMany where { userId, isDefault: true } data { isDefault: false }`（无 op 安全的——如果当前已是默认，不会重复清）
- **事务保证**：create/update/setDefault 全部 `$transaction`，避免"清他处后未设当前"导致的"全无默认"状态
- **deleteMany 幂等**：remove 用 `deleteMany` 而非 `delete`，不存在也返 ok（前端无需先查）
- **`findFirst` 校验存在**：update/remove 先 `findFirst where { id, userId }`，校验归属（防越权）+ 存在性（避免 P2025 异常转 500）

---

## ⚠️ 已知坑

1. **区级联动数据**：当前 `province/city/district` 是字符串，未联动前端 picker（前端自行处理 + 拼字符串传上来）；V0.1.23 MVP 简化
2. **地址簿最大数**：未限制每用户最多保存几条（极端情况几百条会导致 list 查询慢）；YAGNI 暂不加限制
3. **删除默认地址的级联**：当前删除默认地址后，用户无默认地址（前端 mall.createOrder 取最新一条兜底）；未做"自动提升最近一条为默认"

---

## 🔗 关联

- **mall.createOrder**：下单取默认地址（V0.1.23 集成）
- **cart**：未联动
- **points**：未联动
