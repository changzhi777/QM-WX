# ludong — 律动 module（V2 stub）

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../CLAUDE.md) → [`apps/server/CLAUDE.md`](../../../CLAUDE.md) → **apps/server/src/modules/ludong/**（这里）
>
> **GAP-12 收口补建**（init #10 2026-07-15）+ **V2 stub**

---

## 🎯 职责

律动(第三方数据聚合平台) module(**V2 stub**,Phase 7+ 实现)。

**典型场景**：佳明/Strava/COROS 等设备数据通过律动统一聚合,本 module 提供律动账号绑定 + 数据落库。

**当前 4 action（Zod schema 已定义,service 部分 stub）**：
- `bindAccount` — 绑定律动账号
- `bindingStatus` — 绑定状态查询
- `listOutbox` — 出箱列表(失败重试)
- `flushOutbox` — 手动 flush 出箱

---

## 📂 文件清单

| 文件 | 说明 |
| --- | --- |
| `ludong.service.ts` | 4 action stub(部分可返 mock) |
| `ludong.schema.ts` | Zod schema `BindLudongInputSchema` / `ListOutboxInputSchema` |
| `ludong.routes.ts` | POST /api/ludong switch 分发(4 case) |

**注意**：律动 webhook 是**独立 HTTP 触发路由**(`/webhook/ludong`),不走 POST /api/ludong。

**jobs**：`jobs/ludong-sync.job.ts`(BullMQ stub,定时拉律动)

---

## 🚪 API（4 action）

| Action | 鉴权 | Payload | 说明 |
| --- | --- | --- | --- |
| `bindAccount` | 需登录 | `{ ludongUserId, token }` | 绑定律动账号 |
| `bindingStatus` | 需登录 | — | 绑定状态查询 |
| `listOutbox` | 需登录(管理?) | `{ status?, limit? }` | 出箱列表(失败重试) |
| `flushOutbox` | 需登录(管理?) | — | 手动 flush 出箱 |

**webhook**：`POST /webhook/ludong`(独立路由,无鉴权,内部校验签名) — 律动主动推数据。

---

## 🔑 现状

### 与 device module 的关系
- **device**：`device.corosAuthUrl` + `device.garminAuthUrl` + Terra API(V0.1.128/146) — **Terra 已是律动的等价方案**(第三方聚合)
- **ludong**：V2 stub — Terra 走通后 YAGNI 不实现,留待真正接入律动时再实现

### webhook 路由
`POST /webhook/ludong` 是**独立 HTTP 路由**,不走 POST /api/ludong(避免 requireLogin 中间件拦截)。注册位置:`app.ts` 单独注册。

---

## 📦 依赖

- 暂无(service stub)
- 未来依赖：律动 OAuth2 client_credentials + webhook 签名校验

---

## 📌 当前状态

- ✅ routes 4 case switch 落地
- ✅ schema 2 个 Zod 已定义
- ⚠️ service 全 stub
- ⏳ jobs/ludong-sync.job.ts BullMQ stub 已建

---

🤙 **GAP-12 收口补建**:ludong module CLAUDE.md。V2 stub,YAGNI 仅作 GAP-12 收口追踪用 — 实际聚合已用 **Terra API**(V0.1.128/146) 替代方案。