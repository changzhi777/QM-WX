# weekly-report — 周报聚合 module

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../CLAUDE.md) → [`apps/server/CLAUDE.md`](../../../CLAUDE.md) → **apps/server/src/modules/weekly-report/**（这里）
>
> **GAP-12 收口补建**（init #10 2026-07-15）

---

## 🎯 职责

聚合某群某周的打卡数据,输出战报(top 5 + 冠军 + 总公里 + 参与人数)。供小程序「跑群周报战报」+「我的周报」使用。

**触发方式**：
1. **手动**：POST `/api/weekly-report` `{ action: "trigger", payload: { groupId, period? } }`
2. **自动**：BullMQ 每周日 20:00 扫所有群(jobs/weekly-report.job.ts)

**数据写入**：写 `GroupReport` 表(后续可生成战报图)。

---

## 📂 文件清单

| 文件 | 说明 |
| --- | --- |
| `weekly-report.service.ts` | 3 action: `currentWeek`(本周所有群周报) / `myReport`(我的某群周报) / `trigger`(手动触发) + 60s Cache 聚合 |
| `weekly-report.schema.ts` | Zod schema `WeeklyReportActionBodySchema` (action + payload) |
| `weekly-report.routes.ts` | POST /api/weekly-report switch 分发(3 case) |

**测试**：`apps/server/tests/modules/weekly-report/`(沿用)

---

## 🚪 API（3 action）

| Action | Payload | 返回 | 说明 |
| --- | --- | --- | --- |
| `currentWeek` | `{ groupId? }` | `{ reports: GroupReport[] }` | 本周所有群周报(可选 groupId 过滤) |
| `myReport` | `{ groupId }` | `GroupReport` | 我的某群周报(单 group) |
| `trigger` | `{ groupId, period? }` | `{ triggered: true, reportId }` | 手动触发聚合(写入 GroupReport) |

**period**：ISO 周号 `YYYY-Www`（如 `2026-W28`）,默认本周。

---

## 🔑 关键实现

### ISO 周计算
```ts
function isoWeek(date: Date): { period: string; start: Date; end: Date } {
  // 周一为周首日（V0.1.132 沉淀的 ISO 周范式）
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7; // 周日=0 → 7
  d.setDate(d.getDate() - (day - 1));
  // ...
}
```

### 60s Cache
```ts
const AGGREGATE_CACHE_TTL_SEC = 60;
const aggregateCacheKey = (groupId: string, period: string) =>
  `weeklyReport:aggregate:${groupId}:${period}`;
```
群周报随群成员打卡变化,60s 容忍延迟。

---

## 📦 依赖

- `@qm-wx/shared`（WeeklyReport / WeeklyReportMember 类型）
- `infra/prisma` + `infra/cache`（Cache 60s 热路径之一）
- `jobs/weekly-report.job.ts`（BullMQ 定时任务）

---

## 📌 当前状态

- ✅ 3 action 完整实现
- ✅ ISO 周计算范式（V0.1.132 沉淀）
- ✅ 60s Cache 接入（V0.1.15 缓存热路径）
- ✅ BullMQ 自动触发(每周日 20:00)

---

🤙 **GAP-12 收口补建**:weekly-report module CLAUDE.md。YAGNI 仅作 GAP-12 收口追踪用。