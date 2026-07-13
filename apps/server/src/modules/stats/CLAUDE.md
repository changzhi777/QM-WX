# stats Module — AI 上下文

> 📍 面包屑：[根目录](../../../../CLAUDE.md) > [apps/server](../../../CLAUDE.md) > modules > **stats**

## 职责

跑者数据汇总读模型。聚合 Checkin（手动+佳明）/Enrollment/GroupMember/Shoe 数据，生成年/月/总跑量、打卡次数、平均配速、年度报告、证书成就。数据来源单一（Checkin），缓存 120s，无写操作。

## 入口

- **路由注册**：`app.ts` 注册 `statsRoutes`，namespace `/api/stats`
- **路由前缀**：`POST /api/stats`
- **鉴权**：全部 action 需登录（`req.user.id`）

## Action 清单

| action | 方法 | 功能 | 备注 |
|--------|------|------|------|
| `myRunnerStats` | `userId + {year?, month?}` | 跑者数据中心汇总（年/月/总跑量+打卡+平均配速） | Cache.wrap 120s，默认今年/本月 |
| `myAnnualReport` | `userId + {year?}` | 年度报告（年汇总+月度分布+最长单次+活跃天数） | V0.1.27，单次 groupBy 替代 12 次 aggregate |
| `myCertificates` | `userId` | 我的证书（里程碑+赛事+配速进步+连续打卡+群内前3+跑鞋成就） | V0.1.28，动态生成零建表；V0.1.135 扩多种；V0.1.137 扩跑鞋成就 |

## 数据模型（Prisma）

| Model | 关键字段/索引 | 用途 |
|-------|---------------|------|
| **Checkin** | `userId`, `date`, `distance`, `durationSec` | 聚合源（manual+garmin 导入） |
| **Enrollment** | `userId`, `type=marathon`, `status` | 赛事证书源（confirmed/submitted） |
| **GroupMember** | `userId`, `groupId` | 群内贡献证书（本月跑量榜） |
| **Group** | `id`, `name` | 群信息（群贡献证书） |
| **Shoe** | `userId`, `currentKm`, `purchasedAt`, `status` | 跑鞋成就证书（V0.1.137） |

**关键索引**：Checkin `[userId, date]`，GroupMember `[userId, groupId]`。

## 集成点

- **被调用方**：前端 `pages/annual-report/`（年度报告）、`pages/certificate/`（证书页）、`pages/user/`（用户主页跑量卡）
- **调用方**：无（纯读模型）
- **缓存**：Cache.wrap 120s，cache key 含 `userId:year:month` / `userId:year` / `userId`
- **BullMQ**：无
- **notify**：无

## 测试

| 文件 | 用例数 | 覆盖 action |
|------|--------|-------------|
| `tests/modules/stats/stats.service.test.ts` | 15 | myRunnerStats(3) + myAnnualReport(3) + myCertificates(3) + 多种证书(3) + 跑鞋成就(3) |
| `tests/modules/stats/stats.routes.test.ts` | 5 | 鉴权(1) + 未知 action(1) + 透传 payload(3) |

**覆盖率**：V0.1.29 补单测后覆盖 39→**100%**（含 myAnnualReport 月度 reduce + myCertificates 里程碑+赛事逻辑）。

## 关键范式与坑

1. **groupBy 单次聚合替代 N 次 aggregate（V0.1.27 性能范式）**
   - `myAnnualReport`：`groupBy(by date)` 拿全年每日数据 → 前端/服务端 reduce 成月度（避免 12 次按月 aggregate）
   - 示例代码：`daily.forEach(d => { const m = Number(d.date.slice(5,7)); monthly[m-1].distance += d._sum.distance })`

2. **证书动态生成零建表（V0.1.28）**
   - 里程碑证书：总跑量 ≥ 100/500/1000/3000 km（常量 `MILESTONE_CERTS`）
   - 赛事证书：`Enrollment.type=marathon + status∈{submitted,confirmed}`
   - 下一里程碑：`MILESTONE_CERTS.find(m => totalDistance < m.km)`

3. **连续打卡 Streak 算法（V0.1.135）**
   - 去重 date（`Set(checkins.map(c => c.date))`）
   - 当前 streak：从最后一天往前数连续天数
   - 最长 streak：遍历整个序列找最大连续段

4. **配速进步证书算法（V0.1.135）**
   - 取最近 10 次有配速的 Checkin（`distance>0 && durationSec>0`）
   - 前 5 次（基线）vs 后 5 次（最新），按 `createdAt desc` 排序
   - 提速 10% → `recentAvg < baselineAvg * 0.9`

5. **群内贡献证书（V0.1.135）**
   - 按 `GroupMember` 找用户所在群
   - 对每个群：Checkin.groupBy(by userId) 取本月跑量 → 找用户排名
   - N+1 规避：批量查 User（`userIds` → `findMany where id in`）

6. **跑鞋成就证书（V0.1.137）**
   - `shoesMilestonesCert`：Shoe.aggregate sum currentKm（含 active+retired）
   - `shoeDaysMilestonesCert`：最早 shoe.purchasedAt 到现在的天数（`Math.floor((now - purchasedAt) / 86400000)`）
   - `shoeCheckinMilestonesCert`：Checkin.count where shoeId IS NOT NULL

7. **平均配速计算（mm:ss/km）**
   - `calcAvgPace(totalDurationSec, totalDistanceKm)` → `Math.round(totalDurationSec / totalDistanceKm)` → 转分:秒格式
   - 边界：`distance <= 0` 或 `durationSec = 0` 返回 `null`

8. **Cache TTL 120s（2 分钟）**
   - 汇总低频变化，失效依赖打卡时手动 `Cache.delByPattern('stats:*')`（当前未实现，依赖 TTL 自然失效）

## 版本演进

- **V0.1.27** — 新增 `myAnnualReport` action（年汇总+月度分布+最长单次+活跃天数，groupBy 性能优化）
- **V0.1.28** — 新增 `myCertificates` action（里程碑证书 100/500/1000/3000km + 赛事证书 marathon + 下一里程碑）
- **V0.1.29** — 测试补漏（myAnnualReport/myCertificates 单测覆盖，覆盖 39→100%）
- **V0.1.135** — 扩多种证书（配速进步 + 连续打卡 7/30/100 天 + 群内前 3 + 自定义里程碑）
- **V0.1.137** — 扩跑鞋成就（累计里程 100/500/1000/3000km + 持有天数 30/100/365 天 + 打卡次数 50/100/500 次）
