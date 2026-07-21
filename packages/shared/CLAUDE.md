# packages/shared — 前后端共享层

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../CLAUDE.md) → **packages/shared/**（这里）
>
> ## 📋 变更记录 (Changelog)
>
> - **2026-07-21** — 🎯 **V0.2.42 ENDPOINTS.strength 新增（第 36 个 module）**：`packages/shared/src/api-contracts/endpoints.ts` 加 `strength: { startSession/addSet/finishSession/listSessions/sessionDetail/myVolume/listExercises: '/api/strength' }`（7 action）；**packages/shared 35→36 module**（interpret 第 35 + strength 第 36）；对应后端 V0.2.42 strength module（训记式力量日志，StrengthSession/StrengthSet/Exercise #63-65，迁移 20260720000000 + Exercise seed ~15）；前端 `pages/strength` 待建（训练日志页 + 组间计时）；**V0.2.40-52 其他迭代不动 shared**：ai-coach 多模态（V0.2.45）是 payload `imageUrl` 不加 ENDPOINTS / huawei TCX（V0.2.47）是后端 parser / admin 加固（V0.2.49）是测试 / weather（V0.2.40-41）后端 stats；**miniprogram_npm 待 rebuild**（shared V0.2.42 加 ENDPOINTS.strength，前端 strength 页调用待建）

> - **2026-07-20** — 🎯 **`/zcf:init-project` 增量校准 #18（V0.2.38 收官）**：本会话 init-architect 全量实测（**ENDPOINTS 35 module ✅ +1（interpret）**）；**V0.2.28~V0.2.38 shared 关键改动**：① **V0.2.33 ENDPOINTS.interpret 新增**（line 115 `interpret: { garmin: '/api/interpret' }`）— **packages/shared 34→35 module**；② V0.2.28 aiCoach contextBuilder 3 天时效（后端 prompt，无新 action，shared 不动）；③ V0.2.30 stats buildReportText 重写（后端 service 内部，无 ENDPOINTS 改动）；④ V0.2.34 interpret 前端页（apps/miniprogram，不动 shared）；⑤ V0.2.35 interpret routes bodyLimit 10MB（后端 routes，不动 shared）；⑥ V0.2.36 interpret 测试加固 +7（后端测试，不动 shared）；⑦ V0.2.37 admin listInterpret action（后端 admin.service，**shared ENDPOINTS.admin 未单独记 listInterpret**，沿用 admin generic action 模式）；**ENDPOINTS 现状**：35 module / food 6 action / ocr 3 action / **interpret 1 action（V0.2.33 garmin）** / stats 10 action / admin 25+ action（V0.2.8 RBAC + V0.2.37 listInterpret 沿用 generic）/ user +redeemMember / distribution +bindInviter + inviteInfo 加强；**types/index.ts** 保持 `GrowthLevel` + `AdminRole` + `MemberPackage`（V0.2.7/2.8）；**constants/member-levels.ts** 保持 `GROWTH_THRESHOLDS` + `REDEEM_PACKAGES` + `ADMIN_ROLE_PERMISSIONS`（V0.2.7/2.8）；本次 init #18 **0 代码改动**纯文档增量；**miniprogram_npm 产物需 rebuild**（shared V0.2.33 加 ENDPOINTS.interpret，前端 pages/interpret 调用）；下一步：① 主人提供 minimax key + 佳明 .fit 样本后真机验证 interpret.garmin；② 若 listInterpret 需独立 action 显式声明（当前沿用 admin generic 模式），可在 ENDPOINTS.admin 单独加
> - **2026-07-18** — 🎯 **V0.2.33 ENDPOINTS.interpret 新增（第 35 个 module）**：`packages/shared/src/api-contracts/endpoints.ts:115` 加 `interpret: { garmin: '/api/interpret' }`；**packages/shared 34→35 module**；对应后端 `apps/server/src/modules/interpret/{client,service,routes}.ts`（MiniMax M3 Anthropic 兼容 + 佳明 FIT 解读 + InterpretRecord #62）；前端 `apps/miniprogram/miniprogram/pages/interpret/`（chooseMessageFile → base64 → POST → 展示）；**miniprogram_npm 待 rebuild**（build:mp-shared 注入产物，前端依赖）；key `sk-cp-` 疑代理，真机调官方若 401 切 base URL（env MINIMAX_BASE_URL 可改）
> - **2026-07-17** — 🎯 **`/zcf:init-project` 增量校准 #17（V0.2.27 收官）**：本会话 init-architect 全量实测（**ENDPOINTS 34 module ✅ 一致**）；**V0.2.22~V0.2.27 shared 零代码改动**：① V0.2.22 wxpay fetchPlatformCerts 是后端测试不动 shared；② V0.2.23 funcs% 加固是后端测试不动 shared；③ V0.2.24 体脂秤修复是 utils/scale.ts + device.service 不动 shared；④ V0.2.25 dev-cli --project + WechatSI 临时移除是 scripts/dev-cli + app.json 不动 shared；⑤ **V0.2.26 stats.weatherAnalysis 返回类型扩**（后端 stats.service.ts 加 `correlations.aqiHr` + `scatter.aqiHr` + `feelsLikeZones?` + `optimalZone?`），shared 未加 Zod schema（stats.weatherAnalysis action 仍走 JSON 返回，前端 `pages/insight/index.ts` 直接消费 WeatherAnalysisResult 接口类型，无 Zod 强制）；⑥ **V0.2.27 aiCoach contextBuilder 天气感知**（后端 context-builder.ts prompt 拼接，无新 action，shared 不动）；**ENDPOINTS 现状保持 V0.2.8 沉淀**：34 module / food 6 action / ocr 3 action / stats 10 action / admin 8 RBAC action / user +redeemMember / distribution +bindInviter + inviteInfo 加强；**types/index.ts** 保持 `GrowthLevel` + `AdminRole` + `MemberPackage`（V0.2.7/2.8）；**constants/member-levels.ts** 保持 `GROWTH_THRESHOLDS` + `REDEEM_PACKAGES` + `ADMIN_ROLE_PERMISSIONS`（V0.2.7/2.8）；本次 init #17 **0 代码改动**纯文档增量；**miniprogram_npm 产物无需 rebuild**（shared 源零改动）
> - **2026-07-17** — 🎯 **`/zcf:init-project` 增量校准 #16（V0.2.21 收官）**：本会话 init-architect 全量实测（**ENDPOINTS 34 module ✅ 一致**）；**V0.2.9~V0.2.21 shared 零改动**（V0.2.9 prototype 4 组件是纯前端；V0.2.10 CLI 在 scripts/dev-cli；V0.2.11~2.18 均测试/文档/CI；V0.2.19 voice 是 app.json 不动 shared；V0.2.21 huawei fuzzer 是后端测试）；**ENDPOINTS 现状保持 V0.2.8 沉淀**；本次 init #16 **0 代码改动**纯文档增量
> - **2026-07-15** — 🎯 **V0.2.5 device-brands +mi_scale + ENDPOINTS.food +recognize**：① `DEVICE_BRANDS` 加 `{ key:'mi_scale', name:'小米体脂秤', category:'scale', connectionType:'ble', available:true, desc:'MI_SCALE/MIBCS 体重+体成分' }` + `DeviceCategory` +'scale' + `DEVICE_CATEGORY_LABEL` scale:'体脂秤'；② `ENDPOINTS.food` +`recognize`（5→**6** action）；已 rebuild `miniprogram_npm`
> - **2026-07-16** — 🎯 **V0.2.6/V0.2.7/V0.2.8 ENDPOINTS 增长体系 + admin RBAC 配套**：① **`ENDPOINTS.user`** +`redeemMember` action（V0.2.7）；② **`ENDPOINTS.distribution`** `inviteInfo` 加强 + 新增 `bindInviter` action（V0.2.6）；③ **`ENDPOINTS.admin`** +8 action（V0.2.8 RBAC）；④ **`types/index.ts`** +`GrowthLevel` + `AdminRole` + `MemberPackage`（V0.2.7/2.8）；⑤ **`constants/member-levels.ts`** +`GROWTH_THRESHOLDS` + `REDEEM_PACKAGES` + `ADMIN_ROLE_PERMISSIONS`（V0.2.7/2.8）；⑥ **ENDPOINTS 总数**：34 module；⑦ **miniprogram_npm 已 rebuild**
> - **2026-07-15** — 🎯 **`/zcf:init-project` 增量校准 #10（V0.2.1 OCR SDK + V0.2.0 饮食/天气关联 + V0.1.150/151 上传 pipeline + diet/insight 页 收官实测）**：34 module 含 food 5 action + ocr 3 action + stats 10 action
> - **2026-07-15** — 🎯 **V0.2.1 ENDPOINTS.ocr 3 action + V0.2.0 ENDPOINTS.food 5 action + V0.2.0 ENDPOINTS.stats +weatherAnalysis +userProfile 2 action**：腾讯云 OCR SDK + FatSecret OAuth2 + Pearson 相关系数 + 千人千面画像
> - **2026-07-14** — 🎯 **`/zcf:init-project` 增量校准 #8（V0.1.148 init #8）**：32 module 含 aiCoach 9 action + V0.1.148 stats.weather 4 action
> - **2026-07-14** — 🎯 **V0.1.148 ENDPOINTS.stats +weather 4 action**（coord 补）：realtime / forecast / air / sunrise
> - **2026-07-13~14** — 🎯 **V0.1.144~147 ENDPOINTS 加 ai-coach.myDailyReport 等**（健康助手化）：+myDailyReport/generateDailyReport 2 action
> - **2026-07-13** — 🎯 **V0.1.142 ENDPOINTS 后端保留**：删商城前端 16 页但后端 module 保留
> - **2026-07-13** — 🎯 **V0.1.141 aiCoach.warmup action**（速度优化第 9 个 action）
> - **2026-07-13** — 🎯 **V0.1.140 aiCoach 完善（4 人设 + 建议卡片 + 计划追踪 + 分享 + 限流 + voice）**：User +aiCoachPersona 字段；**aiCoach.setPersona action**（第 9 个）
> - **2026-07-13** — 🎯 **V0.1.139 AI 私教** ENDPOINTS 加 `aiCoach` 模块（**6 action**：chat/chatStream/generatePlan/adoptPlan/history/regenerate）
> - **2026-07-13** — 🎯 **V0.1.137 跑鞋增强 2 期**：shoes +1 action `compareShoes` + reviews 扩 targetType enum 'product'|'shoe'
> - **2026-07-13** — 🎯 **V0.1.136 收藏+动态社交向扩展**：feed +1 action `shoesForPicker`
> - **2026-07-12** — 🎯 **V0.1.135 目标/证书增强** / **V0.1.134 赛事服务 MVP** / **V0.1.133 跑鞋增强** / **V0.1.129 多方式认证** / **V0.1.128 COROS 三轨** / **V0.1.127 体脂秤** / **V0.1.113 评价系统** / **V0.1.100 GitHub 主线** / **V0.1.43 微信运动** / **V0.1.42 跑群深化** / **V0.1.34 家庭空间** / **V0.1.33 BLE 设备品牌识别** / **V0.1.32 follow** / **V0.1.31 notification** / **V0.1.30 feed** / **V0.1.29 favorite** / **V0.1.28 goal + stats.myCertificates** / **V0.1.27 stats.myAnnualReport** / **V0.1.26 shoes** / **V0.1.25 pic 3 页 + device 扩 5 action + device-brands.ts 新增**

> 最近更新：2026-07-20 **V0.2.38 init #18 全量实测**（**init #18 + V0.2.33 段 changelog 已补本文件顶部**） — **ENDPOINTS 35 module**（V0.2.33 +interpret 第 35 个）— V0.2.28~V0.2.38 shared 改动 = **V0.2.33 ENDPOINTS.interpret 新增 1 项**（line 115 `interpret: { garmin: '/api/interpret' }`），其他全是后端/前端改动不动 shared — ENDPOINTS.stats **10 action** 沿用（V0.2.30 buildReportText 重写是后端 service 内部）— ENDPOINTS.aiCoach 11 action 沿用（V0.2.28 3 天时效是后端 prompt）— **miniprogram_npm 需 rebuild**（V0.2.33 加 ENDPOINTS.interpret，前端 pages/interpret 调用）

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
│   └── index.ts                    # TS 类型（从 Zod schema 推导；V0.1.140 +aiCoachPersona enum；V0.2.7 +GrowthLevel；V0.2.8 +AdminRole）
├── constants/
│   ├── feature-flags.ts            # 功能开关定义（wallet / payment / membership / ai）
│   ├── member-levels.ts            # 会员等级（free / monthly / quarterly / yearly）+ V0.2.7 GROWTH_THRESHOLDS + REDEEM_PACKAGES + V0.2.8 ADMIN_ROLE_PERMISSIONS
│   ├── points-rules.ts             # 积分规则（打卡 +N / 注册 +N / 等）
│   └── device-brands.ts            # **设备品牌清单**（V0.1.25：DEVICE_BRANDS 9 品牌 + DEVICE_CATEGORY_LABEL；V0.1.33 新增：BLE_VENDOR_PATTERNS + matchBleVendor + BleVendor type；V0.2.5 +mi_scale）
└── api-contracts/
    └── endpoints.ts                # API 端点路径常量（V0.2.33 **35 module** + ENDPOINTS.stats.weather 4 action + ENDPOINTS.aiCoach 11 action + ENDPOINTS.food 6 action V0.2.5 + ENDPOINTS.ocr 3 action V0.2.1 + **ENDPOINTS.interpret 1 action V0.2.33**）
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
import {} from '@qm-wx/shared/constants/device-brands';
import {} from '@qm-wx/shared/api-contracts';
```

### ENDPOINTS 模块清单（截至 2026-07-20 V0.2.38 init #18 实测 **35 module**）

> 🎯 V0.2.33 +interpret；其他 V0.2.28-38 shared 零代码改动

| 模块 | action 数 | 说明 |
| --- | ---: | --- |
| auth | 2 | login / refresh |
| user | 4 | me / updateProfile / login / bindApps |
| sport | 6 | checkin / myStats / groupRanking / myGroups / createGroup / groupDetail |
| mall | 5+ | listProducts / listCategories / myOrders / createOrder / cancelOrder（**V0.1.142 前端下线后端保留**） |
| content | 6 | list / detail / enroll / submitRaceResult / getRaceLeaderboard / getMyRaceResult |
| wallet | 3 | balance / recharge / transactions |
| weekly-report | 2 | getWeeklyReport / aggregate |
| admin | 25+（V0.2.8 +8 RBAC + **V0.2.37 listInterpret**）| 全功能 admin（沿用 V0.2.8 + V0.2.37 listInterpret 沿用 admin generic action 模式） |
| upload | 1 | upload |
| wxpay | 4 | createOrder / notify / queryOrder / refund |
| device | 18（V0.1.43 +3 / V0.1.127 +2） | +syncWeRun/myWeRun/myHealthHistory + submitBodyComp/myScaleBind + 佳明 + BLE + 心率/血氧/睡眠 + 体脂秤（V0.2.24 体重系数 0.005） |
| **stats** | **10**（V0.2.0 +weatherAnalysis +userProfile；**V0.2.30 buildReportText 三段式重写后端内部**） | myRunnerStats + myAnnualReport + myCertificates + myDailyReport + generateDailyReport + weather 4 action + weatherAnalysis V0.2.0 + userProfile V0.2.0 |
| ranking | 1 | groupRankingMulti |
| cart | 5 | add/remove/list/updateQty/clear（**V0.1.142 前端下线后端保留**） |
| points | 3 | myBalance/signin/myTasks（**V0.1.142 前端下线后端保留**） |
| address | 5 | list/create/update/delete/setDefault（**V0.1.142 前端下线后端保留**） |
| coupon | 4 | templates/myCoupons/receive/availableCount（**V0.1.142 前端下线后端保留**） |
| distribution | 6 | mySummary/myOrders/myTeam/myCommissionLogs/myLevel/inviteInfo（**V0.1.142 前端下线后端保留**；V0.2.6 inviteInfo 加强 + bindInviter） |
| training | 5 | myPlans/mySportRecords/joinPlan/myActivePlan/leavePlan |
| shoes | **9** | list/add/update/retire/myStats + getDetail/getMileageHistory/updateThreshold + compareShoes |
| goal | **10** | list/add/remove/myProgress + addFamilyGoal/myFamilyGoals + addCustomMilestone/removeCustomMilestone/listCustomMilestones/checkMilestoneAchievement |
| favorite | 4 | list/add/remove/isFavorited（**V0.1.142 前端下线后端保留**） |
| feed | **7** | list/myFeeds/publish/like/unlike/comment + shoesForPicker |
| notification | 4 | list/unreadCount/markRead/markAllRead |
| follow | 6 | follow/unfollow/isFollowing/myFollowing/myFollowers/myCounts |
| family | 6 | createFamily/joinFamily/myFamily/leaveFamily/familyRanking/inviteInfo |
| **group-buy** | 4 | list/detail/join/leave（**V0.1.142 前端下线后端保留**） |
| review | **7** | create/listByProduct/productStats/myReviews/remove + addReply（admin）/listByTarget（鞋评）/targetStats |
| **ai-coach**（**V0.2.27 天气感知 + V0.2.28 3 天时效**） | **11** | chat / chatStream / generatePlan / regenerate / setPersona / history / conversations / deleteConversation / warmup / adoptPlan / myDailyReport / generateDailyReport（**V0.2.27/28 contextBuilder 是后端 prompt，无新 action**） |
| recipe / ludong | — | V2 stub |
| **food（V0.2.0 第 33 个）** | **6**（V0.2.5 +recognize） | search / nutrition / record / myMeals / removeMeal / **recognize**（vision GLM-4.6V / ocr 腾讯 OCR） |
| **ocr（V0.2.1 第 34 个）** | **3** | generalBasic / generalAccurate / idCard |
| **interpret（V0.2.33 第 35 个）** | **1**（V0.2.33 garmin） | **garmin**（佳明 FIT parseAsync → minimax M3 Anthropic 兼容 → 落 InterpretRecord #62；routes bodyLimit 10MB V0.2.35；admin listInterpret V0.2.37 沿用 admin generic 模式） |

### DEVICE_BRANDS（V0.1.25 新增常量；V0.1.33 增强；V0.2.5 +mi_scale）

`src/constants/device-brands.ts` 提供 9 个品牌 + V0.1.33 BLE 设备品牌识别 + V0.2.5 mi_scale 体脂秤

---

## 📦 依赖

- **运行时**：`zod`（schema 定义 + 类型推导）
- **开发**：`typescript` `vitest@^3.2.6` `@vitest/coverage-v8@^3.2.6`

---

## 🧪 测试

```bash
pnpm test              # vitest run — 6 测（endpoints 验证）
pnpm typecheck         # tsc --noEmit
pnpm build             # tsc -p tsconfig.build.json → dist/
```

---

## ⚠️ Zod v3.25 注意事项

`z.infer<>` 在 v3.25+ 返回 **input 形式**（带 optional），要用 `z.output<>` 拿 applied default 后的类型。

---

## 📌 当前状态

- ✅ **V0.2.38 init #18 实测：ENDPOINTS 35 module**（V0.2.33 +interpret；V0.2.28-38 其他改动不动 shared）
- ✅ 4 个常量模块（feature-flags / member-levels / points-rules / endpoints + V0.1.25 device-brands + V0.1.33 BLE_VENDOR_PATTERNS/matchBleVendor/BleVendor + V0.2.5 mi_scale）
- ✅ 类型导出（V0.1.140 +aiCoachPersona enum + V0.2.7 +GrowthLevel + V0.2.8 +AdminRole + V0.2.7 +MemberPackage）
- ✅ 构建产物 `dist/`
- ✅ 前后端共用（后端 `workspace:*`，小程序构建产物引用）
- ✅ `api-contracts/endpoints.ts` **35 module**（V0.2.33 +interpret）+ `actionUrl(module, action)` 工具
- ✅ **`endpoints.test.ts`** 测试（验证 V0.1.142 后端保留 endpoint）
- ✅ **`device` 模块端点** 18 action
- ✅ **`stats` 模块端点** **10 action**（V0.2.30 buildReportText 重写是后端 service 内部）
- ✅ **`aiCoach` 模块端点** 11 action（V0.2.27/28 天气感知 + 3 天时效是后端 prompt）
- ✅ **`shoes` 模块端点** 9 action
- ✅ **`goal` 模块端点** 10 action
- ✅ **`feed` 模块端点** 7 action
- ✅ **`review` 模块端点** 7 action
- ✅ **`interpret` 模块端点** **1 action（V0.2.33 garmin）**
- ✅ **`API_BASE.prod`** = `qingmulife.cn`
- ✅ **`device-brands.ts` + BLE_VENDOR_PATTERNS + matchBleVendor**（前后端单一数据源）
- ✅ **V0.2.7 GROWTH_THRESHOLDS + REDEEM_PACKAGES + V0.2.8 ADMIN_ROLE_PERMISSIONS**（前后端单一数据源）

---

🤙 **V0.2.38 init #18 完成**：ENDPOINTS 共 **35 module**（V0.2.33 +interpret 第 35 个；其他 V0.2.28-38 改动不动 shared）+ ENDPOINTS.stats **10 action**（V0.2.30 buildReportText 重写是后端内部）+ ENDPOINTS.aiCoach 11 action（V0.2.27/28 天气感知+3 天时效是后端 prompt）+ ENDPOINTS.interpret **1 action（V0.2.33 garmin）** + V0.1.142 后端保留端点。**miniprogram_npm 需 rebuild**（前端 pages/interpret 调用 ENDPOINTS.interpret）。下一步：① minimax key 注入 + 佳明 .fit 样本到位后真机验证 interpret.garmin；② huawei 样本 + wxpay 4 件套 + WechatSI 授权加回（3 项待主人物料/授权）；③ V0.2.26/2.27/2.28/2.29/2.30/2.32 真机验证。
