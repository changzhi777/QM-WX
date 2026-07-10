# family module — 家庭空间

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../../../CLAUDE.md) → [`apps/server/`](../../../CLAUDE.md) → [`modules/`](../) → **family/**（这里）
> 父级：[apps/server CLAUDE.md](../../../CLAUDE.md) | 同级：[follow](../follow/) / [feed](../feed/) / [favorite](../favorite/) / [notification](../../notification/)

> 引入版本：**V0.1.34**（2026-07-04，pic 2776 家庭方向）+ **V0.1.39**（转让 + 解散 + 家庭成就）
> 相关 pic：2776（家庭空间 — 家庭卡 + 本月跑量榜 + 家庭目标）

---

## 🎯 模块职责

**家庭空间**：创建/加入家庭 + 家庭卡（成员本月跑量）+ 跑量榜（本周/本月）+ 转让/解散（owner 闭环）+ 家庭成就（全家累计跑量里程碑）。

- **数据来源**：
  - **`Family`** 表（name/ownerId/`inviteCode @unique` 8 位 hex 短码）
  - **`FamilyMember`** 表（familyId + `userId @unique` **一人一家庭强制** + role(owner|member)）
  - **`Goal +familyId`**（V0.1.34 复用，null=个人目标，有值=家庭目标）
- **一人一家庭**：`FamilyMember.userId @@unique` 强制（已有则 conflict）
- **8 位邀请码**：`randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()`（hex，@unique 兜底）
- **owner 闭环（V0.1.39）**：owner 不能直接 leaveFamily（需先 transferOwner / dissolveFamily）
- **家庭成就（V0.1.39）**：复用 `stats.myCertificates` 范式（MILESTONES 常量 + Checkin aggregate），动态生成零建表（100/500/1000/2000/5000km）
- **N+1 规避**：myFamily/familyRanking 用 **`groupBy(by userId) + Map 关联`**（范式同 favorite.list / sport.groupMembers）

---

## 🚪 入口与启动

| 文件 | 职责 | 行数 |
| --- | --- | ---: |
| `family.routes.ts` | POST `/api/family`（统一 switch action） | ~60 |
| `family.service.ts` | 9 action + cnMonthRange/cnWeekRange 工具 | 269 |

注册：`src/app.ts` 内 `app.register(familyRoutes, { prefix: '/api/family' })`

---

## 📡 对外接口（9 action）

> 统一 POST `/api/family` body：`{ action, payload }`，需 JWT 鉴权

| action | payload | 返回（data）| 说明 |
| --- | --- | --- | --- |
| `createFamily` | `{ name }` | `{ id, name, inviteCode }` | 创建家庭（事务建 Family + FamilyMember(role=owner)；已有家庭 conflict） |
| `joinFamily` | `{ inviteCode }` | `{ id, name }` | 加入家庭（按 inviteCode 查；已有家庭 conflict） |
| `myFamily` | — | `{ family: null \| { id, name, inviteCode, members: [...含 monthDistance], ... } }` | 家庭详情 + 成员列表含本月跑量（N+1 规避） |
| `leaveFamily` | — | `{ ok }` | 离开家庭（owner 不可离开，需先解散/转让） |
| `familyRanking` | `{ period: 'week'\|'month' }` | `{ period, start, end, ranking: [...] }` | 成员跑量榜（按距离 desc；N+1 规避） |
| `inviteInfo` | — | `{ name, inviteCode }` | 邀请信息（前端分享给家人） |
| `transferOwner`（V0.1.39） | `{ newOwnerId }` | `{ ok }` | 转让家长（事务：旧 owner role=member + 新 owner role=owner + Family.ownerId 更新） |
| `dissolveFamily`（V0.1.39） | — | `{ ok }` | 解散家庭（仅 owner 可；删 Family 级联 FamilyMember + Goal.familyId） |
| `familyAchievements`（V0.1.39） | — | `{ totalDistance, achievements: [...{ km, achieved, progress }] }` | 家庭成就（动态生成零建表，复用 stats.myCertificates 范式） |

---

## 🔑 关键范式：N+1 规避（myFamily / familyRanking groupBy）

```ts
// myFamily — 1 次 groupBy 替代 N 次 aggregate
const memberIds = member.family.members.map((m) => m.userId);
const grouped = await prisma.checkin.groupBy({
  by: ['userId'],
  where: { userId: { in: memberIds }, date: { gte: range.start, lt: range.end } },
  _sum: { distance: true },
});
const distMap = new Map(grouped.map((g) => [g.userId, g._sum.distance ?? 0]));
const members = member.family.members.map((m) => ({
  ..., monthDistance: Math.round((distMap.get(m.userId) ?? 0) * 10) / 10,
}));
```

**对比 N+1**：5 个家庭成员每月榜单 = 5 次 aggregate + 1 次 members 查询；本范式 = **2 次查询**（1 members + 1 groupBy）。

**范式累计第 4 次**（favorite.list V0.1.29 / family.myFamily V0.1.34 / family.familyRanking V0.1.34 / sport.groupMembers V0.1.42）。

---

## 🧪 测试

```bash
# tests/modules/family/family.service.test.ts — 10 单元（V0.1.34）
pnpm test family
```

覆盖：createFamily 事务建 + 8 位 inviteCode / joinFamily 按 inviteCode / myFamily 含成员 monthDistance（N+1 groupBy mock）/ leaveFamily owner 不可（badRequest）/ leaveFamily member OK / familyRanking groupBy / inviteInfo / **mockImplementation 并发 aggregate 按 userId 区分**（familyRanking Promise.all mockResolvedValueOnce 顺序不保证 → mockImplementation）。

> ⚠️ **测试坑**：familyRanking Promise.all 并发 aggregate，mockResolvedValueOnce 顺序不保证 → 用 `mockImplementation` 按 userId 区分（并发 mock 测试范式，V0.1.34 沉淀）

---

## 📌 范式

- **一人一家庭 `@@unique`**：`FamilyMember.userId @unique` — 已有家庭 → createFamily/joinFamily 都 conflict（强制一人一家庭）
- **8 位 hex 邀请码**：`randomUUID().slice(0, 8).toUpperCase()`，`@@unique` 兜底；极小概率重复时报错让用户重试（YAGNI 不加重试逻辑）
- **owner 闭环**：leaveFamily 校验 `role !== 'owner'`（badRequest）；解锁路径：transferOwner（事务 3 update）/ dissolveFamily（删 Family 级联）
- **N+1 规避（groupBy by userId）**：myFamily/familyRanking 一次 groupBy 替代 N 次 aggregate — **范式累计第 4 次**
- **cnMonthRange / cnWeekRange 工具**：CN 时区本月/本周 "YYYY-MM-DD" 字符串范围（Checkin.date 是字符串）；周首=周一
- **动态成就复用**：`familyAchievements` 用 `MILESTONES = [100, 500, 1000, 2000, 5000]` 常量 + Checkin aggregate；**复用 stats.myCertificates 范式**（V0.1.39）
- **V0.1.39 转让事务 3 update**：`tx.familyMember.update({where:{userId}, data:{role:'member'}})` + `tx.familyMember.update({where:{userId:newOwnerId}, data:{role:'owner'}})` + `tx.family.update({where:{id}, data:{ownerId:newOwnerId}})` — 全部原子
- **V0.1.39 解散级联**：`tx.family.delete({where:{id}})` — FamilyMember + Goal.familyId 都 onDelete Cascade 自动删

---

## ⚠️ 已知坑

1. **User 双 relation 范式累计第 3 次**：`familiesOwned Family[] @relation("FamilyOwner")` + `familyMember FamilyMember?`（1:1） — **必须 `@relation("FamilyOwner")`** 消歧义（V0.1.31 NotifActor / V0.1.32 Follower / V0.1.34 FamilyOwner）
2. **inviteCode 8 位碰撞**：极小概率重复（16^8 = 4.3e9）；依赖 `@unique` 报错让用户重试（YAGNI 不加重试）
3. **并发 mock 范式**：familyRanking Promise.all 并发 aggregate → mockResolvedValueOnce 顺序不保证 → 用 `mockImplementation` 按 userId 区分（V0.1.34 沉淀）
4. **owner 不能直接离开**：必须先 transferOwner 或 dissolveFamily（业务规则强制 — 避免家庭"群龙无首"）
5. **家庭目标鉴权**：addFamilyGoal 校验 `member.familyId === input.familyId`（在 goal module）— 越权 forbidden

---

## 🔗 关联

- **goal.addFamilyGoal / myFamilyGoals**：V0.1.34 复用（家庭目标 familyId，复用 Goal 表 + calcGoalProgress userIds 扩）
- **stats.myCertificates 范式**：V0.1.39 familyAchievements 复用（动态生成零建表）
- **Checkin aggregate**：myFamily/familyRanking/familyAchievements 数据源
- **前端 pages/family**：家庭卡 + 邀请按钮复制 + 本月跑量榜 + 家庭目标进度条 + 创建/加入无家庭态 + 添加家庭目标弹层 + leaveFamily 按钮（V0.1.34 新页）
- **前端 family 页 owner 操作区**：V0.1.39 转让 showActionSheet 选成员 + 解散确认 dialog + 家庭成就卡
