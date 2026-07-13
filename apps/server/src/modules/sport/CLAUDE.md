# sport Module — AI 上下文

> 📍 面包屑：[根目录](../../../../CLAUDE.md) > [apps/server](../../../CLAUDE.md) > modules > **sport**

## 职责

运动打卡 + 跑群管理 module。**Checkin 表是全项目核心聚合源**，被 stats（myRunnerStats/myAnnualReport/myCertificates）/ goal（calcGoalProgress）/ family（myFamily/familyRanking）/ feed（publish 关联）/ shoes（getMileageHistory/compareShoes aggregate checkinCount）/ ranking（groupRankingMulti）/ weekly-report（aggregate）共 **7 个 module** 复用。任何 Checkin 写入会触发跨 module 缓存失效（sport:today + sport:myStats:* + sport:groupRanking:* + weeklyReport:aggregate:*）。

## 入口

- **路由注册**：`app.ts` 注册 `sportRoutes`，namespace `/api/sport`
- **路由前缀**：`POST /api/sport`（单 endpoint，body 含 `action`）
- **鉴权策略**：**整条 route 不 public**（无 `config.public`），authPlugin 自动 jwtVerify
  - 但 route handler 内**显式兜底** `if (!req.user) throw Errors.unauthorized()`（V0.1.42 setErrorHandler 时机修后，401 走 BusinessError 路径而非默认格式）

## Action 清单

| action | 方法签名 | 功能 | 备注 |
|--------|----------|------|------|
| `today` | `today(userId)` | 今日打卡状态（done + checkin 详情） | **Cache.wrap 60s**，`sport:today:{userId}:{date}` |
| `checkin` | `checkin(userId, CheckinInput)` | 打卡：防作弊 + 积分事务 + 跑鞋里程 + ludong outbox | **事务** + 写后失效 today/myStats/groupRanking/weeklyReport；防作弊忽略前端 `points` 字段 |
| `myStats` | `myStats(userId, {period})` | 个人统计（totalDistance + count + avgPace） | period: week/month/year/all；**Cache.wrap 60s** |
| `myGroups` | `myGroups(userId)` | 我加入的群列表 | 含 role（owner/member）+ joinedAt |
| `createGroup` | `createGroup(userId, {name}, userNickname)` | 建群（owner = 创建者） | 会员等级上限校验（free 默认 2 个） |
| `joinGroup` | `joinGroup(userId, {groupId, opengid?}, userNickname, avatarUrl)` | 加群 | opengid 首次绑定（不覆盖） |
| `quitGroup` | `quitGroup(userId, {groupId})` | 退群（owner 不可退） | 事务内 delete member + decrement memberCount |
| `groupRanking` | `groupRanking(userId, {groupId, period})` | 群榜单（按距离降序 top 50） | **鉴权在 cache 外**；**Cache.wrap 60s**，群维度 N 人共享 |
| `groupDetail` | `groupDetail(userId, {groupId})` | 群详情：群卡 + 公告 + 汇总（总跑量/打卡数/活跃天数） | V0.1.42；`Promise.all([aggregate, count, groupBy])` 并行 |
| `groupMembers` | `groupMembers(userId, {groupId})` | 群成员列表 + 本月跑量降序 | V0.1.42；复用 familyRanking groupBy userId 范式（N+1 规避） |
| `announceGroup` | `announceGroup(userId, {groupId, announce?})` | 发群公告（仅 owner，空串清空） | V0.1.42；owner 鉴权 `member.role !== 'owner' → forbidden` |

> 三方对齐：`SportActionBodySchema.enum` ↔ `routes switch case` ↔ `sportService` 导出方法 — **11 个 action 全覆盖**

## 数据模型（Prisma）

| Model | 关键字段 / 索引 | 用途 |
|-------|-----------------|------|
| **Checkin** | `userId` `date("YYYY-MM-DD" CN)` `distance Float (km)` `durationSec?` `pace?` `heartRate?` `cadence?` `points Int` `groupId?` `shoeId?` `dataSource` `garminActivityId?` `sportType?`；索引 `[userId, date]` + `[groupId, date]` | **全项目核心聚合源** |
| **Group** | `id` `name` `ownerId` `memberCount` `opengid? @unique` `announce?`（V0.1.42）`createdAt` | 跑群 |
| **GroupMember** | `groupId` `userId` `nickname` `avatarUrl?` `role` (owner\|member) `joinedAt`；`@@unique([groupId, userId])` | 群成员关系 |
| **PointsRecord** | `userId` `change` `type` `createdAt` | 积分流水（type=`checkin`） |

**关键索引**：Checkin `[userId, date]`（today 查询）+ `[groupId, date]`（groupRanking 范围扫）；GroupMember `@@unique([groupId, userId])`（isMember 复合主键查）。

> ⚠️ **Checkin.distance 单位混用坑（V0.1.133 沉淀）**：
> - **sport.checkin 手动打卡**：`distance` 单位 km，前端传 km 直通入库
> - **佳明（garmin）导入**：原始数据是 cm，import 时 `/100000` 转 km 入库
> - **RaceResult.paceSecPerKm 计算**（V0.1.134）：必须先确认 distance 是 km，再算 `durationSec / distanceKm`
> - 跨数据源计算时**永远先转 km 再 aggregate**，否则结果数量级错误

## 集成点

- **被调用方（前端）**：小程序 `pages/sport/`（打卡）+ `pages/group-detail/`（V0.1.42）+ `pages/my-groups/` + `pages/ranking/`
- **调用方（service 内）**：
  - `sportRepo`（`sport.repository.ts`）：`findTodayCheckin` / `checkinInTx` / `findMyCheckins` / `findGroupCheckins` / `isMember` / `myGroups` / `findGroup` / `countMyGroups`
  - `userRepo.findById` + `userRepo.addPoints(tx, userId, points, 'checkin')`（**跨 module 复用 user repository**）
  - `configRepo.getLoginConfig()`（拿 `perKm` 积分规则 + `memberLevels.maxGroups`）
  - `assertNotBanned(user)`（V0.1.18 黑名单拦截，跨 module 复用 admin.service）
  - **`incrementShoeKm(tx, shoeId, distance)`**（V0.1.26 跨 module DRY：从 shoes.service 导出，sport.checkin 事务内调用，shoeId 为空跳过）
  - `ludongService.enqueueInTx(tx, 'checkin.batch', ...)`（同步打卡到律动 outbox）
- **缓存**：Cache.wrap **3 个热路径**（共占 sport 90%+ 流量）
  - `sport:today:{userId}:{date}` 60s TTL — today 状态
  - `sport:myStats:{userId}:{period}` 60s TTL — 个人统计
  - `sport:groupRanking:{groupId}:{period}` 60s TTL — 群榜单（**群维度，N 人查同榜共享**）
- **跨 module 缓存失效（checkin 写后）**：
  - `Cache.del(todayCacheKey)` 精准
  - `Cache.delByPattern('sport:myStats:{userId}:*')` 该用户全 period
  - 带 groupId 时：`Cache.delByPattern('sport:groupRanking:{groupId}:*')` + `Cache.delByPattern('weeklyReport:aggregate:{groupId}:*')`（V0.1.12 一并失效群周报）
- **BullMQ**：无入队（ ludong 入 outbox 由 ludong-sync job 投递）
- **notify**：无（sport 不直接调 notify，但下游 stats.myCertificates 间接消费 Checkin）

## 测试

| 文件 | 用例数 | 覆盖 action / 场景 |
|------|--------|-------------------|
| `tests/modules/sport/sport.service.test.ts` | **30** | checkin(6)：正常/距离-1/距离999/传points被忽略/同日重打卡/不在群中；myStats(2)：聚合/period=all；groupRanking(2)：非成员/聚合2成员；createGroup(2)：超上限/正常；today 带缓存(3)：miss/命中/今日未打卡；checkin 失效缓存(2)：成功失效/失败不动；myStats 缓存(3)：miss/命中/不串扰；groupRanking 缓存(3)：miss/N人共享/不串扰；checkin 失效 myStats/groupRanking(2)：无groupId/带groupId；groupDetail(2)：非成员/正常返汇总；groupMembers(1)：本月跑量降序；announceGroup(2)：owner/非owner |
| `tests/modules/sport/sport.routes.test.ts` | **13** | today/checkin 400 (payload 缺)/checkin 正常/myStats/myGroups/createGroup 400/createGroup notFound/createGroup 正常/joinGroup/quitGroup/groupRanking/unknown action/req.user 缺失 401 |

**共 43 用例**（含 V0.1.42 groupDetail/groupMembers/announceGroup 5 个新单测）。**关键范式**：
- `vi.hoisted` + `_redisMockState`：隔离 Redis mock + `cacheStore: Map` 内存实现，避免 `vi.clearAllMocks` 清掉 mock impl
- `tx = prisma._tx`：事务内 mock 复用顶级 mock（让 `tx.checkin === prisma.checkin`）
- `vi.useFakeTimers + setSystemTime(FROZEN_DATE)`：冻结时间测 today 缓存（todayCN 用系统时钟，否则 key 含真实日期导致缓存 miss）
- `redis.scan` mock 实现 MATCH 模式匹配（支持 `delByPattern('sport:myStats:u1:*')` 测试）

## 关键范式与坑

1. **防作弊三件套（来自 01 审查 P1-1/P1-2 + 02 §5.3）**
   - `distance` 服务端 Zod 校验范围 `[0.5, 50]`（防作弊上限 50km）
   - 前端传 `points` 字段**直接忽略**（`const { points: _ignored, ...clean } = input`）
   - 同日同 user 限 1 次计分（`findTodayCheckin` 存在则 `conflict`）
   - service 内**防御性二次 Zod parse**（`CheckinInputSchema.parse(input)`，防 route 外直接调 service）

2. **checkin 事务五件套（V0.1.26 扩）**
   ```
   prisma.$transaction(async (tx) => {
     sportRepo.checkinInTx(tx, {...})            // 1. 写 Checkin
     userRepo.addPoints(tx, userId, points, 'checkin')  // 2. 写 PointsRecord + inc User.points
     incrementShoeKm(tx, shoeId, distance)        // 3. 跑鞋里程累计（V0.1.26；shoeId 空跳过）
     ludongService.enqueueInTx(tx, 'checkin.batch', ...)  // 4. 律动 outbox（同步外部）
   })
   // 5. 事务外：缓存失效（失败不阻塞业务返回值）
   ```

3. **群维度缓存共享（V0.1.11 性能范式）**
   - `groupRankingCacheKey = (groupId, period)` — **不含 userId**
   - 鉴权（isMember）在 `Cache.wrap` **外**：非成员直接 forbidden 不缓存
   - N 人查同群同榜 → 1 次 DB + N-1 次 cache 命中（sport 最重的查询优化）

4. **groupMembers N+1 规避（V0.1.42 复用 familyRanking 范式）**
   - 错误写法：每个 member 各跑一次 Checkin.aggregate（N 次 DB）
   - 正确写法：`groupBy(by userId, where userId in memberIds, date in [start,end))` 1 次查询返 Map → 内存 reduce
   - 范式累计第 4 次（familyRanking / favorite.list / stats.myCertificates / sport.groupMembers）

5. **periodSince period 转换（week/month/year/all）**
   - `week` → 7 天前；`month` → 1 个月前；`year` → 1 年前；`all` → `new Date(0)`（1970 epoch）
   - 用于 myStats / groupRanking 的 `findMany where createdAt >= since`

6. **groupDetail Promise.all 并行三查询**
   - `Promise.all([aggregate(sum distance), count, groupBy(by date)])` 拿总跑量/打卡数/活跃天数
   - 活跃天数 = `groupBy date` 返的不同 date 数量（不直接 count，因一天可能多次打卡）
   - owner 关联查询用 `include: { owner: { select: { id, nickname, avatarUrl } } }`

7. **createGroup 会员等级上限**
   - `memberLevels[user.memberLevel].maxGroups`（默认 free=2）
   - 含创建 + 加入两路径校验（同一上限）
   - 升级提示文案：「你当前可加入/创建 N 个群，升级会员可加更多」

8. **checkin 跨 module 缓存失效（V0.1.12 加 weeklyReport）**
   - 失效顺序：先 today（精准），再 myStats（pattern），最后 groupRanking + weeklyReport（带 groupId 时一并失效）
   - 失效在事务**外**执行：缓存失败不阻塞业务返回值（业务已 commit）
   - `delByPattern` 用 Redis SCAN，避免 KEYS 阻塞（生产安全）

9. **CN 时区 todayCN（东八区）**
   - `todayCN() = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)`
   - 用于 Checkin.date 字段（"YYYY-MM-DD" 格式，CN 时区）
   - 测试必须 `vi.useFakeTimers + setSystemTime(FROZEN_DATE)` 锁时间，否则 key 含真实日期导致缓存 miss

## 版本演进

- **V1（init）** — sport module 落地：checkin + myStats + groupRanking + myGroups + createGroup + joinGroup + quitGroup 7 action + Checkin/Group/GroupMember 3 表
- **V0.1.5** — `today` 接 `Cache.wrap` 60s TTL（缓存基础设施接入）
- **V0.1.8** — checkin 写后精准失效 today 缓存
- **V0.1.11** — `myStats` + `groupRanking` 接 Cache.wrap；checkin 写后失效 myStats（pattern）+ groupRanking（带 groupId）
- **V0.1.12** — checkin 带 groupId 写后失效 weeklyReport aggregate（跨 module 缓存失效）
- **V0.1.18** — checkin 加 `assertNotBanned(user)` 黑名单拦截（复用 admin.service）
- **V0.1.25** — Checkin +`dataSource/garminActivityId/sportType`（佳明导入字段，被 garmin-import job 写入）
- **V0.1.26** — **Checkin +`shoeId?`（外键 ON DELETE SET NULL）+ checkin 事务内集成 `incrementShoeKm`（跨 module DRY，shoeId 空跳过，向后兼容）**
- **V0.1.27** — 前端 sport 打卡页加跑鞋 picker（调 shoes.list 取 active，传 shoeId）→ **跑鞋里程闭环 GAP-10 关闭**
- **V0.1.28** — Checkin 被 goal.calcGoalProgress aggregate 复用（跨 module 读）
- **V0.1.30** — Checkin 被 feed.publish 关联（跨 module 关联，Feed.checkinId）
- **V0.1.34** — Checkin 被 family.myFamily/familyRanking aggregate 复用
- **V0.1.42** — **跑群深化**：Group +`announce?` 字段 + 新增 3 action `groupDetail` / `groupMembers` / `announceGroup`（sport 5→8 action；schema +3）
- **V0.1.112** — sport.routes.test.ts 补完（13 用例，routes 纳入覆盖率统计）
