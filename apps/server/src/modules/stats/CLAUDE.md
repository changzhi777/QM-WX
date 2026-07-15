# stats Module — AI 上下文

> 📍 面包屑：[根目录](../../../../CLAUDE.md) > [apps/server](../../../CLAUDE.md) > modules > **stats**

## 📋 变更记录 (Changelog)

- **2026-07-15** — 🎯 **V0.2.3 weatherAnalysis + userProfile 接 Cache.wrap 120s（init #12）**：2 个 V0.2.0 阶段 2/3 action 接入 Cache.wrap（commit 0198f2f，V0.2.3 第 1 个 perf 优化）；TTL `RUNNER_STATS_CACHE_TTL_SEC`=120s 与 myRunnerStats/myAnnualReport/myCertificates 同档；cacheKey `stats:weatherAnalysis:${userId}` / `stats:userProfile:${userId}`；**统一范式**「抽 compute* 内部纯函数（`computeWeatherAnalysis` / `computeUserProfile`）+ service 层包 Cache.wrap + 测试加 redis mock 隔离 + beforeEach clear cacheStore 防缓存串扰」； funcs +0.2pp 左右；测试加 redis mock 避免缓存命中导致断言失败
- **2026-07-15** — 🎯 **V0.2.0 阶段 2 + 阶段 3 收官(init #11 补 changelog)**：**+2 action** `weatherAnalysis`(关联分析 — Checkin 天气快照+配速/心率 Pearson 相关系数,样本<10 返 sufficient:false 兜底)/ `userProfile`(用户画像 — tags 自动生成 + basic/sport/body 三段聚合 + summary 段落,frontend insight 页可一键喂 aiCoach.chat 拿千人千面建议);**Checkin +5 字段** weatherTemp/humidity/aqi/lat/lon(迁移 20260716000000_checkin_weather_geo,history 不回填 initially 样本少 weatherAnalysis 兜底);**+10 单测**(V0.2.2.1 coverage 修复 5 例:负相关/湿度<10/全相同兜底/BMI 分支/BodyComp 兜底);前端 **pages/insight/ 新页**(3 卡片:画像/天气关联/AI 策略,调 stats.userProfile + stats.weatherAnalysis + aiCoach.chat);ENDPOINTS.stats 8→**10 action**
- **2026-07-12** — V0.1.137 跑鞋成就 3 段:累计 100/500/1000/3000km / 持有 30/100/365 天 / 打卡 50/100/500 次
- **2026-07-12** — V0.1.135 5 段证书:milestones / marathons / paceProgressCert(最近 10 次 5+5 比较提速 10%) / consecutiveCheckinCert(7/30/100 天 streak) / groupContributionCert(本月群内前 3)
- **2026-07-11** — V0.1.134 RaceResult race leaderboard + myRaceResult
- **2026-07-03** — V0.1.28 证书里程碑 100/500/1000/3000km
- **2026-07-03** — V0.1.27 年度报告(myAnnualReport)

## 🎯 职责

跑者数据汇总读模型。聚合 Checkin(手动+佳明)/Enrollment/GroupMember/Shoe 数据,生成年/月/总跑量、打卡次数、平均配速、年度报告、证书成就、用户画像、天气关联分析。数据来源单一(Checkin),缓存 120s,无写操作。

## 入口

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
| `myAnnualReport` | `userId + {year?}` | 年度报告（年汇总+月度分布+最长单次+活跃天数） | V0.1.27，单次 groupBy 替代 12 次 aggregate；Cache.wrap 120s |
| `myCertificates` | `userId` | 我的证书（里程碑+赛事+配速进步+连续打卡+群内前3+跑鞋成就） | V0.1.28，动态生成零建表；V0.1.135 扩多种；V0.1.137 扩跑鞋成就；Cache.wrap 120s |
| `weatherAnalysis` | `userId` | 关联分析（温度×配速 / 湿度×心率 Pearson；样本<10 sufficient:false 兜底） | **V0.2.0 阶段 2**；**V0.2.3 接 Cache.wrap 120s**（commit 0198f2f）；computeWeatherAnalysis 内部函数 |
| `userProfile` | `userId` | 用户画像（basic/sport/body 三段聚合 + tags 自动生成 + summary 段落，喂 aiCoach 千人千面） | **V0.2.0 阶段 3**；**V0.2.3 接 Cache.wrap 120s**（commit 0198f2f）；computeUserProfile 内部函数 |
| `weather` | `userId + {lat?, lon?}` | 今日天气（城市+温度+天气描述+体感+湿度+图标） | V0.1.148 真天气（和风 API Host + X-QW-Api-Key 头）；无 KEY 或 fetch 失败走 stub（长沙晴 25°C）；前端今日 tab 调 |

## 数据模型（Prisma）

| Model | 关键字段/索引 | 用途 |
|-------|---------------|------|
| **Checkin** | `userId`, `date`, `distance`, `durationSec`, `weatherTemp?`, `humidity?` (V0.2.0) | 聚合源（manual+garmin 导入）；V0.2.0 weatherAnalysis 用 weatherTemp/humidity |
| **Enrollment** | `userId`, `type=marathon`, `status` | 赛事证书源（confirmed/submitted） |
| **GroupMember** | `userId`, `groupId` | 群内贡献证书（本月跑量榜） |
| **Group** | `id`, `name` | 群信息（群贡献证书） |
| **Shoe** | `userId`, `currentKm`, `purchasedAt`, `status` | 跑鞋成就证书（V0.1.137） |
| **BodyCompositionRecord** | `userId`, 脂肪率/肌肉率 等 | userProfile body 段聚合源（V0.2.0） |

**关键索引**：Checkin `[userId, date]`，GroupMember `[userId, groupId]`。

## 集成点

- **被调用方**：前端 `pages/annual-report/`（年度报告）、`pages/certificate/`（证书页）、`pages/user/`（用户主页跑量卡）、`pages/insight/`（V0.2.0 用户画像 + 天气关联 + AI 策略）
- **调用方**：无（纯读模型）
- **缓存**：Cache.wrap 120s，cache key 含 `userId:year:month` / `userId:year` / `userId` / `userId`（weatherAnalysis/userProfile V0.2.3）
- **BullMQ**：无
- **notify**：无

## 测试

| 文件 | 用例数 | 覆盖 action |
|------|--------|-------------|
| `tests/modules/stats/stats.service.test.ts` | 25 | myRunnerStats(3) + myAnnualReport(3) + myCertificates(3) + 多种证书(3) + 跑鞋成就(3) + weatherAnalysis/userProfile（V0.2.0 + V0.2.3 接 Cache 后加 redis mock 隔离）|
| `tests/modules/stats/stats.daily-report.test.ts` | 5 | V0.1.144~147 DailyReport |
| `tests/modules/stats/stats.routes.test.ts` | 6 | 鉴权(1) + 未知 action(1) + 透传 payload(4) |

**覆盖率**：V0.1.29 补单测后覆盖 39→**100%**（含 myAnnualReport 月度 reduce + myCertificates 里程碑+赛事逻辑）；V0.2.3 接 Cache 后加 redis mock 隔离 + beforeEach clear cacheStore 防缓存串扰（V0.2.3 范式）。

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
   - **V0.2.3 范式**（commit 0198f2f）：weatherAnalysis / userProfile 接入 Cache.wrap，抽 `computeWeatherAnalysis` / `computeUserProfile` 内部纯函数；测试加 `vi.mock('../../infra/redis.js', ...)` redis mock + `beforeEach(() => cacheStore.clear())` 防缓存串扰（V0.2.3 沉淀通用范式，shoes/goal/training 同款）

9. **Pearson 相关系数（V0.2.0 weatherAnalysis）**
   - `pearson(points: {x,y}[])` 内部 helper；样本 < 10 返 null（不强算）
   - tempPaceR：温度（x）× 配速秒（y）；`Math.abs(r) >= 0.3` 才生成 insight
   - humidityHrR：湿度（x）× 心率（y）；`r >= 0.3` 生成补水 insight
   - 兜底：样本不足 / 无显著关联 → sufficient:false 或通用文案

## 版本演进

- **V0.1.27** — 新增 `myAnnualReport` action（年汇总+月度分布+最长单次+活跃天数，groupBy 性能优化）
- **V0.1.28** — 新增 `myCertificates` action（里程碑证书 100/500/1000/3000km + 赛事证书 marathon + 下一里程碑）
- **V0.1.29** — 测试补漏（myAnnualReport/myCertificates 单测覆盖，覆盖 39→100%）
- **V0.1.135** — 扩多种证书（配速进步 + 连续打卡 7/30/100 天 + 群内前 3 + 自定义里程碑）
- **V0.1.137** — 扩跑鞋成就（累计里程 100/500/1000/3000km + 持有天数 30/100/365 天 + 打卡次数 50/100/500 次）
- **V0.2.0** — +weatherAnalysis（阶段 2 Pearson）+ userProfile（阶段 3 画像）；Checkin +5 字段 weatherTemp/humidity/aqi/lat/lon（迁移 20260716000000）
- **V0.2.3** — weatherAnalysis + userProfile 接 Cache.wrap 120s（commit 0198f2f）；V0.2.3 perf 优化第 1 站
