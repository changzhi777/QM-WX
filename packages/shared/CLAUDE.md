# packages/shared — 前后端共享层

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../CLAUDE.md) → **packages/shared/**（这里）
> 最近更新：2026-07-03（V0.1.33 — `device-brands.ts` 改动：`xiaomi` available false→**true**（小米手环可绑定）+ `garmin.desc` 加"BLE 实时心率 + OAuth 历史" + 新增 `BLE_VENDOR_PATTERNS: Record<string, RegExp[]>`（garmin: /garmin|forerunner|fenix|vivoactive|edge/i；xiaomi: /mi\s*band|xiaomi|小米|redmi/i）+ 新增 `matchBleVendor(name): 'garmin' | 'xiaomi' | 'ble'` 函数（按设备名匹配，未中返 'ble'）+ `BleVendor` type — **前后端单一数据源**，前端扫描识别 + 后端 vendor 校验共用；V0.1.32 `ENDPOINTS` 加 `follow` 模块（6 action：follow/unfollow/isFollowing/myFollowing/myFollowers/myCounts）；V0.1.31 `ENDPOINTS` 加 `notification` 模块（4 action：list/unreadCount/markRead/markAllRead）；V0.1.30 `ENDPOINTS` 加 `feed` 模块（6 action：list/myFeeds/publish/like/unlike/comment）；V0.1.29 `ENDPOINTS` 加 `favorite` 模块（4 action：list/add/remove/isFavorited）；V0.1.28 `ENDPOINTS` 加 `goal` 模块（4 action：list/add/remove/myProgress）+ `stats` 加 `myCertificates`（action 数 2→3）；V0.1.27 `ENDPOINTS.stats` 加 `myAnnualReport` action；V0.1.26 已加 `shoes` 模块（5 action）；V0.1.25 已加 `training` 模块（2 action）+ device action 数更新（+myTodayHealth/bindBleDevice/myBindings）+ 新增 `device-brands.ts` 常量：DEVICE_BRANDS 9 品牌 + DEVICE_CATEGORY_LABEL）

---

## 🎯 职责

前后端共享的**类型定义、Zod schema、常量、API 端点契约、设备品牌清单**。
**单一数据源**：严禁在后端或小程序里重复定义与这里重复的常量/类型。

---

## 📂 目录结构

```
src/
├── index.ts                        # 统一导出入口
├── types/
│   └── index.ts                    # TS 类型（从 Zod schema 推导）
├── constants/
│   ├── feature-flags.ts            # 功能开关定义（wallet / payment / membership / ai）
│   ├── member-levels.ts            # 会员等级（free / monthly / quarterly / yearly）
│   ├── points-rules.ts             # 积分规则（打卡 +N / 注册 +N / 等）
│   └── device-brands.ts            # **设备品牌清单**（V0.1.25：DEVICE_BRANDS 9 品牌 + DEVICE_CATEGORY_LABEL；**V0.1.33 新增**：BLE_VENDOR_PATTERNS + matchBleVendor + BleVendor type；xiaomi available true）
└── api-contracts/
    └── endpoints.ts                # API 端点路径常量（module/action 映射 + actionUrl 工具）
```

---

## 🚪 导出接口

```ts
// 包入口
export * from './constants/feature-flags.js';
export * from './constants/member-levels.js';
export * from './constants/points-rules.js';
export * from './constants/device-brands.js';   // V0.1.25 新增（V0.1.33 加 matchBleVendor）
export * from './api-contracts/endpoints.js';
export * from './types/index.js';

// 子路径导出（package.json exports）
import {} from '@qm-wx/shared/types';
import {} from '@qm-wx/shared/constants/feature-flags';
import {} from '@qm-wx/shared/constants/device-brands';   // V0.1.25 / V0.1.33
import {} from '@qm-wx/shared/api-contracts';
```

### ENDPOINTS 模块清单（截至 2026-07-03 V0.1.32；V0.1.33 不增 module，仅 device-brands 增强）

| 模块 | action 数 | 说明 |
| --- | ---: | --- |
| auth | 2 | login / refresh |
| user | 4 | me / updateProfile / login / bindApps（含 P0-1 修复后的 public 路由） |
| sport | 6 | checkin（**V0.1.26 +shoeId optional**，打卡选跑鞋触发里程累加；**V0.1.27 前端 picker 联动**）/ myStats / groupRanking / myGroups / createGroup / groupDetail 等 |
| mall | 5+ | listProducts / listCategories / myOrders / createOrder / cancelOrder |
| content | 3 | list / detail / enroll |
| wallet | 3 | balance / recharge / transactions |
| weekly-report | 2 | getWeeklyReport / aggregate |
| admin | 18+ | listUsers/listContents/listProducts/stats/ban/unban/auditLog/statsByTimeRange/exportOrders/exportUsers 等 |
| upload | 1 | upload |
| wxpay | 4 | createOrder / notify / queryOrder / refund |
| **device** | **13**（V0.1.25 +3） | listBindings/startOAuth/unbind/syncWeRun/submitHeartRate + 佳明 4 查询 myActivities/mySleep/myMetrics/myFitnessAge + **V0.1.25 新增**：myTodayHealth（聚合 4 类）/ myBindings（品牌+绑定+佳明自动检测）/ bindBleDevice（vendor=ble；**V0.1.33 schema 加 vendor enum + brandMeta optional，service 按 [userId,vendor] upsert**） |
| **stats** | **3**（V0.1.28 +1） | myRunnerStats（年/总跑量汇总 + Cache）+ V0.1.27 新增 myAnnualReport（年汇总 yearDistance/yearCheckins/yearDurationSec/avgPace + 月度分布 12 个月 + longestRun + activeDays）+ **V0.1.28 新增 myCertificates**（动态生成零建表：里程碑证书 100/500/1000/3000km 自动颁发 + 赛事证书 marathon + 下一里程碑进度 nextMilestone + totalDistance/totalCheckins，Cache 120s） |
| ranking | 1 | groupRankingMulti |
| **cart** | 5 | add/remove/list/updateQty/clear |
| **points** | 3 | myBalance/signin/myTasks |
| **address** | 5 | list/create/update/delete/setDefault |
| **coupon** | 4 | templates/myCoupons/receive/availableCount |
| **distribution** | 6 | mySummary/myOrders/myTeam/myCommissionLogs/myLevel/inviteInfo |
| **training**（V0.1.25 新增） | **2** | **myPlans**（4 套硬编码模板：5K/10K/半马/全马）/ **mySportRecords**（聚合 Checkin run + RawActivity running，importCheckinId 去重） |
| **shoes**（V0.1.26 新增） | **5** | **list**（返 healthRatio = currentKm/thresholdKm*100）/ **add** / **update** / **retire**（active→retired）/ **myStats**（total/activeCount/retiredCount/totalKm/retiringSoonCount，retiringSoon = healthRatio≥70%） |
| **goal**（V0.1.28 新增） | **4** | **list**（含进度 currentDistance + percent + completed，复用 calcGoalProgress helper）/ **add**（type 自动算周期：monthly 本月1号→下月1号 / yearly 今年1/1→明年1/1 / custom 手传 periodStart/End）/ **remove**（硬删）/ **myProgress**（仅 status=active） |
| **favorite**（V0.1.29 新增） | **4** | **list**（含 Content/Product 详情，后端批量关联避免 N+1）/ **add**（upsert 幂等，重复收藏不报错）/ **remove**（deleteMany，不存在也 ok）/ **isFavorited**（批量红心状态查询，传 targetType + targetIds[]，返 {targetId: boolean} Map，详情页/列表页用） |
| **feed**（V0.1.30 新增） | **6** | **list**（含作者 User + 当前用户 liked 状态，分页）/ **myFeeds**（仅当前用户动态）/ **publish**（可关联 checkinId + distanceKm，从打卡延伸为动态）/ **like**（事务内 create FeedLike + Feed.likeCount+1，依赖 unique 约束幂等）/ **unlike**（事务内 delete FeedLike + Feed.likeCount-1）/ **comment**（事务内 create FeedComment + Feed.commentCount+1） |
| **notification**（V0.1.31 新增） | **4** | **list**（分页含 actor 头像/昵称）/ **unreadCount**（红点轻量 count）/ **markRead**（鉴权仅本人）/ **markAllRead**（updateMany 幂等） |
| **follow**（V0.1.32 新增） | **6** | **follow**（upsert 幂等 + 不能关注自己 badRequest + 复用 notify(type=follow) 通知被关注者）/ **unfollow**（deleteMany 幂等）/ **isFollowing**（批量查按钮状态，返 Set/Map）/ **myFollowing**（分页含 user）/ **myFollowers**（分页含 user）/ **myCounts**（用户主页一次拿全：user + followingCount + followerCount + isFollowing + isSelf，可查任意 userId 不限于自己，viewerId 算 isFollowing/isSelf） |
| recipe / ludong | — | V2 stub（路由层 schema） |

### DEVICE_BRANDS（V0.1.25 新增常量；V0.1.33 增强）

`src/constants/device-brands.ts` 提供 9 个品牌（小程序「设备绑定中心」宫格展示用，前后端共用）+ **V0.1.33 新增 BLE 设备品牌识别**：

- **available=true（可绑定）**：`ble`（蓝牙心率设备，BLE 直连）/ `garmin`（佳明，**V0.1.33 desc 加"BLE 实时心率 + OAuth 历史"**，基于 RawActivity 自动检测）/ `werun`（微信运动）/ **`xiaomi`（小米手环，V0.1.33 available false→true 开放）**
- **available=false（敬请期待）**：`coros`（高驰）/ `huawei`（华为运动健康）/ `suunto`（颂拓）/ `honor`（荣耀手环）/ `zepp`（欢太健康）
- 分类（`DeviceCategory`）：`bracelet`（手环）/ `watch`（手表）/ `strap`（心率带）/ `app`（健康 App）— `DEVICE_CATEGORY_LABEL` 提供中文标签
- **单一数据源**：小程序 device-bind 页直接 import，不在前端硬编码

**V0.1.33 新增 BLE 设备品牌识别**（前后端单一数据源，前端扫描识别 + 后端 vendor 校验共用）：

```ts
// BLE_VENDOR_PATTERNS: Record<string, RegExp[]>
export const BLE_VENDOR_PATTERNS: Record<string, RegExp[]> = {
  garmin: [/garmin|forerunner|fenix|vivoactive|edge/i],
  xiaomi: [/mi\s*band|xiaomi|小米|redmi/i],
};

// BleVendor type
export type BleVendor = 'garmin' | 'xiaomi' | 'ble';

// matchBleVendor(name): BleVendor — 按设备名匹配，未中返 'ble'
export function matchBleVendor(name: string): BleVendor {
  // 遍历 BLE_VENDOR_PATTERNS，匹配中即返 vendor key
  // 全部未中返 'ble'（通用蓝牙设备兜底）
}
```

> 范式：**正则单一数据源** — 前端扫描结果 `matchBleVendor(name)` 自动识别品牌（设备名 + 0x180A Manufacturer Name 二次验证）+ 后端 `bindBleDevice` 校验 vendor 合法性，两端共用同一份 `BLE_VENDOR_PATTERNS`，避免不一致；后续扩展 coros/huawei 等品牌只需在 `BLE_VENDOR_PATTERNS` 加 pattern + `BleVendor` type 加 enum value。

---

## 📦 依赖

- **运行时**：`zod`（schema 定义 + 类型推导）
- **开发**：`typescript` `vitest@^3.2.6` `@vitest/coverage-v8@^3.2.6`

---

## 🧪 测试

```bash
pnpm test              # vitest run — **6 passed**（含 endpoints actionUrl 校验；V0.1.33 不增 endpoints，不破现有测试）
pnpm typecheck         # tsc --noEmit
pnpm build             # tsc -p tsconfig.build.json → dist/
```

> ⚠️ **vitest 配置**：`vitest.config.ts` 锚定 `^(\.{1,2}\/.+)\.js$` 避免误伤 vitest 自身
> chunk（vitest 1.6 时代 root .js alias 误伤导致 `Cannot find module 'dist/spy.js'`）。
> 详见 [[phase-c-ci-complete]] / `memory/` 相关条目。

> ⚠️ **小程序运行时构建**：`scripts/build-mp-shared.mjs`（monorepo 根）预编译 CJS 注入 `apps/miniprogram/miniprogram/miniprogram_npm/`，因微信不支持 bare import + ESM + pnpm 三角难题。V0.1.25 新增 `device-brands.ts`（V0.1.33 含 matchBleVendor）已纳入构建。详见 `memory/mp-shared-runtime-build`。

---

## ⚠️ Zod v3.25 注意事项

`z.infer<>` 在 v3.25+ 返回 **input 形式**（带 optional），
要用 `z.output<>` 拿 applied default 后的类型。详见 [[phase2-complete]]。

---

## 📌 当前状态

- ✅ 4 个常量模块（feature-flags / member-levels / points-rules / endpoints）+ **V0.1.25 新增 device-brands**（**V0.1.33 增强：BLE_VENDOR_PATTERNS + matchBleVendor + BleVendor type + xiaomi available 开放 + garmin desc 加 BLE 标注**）
- ✅ 类型导出（从 Zod schema 推导）
- ✅ 构建产物 `dist/`（.js + .d.ts + .map）
- ✅ 前后端共用（后端通过 `workspace:*` 引用，小程序通过构建后产物引用）
- ✅ `api-contracts/endpoints.ts` 补 4 缺口（方案 B）+ `actionUrl(module, action)` 工具
- ✅ **`endpoints.test.ts` 6 测试**（vitest 3.2.6 跑通，含 actionUrl 校验）
- ✅ **`device` 模块端点**（2026-07-01，V0.1.25 +3）— 13 action：listBindings / startOAuth / unbind / syncWeRun / submitHeartRate + 佳明 4 查询 myActivities / mySleep / myMetrics / myFitnessAge + **V0.1.25 新增 myTodayHealth / myBindings / bindBleDevice**
- ✅ **`training` 模块端点**（V0.1.25 新增）— 2 action：myPlans / mySportRecords
- ✅ **`shoes` 模块端点**（V0.1.26 新增）— 5 action：list（含 healthRatio = currentKm/thresholdKm*100）/ add / update / retire（active→retired）/ myStats（total/activeCount/retiredCount/totalKm/retiringSoonCount，retiringSoon = healthRatio≥70%）；thresholdKm 默认 800
- ✅ **`stats.myAnnualReport` 端点**（V0.1.27 新增）— 年汇总（yearDistance/yearCheckins/yearDurationSec/avgPace）+ 月度分布 12 个月 + longestRun + activeDays；后端单次 groupBy(by date) 性能优化（避免 12 次 aggregate）；前端 `pages/annual-report/` 渐变大卡 + 月度柱状图 + 年份切换 + 分享战报
- ✅ **`goal` 模块端点**（V0.1.28 新增）— 4 action：list（含进度 currentDistance + percent + completed，复用后端 calcGoalProgress helper）/ add（type 自动算周期 monthly 本月1号→下月1号 / yearly 今年1/1→明年1/1 / custom 手传 periodStart/End）/ remove（硬删）/ myProgress（仅 status=active）；前端 `pages/goal/` 进度条 + 添加弹层 + FAB + 删除
- ✅ **`stats.myCertificates` 端点**（V0.1.28 新增）— 动态生成零建表：里程碑证书（MILESTONE_CERTS 100/500/1000/3000km 基于 Checkin aggregate 自动颁发）+ 赛事证书（Enrollment type=marathon + Content）+ 下一里程碑进度 nextMilestone；返回 totalDistance / totalCheckins / milestones / marathons / nextMilestone；Cache 120s；前端 `pages/certificate/` 下一里程碑卡（橙色渐变）+ 里程碑🏆 + 赛事证书
- ✅ **`favorite` 模块端点**（V0.1.29 新增）— 4 action：list（含 Content/Product 详情，后端批量关联避免 N+1）/ add（upsert 幂等，重复收藏不报错）/ remove（deleteMany，不存在也 ok）/ isFavorited（批量红心状态查询，传 targetType + targetIds[]，返 {targetId: boolean} Map）；前端 `pages/favorite/` tab 内容/商品 + 列表卡 + 取消收藏 + 点卡跳详情
- ✅ **`feed` 模块端点**（V0.1.30 新增）— 6 action：list（含作者 User + 当前用户 liked 状态，分页）/ myFeeds（仅当前用户动态）/ publish（可关联 checkinId + distanceKm，从打卡延伸为动态）/ like（事务内 create FeedLike + Feed.likeCount+1，依赖 unique 约束幂等）/ unlike（事务内 delete FeedLike + Feed.likeCount-1）/ comment（事务内 create FeedComment + Feed.commentCount+1）；前端 `pages/feed/` 动态卡（作者+时间+内容+图+跑量+点赞❤️+评论💬）+ 发布弹层（textarea 500 字）+ 点赞**乐观更新**（失败回滚）+ 评论弹层 + FAB + 分页 onReachBottom；**V0.1.32 feed-head 加 onTapUser**（点作者头像/昵称跳用户主页，关注闭环入口）
- ✅ **`notification` 模块端点**（V0.1.31 新增）— 4 action：list（分页含 actor 头像/昵称）/ unreadCount（红点轻量 count）/ markRead（鉴权仅本人，`n.userId !== userId → forbidden`）/ markAllRead（updateMany 幂等）；前端 `pages/notification/`（列表卡 actor 头像+昵称+文案+内容摘要+时间+未读红点 + 全部已读按钮 + 点击乐观标记已读 + 跳 feed + onReachBottom 分页 + 下拉刷新）+ mine 入口带未读徽标（调 unreadCount，99+ 截断，`.right` 包裹避免 space-between 居中）
- ✅ **`follow` 模块端点**（V0.1.32 新增）— 6 action：follow（upsert 幂等 + 不能关注自己 badRequest + 复用 notify(type=follow) 通知被关注者，type=follow 是第 3 个通知 type 继 like/comment 之后）/ unfollow（deleteMany 幂等）/ isFollowing（批量查按钮状态，返 Set/Map）/ myFollowing（分页含 user）/ myFollowers（分页含 user）/ **myCounts**（用户主页一次拿全：user + followingCount + followerCount + isFollowing + isSelf，可查任意 userId 不限于自己，viewerId 算 isFollowing/isSelf，避免多次请求）；前端 `pages/user/`（用户主页：头像+昵称+关注/粉丝数+关注按钮**乐观更新**失败回滚 + isSelf 自己不显示按钮；从 feed feed-head onTapUser 进入，关注闭环入口）
- ✅ **`device-brands.ts` 常量**（V0.1.25 新增）— DEVICE_BRANDS 9 品牌（含蓝牙 BLE 兜底）+ DEVICE_CATEGORY_LABEL；**V0.1.33 新增 `BLE_VENDOR_PATTERNS` + `matchBleVendor(name)` 函数 + `BleVendor` type**（前后端单一数据源，BLE 设备名品牌识别 garmin/xiaomi/ble）+ **xiaomi available false→true 开放**（小米手环可绑定）+ garmin desc 加"BLE 实时心率 + OAuth 历史"
- ✅ **`matchBleVendor` 函数 + `BLE_VENDOR_PATTERNS`**（V0.1.33 新增）— BLE 设备名品牌识别：garmin: /garmin|forerunner|fenix|vivoactive|edge/i；xiaomi: /mi\s*band|xiaomi|小米|redmi/i；未中返 'ble'；前后端共用（前端扫描识别 + 后端 vendor 校验）；可扩展 coros/huawei 等品牌（加 pattern + enum value）
- ✅ **`API_BASE.prod`** = `qingmulife.cn`（生产真实域名，nginx /api/ 反代）
- ✅ **B 电商 5 模块端点**（2026-07-02~03）— cart / points / address / coupon / **distribution**（含 6 action）
- ✅ **stats / ranking 模块端点**（2026-07-01）— 佳明跑者中心
- ✅ **sport.checkin +shoeId optional**（V0.1.26）— Checkin 打卡可选关联跑鞋，后端事务内 incrementShoeKm 累加里程（shoeId 空→跳过，向后兼容）；**V0.1.27 前端 sport picker 联动**（跑鞋里程闭环）
- ✅ **build:mp-shared 注入小程序**（`scripts/build-mp-shared.mjs`，CJS 预编译到 `miniprogram_npm/`）

---

🤙 改常量只改这里，别在两端各写一份。新增 module 必须先在 `endpoints.ts` 登记 action 列表。V0.1.26 已加 shoes（5 action）+ sport.checkin +shoeId；V0.1.27 已加 stats.myAnnualReport（年汇总+月度分布）；V0.1.28 已加 goal（4 action）+ stats.myCertificates（动态证书）；V0.1.29 已加 favorite（4 action：list 含详情/add upsert/remove/isFavorited 批量红心）；V0.1.30 已加 feed（6 action：list 含作者+liked/myFeeds/publish 可关联 checkinId/like/unlike 幂等/comment 事务内 commentCount+1）；V0.1.31 已加 notification（4 action：list 含 actor/unreadCount 红点/markRead 鉴权仅本人/markAllRead updateMany 幂等）；V0.1.32 已加 follow（6 action：follow upsert 幂等+不能关注自己+复用 notify(type=follow)/unfollow deleteMany/isFollowing 批量查按钮状态/myFollowing/myFollowers 分页含 user/myCounts 用户主页一次拿全 user+counts+isFollowing+isSelf，可查任意 userId）；**V0.1.33 已加 matchBleVendor + BLE_VENDOR_PATTERNS + BleVendor type（xiaomi available 开放 + garmin desc 加 BLE 实时心率+OAuth 历史标注）— 前后端单一数据源，前端扫描识别 + 后端 vendor 校验共用**；下一步蓝牙真机联调（V0.1.27 调试面板 + V0.1.33 品牌识别就位）+ sport 选鞋 UI 联动（已闭环）+ 目标/证书增强（自定义里程碑 / 多种证书类型）+ 收藏社交向扩展（分享收藏单/合集/红心广场）+ **动态社交向扩展（图文/视频/带打卡/带跑鞋/话题/转发微信群）**+ **通知扩展（goal_complete/系统公告等新 type）**+ **用户主页增强（动态列表 tab / 收藏 tab / 跑量汇总卡 / 关注/粉丝列表分页跳转）** + stats.myAnnualReport/myCertificates 单测（V0.1.29 后端已补，覆盖 39→100%）+ **BLE_VENDOR_PATTERNS 扩展（coros/huawei 等新品牌 pattern）**。
