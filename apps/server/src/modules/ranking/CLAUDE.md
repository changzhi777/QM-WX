# ranking — 多维榜单 module

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../CLAUDE.md) → [`apps/server/CLAUDE.md`](../../../CLAUDE.md) → **apps/server/src/modules/ranking/**（这里）
>
> **GAP-12 收口补建**（init #10 2026-07-15）

---

## 🎯 职责

多维榜单(读模型)。**复用 sport.action/payload 路由范式**,提供跨维度榜单查询。

**当前 action**：`groupRankingMulti`(跑群多维度榜单)

---

## 📂 文件清单

| 文件 | 说明 |
| --- | --- |
| `ranking.service.ts` | `groupRankingMulti(userId, input)` 多维榜单聚合 |
| `ranking.schema.ts` | Zod schema `GroupRankingMultiInputSchema` |
| `ranking.routes.ts` | POST /api/ranking switch 分发(1 case) + `parseOrBadRequest` helper |

---

## 🚪 API（1 action）

| Action | Payload | 返回 | 说明 |
| --- | --- | --- | --- |
| `groupRankingMulti` | `{ groupId, period, dimension }` | `{ rankings: RankItem[] }` | 跑群多维榜单(按 period 周/月 + dimension 距离/次数/配速/心率) |

---

## 🔑 关键设计

### 复用 sport 数据源
榜单数据来源是 Checkin 表(由 sport module 写入),ranking 是**纯读模型**,无独立 schema 表。

### 复用 sport action 路由范式
POST /api/ranking `{ action, payload }` switch 分发,与 sport/shoes/goal 等 module 一致。

### parseOrBadRequest helper
```ts
function parseOrBadRequest<S extends z.ZodTypeAny>(schema: S, payload: unknown): z.output<S> {
  try { return schema.parse(payload) as z.output<S>; }
  catch (e) {
    if (e instanceof z.ZodError) {
      const first = e.issues[0];
      throw Errors.badRequest(`${first.path.join('.')}: ${first.message}`);
    }
    throw e;
  }
}
```
**Zod 校验失败 → 400 + path:msg**(setErrorHandler 捕 ZodError → 400)。

---

## 📦 依赖

- `infra/prisma`(`Checkin` + `User` 表)
- `common/errors`(`Errors.badRequest`)
- `@qm-wx/shared`(维度/周期 enum type)

---

## 📌 当前状态

- ✅ groupRankingMulti 1 action 完整
- ✅ Zod schema 校验 + parseOrBadRequest 范式
- ✅ 复用 sport 数据源(无独立表,纯读模型)

---

## 🔗 相关 module

- **sport**(`ranking.groupRankingMulti` 数据源 = sport.checkin)
- **family**(`familyRanking` 也是榜单,与本 module 不同 group 维度)

---

🤙 **GAP-12 收口补建**:ranking module CLAUDE.md。YAGNI 仅作 GAP-12 收口追踪用。