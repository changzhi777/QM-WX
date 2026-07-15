# packages/shared — 前后端共享层

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../CLAUDE.md) → **packages/shared/**（这里）
>
> ## 📋 变更记录 (Changelog)
>
> - **2026-07-15** — 🎯 **`/zcf:init-project` 增量校准 #10（V0.2.1 OCR SDK + V0.2.0 饮食/天气关联 + V0.1.150/151 上传 pipeline + diet/insight 页 收官实测）**：本会话 init-architect 实测核对（**ENDPOINTS 34 module 含 food V0.2.0 5 action + ocr V0.2.1 3 action + stats V0.2.0 +weatherAnalysis +userProfile**）；**V0.2.0/V0.2.1 2 段增量 changelog 全部补到本文件顶部**；最大改动：**V0.2.0 ENDPOINTS 加 food 模块**（**5 action**：search/nutrition/record/myMeals/removeMeal；FatSecret OAuth2 + Meal.items 宏量升级 + FoodCache 1h TTL）+ **V0.2.0 ENDPOINTS.stats 加 weatherAnalysis +userProfile 2 action**（阶段 2 关联 Pearson + 阶段 3 千人千面画像；stats action 数 8→**10**）+ **V0.2.1 ENDPOINTS 加 ocr 模块**（**3 action**：generalBasic/generalAccurate/idCard；腾讯云官方 SDK + 复用 COS KEY）；本次 init #10 **0 代码改动**，纯文档增量 + 32→34 module
> - **2026-07-15** — 🎯 **V0.2.1 ENDPOINTS.ocr 3 action + V0.2.0 ENDPOINTS.food 5 action + V0.2.0 ENDPOINTS.stats +weatherAnalysis +userProfile 2 action**：① **ENDPOINTS.ocr** 新增（3 action）：`generalBasic`（通用印刷体 — 运动截图成绩）/ `generalAccurate`（高精度 — 模糊截图增强）/ `idCard`（身份证实名 — 赛事报名/账户安全，返 `{name, idNo, sex, birth, address}`）；腾讯云 OCR SDK（tencentcloud-sdk-nodejs-ocr@4.1.267 v20181119）替 V0.1.151 手写 TC3-HMAC-SHA256；复用 `COS_SECRET_ID` / `COS_SECRET_KEY`（V0.1.149 子用户 `qmwx-cos-uploader` 关联 `QcloudOCRFullAccess` 策略即可，无需新密钥）；② **ENDPOINTS.food** 新增（5 action）：`search`（FatSecret food.search.v2 + FoodCache 1h 缓存）/ `nutrition`（food.get.v2 每 100g 宏量）/ `record`（Meal 落库 + 算 totalCalorie）/ `myMeals`（某日列表 + 宏量汇总，默认今日 CN 时区）/ `removeMeal`（鉴权仅本人）；FatSecret OAuth2 client_credentials（无需用户授权，env `FATSECRET_KEY` + `FATSECRET_SECRET`）；Meal.items V0.2.0 宏量升级 `[{name, calorie, protein?, fat?, carb?, qty?, foodId?}]`；③ **ENDPOINTS.stats** 新增 2 action：`weatherAnalysis`（V0.2.0 阶段 2 — Checkin 天气快照+配速/心率 Pearson 相关系数，sufficient:false 兜底 — history 不回填 initially 样本少）/ `userProfile`（V0.2.0 阶段 3 — 用户画像 tags 自动生成 + basic/sport/body 三段 summary，frontend insight 页可一键喂 aiCoach.chat 拿千人千面建议）；stats action 数 8→**10**；commit 待；**32→34 module / 43 迁移 / 1003 测**；GAP-12 5→7
> - **2026-07-14** — 🎯 **`/zcf:init-project` 增量校准 #8（V0.1.148 init #8，post-v0.1.139~148 全量实测重对）**：本会话 init-architect 实测核对（**ENDPOINTS 32 module 含 aiCoach 9 action + V0.1.148 stats.weather 4 action**）；**V0.1.139~148 7 段增量 changelog 全部补到本文件顶部**；最大改动：**V0.1.139 ENDPOINTS 加 aiCoach**（**9 action**：chat/chatStream/generatePlan/regenerate/setPersona/history/conversations/deleteConversation/warmup + V0.1.140 完善 4 人设 + V0.1.141 warmup 性能优化 + V0.1.142 tab 化 + V0.1.144~147 完善 + V0.1.148 UI 优化）/ **V0.1.148 ENDPOINTS.stats 加 weather 4 action**（realtime/forecast/air/sunrise — coord 已落 stats.4 action + 5 测试；和风天气 QWEATHER_API_KEY 环境变量；详见 docs/qweather-api.md）；本次 init #8 **0 代码改动**，纯文档增量
> - **2026-07-14** — 🎯 **V0.1.148 ENDPOINTS.stats +weather 4 action**（coord 补）：**ENDPOINTS.stats 新加 4 action** — `weather(实时天气)` / `weatherForecast(未来 3 天预报)` / `weatherAir(空气质量 AQI + PM2.5/PM10/NO2/SO2/O3/CO)` / `weatherSun(日出日落时间)`；和风天气 API（`https://devapi.qweather.com/v7/` + `https://devapi.qweather.com/air/v1/`），`QWEATHER_API_KEY` + `QWEATHER_API_HOST` 从 .env 读；详见 docs/qweather-api.md（含完整架构/凭据/安全事件说明）；接龙：docs/CLAUDE.md 加 docs/qweather-api.md 登记行；stats/CLAUDE.md 加 weather action；.env.example 加 QWEATHER_API_KEY / QWEATHER_API_HOST；stats 5 测试；**前置清理**：stats.service 杭州→长沙（默认 location changsha CN）
> - **2026-07-13~14** — 🎯 **V0.1.144~147 ENDPOINTS 加 ai-coach.myDailyReport 等**（V0.1.144~147 健康助手化）：**ENDPOINTS.aiCoach 加 myDailyReport / generateDailyReport 2 action**（调 DailyReport 表 #58，AI 解读文本 / 健康分数 0-100 / alertText / steps / restingHr / sleepHours）；ENDPOINTS.aiCoach 共 11 action（含 V0.1.139 ~141 历史版本）
> - **2026-07-13** — 🎯 **V0.1.142 ENDPOINTS 后端保留**：V0.1.142 删商城前端 16 页但**后端 module 保留**（cart/points/address/coupon/distribution/group-buy/backend review 即 favorite/mall/cart/points/address/coupon/distribution/group-buy/review endpoint 持续可用）；endpoints.test 6→7 测（加 1 测验证保留 endpoint）；不变 schema 不变 type
> - **2026-07-13** — 🎯 **V0.1.141 aiCoach.warmup action**（速度优化第 9 个 action）：ENDPOINTS.aiCoach 加 warmup action（前端进页前预 Cache system prompt，省首次 30+ms 加载）
> - **2026-07-13** — 🎯 **V0.1.140 aiCoach 完善（4 人设 + 建议卡片 + 计划追踪 + 分享 + 限流 + voice）**：User +aiCoachPersona 字段（scientist/coach/buddy/strict）— UserOutputSchema +aiCoachPersona enum**；Persona enum 4 value 加入 types/index.ts；**aiCoach.setPersona action**（第 9 个；Cache.delByPattern 失效）+ history/regenerate（之前 V0.1.139 完善续已加）；action 数 7→9（V0.1.140）
> - **2026-07-13** — 🎯 **V0.1.139 AI 私教** ENDPOINTS 加 `aiCoach` 模块（**6 action**：chat / chatStream 流式 / generatePlan / adoptPlan / history 历史持久化 / regenerate 重新生成）
> - **2026-07-13** — 🎯 **V0.1.137 跑鞋增强 2 期** ENDPOINTS：shoes +1 action `compareShoes`（横向对比 2 双，shoes action 数 8→9）+ reviews 扩 targetType enum 'product'|'shoe'（鞋评双分发，合成 productId=`shoe:${shoeId}` 绕过 @@unique 三元组）+ stats.myCertificates 返扩 3 段鞋成就（shoesMilestones 100/500/1000/3000km + shoeDays 30/100/365 天 + shoeCheckin 50/100/500 次）
> - **2026-07-13** — 🎯 **V0.1.136 收藏+动态社交向扩展** ENDPOINTS：feed +1 action `shoesForPicker`（跑鞋 picker 接口，publish 校验 shoeId 归属）+ Feed schema +shoeId optional（前端动态可关联跑鞋，badge 显示）
> - **2026-07-12** — 🎯 **V0.1.135 目标/证书增强** ENDPOINTS：goal +4 action（addCustomMilestone/removeCustomMilestone/listCustomMilestones/checkMilestoneAchievement，goal action 数 6→10）+ stats.myCertificates 返扩 5 段（+paceProgressCert/consecutiveCheckinCert/groupContributionCert + customMilestones 用户自定义）+ User schema +customMilestones Json?
> - **2026-07-12** — 🎯 **V0.1.134 赛事服务 MVP** ENDPOINTS：content +3 action（submitRaceResult/getRaceLeaderboard/getMyRaceResult，content action 数 3→6）+ admin +2（submitRaceResult/listEnrollmentsByContent）+ RaceResult schema（@@unique enrollmentId 1:1）
> - **2026-07-12** — 🎯 **V0.1.133 跑鞋增强** ENDPOINTS：shoes +3 action（getDetail/getMileageHistory/updateThreshold，shoes action 数 5→8）
> - **2026-07-12** — 🎯 **V0.1.132 init 校准**（纯文档，ENDPOINTS 无改动）
> - **2026-07-12** — 🎯 **V0.1.129 多方式认证 + V0.1.131 qm-admin 登录** ENDPOINTS 加 `auth` 模块 login 4 method（wechat/phone/email/password）+ bindApps + sms-code + send-mail（保留 refresh）；+UserOutputSchema 字段 `email?` / `username?` / `hasPassword`（V0.1.130）+ action 数 +5（auth.sms-code / send-mail / bindApps + login dispatcher 方法）
> - **2026-07-12** — 🎯 **V0.1.128 COROS 三轨** ENDPOINTS 加 `device.bindApps` 操作扩展（Terra 聚合 API key 配置在 configRepo）
> - **2026-07-12** — 🎯 **V0.1.127 体脂秤** ENDPOINTS.device 加 `myScaleBind` / `submitBodyComp`（scale GATT 解析 + 入 BodyCompositionRecord 表）；action 数 16→18
> - **2026-07-10** — **V0.1.113 评价系统** ENDPOINTS 加 `review` 模块（5 action：create/list/stats/myReviews/remove，电商闭环最后一块）
> - **2026-07-10** — 🎯 **V0.1.100 GitHub 主线起点** + 🎯 **V0.1.43 微信运动 + 小米 OAuth + 健康持久化 + onboarding 4 步式**：`ENDPOINTS.device` 加 3 action（syncWeRun / myWeRun / myHealthHistory），端点 action 数 13→**16**；`API_BASE.prod` 仍 `qingmulife.cn`；本仓未单独发版本（与主仓同步 v0.1.100 跳号）
> - **2026-07-08** — **V0.1.42 跑群深化** ENDPOINTS sport +3 action（groupDetail / groupMembers / announceGroup）+ **V0.1.41** training +3 joinPlan/myActivePlan/leavePlan + admin +2 upsertTrainingPlan/listTrainingPlans
> - **2026-07-04** — **V0.1.34 家庭空间 family** ENDPOINTS 加 `family` 模块（6 action：createFamily/joinFamily/myFamily/leaveFamily/familyRanking/inviteInfo）+ `goal` 扩 2 action（addFamilyGoal/myFamilyGoals，action 数 4→6）
> - **2026-07-03** — **V0.1.33 BLE 设备品牌识别** `device-brands.ts` 改动：`xiaomi` available false→**true**（小米手环可绑定）+ `garmin.desc` 加"BLE 实时心率 + OAuth 历史" + 新增 `BLE_VENDOR_PATTERNS` + `matchBleVendor(name)` 函数 + `BleVendor` type（**前后端单一数据源**）
> - **2026-07-03** — **V0.1.32 follow** ENDPOINTS 加 follow 模块（6 action）
> - **2026-07-03** — **V0.1.31 notification** ENDPOINTS 加 notification 模块（4 action）
> - **2026-07-03** — **V0.1.30 feed** ENDPOINTS 加 feed 模块（6 action）
> - **2026-07-03** — **V0.1.29 favorite** ENDPOINTS 加 favorite 模块（4 action）
> - **2026-07-03** — **V0.1.28 goal + stats.myCertificates** ENDPOINTS 加 goal 模块（4 action）+ stats 加 myCertificates（action 数 2→3）
> - **2026-07-03** — **V0.1.27 stats.myAnnualReport** ENDPOINTS.stats 加 myAnnualReport action
> - **2026-07-03** — **V0.1.26 shoes** ENDPOINTS 加 shoes 模块（5 action）
> - **2026-07-03** — **V0.1.25 pic 3 页 + device 扩 5 action** ENDPOINTS 加 training 模块（2 action）+ device action 数 13 + device-brands.ts 新增（DEVICE_BRANDS 9 品牌 + DEVICE_CATEGORY_LABEL）

> 最近更新：2026-07-14 **V0.1.148 init #8 全量实测**（**V0.1.139~148 7 段 changelog 已补本文件顶部**） — **ENDPOINTS 32 module**（auth/user/sport/mall/content/wallet/weekly-report/upload/admin/app-config/wxpay/device/stats/ranking/recipe/ludong/cart/points/address/coupon/distribution/training/shoes/goal/favorite/feed/notification/follow/family/group-buy/review/ai-coach）— ENDPOINTS.aiCoach 11 action（含 V0.1.144~147 myDailyReport/generateDailyReport + V0.1.141 warmup + V0.1.140 setPersona）+ ENDPOINTS.stats **8 action**（V0.1.148 +weather 4 action coord 补；myRunnerStats/myAnnualReport/myCertificates/myDailyReport/generateDailyReport + **weather/weatherForecast/weatherAir/weatherSun**） — **V0.1.142 ENDPOINTS 后端保留**：cart/points/address/coupon/distribution/group-buy/review 等 endpoint 持续可用 — V0.1.137 ENDPOINTS shoes +compareShoes（9 action）+ reviews 扩 targetType enum + stats.myCertificates 扩 3 段鞋成就 — V0.1.136 feed +shoesForPicker + Feed schema +shoeId — V0.1.135 goal +4 action + stats.myCertificates 扩 5 段 + User +customMilestones Json? — V0.1.134 content +3 race + admin +2 race + RaceResult schema — V0.1.133 shoes +3 action（getDetail/getMileageHistory/updateThreshold）

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
│   └── index.ts                    # TS 类型（从 Zod schema 推导；**V0.1.140 +aiCoachPersona enum**）
├── constants/
│   ├── feature-flags.ts            # 功能开关定义（wallet / payment / membership / ai）
│   ├── member-levels.ts            # 会员等级（free / monthly / quarterly / yearly）
│   ├── points-rules.ts             # 积分规则（打卡 +N / 注册 +N / 等）
│   └── device-brands.ts            # **设备品牌清单**（V0.1.25：DEVICE_BRANDS 9 品牌 + DEVICE_CATEGORY_LABEL；**V0.1.33 新增**：BLE_VENDOR_PATTERNS + matchBleVendor + BleVendor type；xiaomi available true）
└── api-contracts/
    └── endpoints.ts                # API 端点路径常量（**V0.1.148 32 module + ENDPOINTS.stats.weather 4 action + ENDPOINTS.aiCoach 11 action**）
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

### ENDPOINTS 模块清单（截至 2026-07-15 V0.2.1 init #10 实测 34 module）

> 🎯 init #10 新增：**food V0.2.0 第 33 个**（5 action）+ **ocr V0.2.1 第 34 个**（3 action）+ stats +2 action（weatherAnalysis + userProfile）

| 模块 | action 数 | 说明 |
| --- | ---: | --- |
| auth | 2 | login / refresh |
| user | 4 | me / updateProfile / login / bindApps |
| sport | 6 | checkin（V0.1.26 +shoeId optional）/ myStats / groupRanking / myGroups / createGroup / groupDetail |
| mall | 5+ | listProducts / listCategories / myOrders / createOrder / cancelOrder（**V0.1.142 前端下线后端保留**） |
| content | 6（含 V0.1.134 +3 race） | list / detail / enroll / submitRaceResult / getRaceLeaderboard / getMyRaceResult |
| wallet | 3 | balance / recharge / transactions |
| weekly-report | 2 | getWeeklyReport / aggregate |
| admin | 25+（V0.1.117+ V0.1.118+ V0.1.123+ V0.1.131+ V0.1.134 +2 race = 25+）| 全功能 admin（listUsers / listContents / listProducts / stats / ban / unban / auditLog / statsByTimeRange / exportOrders / exportUsers / uploadProduct / upsertGroupBuy / listGroupBuys / upsertTrainingPlan / listTrainingPlans / addReviewReply / listReviews / submitRaceResult / listEnrollmentsByContent 等） |
| upload | 1 | upload |
| wxpay | 4 | createOrder / notify / queryOrder / refund |
| device | 18（V0.1.43 +3 / V0.1.127 +2 = 18） | +syncWeRun/myWeRun/myHealthHistory（V0.1.43）+submitBodyComp/myScaleBind（V0.1.127）+ 佳明 + BLE + 心率/血氧/睡眠 |
| **stats** | **10**（V0.1.144~147 +2 myDailyReport/generateDailyReport + V0.1.148 +4 weather coord 补 + **V0.2.0 +2 weatherAnalysis +userProfile 阶段 2/3**） | myRunnerStats + myAnnualReport V0.1.27 + myCertificates V0.1.28（V0.1.135 5 段 + V0.1.137 3 段鞋成就）+ myDailyReport V0.1.144~147（DailyReport #58 + 健康分数 0-100 + AI 解读）+ generateDailyReport V0.1.144~147（AI 重新生成）+ weather V0.1.148 + weatherForecast + weatherAir + weatherSun（和风天气）+ **weatherAnalysis V0.2.0**（Checkin 天气快照+配速/心率 Pearson 相关系数，sufficient:false 兜底 — history 不回填）+ **userProfile V0.2.0**（千人千面画像 tags + summary，可喂 aiCoach.chat 拿建议） |
| ranking | 1 | groupRankingMulti |
| cart | 5 | add/remove/list/updateQty/clear（**V0.1.142 前端下线后端保留**） |
| points | 3 | myBalance/signin/myTasks（**V0.1.142 前端下线后端保留**） |
| address | 5 | list/create/update/delete/setDefault（**V0.1.142 前端下线后端保留**） |
| coupon | 4 | templates/myCoupons/receive/availableCount（**V0.1.142 前端下线后端保留**） |
| distribution | 6 | mySummary/myOrders/myTeam/myCommissionLogs/myLevel/inviteInfo（**V0.1.142 前端下线后端保留**） |
| training（V0.1.25 + V0.1.41 +3） | 5 | myPlans/mySportRecords/joinPlan/myActivePlan/leavePlan |
| shoes（V0.1.26 + V0.1.133 +3 + V0.1.137 +1） | **9** | list/add/update/retire/myStats + getDetail/getMileageHistory/updateThreshold + compareShoes |
| goal（V0.1.28 + V0.1.34 +2 + V0.1.135 +4） | **10** | list/add/remove/myProgress + addFamilyGoal/myFamilyGoals + addCustomMilestone/removeCustomMilestone/listCustomMilestones/checkMilestoneAchievement |
| favorite（V0.1.29） | 4 | list/add/remove/isFavorited（**V0.1.142 前端下线后端保留**） |
| feed（V0.1.30 + V0.1.136 +1） | **7** | list/myFeeds/publish/like/unlike/comment + shoesForPicker |
| notification（V0.1.31） | 4 | list/unreadCount/markRead/markAllRead |
| follow（V0.1.32） | 6 | follow/unfollow/isFollowing/myFollowing/myFollowers/myCounts |
| family（V0.1.34） | 6 | createFamily/joinFamily/myFamily/leaveFamily/familyRanking/inviteInfo |
| **group-buy**（V0.1.37） | 4 | list/detail/join/leave（**V0.1.142 前端下线后端保留**） |
| review（V0.1.113 + V0.1.118 + V0.1.137） | **7** | create/listByProduct/productStats/myReviews/remove + addReply（admin）/listByTarget（鞋评）/targetStats |
| **ai-coach**（**V0.1.139 +V0.1.140 完善 + V0.1.141 + V0.1.144~147 + V0.1.148 UI**） | **11** | chat / chatStream / generatePlan / regenerate / **setPersona**（V0.1.140 第 9 个，4 人设 scientist/coach/buddy/strict）/ history / conversations / deleteConversation / **warmup**（V0.1.141 第 10 个，预 Cache system prompt）/ adoptPlan / **myDailyReport / generateDailyReport**（V0.1.144~147 健康简报） |
| recipe / ludong | — | V2 stub |
| **food（V0.2.0 第 33 个）** | **5** | search / nutrition / record / myMeals / removeMeal — FatSecret OAuth2 + FoodCache 1h TTL + Meal.items 宏量升级 |
| **ocr（V0.2.1 第 34 个）** | **3** | generalBasic / generalAccurate / idCard — 腾讯云官方 SDK 替 V0.1.151 手写 TC3 + 复用 COS KEY |

### DEVICE_BRANDS（V0.1.25 新增常量；V0.1.33 增强）

`src/constants/device-brands.ts` 提供 9 个品牌 + **V0.1.33 BLE 设备品牌识别**（详同前）

---

## 📦 依赖

- **运行时**：`zod`（schema 定义 + 类型推导）
- **开发**：`typescript` `vitest@^3.2.6` `@vitest/coverage-v8@^3.2.6`

---

## 🧪 测试

```bash
pnpm test              # vitest run — **7 passed**（V0.1.148 init #8 +1 测：endpoints 验证 V0.1.142 后端保留 endpoint 仍可用）
pnpm typecheck         # tsc --noEmit
pnpm build             # tsc -p tsconfig.build.json → dist/
```

---

## ⚠️ Zod v3.25 注意事项

`z.infer<>` 在 v3.25+ 返回 **input 形式**（带 optional），要用 `z.output<>` 拿 applied default 后的类型。

---

## 📌 当前状态

- ✅ **V0.1.148 init #8 实测：ENDPOINTS 32 module（含 ai-coach 第 32 个 V0.1.139 新增）+ V0.1.148 stats 加 weather 4 action coord 补 + V0.1.144~147 ai-coach 加 myDailyReport/generateDailyReport 2 action**
- ✅ 4 个常量模块（feature-flags / member-levels / points-rules / endpoints + V0.1.25 device-brands + V0.1.33 BLE_VENDOR_PATTERNS/matchBleVendor/BleVendor）
- ✅ 类型导出（V0.1.140 +aiCoachPersona enum）
- ✅ 构建产物 `dist/`
- ✅ 前后端共用（后端通过 `workspace:*` 引用，小程序通过构建后产物引用）
- ✅ `api-contracts/endpoints.ts` 32 module + `actionUrl(module, action)` 工具
- ✅ **`endpoints.test.ts` 7 测试**（V0.1.148 +1 测）
- ✅ **`device` 模块端点** 18 action（含 V0.1.43 +3 syncWeRun/myWeRun/myHealthHistory + V0.1.127 +2 + 佳明 + BLE + 心率/血氧/睡眠）
- ✅ **`stats` 模块端点**（V0.1.148 **8** action：myRunnerStats + myAnnualReport + myCertificates + myDailyReport V0.1.144~147 + generateDailyReport V0.1.144~147 + weather 4 action V0.1.148 coord 补）
- ✅ **`aiCoach` 模块端点**（V0.1.148 **11** action：V0.1.139 MVP 4 + V0.1.139 完善续 2 + V0.1.140 2 + V0.1.141 1 + V0.1.144~147 2）
- ✅ **`shoes` 模块端点** 9 action（list/add/update/retire/myStats + getDetail/getMileageHistory/updateThreshold + compareShoes）
- ✅ **`goal` 模块端点** 10 action（list/add/remove/myProgress + addFamilyGoal/myFamilyGoals + 4 customMilestone）
- ✅ **`feed` 模块端点** 7 action（list/myFeeds/publish/like/unlike/comment + shoesForPicker）
- ✅ **`review` 模块端点** 7 action（create/listByProduct/productStats/myReviews/remove + addReply/listByTarget/targetStats）
- ✅ **`API_BASE.prod`** = `qingmulife.cn`
- ✅ **`device-brands.ts` + BLE_VENDOR_PATTERNS + matchBleVendor**（前后端单一数据源）

---

🤙 **V0.2.1 init #10 完成**：ENDPOINTS 共 **34 module**（含 V0.2.0 food 第 33 个 + V0.2.1 ocr 第 34 个） + ENDPOINTS.food **5 action**（V0.2.0 FatSecret OAuth2 + Meal.items 宏量 + FoodCache 1h）+ ENDPOINTS.ocr **3 action**（V0.2.1 腾讯云 SDK 替手写 TC3 + 复用 COS KEY）+ ENDPOINTS.stats **10 action**（V0.2.0 +weatherAnalysis +userProfile 阶段 2/3）+ ENDPOINTS.aiCoach 11 action 沿用 + V0.1.142 后端保留端点。下一步：huawei 样本 + FATSECRET_KEY 生产注入 + qmwx-cos-uploader 关联 QcloudOCRFullAccess + diet/insight 真机验证 + wxpay 真生产切流 + AI 私教 voice 插件。
