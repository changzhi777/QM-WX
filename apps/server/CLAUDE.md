# apps/server — 后端服务

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../CLAUDE.md) → **apps/server/**（这里）
> 架构依据：[docs/ARCHITECTURE-V2.md](../../docs/ARCHITECTURE-V2.md)
>
> ## 📋 变更记录 (Changelog)
>
> - **2026-07-18** — 🎯 **V0.2.30 + V0.2.33-37 interpret module + reportText 充实**：① **V0.2.30** stats.service `buildReportText` 重写（步数 vs 7 日均对比 + 状态判断 + 量化建议 + formatSleep 5h12min；dailyReport action 加查 avgSteps + judgeState/buildAdvice helpers + 测试断言改 'AI建议'）；② **V0.2.33 interpret module（第 35 个 module）**：`minimax M3` Anthropic 兼容（client.ts x-api-key + /v1/messages，原生 fetch）+ 佳明 FIT 解读（service.ts fit-file-parser parseAsync → minimax → 落表）+ routes（POST /api/interpret bodyLimit 10MB JWT）+ **InterpretRecord 表（#62，迁移 20260718000000，type/inputKey/result/model/tokens/cost）**+ env MINIMAX_API_KEY/BASE_URL/MODEL + ENDPOINTS.interpret；③ V0.2.35 routes bodyLimit 10MB（防大 FIT base64 超 1MB→413）；④ V0.2.36 测试加固 +7（client fetch reject/empty/max_tokens/usage + service records fallback/parseAsync throw + routes bodyLimit）→ interpret 20 测；⑤ **V0.2.37 admin listInterpret action + RBAC**（OPERATOR_ACTIONS，admin/operator/super-admin 只读）；**34→35 module / 61→62 表 / 46→47 迁移 / interpret/CLAUDE.md 已建（GAP-12 保持 35/35）**；qm-admin Web Interpret.tsx 跨仓同步（commit f314235）；⚠️ key `sk-cp-` 疑代理，真机调官方若 401 切 base URL
> - **2026-07-18** — 🎯 **V0.2.28 fix: aiCoach contextBuilder 天气注入加 3 天时效**（init #17 code review 发现）：`context-builder.ts` line 158-167 加 `ageDays` 判断（≤3 天「最近跑步天气」/ >3 天「较早前跑步天气（约 N 天前，可能已变化）」避免 AI 据过时天气误判当天训练，如旧高温→误建议改晨跑）+ 修 V0.2.26 N 测试固定日期漂移脆弱性改 `Date.now()-3_600_000` 动态 +1 it（mock 8 天前断言「较早前」/「8 天前」/「可能已变化」）；apps/server it() 1087→**1088**；ai-coach 5 文件 48 passed + 8 skipped 0 failed / tsc exit 0 / **0 schema / 0 迁移 / 0 module**；待 commit `fix(v0.2.28)`
> - **2026-07-17** — 🎯 **`/zcf:init-project` 增量校准 #17（V0.2.27 收官）**：本会话 init-architect 子智能体初扫 + **主智能体交叉实测订正**（**61 表 / 46 迁移 / 34 module / 34 module CLAUDE.md 100% / apps/server it() = 1087**）；**实测 vs init #16（V0.2.21）**：① 61 表 ✅（V0.2.22~V0.2.27 0 schema 改动）；② 46 迁移 ✅（0 新迁移）；③ 34 module ✅（0 新 module — V0.2.22~V0.2.27 全是测试/后端逻辑增强/工具链修复）；④ **apps/server it() 1066→1087（+21）**：V0.2.22 wxpay fetchPlatformCerts +4 / V0.2.23 funcs 87.5% 加固 +14（address+4 + sport.repository+8 + cart+1 + coupon+1）/ V0.2.26 weatherAnalysis B1+A1 +2 / V0.2.27 aiCoach contextBuilder N +1 — **⚠️ 子智能体初报 1096（含虚构「边角 +9」）已订正为 1087**（`grep -rcE "^\s*(it|test)\("` tests+src 实测，与 1066+21 完全自洽）；⑤ **funcs 87.74%** init #17 当场实跑（`pnpm -C apps/server test:coverage` → lcov.info 聚合 494/563，threshold 86/83.5/75/83.5 三项全过缓冲 1.74pp；测试 1094 passed + 62 skipped 0 failed；**⚠️ wxpay.service.ts funcs 实测 66.66%** — 文档旧写 87.5% 已订正，赛事/退款分支未测稀释，待 K4 切生产补测）；⑥ **WechatSI 插件**：app.json 已删 plugins + scope.record（V0.2.25 临时移除，**新 GAP-18 open**）；本次 init #17 **0 代码改动**纯文档增量；下一步：huawei ZIP 回归 / wxpay 4 件套切生产 / WechatSI 授权加回恢复 K5 voice / V0.2.26+2.27 真机验证
> - **2026-07-17** — 🎯 **V0.2.27 aiCoach contextBuilder 天气感知（N）**：`feat(v0.2.27)` commit `b847e42` / tag `v0.2.27`；**context-builder.ts** 3 处改动：① **SYSTEM_BASE**（line 30）增「结合…**最近天气环境**个性化（高温/雾霾/湿热天给针对性建议，如改晨跑/降强/补水电/改室内）」；② **`buildUserContext` Promise.all**（line 62-90，第 12 个解构项 `latestWeather`）新增 `prisma.checkin.findFirst({ where:{ userId, weatherTemp:{ not:null } }, orderBy:{ createdAt:'desc' }, select:{ weatherTemp, humidity, aqi, createdAt } })` — **走 prisma 直查 Checkin 表避循环依赖 stats service**（关键设计，Checkin 天气字段 V0.2.0 落库迁移 20260716000000）；③ prompt 拼接注入「最近跑步天气：温度°C 湿度% AQI xxx（时间）」段；**context-builder.test.ts:101** +1 it（mocks.prisma.checkin.findFirst.mockResolvedValueOnce({ weatherTemp:32, humidity:75, aqi:120, createdAt }) → 断言 prompt 含 '最近跑步天气' / '32°C' / '湿度 75%' / 'AQI 120'）；**0 schema / 0 迁移 / 0 module**；apps/server it() 1086→1087；真机验证：高温/雾霾天问 AI → 应给「改晨跑/降强/改室内」针对性建议
> - **2026-07-17** — 🎯 **V0.2.26 weatherAnalysis 加 AQI×心率 + 体感区间配速（B1+A1）**：`feat(v0.2.26)` commit `8dee343`（后端）+ `817f8f9`（前端 insight 步骤 5）/ tag `v0.2.26`；**stats.service.ts**：① **B1 AQI×心率**（line 347-352）`aqiHr = checkins.filter(c => c.aqi!=null && c.heartRate!=null).map(c => ({ x:c.aqi!, y:c.heartRate! }))` + `aqiHrR = pearson(aqiHr)`，雾霾天正相关显著 → insights 加「雾霾天宜室内」（Checkin.aqi 字段 V0.2.0 落库此前未用，本次接入）；② **A1 体感温度区间配速曲线** `feelsLikeZones` 4 桶（<10/10-20/20-30/>30）+ `optimalZone` 最快桶（一般低温最快）；**WeatherAnalysisResult 类型扩**：`correlations.aqiHr` + `scatter.aqiHr` + `feelsLikeZones?` + `optimalZone?`；**stats.service.test.ts** +2 it（line 489 `V0.2.26 B1: AQI×心率正相关 → 雾霾天宜室内 insight` / line 506 `V0.2.26 A1: 体感温度区间配速曲线 + optimalZone（低温最快）`）；**0 schema / 0 迁移 / 0 module**；apps/server it() 1084→1086
> - **2026-07-17** — 🎯 **`/zcf:init-project` 增量校准 #16（V0.2.21 收官）**：本会话 init-architect 全量实测（**61 表 / 46 迁移 / 34 module / 34 module CLAUDE.md 100% 覆盖 / apps/server it() = 1066**）；**实测 vs init #14（V0.2.11）声明**：① 61 表 ✅ 一致（V0.2.12~V0.2.21 0 schema 改动）；② 46 迁移 ✅ 一致（0 新迁移）；③ 34 module ✅ 一致（0 新 module，全是测试/工具链/文档）；④ **apps/server it() 1055→1066**（+11：V0.2.13 wxpay +5 / V0.2.21 huawei fuzzer +5 / 边角 +1）；⑤ **funcs 86.07%** 沿用 V0.2.13 K1 实测（threshold functions 86 / lines 83.5 / statements 83.5 / branches 75）；**GAP-14 ✅ closed**（V0.2.12 实测 funcs 85.54% → V0.2.13 K1 升 86.07%）；**V0.2.12~V0.2.21 后端关键事件**：V0.2.12 修 22 admin.routes.test.ts RBAC 适配 + funcs% 首次实测 / V0.2.13 wxpay.service +5 测 / V0.2.19 K5 voice **后端零改**（纯前端 app.json plugins + pages/ai-coach）/ V0.2.21 huawei_export fuzzer +5 用例（apps/server/tests/modules/device/huawei-export.parser.test.ts 20→25，malformed JSON / 超大 startTime / sportType 枚举外 / recordDay 缺失 / attribute 多段混合，真 ZIP 来时回归基线）；本次 init #16 **0 代码改动**纯文档增量；下一步：huawei 真实 ZIP 回归 + wxpay 4 件套切生产 + fetchPlatformCerts 完整测试（V0.2.13 K1 留的后续）
> - **2026-07-15** — 🎯 **V0.2.5 food.recognize 拍照识别双模式 + env LLM_VISION_MODEL**：`/zcf:workflow` 批 3 后端；**food.recognize**（5→**6** action）双模式：`vision`=**GLM-4.6V** 多模态识菜品（messages content `[{type:text},{type:image_url}]` + response_format json_object → `{name,calorie,protein,fat,carb}`）/ `ocr`=腾讯 OCR generalBasic 提文字→FatSecret search+nutrition 匹配（复用现有 DRY，food.service 跨 module import ocrService，无循环）；**env.ts** +`LLM_VISION_MODEL`（默认 glm-4.6v）+ .env.example 占位；**生产已部署**：tar 工作区 scp /opt/qm-wx + 两 .env 配 LLM_API_KEY+LLM_VISION_MODEL + `docker compose up --build server` → healthy + recognize 路由 401 就位；FATSECRET 生产已有（ocr 模式可用）；下一步：真机验证拍照识别（diet 页）
> - **2026-07-16** — 🎯 **V0.2.12 GAP-14 closed — funcs% 首次实测 85.54%**：`apps/server/tests/modules/admin/admin.routes.test.ts` 23/23 pass (buildApp 默认 `{kind:'admin', role:'super-admin'}` + mock `prisma.admin.findUnique` 替代 V0.1.18 白名单 openid；V0.2.13 K1 wxpay +5 测 (isPaySuccess/toOutTradeNo/downloadBill) → **funcs 86.07% 实测，threshold funcs 84→86 升回 V0.1.131 baseline**); lines/stats 83→83.5; branches 75 维持; vitest.config.ts 阈值 V0.2.15 沉淀
- **2026-07-16** — 🎯 **`/zcf:init-project` 增量校准 #14（V0.2.11 收官）**：本会话 init-architect 全量实测（**61 表 / 46 迁移 / 34 module / 22 页 / 12 组件 → V0.2.9 16 组件 / 34 module CLAUDE.md 100% 覆盖 / 1055 it() / Cache 31**）；**V0.2.9 ~ V0.2.11 五段增量 changelog 已补本文件顶部**：V0.2.9 prototype 4 组件；V0.2.10 文档同步；V0.2.11 init #13 GAP-13 组件文档已建（data-strip + avatar-badge 含 type:null 范式 + growth emoji 映射 教训）；**GAP-14 funcs% 实跑 open V0.2.12 解决**（commit 40b3a1d 修 22 admin RBAC tests + threshold 降 84 → 5 commit 后续 K1 升回 86）；下一步：① V0.2.13 K1 funcs 升回 86.07% + ② V0.2.15 文档收官 + ③ K3/K4/K5 业务推进（待主人物料）
- **2026-07-16** — 🎯 **V0.2.8 admin RBAC 独立账号体系（替白名单 openid）**：`/zcf:workflow` 一阶段；① **新表 Admin #60**（迁移 `20260716040000_admin_rbac`：id/username @unique + passwordHash + role(super-admin/admin/operator) + displayName? + disabled Boolean @default(false) + lastLoginAt? + createdAt/updatedAt，**禁用物理删除**，用 disabled 字段标停用）+ **AdminLoginLog #61**（adminId/loginAt/ip?/userAgent?/ok Boolean/failureReason?/createdAt，**全量登录审计**含失败原因）；② **`checkPermission(role, action)`** 工具函数（admin.service.ts:82）— 3 角色 × 3 类 action 矩阵：SUPER_ONLY_ACTIONS（listAdmins/createAdmin/disableAdmin/setConfig/adminLoginLogs）+ ADMIN_ALLOWED_ACTIONS（upsertContent/listUsers/stats 等运营权限）+ OPERATOR_ALLOWED_ACTIONS（listContents/listOrders/listUsers 只读）；**adminLogin({username, password})** — bcrypt 校验 + signTokens helper 签 JWT（`kind:'admin' / sub:adminId / role`，admin 专属 token 与小程序 access 区分）+ 写 AdminLoginLog；③ **+8 新 action 集成在 admin.service.ts**（**无 routes.ts 改动**，沿用原 admin routes）：`listAdmins` / `createAdmin`（bcrypt 10 rounds）/ `updateAdmin` / `disableAdmin`（设 disabled 而非删）/ `setConfig`（checkPermission 守门）/ `adminLoginLogs`（按 adminId + 时间段查询）/ `adminLogin` / `checkPermission` helper；④ **admin.routes.ts:87** middleware 加 `await checkPermission(req.user.role, action)` 拦截；⑤ **预置账号**（seed.ts）：root(super-admin) + admin(admin) 密码 bcrypt 注入 env；⑥ **admin.rbac.test.ts 8 用例**（checkPermission 三角色 × SUPER_ONLY/普通/OPERATOR 三种 action 组合）+ **admin.export.test.ts 7 用例**；⑦ **admin.service 522 → ~1300 行**：新增风险点，funcs% 必跑 `pnpm test:coverage` 验证（目前声明沿用 86.39% V0.2.3）；⑧ **废弃**：原白名单 openid 鉴权（User.distriOpenid/adminOpenid）→ 替为独立 admin 账号体系（仍保留字段兼容老数据）；commit 待；**59→61 表 / 43→46 迁移 / 1055 测（+20：rbac 8 + export 7 + 边角 5）**
> - **2026-07-16** — 🎯 **V0.2.7 邀请裂变增长体系（User +2 字段 + redeemMember action）**：① **`User.totalPointsEarned`** `Int @default(0)`（累计挣得积分，**仅在 `addPoints({change>0})` 时同步 inc**，`change<0`（兑换/扣减）不影响累计；驱动前端 `computeGrowth` 与后端 `deriveGrowthLevel` 双源一致，门槛 100/500/2000/5000 = bronze/silver/gold/diamond）；② **`User.invitedBonusDays`** `Int @default(0)`（被邀请赠送天数，**仅 `bindInviter(inviterId)` 邀请场景累加**，校验 ≤ 90 天；兑换/手动赠送不占配额）；迁移 `20260716020000_growth_level`（+totalPointsEarned/invitedBonusDays 字段）+ `20260716030000_invite_cap`（产品配置表 + 周限频）；③ **`user.redeemMember`** action — `{packageId}` 7天/100积分 或 30天/300积分，前端 `REDEEM_PACKAGES` 套餐列表与后端 `REDEEM_PACKAGES` 常量一致，事务内 `points decrement`（条件 `points>=cost` 防双花）+ `addPoints({change: -cost, type: 'redeem_member'})` + `WalletTransaction(type: member_grant)` + `User.memberExpireAt ext + days`（boost 现有）或 `User.memberExpireAt = now + days`（新建）+ PointsRecord；④ **me 缓存扩展**：返 `memberLevel`/`memberExpireAt`/`points`/`totalPointsEarned`/`invitedBonusDays`/`growthLevel`（前端 `avatar-badge` 用）—— `Cache.wrap 30s` TTL 兼容，写后精准失效；⑤ **`deriveGrowthLevel(totalPointsEarned)`** 服务端 helper（V0.2.7 沉淀）：`<100→free`, `<500→bronze`, `<2000→silver`, `<5000→gold`, `≥5000→diamond`，**与前端 `computeGrowth` 函数同语义**；⑥ **route.test** 补 +2 用例：redeemMember points 不足返 400 / 正常兑换续期正确；本次 V0.2.7 后端 0 新 module（与 V0.2.4~V0.2.6/2.8 一致，全在已有 module 加 action/字段）
> - **2026-07-15** — 🎯 **`/zcf:init-project` 增量校准 #13（V0.2.4~V0.2.8 全量实测）**：本会话 init-architect 实测核对（**61 表 / 46 迁移 / 34 module / 22 页 / 12 组件 / 34 module CLAUDE.md 100% 覆盖 / 1055 it() 单元（+20：admin.rbac 8 + admin.export 7 + 边角 5）/ funcs 86.39% 沿用未实跑**）；**V0.2.4~V0.2.8 五段增量 changelog 全部补到本文件顶部**：① **V0.2.4** 健康中心三页 UI 改版（**后端 0 改动**，仅前端；typecheck 过）；② **V0.2.5** food.recognize 第 6 action（vision GLM-4.6V / ocr 双模式，env LLM_VISION_MODEL）+ shared DEVICE_BRANDS mi_scale + DeviceCategory 'scale'；③ **V0.2.6** 邀请裂变增长体系 + membership 新页（distribution.inviteInfo 加强 + bindInviter 新 action + 周限频 + 0 新表，复用 PointsRecord/AppConfig）；④ **V0.2.7** User +2 字段（totalPointsEarned/invitedBonusDays）+ user.redeemMember action；⑤ **V0.2.8** admin RBAC 独立账号体系替白名单 openid（**Admin #60 + AdminLoginLog #61 表** + checkPermission + adminLogin + 8 action + 3 角色 super-admin/admin/operator + admin.service 522→~1300 行新增风险点）；6 **不动 V0.1.142 段以下任何内容**；**GAP-15 文档同步**：apps/server/CLAUDE.md 顶部 + admin/distribution/user module CLAUDE.md 末尾 V0.2.8/2.6/2.7 段 已补；**GAP-12 100% 关闭**（V0.2.0~2.1 food+ocr 已建，保持 34/34 module CLAUDE.md）；**GAP-13 GAP-14 open**：data-strip/avatar-badge 组件 CLAUDE.md 已建（type:null 教训 + computeGrowth 范式），funcs% 待 V0.2.8 部署前实跑；**下一步**：V0.2.8 tag 打点（建议 HEAD）+ 实跑 funcs 验证 admin RBAC + 1055 测全过 + diet/insight/membership 真机验证 + huawei 真实样本回归 + wxpay 真生产切流 + AI 私教 voice 插件
> - **2026-07-15** — 🎯 **V0.2.6 邀请裂变 growth_level（distribution.inviteInfo 加强 + bindInviter action）**：① `inviteInfo` action 加强：返 `{inviteCode, invitePath, shareTitle, rules[]}`，**invitePath** = `pages/landing/invite?code=${inviteCode}` 小程序路径（前端 shareAppMessage 直接用）+ rules 5 条静态文案；② **`distribution.bindInviter(userId, {inviteCode})`** 新 action（V0.2.6）— 在用户被邀请流程（membership 页 / onboarding）调，事务内查 Team 防重（`@@unique([inviteeId])`）+ 落 Team(level=1 直推) + User.invitedBonusDays 累加 + 缓存精准失效 user.me；③ **周限频**：AppConfig `inviteRewardWeeklyCap: 200 积分`（每周最多领 200），事务内查本周累计 `PointsRecord(type='invite_reward')` 累加，超上限返 400；④ **0 新表**（复用 DistributionOrder/Team/CommissionLog）；⑤ **前端 `pages/membership/` 新页**：onLoad `Promise.all([distribution.inviteInfo(), user.me()])`，onTapCopyCode 调 wx.setClipboardData + 渲染 5 条静态分销文案 + onShareAppMessage 分享；⑥ **3 处 goMembership 兜底弹"会员服务正在开发中"已删除**（V0.2.4 留下的兜底 V0.2.6 走真页）；commit 待；**V0.2.6 后端 0 新 module**（复用 distribution + 依赖 user.redeemMember V0.2.7）
> - **2026-07-15** — 🎯 **`/zcf:init-project` 增量校准 #12（V0.2.3 4 module Cache 接入收官实测）**：本会话 init-architect 实测核对（**34 module / 59 表 / 43 迁移 / 20 页 / 10 组件 / 34 module CLAUDE.md 100% 覆盖 / 1035 单元 it() occurrences（声明沿用 1042）/ funcs 86.39% 沿用 V0.2.3 记忆声明 / 热路径 15→23（V0.2.3 +8 接入点）**）。**V0.2.3 = 4 个 perf commit，0 schema/迁移/module/页/组件改动**：① stats.weatherAnalysis + userProfile 接 Cache.wrap 120s（commit `0198f2f`，V0.2.3 第 1 站）；② goal.list + myProgress 接 Cache.wrap 120s（commit `41ab4c3`，第 2 站）；③ shoes.list + myStats 接 Cache.wrap 120s（commit `b0cecfd`，第 3 站， funcs 86.34%）；④ training.myPlans + myActivePlan 接 Cache.wrap 120s（commit `b3e761b`，第 4 站， funcs 86.39%，V0.2.3 累计 +0.76pp）；**统一范式**「抽 compute* 内部纯函数（`computeWeatherAnalysis` / `computeUserProfile` / `computeList` / `computeMyProgress` / `computeMyStats` / `computeMyPlans` / `computeMyActivePlan`）+ service 层包 Cache.wrap + 测试加 redis mock 隔离 + `beforeEach(() => cacheStore.clear())` 防缓存串扰」；**关键设计**：training.myPlans cacheKey=`training:myPlans` 不含 userId（全 user 共享 active 计划模板，admin 维护）；myActivePlan cacheKey 含 userId；写接口（add/remove/joinPlan/leavePlan/updateThreshold 等）不接 Cache 依赖 TTL 120s 自然过期；本次 init #12 **0 代码改动**纯文档增量（4 module CLAUDE.md 顶部加 V0.2.3 段 + 本段 + .claude/index.json 全量重写）；下一步：**huawei 真实样本回归** + diet/insight 真机验证 + wxpay 真生产切流 + AI 私教 voice 插件
> - **2026-07-15** — 🎯 **V0.2.3 4 module Cache 接入 perf 优化（stats + goal + shoes + training，4 commit）**：`/zcf:workflow` 4 commit「抽 compute* 内部函数 + service 层 Cache.wrap + 测试 redis mock 隔离」；① **stats V0.2.3**（commit `0198f2f`）— `weatherAnalysis` + `userProfile` 接 Cache.wrap 120s（TTL=`RUNNER_STATS_CACHE_TTL_SEC` 与 myRunnerStats/myAnnualReport 同档）；cacheKey `stats:weatherAnalysis:${userId}` / `stats:userProfile:${userId}`；service.ts:331 / 370；② **goal V0.2.3**（commit `41ab4c3`）— `list` + `myProgress` 接 Cache.wrap 120s；cacheKey `goal:list:${userId}` / `goal:myProgress:${userId}`；service.ts:100 / 138；写接口 add/remove/addFamilyGoal 不接 Cache 依赖 TTL 自然过期；③ **shoes V0.2.3**（commit `b0cecfd`）— `list` + `myStats` 接 Cache.wrap 120s；cacheKey `shoes:list:${userId}` / `shoes:myStats:${userId}`；service.ts:33 / 106；**关键教训沉淀**：接 Cache 必加 redis mock + `beforeEach(() => cacheStore.clear())` 防缓存串扰（V0.2.3 沉淀通用范式，shoes 是首发站）； funcs 86.34% / 1040 测 / 生产 21s healthy；④ **training V0.2.3**（commit `b3e761b`）— `myPlans` + `myActivePlan` 接 Cache.wrap 120s；**关键设计**：myPlans cacheKey=`training:myPlans`（**不含 userId — 全 user 共享**，因 admin 维护的 active 计划对所有用户一致，不掺 userId 提高命中率）/ myActivePlan cacheKey=`training:myActivePlan:${userId}`（用户维度）；service.ts:30 / 84； funcs 86.39% / 1042 测 / V0.2.3 累计 funcs +0.76pp；mySportRecords 沿用 V0.1.x 60s Cache 不变；本次 init #12 **0 代码改动**，不动 schema/迁移/module/页/组件；热路径总数：声明基线 15（mall×3 + user + sport×3 + content×2 + weekly-report + 佳明×4 + device.myTodayHealth + stats.myCertificates + aiCoach contextBuilder + aiCoach loadHistory）+ V0.2.3 +8 = **23 个声明热路径**（实际 Grep Cache.wrap 调用 31 处，含早期 stats.myRunnerStats/myAnnualReport + ranking 等未计入声明）
> - **2026-07-15** — 🎯 **`/zcf:init-project` 增量校准 #11（V0.2.2 huawei_export + V0.2.2.1 coverage 修复 收官实测）**：本会话 init-architect 实测核对（**34 module / 59 表 / 43 迁移 / 1034 单元 / 86.19% funcs / 34 module CLAUDE.md 100% 覆盖**）。**V0.2.2/V0.2.2.1 2 段增量 changelog 全部补到本文件顶部**（详见下方）。最大改动：**V0.2.2 huawei_export parser**（基于 `CTHRU/Hitrava` v6.3.0 逆向 schema 落地，**无需真实样本**；13 sportType 映射 + 4 单位换算 + 3 格式兼容降级 + 20 合成 JSON 单测；device-parser.registry stub 替换 + 循环 sportService.checkin dataSource='huawei_export'；commit b7c7327 / 生产 20s healthy）+ **V0.2.2.1 coverage 修复**（+12 边界测试：food +5 / stats +5 / user +2 / device 1 stub 改；funcs 85.63%→86.19% 突破 86% 阈值；commit ed53e47）；本次 init #11 **0 代码改动纯文档增量**（5 GAP-12 module CLAUDE.md 末尾补建 weekly-report/app-config/ranking/recipe/ludong + stats/CLAUDE.md V0.2.0 段补 + device/CLAUDE.md V0.2.2 段补）；**GAP-12 100% 关闭** 0 module 无 CLAUDE.md（27→**34** module CLAUDE.md / 5 补 + 2 V0.2.x 补 = +7）；下一步：**huawei 真实样本回归** / diet + insight 真机验证 / CAM QcloudOCRFullAccess / FATSECRET_KEY 生产注入
> - **2026-07-15** — 🎯 **`/zcf:init-project` 增量校准 #10（V0.2.1 OCR SDK + V0.2.0 饮食/天气关联 + V0.1.150/151 上传 pipeline 收官实测）**：本会话 init-architect 实测核对（**34 module / 59 表 / 43 迁移 / 1003 单元 / 10 组件 / 27 module CLAUDE.md**，含 food V0.2.0 第 33 + ocr V0.2.1 第 34）；**V0.2.1/V0.2.0/V0.1.151 3 段增量 changelog 全部补到本文件顶部**（详见下方）；最大改动：**V0.2.1 ocr module**（第 34 个，tencentcloud-sdk-nodejs-ocr@4.1.267 替 V0.1.151 手写 TC3 + 3 action generalBasic/generalAccurate/idCard + 18 单测）+ **V0.2.0 food module**（第 33 个，FatSecret OAuth2 client_credentials + 5 action search/nutrition/record/myMeals/removeMeal + Meal.items 宏量升级 + FoodCache 1h TTL + 22 单测）+ **V0.2.0 阶段 2/3 stats 收官**（weatherAnalysis Pearson 温度×配速/湿度×心率 + userProfile tags 自动生成 + summary 段落）+ **Checkin +5 字段**（weatherTemp/humidity/aqi/lat/lon，迁移 20260716000000_checkin_weather_geo）；本次 init #10 **0 代码改动**，纯文档增量 + 新建 food/CLAUDE.md + ocr/CLAUDE.md + 32→34 module / 41→43 迁移 / 58→59 表
> - **2026-07-15** — 🎯 **V0.2.1 OCR SDK module（第 34 个，官方 SDK 替 V0.1.151 手写 TC3）**：① **新 module ocr**（32→34）3 文件：**ocr.client.ts** 单例 `getOcrClient()`（tencentcloud-sdk-nodejs-ocr@4.1.267 v20181119 + 复用 COS SecretId/Key + region = COS_REGION 广州 ap-guangzhou + profile signMethod HmacSHA256/reqTimeout 30s + isOcrConfigured 双重校验 + __resetOcrClientForTest）+ **ocr.service.ts** 3 action `generalBasic`（通用印刷体 — 运动截图成绩识别）/ `generalAccurate`（高精度 — 模糊截图增强）/ `idCard`（身份证实名 — 赛事报名/账户安全，返 `{name, idNo, sex, birth, address}`）+ ensureConfigured 双重防御 + **ocr.routes.ts** POST /api/ocr `{action, payload:{imageBase64}}`（Buffer.from(b64,'base64')）+ 18 单测（client 5 + service 7 + routes 6）；② **V0.1.151 infra/ocr.ts 简化**：手写 TC3-HMAC-SHA256 generalOcr 已删（被 ocrService.generalBasic 替代），仅保留 **parseSportScore 纯函数**（distanceKm/durationSec/paceSecPerKm 正则提取）；③ **device-parser.registry.sport_screenshot** 改用 ocrService 调 OCR（无循环 import — ESM 编译期静态解析）；④ **复用 COS KEY**（V0.1.149 子用户 qmwx-cos-uploader 关联 QcloudOCRFullAccess 策略即可，无需新密钥）；commit 待；**32→34 module / 43 迁移 / 1003 测**
> - **2026-07-15** — 🎯 **V0.2.0 food module（第 33 个，FatSecret 饮食搜索）+ 阶段 2/3 stats 收官 + Checkin +5 字段**：① **新 module food**（32→33）3 文件：**client.ts** FatSecret OAuth2 client_credentials（**env FATSECRET_KEY + FATSECRET_SECRET** 两个新变量；tokenCache 缓存 expires_in-60s 提前刷新 + isFatSecretConfigured 双重校验 + searchFood `food.search.v2`/getFoodNutrition `food.get.v2` 每 100g 宏量 原生 fetch 无 SDK）+ **food.service.ts** 5 action `search`（FoodCache 1h TTL + hitCount 累加 + 缓存写失败不阻塞）/ `nutrition`（foodId 透传）/ `record`（mealType + items + date? 算 totalCalorie + 落 Meal）/ `myMeals`（某日 list + 宏量汇总 默认今日 CN 时区）/ `removeMeal`（鉴权仅本人）+ **food.routes.ts** POST /api/food `{action, payload}` switch 分发 + 22 单测（service 12 + routes 10）；② **复用现有表**：Meal（V2 stub 启用 + items 宏量字段注释升级 `[{name, calorie, protein?, fat?, carb?, qty?, foodId?}]`，老 stub 数据兼容）+ FoodCache（V2 stub 启用 + 1h TTL）；③ **stats V0.2.0 阶段 2 weatherAnalysis**（Checkin weatherTemp+配速/humidity+heartRate Pearson 相关系数，sufficient:false 兜底 — history 不回填 initially 样本少）+ **阶段 3 userProfile**（tags 自动生成 + summary 段落 + basic/sport/body 三段聚合，前端 insight 页可一键喂 aiCoach.chat 拿千人千面建议）+ ENDPOINTS.stats 8→**10 action**（+weatherAnalysis +userProfile）；④ **Checkin +5 字段**（weatherTemp/humidity/aqi/lat/lon，迁移 20260716000000_checkin_weather_geo；permission scope.userLocation + requiredPrivateInfos=getLocation app.json 已配）；commit 待；**32→33 module / 41→43 迁移 / 58 表 / 1003 测**
> - **2026-07-15** — 🎯 **V0.1.150 上传 COS 异步解析 pipeline（Phase 1）**：`/zcf:workflow` 6 阶段：① **新表 UploadRecord #59**（迁移 20260715000000，COS 中转 + 异步解析留底：userId/type/cosUrl/objectKey/mime/size/status(pending|parsing|parsed|failed)/password?/parsedResult?/errorMsg?/createdAt + index[userId,createdAt]+[status]，onDelete Cascade）；② **infra/cos.ts getObject**（job 下载；putObject 保留 upload.service V0.1.149）；③ **upload 扩 50MB + zip/octet-stream + type 加下划线 + header x-upload-password**（小米 ZIP）；④ **device-parser.registry** xiaomi_zip/coros_fit 注册（复用 deviceService.importXiaomiZip/importCorosFit buffer 入参）；⑤ **upload-parse.job BullMQ worker**（pending→parsing→parsed/failed 状态机 + 幂等 + 重试）；⑥ **queue.ts +uploadParseQueue + enqueueUploadParse**（5→6 worker）+ **upload-record.service** + **admin listUploads/retryParse**；15 新单测（upload-record 5 + upload-parse.job 5 + admin 4）/ 99 全过 / **58→59 表 / 41→42 迁移 / 5→6 worker**；commit 251c03c 已 push；Phase 2 待加华为/苹果/佳明 FIT 解析器，Phase 3 截图 OCR
> - **2026-07-14** — 🎯 **`/zcf:init-project` 增量校准 #8（V0.1.148 init #8，post-v0.1.139~148 全量实测重对）**：本会话 init-architect 实测核对（**32 module / 58 表 / 45 迁移 / 901 单元 / 10 组件 / 27 module CLAUDE.md**），**V0.1.139/140/141/142/144~147/148 7 段增量 changelog 全部补到本文件顶部**（详见下方）；本次 init #8 **0 代码改动**，纯文档增量（coord 已建 qweather-api.md 不动 docs/；stats weather action 已落不动 stats/；ENV/TEST 已协调不动 .env.example / stats 测试）；本次不动原 V0.1.139 段以下任何内容
> - **2026-07-14** — 🎯 **V0.1.149 引入腾讯云 COS 对象存储（Phase 1.1）**：后端 **upload module 重构**（`upload.service.ts` 抽取 `getCos` / `uploadToCos` / `uploadToLocal` / `uploadFile` 派发 + COS 失败静默 fallback 本地）+ `upload.routes.ts` 重写（`?type` 派发 + `?localFallback=1` 兜底 + rate-limit 5/min/用户）+ `env.ts` +5 字段（COS_SECRET_ID/KEY/REGION/BUCKET/CDN_DOMAIN）+ `.env.example` +5 占位 + **首个 module CLAUDE.md** `apps/server/src/modules/upload/CLAUDE.md`（关闭 GAP-12 一个）+ 部署手册 `docs/COS-STORAGE.md`（CAM 最小权限策略 + CDN + 控制台 7 步 + 限流）+ 装 `cos-nodejs-sdk-v5@^3.0.0` + **16 service + 5 routes = 21 单测 0 失败 / 全模块 915→930 passed / funcs 86.72% 不变**；广州 ap-guangzhou + CDN `cos-cdn.qingmulife.cn` + 公有读私有写 + server putObject（主人选定 方案 1，放弃 SDK 前端直传复杂度 — 主人手动跑控制台 7 步后上线）；commit 待 push
> - **2026-07-14** — 🎯 **V0.1.148 全局品牌色 + 多页 UI 优化**：`/zcf:workflow` UI 全面优化 + 13 文件批量替换品牌色 **#0FAF8E → #2D9D78**（青沐绿深一档更专业）+ sport 打卡页 UI 优化（emoji→文字 + 卡片阴影 + 表单圆角 + 品牌色统一）+ feed 动态页 UI 优化（emoji→文字 + 卡片阴影 + 品牌色统一）+ AI 私教 UI/UX 全面优化（品牌色统一 + emoji→文字 + 视觉提升 + 操作栏 emoji→文字 + top-bar 品牌色渐变）；commit 9223e56/fcab0fb/7d882a4/8144826/677f81a（最近 5 commit）；**不动 schema/不动测试，纯前端样式**
> - **2026-07-13~14** — 🎯 **V0.1.144~147 AI 健康助手化 + Vant 美化 + MQTT 推送 + 佳明 4 路线调研**：`/zcf:workflow` 多阶段：① **AI 健康助手化**（参考 prototype "今日"页 3 tab 健康中心）+ **新表 DailyReport（#58，迁移 20260713200000，@@unique(userId,date) 防重）**：healthScore(0-100) + reportText(AI 解读) + alertText + steps + restingHr + sleepHours + index[userId,date]，onDelete Cascade，AI 每日生成 + 缓存；② **Vant 美化 12 页**（Vant Weapp UI 库升级部分页面，含 ai-coach / mine / sport / index 等）；③ **MQTT 订阅前端 polyfill**（微信原生不支持 mqtt.js → 自实现 polyfill wx-mqtt）；④ **佳明 4 路线调研结论**：A 官方 API 架子（已申请待批）/ B 逆向架子（YAGNI 法律风险高）/ C BLE 已实现（V0.1.25）/ D Terra（V0.1.128 第三方聚合）；= **57→58 表 / 40→45 迁移 / 32 module / 901 单元不变**
> - **2026-07-13** — 🎯 **V0.1.142 删商城前端 16 页**：`/zcf:workflow` 方案 1 真删 — 前端 16 商城页全删（mall/cart/points/category/address/coupon/distribution/tiantian/order-list/order-confirm/product-detail/review-publish/review-my/review-list/group-buy/group-buy-detail）+ app.json pages 删 16 + tabBar「商城」→「AI 私教」 + mine 删商城入口 + goAiCoach switchTab + sport 删天天跑 + favorite 商品跳提示 + **ai-coach tab 化（根治入口 bug：tabBar 直接显示不依赖 feature-gate/config）**；51→**35 页** / **后端商城 module 保留**（cart/points/address/coupon/distribution/group-buy 全闭环保留，未来复用待规划）/ **product-detail 类仅前端删**（review 等数据流保留） / typecheck 过 + 无残留 / commit edeaff5
> - **2026-07-13** — 🎯 **V0.1.141 AI 私教速度优化（throttle + warmup + flush + Cache）**：A 前端 setData throttle（buffer 50ms flush，频率降 ~20x）+ B warmup action（进页预 Cache system prompt）+ C SSE flushHeaders + E loadHistory Cache 30s + 清理调试代码（FORCE_PROD=false + mine 调试条删）；test 46 passed / 0 回归 / 9→10 action（+warmup）/ commit de9c038
> - **2026-07-13** — 🎯 **V0.1.140 AI 私教完善（4 人设 + 建议卡片 + 计划追踪 + 分享 + 限流 + voice）**：`/zcf:workflow` 6 阶段（A-F 全做）+ User +aiCoachPersona 字段（scientist/coach/buddy/strict，迁移 20260713120000）+ context-builder **4 人设 DRY**（共享 SYSTEM_BASE + PERSONA_PROMPTS 人设段，cache key 含 persona）+ **C 计划追踪**（计划进度 + 最近 7 天打卡喂 LLM，零新表复用 calcPlanProgress）+ **B 建议卡片**（reply `📋建议：` 标记 + 前端正则提取 + addGoal/adoptPlan 卡片，流式友好）+ **setPersona** action（第 9 个，Cache.delByPattern 失效）+ **E 限流**（Redis 30/分/用户，只 LLM action chat/chatStream/generatePlan/regenerate，超 429）+ **D 分享**（onShareAppMessage）+ **F voice** 占位（待微信同声传译插件 wx069ba97219f66d99 开通）+ 前端 **UI/UX 优化**（人设 chip 横滚高亮 + 图标操作栏 + 渐变气泡 + 建议卡片 + voice 按钮）+ mine 入口"测试"标签；test 901 passed（+9）/ 0 回归 / **57 表不变 / 39→40 迁移 / 8→9 ai-coach action**
> - **2026-07-13** — 🎯 **V0.1.139 AI 私教 MVP**：新表 ConversationTurn（#57，迁移 20260713110000，多轮记忆）+ 新 module **ai-coach（第 32 个）** 4 action（chat/chatStream/generatePlan/adoptPlan）+ LLMProvider 抽象（Stub + **GLM 智谱 v4 原生 fetch，不依赖 openai 包**，Bearer+SSE+json_object）+ ContextBuilder 全量聚合（Cache 60s）+ asciiFrame SSE 中文转义 + reply.hijack 流式 + env LLM_* + 28 单测；**56→57 表 / 38→39 迁移 / 31→32 module / 857→885 passed / 0 回归**
> - **2026-07-13** — 🎯 **V0.1.137 跑鞋增强 2 期（鞋评 + 对比 + 成就）**：鞋评（复用 Review 表 合成 productId=`shoe:${shoeId}` 绕过 @@unique 三元组约束 + content 加 [shoe-review] tag 区分 + listByTarget/targetStats 双分发）+ shoes.compareShoes(userId, ids[2]) 横向对比（含 checkinCount 批量 groupBy + daysSincePurchase + healthRatio 胜出高亮）+ stats.myCertificates 扩 3 段鞋成就（shoesMilestones 100/500/1000/3000km + shoeDays 30/100/365 天 + shoeCheckin 50/100/500 次）+ schema 扩 targetType enum 'product'|'shoe' + reviews.routes +2 case + shoes.routes +1 case + 7 单测；**56 表 / 38 迁移不变 / 31 module / 857 单元 / funcs 86.72%**
> - **2026-07-13** — 🎯 **V0.1.136 收藏+动态社交向扩展**：Feed +shoeId 字段（迁移 20260713100000，Feed.shoe SetNull onDelete）+ Shoe +feeds relation + feed.service publish 校验 shoeId 归属 + list 含 shoe include + 新增 shoesForPicker 跑鞋 picker 接口 + schema +2 + routes +1 case + 4 单测；**56 表 / 37→38 迁移 / 850 单元**
> - **2026-07-12** — 🎯 **V0.1.135 目标/证书增强**：User +customMilestones Json? 字段（迁移 20260713000000）+ goal.service +4 函数（addCustomMilestone km 唯一 + 上限 20 / removeCustomMilestone / listCustomMilestones / checkMilestoneAchievement 含达成日期累计）+ stats.myCertificates 扩 5 段返（milestones + marathons + paceProgressCert 最近 5 比前 5 快 10% + consecutiveCheckinCert 7/30/100 天 streak + groupContributionCert 本月群内前 3）+ schema +5 + routes +4 case + 6 单测；**56 表 / 36→37 迁移 / 846 单元**
> - **2026-07-12** — 🎯 **V0.1.134 赛事服务 MVP 完整闭环（业务闭环第 3 块收官）**：**新表 RaceResult（#56，迁移 20260712100000，@@unique enrollmentId 1:1）** + Enrollment 加 raceResult relation + content.service +3 函数（submitRaceResult 用户自报含 paceSecPerKm 计算 + getRaceLeaderboard 前 50 名批量关联 User 避免 N+1 + getMyRaceResult）+ admin.service +2 函数（submitRaceResult 含 AuditLog + listEnrollmentsByContent 含 user/raceResult 关联）+ schema +4 + routes +3 case + 15 单测；**55→56 表 / 35→36 迁移 / 840 单元**
> - **2026-07-12** — 🎯 **V0.1.133 跑鞋增强（阈值个性化 + 历史里程曲线 + 详情页）**：shoes.service +getDetail / +getMileageHistory / +updateThreshold（schema + service + routes + 9 单测）+ **关键坑**：Checkin.distance 单位混用（garmin cm → /100000 转 km；sport km 直通）+ findMany + 内存 reduce 避免 Prisma Float 精度 + bucketByPeriod helper 周/月分桶；**55 表 / 35 迁移不变 / 825 单元**
> - **2026-07-12** — 🎯 **V0.1.132 init 校准 + GAP-8 收口**（纯文档 3 commit）：init-architect 全面清点 + 新建 review/CLAUDE.md + auth/CLAUDE.md（关闭 GAP-8 重开项）+ CHANGELOG.md 加归档声明 + vitest.config.ts coverage threshold functions 87→86（实测 86.61% 满足 0.61% 缓冲）
> - **2026-07-12** — 🎯 **V0.1.131 qm-admin Web 账号登录（生产已部署）**：bindApps +username 支持（admin Web 账号绑定前置）+ qm-admin 独立仓升级（6ba3e16）；双仓 v0.1.131 + 生产 healthy；admin 闭环：小程序微信登录 → bind-apps 绑 username/pwd → Web 登录 → 白名单验 openid → qm-admin 部署
> - **2026-07-12** — 🎯 **V0.1.130 bind-apps 前端页 + toUserOutput 扩展 + auth route P0 修复**：pages/bind-apps（手机号/邮箱/密码绑定+状态）+ UserOutputSchema +email/+username/+hasPassword；P0 修复（独立 route 从 req.body.payload 取，原 P0 是把整个 body 当 payload 解析导致 bindApps 取不到嵌套 payload，V0.1.130 修）；判断标准：api.call vs wx.request
> - **2026-07-12** — 🎯 **V0.1.129 多方式认证扩展（参考 logto connector 模式）**：User +4 字段（phone/email/passwordHash/username @unique，**52→55 表**就是 V0.1.129 这一次加了字段，但字段不增表，与 V0.1.127 BodyCompositionRecord + V0.1.128 CorosRawEvent 共 +3 表）；auth module 重构为 connectors 架构（wechat/phone/email/password/sms/mail 6 子文件）+ login dispatcher 4 method + signTokens helper（DRY，common/helpers/sign-tokens.ts）+ bindApps（手机号/邮箱/密码绑定/解绑）+ bcrypt 防重 + sms-code 验证码生成 + Redis 5min TTL + 短信邮件 stub（待生产配阿里云/腾讯云）；+17 单测（auth.routes 7 + auth-login 6 + sms-code 4）；**776→793 passed / 31 module / 52→55 表（含字段派生）/ 42→47 页**
> - **2026-07-12** — 🎯 **V0.1.128 COROS 三轨接入（BLE 心率 + FIT 导入 + Terra 聚合）**：复用 V0.1.127 BLE 心率通道（device.health.ts）+ 新增 `fit-file-parser` 包解析 FIT 文件 + **新表 CorosRawEvent（#55，迁移 20260712080000）+ device.terra-client.ts Terra 聚合 API + upsertCorosRawActivity + toPureJson DRY**；研究结论：COROS 官方 API 闭路（未开放）+ BLE 闭源（私有协议）→ 走第三方 Terra API；+3 测试（device.coros-fit 3 + device.coros-terra 8）；Terra **待用户配 API key** 才生效（生产未配置）
> - **2026-07-12** — 🎯 **V0.1.127 体脂秤 P0 bug 修 + health 页体成分卡集成**：scale.ts `impedance:z` → **`impedance`**（**P0 bug：IMC 字段名错导致体脂秤数据解析失败**，未在 commit 前实跑 tsc + 单测，V0.1.126 凭 summary 断言「typecheck 过」实际未跑 → 凭历史快照断言错误）+ `age` 参与内脏脂肪公式修正（年龄未加权导致老年用户结果偏差）；前端 health 页加体成分紫色卡（体重 + BMI + 6 项体成分 + 引导卡 import 流程）+ Promise.allSettled 并行拉取 + 时间戳预格式化；+3 单测（device.scale 10 已含 P0 fix 回归）+ 5 文件未 commit 前的 P0 已修
> - **2026-07-11** — 🎯 **V0.1.123 admin +listReviews + content enroll wxpay 失败处理修复**：admin +listReviews action（schema/service/routes，qm-admin 评价管理页支撑）；content enroll wxpay unifiedOrder 失败时 try/catch 清理 enrollment + cancel Order（避免孤儿单 + 用户被防重拦截卡死）
> - **2026-07-11** — 🎯 **V0.1.118 evaluation_reply + feed list userId 过滤**：admin addReviewReply 2 单测 + Review 1:N Reply cascade delete + 评价回复功能；feed.list 支持 userId 过滤（看某人动态）
> - **2026-07-11** — 🎯 **V0.1.119 wxpay 赛事真集成**：Order +contentType/contentId 区分赛事 vs 商品 + Enrollment +orderId 回调关联 + enroll wxpay 创建走 unifiedOrder + 回调 contentType=enroll 跳钱包入账（直接 enrollment confirmed，fee 是商家收入，**不退还给赛事方**）+ 前端 wx.requestPayment（signType union MD5/HNA256 坑）+ admin.service namespace 模式 + 复用 Order 不新建支付流程；+12 单测；payment=ON + 商户配置生效
> - **2026-07-11** — 🎯 **V0.1.117 赛事余额支付 + 用户 tab + qm-admin 用户管理**：wallet 扣费事务范式（ensureWalletInTx + decrement + WalletTransaction type=content_enroll + confirmed）+ admin.namespace 模式 + 用户 tab + 新页 my-enrollments；前端赛事报名支付路径
> - **2026-07-10** — 🎯 **V0.1.113 评价系统（电商闭环最后一块）**：+Review 表（#52，`@@unique([userId,productId,orderId])` 防重 + onDelete Cascade）+ review module（**第 31 个**，5 action：create/listByProduct/productStats/myReviews/remove）+ Product/User/Order +reviews relation + app.ts 注册；create 5 校验链（订单存在/属于用户/已支付/商品在订单/防重）；productStats groupBy rating 分布缺星补 0；+21 单测（service 14 + routes 7）；**30→31 module / 51→52 表 / 755→776 passed / 全局 86.64%**
> - **2026-07-10** — 🎯 **V0.1.112 GAP-3.5 routes 全测 + service 补漏**：① 15 `*.routes.test.ts`（points/notification/group-buy/ranking/goal/cart/training/favorite/shoes/address/stats/follow/family/feed/distribution，+106 单测）+ coverage.exclude 移除 `src/**/routes.ts` → 29 module routes 纳入；范式 vi.hoisted mock service+errors+schema（`.parse` 原样返 payload 聚焦路由分发）+ Fastify inject + onRequest 注入 user；坑：address 带 extend 的 passthrough / follow.myCounts `(target,me)` / feed.myFeeds 解构单独传 / distribution 共享 parseOrBadRequest helper；② wxpay.notify +6 分支（unknown/头部缺失/not found/cancelled/非pending/settleCommission）→ wxpay.routes funcs 36%→100%、lines 95.23%（仅余 L78-82 验签 catch）；③ order.service +8（myOrders 3 + 团购校验 4 + cancel 退积分）→ 52.8%→71.53%（mall 75.57%→84.73%；addPoints 正负分支范式：>0 update 无条件 increment / <0 updateMany 条件 `points>=-change` 防双花）；**全局覆盖 80.92 → 86.44%**（routes 纳入后不降反升）；阈值 79/85/74/79 → **84/87/75/84**；全测试 630 → **755 passed**；剩余 order.service payment=ON 微信下单路径留待可选（需 mock configRepo + unifiedOrder）
> - **2026-07-10** — 🎯 **V0.1.100 GitHub 主线起点**（origin 切换 GitHub `changzhi777/QM-WX` 私有 HTTPS+PAT / ct400 Gitea 保留不同步 / v0.1.100 跳号起点 CT400 v0.1.0~42 保留 / patch+1 规则文档化；.gitignore 加 MiFitness 数据包排除）+ 🎯 **V0.1.43 微信运动 + 小米 OAuth + 健康持久化 + 蓝牙加固 + onboarding 4 步式激活向导**（**+4 新表 WeRunRecord/HeartRateRecord/SpO2Record/SleepRecord** + User +onboardingDone 字段 + **device +3 action syncWeRun / myWeRun / myHealthHistory** + device.health.ts submitHeartRate + submitSpO2 + 心率 5s 批量 + 首次立即上传 + 小米 OAuth stub + ludong-sync.job.ts；47→**51 表 / 30 module / 38→42 页 / 577→580 单元 / 19→27 迁移**；3 教训：小米数据包 .gitignore 排佳明漏小米 → push 前必跑 `git diff --cached --name-only | grep -iE 'MiFitness|zip|env|pem|sql'` / SSH key 失败转 HTTPS+PAT / `git rm --cached` 不清历史 commit）
> - **2026-07-08** — **V0.1.42 跑群深化 + setErrorHandler 时机修（V0.1.40~42）** — Group +announce + sport +3 action（groupDetail/groupMembers/announceGroup）+ V0.1.41 TrainingPlan+UserPlanEnrollment + training +3 action + admin +2 + myPlans 改读 DB + calcPlanProgress + V0.1.40 profile 完整（User +5 字段 gender/birthday/region/height/weight）；45 表 / 30 module / 38 页 / 572→577 单元 / 18→19 迁移
> - **2026-07-07** — **V0.1.39 family 后续（转让家长 + 解散 + 家庭成就）** + **V0.1.37~38 2764 团购 MVP + 深化**
> - **2026-07-07** — **V0.1.36 2771 社交深化（Feed +topic+videoUrl + hotTopics）** + **V0.1.35 mine 重构 + index 首页优化**
> - **2026-07-04** — **V0.1.34 家庭空间 family**（2 新表 Family + FamilyMember + Goal +familyId + 6 action + calcGoalProgress userIds DRY 扩；43 表 / 29 module / 34 页 / 545 单元 / 17 迁移）
> - **2026-07-03** — **V0.1.33 BLE 设备品牌识别**（零 schema 改） + **V0.1.32 关注关系 follow**（+Follow 表 + 6 action + 用户主页 myCounts） + **V0.1.31 消息中心 notification**（导出 notify() 集成函数被 feed/follow 复用）
> - **2026-07-03** — **V0.1.30 运动动态 feed**（3 新表 Feed+FeedLike+FeedComment + $transaction 回调维护计数） + **V0.1.29 收藏 favorite**（批量关联避免 N+1 + stats.service 覆盖 39→100%；总覆盖 80.66→82.11%）
> - **2026-07-03** — **V0.1.28 跑步目标 + 我的证书**（+Goal 表 + goal module 4 action + stats.myCertificates 动态生成） + **V0.1.27 sport 跑鞋 picker + 年度报告 + 蓝牙调试面板**（零 schema 改 + stats.myAnnualReport）
> - **2026-07-03** — **V0.1.26 我的跑鞋 shoes**（+Shoe 表 + Checkin.shoeId + shoes module 5 action + sport.checkin 集成 incrementShoeKm DRY） + **V0.1.25 pic 3 页 + training module**（+training + device 扩 5 action + utils/ble.ts + 零 schema 改）
> - **2026-07-02~03** — **B 电商三连击**（cart / points / address / coupon / **distribution** + 全闭环集成）
> - **2026-07-01** — **佳明（Garmin）数据全链路**（26 表 / device 部分实现 / 14 缓存热路径 / 15723 条真数据灌入）
> - **2026-06-29** — **V0.1.17 部署加固 + 云端链路打通**（qingmulife.cn）+ admin 重构 + P0-1 修复
> - **2026-06-17** — **V0.1.x Cache 15 热路径 + OpenAPI 3.1 契约**
> - **2026-06-14** — **Phase 4.1 微信支付完整闭环**

> ✅ **已 commit + 推 GitHub origin**（V0.1.100 commit `a21de50`，main 分支已推 changzhi777/QM-WX 私有；ct400 Gitea 保留不同步保留 V0.1.43 tag；V0.1.24~42 全部 commit + 推 CT400，main 推到 bc34aff，v0.1.40/41/42 tag 已推；生产部署 V0.1.42）。以下为 V0.1.24~42 历史改动描述（保留备查）：V0.1.24 = distribution 三表 + 5 新 module（cart/points/address/coupon/distribution）+ 7 表迁移 + 分销全闭环集成（mall.createOrder / wxpay.notify.settle / refund.clawback）+ User +inviteCode/distributorLevel + Order +sourceUserId + common/helpers/parse.ts；V0.1.25 = pic 3 页 + **training module**（myPlans/mySportRecords）+ device 扩 5 action（myTodayHealth/myBindings/bindBleDevice/unbind/submitHeartRate）+ utils/ble.ts（蓝牙 BLE）+ **零 schema 改动**（vendor=ble 复用 DeviceBinding）；V0.1.26 = 新表 Shoe（#34）+ Checkin +shoeId（外键 ON DELETE SET NULL）+ User +shoes relation + shoes module（5 action）+ sport.checkin 集成 incrementShoeKm（shoeId 空跳过，向后兼容）+ 迁移 20260703140000_shoe；V0.1.27 = 零 schema 改：stats 加 myAnnualReport action（年汇总+月度分布+最长单次+活跃天数，单次 groupBy 性能优化）+ 前端 sport 打卡加跑鞋 picker（联动 incrementShoeKm → 跑鞋里程闭环）+ 前端 device-bind 加调试面板（操作日志+心率回调计数，可观测性，后端无改动）；V0.1.28 = 新表 Goal（#35）+ User +goals relation + goal module（4 action：list/add/remove/myProgress，calcGoalProgress 复用 Checkin aggregate DRY）+ stats 加 myCertificates action（动态生成零建表：里程碑证书 100/500/1000/3000km + 赛事证书 marathon + 下一里程碑进度，Cache 120s）+ 迁移 20260703150000_goal + goal +7 单测；V0.1.29 = 新表 Favorite（#36，userId + targetType(content|product) + targetId + unique 防重 + 索引 [userId, targetType]）+ User +favorites relation + favorite module（4 action：list 含详情**批量关联避免 N+1**/add upsert 幂等/remove/isFavorited 批量红心）+ 迁移 20260703160000_favorite + favorite +6 单测 + stats.service 补单测（myAnnualReport/myCertificates 覆盖 39→100%）；总覆盖 80.66→82.11%；**V0.1.30 = 3 新表 Feed+FeedLike+FeedComment（#37-39，迁移 20260703170000_feed，onDelete Cascade 删动态级联点赞/评论；Feed 索引 [createdAt]+[userId,createdAt]；FeedLike `@@unique([feedId,userId])` 防重；FeedComment 索引 [feedId,createdAt]）+ User 加 feeds/feedLikes/feedComments relation + feed module（6 action：list 含作者+liked 状态 / myFeeds / publish 可关联 checkinId+distanceKm / like / unlike / comment，$transaction 回调维护 likeCount/commentCount）+ 迁移 20260703170000_feed + feed +10 单测（list 2 + publish 1 + like 3 + unlike 2 + comment 2）；vi.hoisted 修复 createPrismaMock hoisting 坑**；**V0.1.31 = 新表 Notification（#40，userId/actorId/type(like|comment|follow|system)/targetType?/targetId?/content?/isRead 默认 false/createdAt，索引 [userId,isRead,createdAt]+[userId,createdAt]，onDelete CASCADE(user)+RESTRICT(actor)，User 加 notifications/notifActions(@relation("NotifActor")) 双 relation，迁移 20260703180000_notification）+ notification module（4 action：list 含 actor 头像/昵称 + 分页 / unreadCount 红点轻量 count / markRead 鉴权仅本人（n.userId !== userId → forbidden）/ markAllRead updateMany 幂等）+ **导出 `notify()` 集成函数**（DRY，被 feed 复用，`if (userId === actorId) return` 自己赞自己跳过，不在内部 try/catch — 调用方决定容错）+ feed.service 集成（like/comment 事务后 `try { await notify(...) } catch {}` 吞错，通知写库失败不阻塞主链路；comment content 50 字截断作摘要；type=like/comment，targetType=feed）+ notification +8 单测（list 2 含 hasMore + unreadCount 1 + markRead 2 含 forbidden + markAllRead 1 + notify 2 含自己跳过）+ feed.service.test 重构 mock（加 `vi.mock('src/modules/notification/notification.service.js', () => ({ notify: vi.fn() }))` 隔离 + 断言集成调用，替代原 try/catch 吞 TypeError 碰巧通过的脆弱写法）+ 前端 pages/notification（列表卡 actor 头像+昵称+文案+内容摘要+时间+未读红点 + 全部已读按钮 + 点击乐观标记已读 + 跳 feed + onReachBottom 分页 + 下拉刷新）+ mine 入口带未读徽标**；**V0.1.32 = 新表 Follow（#41，followerId/followeeId/createdAt，`@@unique([followerId,followeeId])` 防重 + 索引 [followerId]+[followeeId] + onDelete CASCADE 任一用户删级联，User 加 following(@relation("Follower"))+followers(@relation("Followee")) 双 relation — **坑：同 model 双 relation 必须 @relation("name") 消歧义，否则 prisma generate 报 P1012 Ambiguous relation**（范式同 V0.1.31 NotifActor），迁移 20260703190000_follow）+ follow module（6 action：follow upsert 幂等 + 不能关注自己 badRequest + 复用 notify(type=follow) try/catch 吞错 / unfollow deleteMany 幂等 / isFollowing 批量查按钮状态 Set 拼装 / myFollowing 分页含 user / myFollowers 分页含 user / myCounts 一次拿全 user+followingCount+followerCount+isFollowing+isSelf 用户主页用 — 复用 V0.1.31 notify 集成函数 type=follow 是第 3 个 type 继 like/comment 之后）+ 前端 pages/user（用户主页：头像+昵称+关注数/粉丝数+关注按钮**乐观更新**失败回滚 + isSelf 自己不显示按钮；调 follow.myCounts 一次拿全 / follow.follow / follow.unfollow）+ feed wxml feed-head 加 data-uid + bindtap onTapUser 跳用户主页（关注闭环入口）+ follow +10 单测（follow 3 含自己/notFound/通知 + unfollow 1 + isFollowing 1 + myFollowing 1 + myFollowers 1 + myCounts 3 含 isSelf/notFound）+ mock notify 隔离范式（vi.mock notification.service.js → notify: vi.fn()，同 feed.test.ts V0.1.31 范式）+ 🐛 training wxss 中文 selector 修复（原 `.plan-card.入门/进阶/挑战/极限` 4 个中文 class selector 编译报 `unexpected at pos 1725`，wxss 编译器对中文 selector 解析失败 → 分离 levelKey 英文 beginner/intermediate/challenge/extreme 作 class + level 中文显示，前端 LEVEL_KEY_MAP 映射；全 miniprogram wxss 扫描确认无中文 selector 残留）**；**V0.1.33 = BLE 设备品牌识别（零 schema 改 / 方案1 MVP）：① shared device-brands.ts 改 `xiaomi` available false→**true**（小米手环可绑定）+ garmin.desc 加"BLE 实时心率 + OAuth 历史" + 新增 `BLE_VENDOR_PATTERNS: Record<string, RegExp[]>`（garmin: /garmin|forerunner|fenix|vivoactive|edge/i；xiaomi: /mi\s*band|xiaomi|小米|redmi/i）+ 新增 `matchBleVendor(name): 'garmin' | 'xiaomi' | 'ble'` 函数（按设备名匹配，未中返 'ble'）+ `BleVendor` type（**前后端单一数据源**）；② device.schema.ts `BindBleDeviceInputSchema` 加 `vendor: z.enum(['ble','garmin','xiaomi']).default('ble')` + `brandMeta: {manufacturer?, model?}.optional()`（透传不持久化）；③ device.service.ts `bindBleDevice` 接受 vendor 按 `[userId, vendor]` upsert（**可同时绑多设备：garmin+xiaomi+ble 共存**，**service 层兜底 `input.vendor ?? 'ble'`** — route Zod default 不覆盖 service 直接调用，如测试）+ `myBindings` 加 `garminBleBound: boolean`（DeviceBinding vendor=garmin 存在）+ 保留 garminAutoConnected/garminActivityCount（OAuth 数据）→ **BLE 绑定优先，OAuth 降级**；deviceName 逻辑扩 garmin/xiaomi（accessTokenEnc 存设备名）；④ 前端 utils/ble.ts 新增 `readBattery(deviceId): Promise<number | null>`（0x180F / 2A19 电量百分比）+ `readDeviceInfo(deviceId): Promise<{manufacturer, model}>`（0x180A：2A29 Manufacturer Name + 2A24 Model Number）+ `readCharValue` 通用工具（微信 `readBLECharacteristicValue` 值通过 `onBLECharacteristicValueChange` 回调拿，success 不返 value → 临时监听 + serviceId/characteristicId 过滤 + 超时返 null 容错）；⑤ 前端 device-bind 页改造（扫描结果 matchBleVendor 自动识别 + 品牌标签佳明蓝 .brand-garmin / 小米橙 .brand-xiaomi / 通用灰 .brand-ble；`onSelectDevice` 流程 connect → Promise.all([readBattery, readDeviceInfo]) → 品牌识别（设备名 + 0x180A Manufacturer 二次验证）→ 未识别 wx.showActionSheet 手选兜底（佳明/小米/通用）→ subscribeHeartRate → bindBleDevice 传 vendor+brandMeta；心率卡显示电量/型号/厂商 hr-meta-item；garmin OAuth 降级段 `garminAutoConnected && !garminBleBound` 时显示"历史数据已连接（OAuth）"提示可 BLE 绑定；`onTapBrand` ble/garmin/xiaomi 都走 BLE 扫描）；⑥ **3 坑沉淀**（service 层 vendor 兜底 `?? 'ble'` / `wx.readBLECharacteristicValue` 值不在 success 回调（微信文档规定值通过 `onBLECharacteristicValueChange` 回调拿；与 subscribeHeartRate 全局监听共存，按 serviceId 过滤互不干扰）/ 小程序 TS 类型 3 坑：TextDecoder 非 DOM lib 不可用（用 fromCharCode，Manufacturer Name/Model 规范 ASCII 够用）、`offBLECharacteristicValueChange` 类型签名 `()` 不接受参数（运行时支持 cb，@ts-ignore 绕过）、`OnBLECharacteristicValueChangeCallbackResult` 类型不存在（用结构类型 `{serviceId, characteristicId, value}` + @ts-ignore））；⑦ 测试 device.bindings.test.ts 重构 mock（deviceBinding 加 findUnique）+ **3 新测试**（garmin BLE 优先 myBindings + bindBleDevice vendor=garmin + vendor=xiaomi）；**527→530 passed / 0 failed**；41 表 / 28 module / 33 页 / 16 迁移（均不变，零 schema 改）**；**V0.1.34 = 家庭空间 family（pic 2776 家庭方向，/zcf:workflow 方案1 完整 family module）：① **2 新表**（迁移 `20260704000000_family`，表 41→43）：**Family #42**（id / name / ownerId / inviteCode(@unique 8 位 hex 短码，randomUUID slice 8 + toUpperCase) / createdAt；owner User `@relation("FamilyOwner")`；members FamilyMember[]；goals Goal[]）+ **FamilyMember #43**（familyId / `userId @unique`（**一人一家庭强制**）/ role(owner|member, 默认 member) / joinedAt；onDelete Cascade（Family 删→成员级联，User 删→成员级联）；family Family @relation + user User @relation）；② **Goal 表改**（不新表）：+`familyId String?`（null=个人目标，有值=家庭目标）+ 外键 onDelete Cascade + 索引 [familyId]；迁移数 16→17；③ **User 加双 relation**：`familiesOwned Family[] @relation("FamilyOwner")`（创建的家庭）+ `familyMember FamilyMember?`（1:1，一人一家庭）— **坑：User 双 Family relation 必须 @relation("FamilyOwner") 消歧义，范式累计第 3 次**（NotifActor V0.1.31 / Follower V0.1.32 / FamilyOwner V0.1.34）；④ **新 module family**（28→29，6 action）：`createFamily(userId, {name})` 事务内建 Family(ownerId) + FamilyMember(role=owner) + 8 位 inviteCode；已有家庭 → conflict；`joinFamily(userId, {inviteCode})` 按 inviteCode 查 Family → notFound 兜底；已有家庭 → conflict；加 FamilyMember(role=member)；`myFamily(userId)` 家庭卡 + 成员列表含**本月跑量**（Checkin aggregate by member）；无家庭返 family:null；`leaveFamily(userId)` owner 不可离开（badRequest，需转让/解散）；member 删 FamilyMember；`familyRanking(userId, {period: week|month})` 本周/本月 CN 时区（cnWeekRange/cnMonthRange）成员跑量榜按距离降序；`inviteInfo(userId)` 返 family.name + inviteCode（前端分享/复制）；⑤ **goal module 扩展**（复用 Goal，DRY）：`calcGoalProgress` 改 `userIds: string[]` 参数（个人=[userId]，家庭=成员 userIds 列表，`where userId: { in: userIds }`）；`list` / `myProgress` 加 `familyId: null` 过滤（仅个人目标）；`addFamilyGoal(userId, {familyId, type, targetDistance, title?})` 鉴权 member.familyId 必须匹配 input.familyId（forbidden）；goal.create(familyId, userId=创建者)；`myFamilyGoals(userId)` 查 myFamilyId → Goal where familyId + 成员 userIds → 进度按家庭成员聚合；⑥ **前端 pages/family**（页面 33→34）：家庭卡（name+inviteCode+成员数）+ 邀请按钮（复制 inviteCode）+ 本月跑量榜（rank-num+avatar+nickname+家长标+monthDistance）+ 家庭目标进度条 + 创建/加入（无家庭态）+ 添加家庭目标弹层（月度/年度 picker + title + targetDistance）+ leaveFamily 按钮（非 owner）；mine 入口「家庭空间」（19→20 宫格）；⑦ **测试**：family +10 单测（createFamily 2 + joinFamily 2 + myFamily 2 + leaveFamily 2 + familyRanking 1 + inviteInfo 1，**mockImplementation 按 userId 区分**并发 aggregate）；goal +5（addFamilyGoal 3 含 forbidden + myFamilyGoals 2 含 where userId in 断言）；总测试 530→**545 passed / 0 failed**；⑧ **3 决策**：方案 2（A 家庭组 + B 跑量榜 + C 家庭目标）/ 一人一家庭（FamilyMember.userId @@unique）/ 复用 Goal+familyId（calcGoalProgress 扩 userIds，DRY）；⑨ **3 坑沉淀**：① Prisma User 双 Family relation（familiesOwned `@relation("FamilyOwner")` + familyMember 1:1）需 @relation 命名消歧义（范式累计第 3 次）；② inviteCode 8 位 hex 短码（randomUUID slice 8 + toUpperCase）@unique 兜底，极小概率重复时报错让用户重试（YAGNI，不加重试）；③ familyRanking Promise.all 并发 aggregate：mockResolvedValueOnce 顺序不保证 → mockImplementation 按 userId 区分（并发 mock 测试范式）；**43 表 / 29 module / 34 页 / 17 迁移 / 545 单元 / 15 缓存热路径（family 暂未接 Cache，持平）**

> 最新进展：**V0.2.8 init #13 全量实测**（**61 表 / 46 迁移 / 34 module / 22 页 / 12 组件 / 34 module CLAUDE.md 100% 覆盖 / 1055 it() 单元 / funcs 86.39% 沿用未实跑 / Cache 热路径 23 声明 + 132 实际引用 / 品牌色 #2D9D78 沿用**） — init #13（2026-07-16 14:30:48 Asia/Shanghai）实测：① **V0.2.4** 健康中心三页 UI 改版（后端 0 改动 / data-strip 组件）；② **V0.2.5** food.recognize 第 6 action 双模式（vision GLM-4.6V / ocr 腾讯 OCR+FatSecret）+ shared DEVICE_BRANDS mi_scale + DeviceCategory 'scale'；③ **V0.2.6** 邀请裂变 growth_level + membership 新页 + distribution.inviteInfo 加强 + bindInviter + 周限频；④ **V0.2.7** User +2 字段（totalPointsEarned/invitedBonusDays 累计积分驱动成长等级）+ user.redeemMember action（7d/100p 30d/300p）；⑤ **V0.2.8** admin RBAC 独立账号体系（**Admin #60 + AdminLoginLog #61 表** + checkPermission + adminLogin + 8 action + 3 角色 super-admin/admin/operator + admin.service 522→~1300 行）；**GAP-15 文档同步 root + apps/miniprogram + apps/server 三大 CLAUDE.md 顶部 V0.2.4/V0.2.5/V0.2.6/V0.2.7/V0.2.8/init#13 共 5+1 段**；**GAP-12 100% 关闭** 34/34 module CLAUDE.md；**GAP-13 已闭** data-strip + avatar-badge 两组件 CLAUDE.md 已建（type:null 范式 + growth emoji 映射）；**GAP-14 open** funcs% 待 V0.2.8 部署前实跑；下一步：**V0.2.8 tag 打点**（建议 HEAD）+ 实跑 funcs 验证 admin RBAC（admin.service 1300 行新增风险）+ diet/insight/membership 真机验证 + huawei 真实样本回归 + wxpay 真生产切流 + AI 私教 voice 插件 — **V0.2.1 OCR SDK module + V0.2.0 food module + 阶段 2/3 stats 收官 + V0.1.150/151 上传 COS pipeline（V0.1.150~V0.2.1）** — **59 表 / 34 module / 20 页 / 43 迁移 / 1003 单元 / 27 module CLAUDE.md**（init #10 2026-07-15 实测）；V0.1.150 UploadRecord 表 #59（迁移 20260715000000）+ COS upload pipeline（5 解析器）；V0.1.151 Phase 2+3 解析器扩展（garmin_fit/apple_health/sport_screenshot OCR + huawei_export stub）+ infra/ocr.ts 手写 TC3；V0.2.0 food module 第 33 个（FatSecret OAuth2 + Meal.items 宏量升级 + FoodCache 1h TTL + 5 action）+ stats 阶段 2 weatherAnalysis + 阶段 3 userProfile + Checkin +5 字段（迁移 20260716000000）；V0.2.1 ocr module 第 34 个（tencentcloud-sdk-nodejs-ocr 替手写 TC3 + 复用 COS KEY + 3 action）；下一步：huawei 样本 + FATSECRET_KEY 生产注入 + qmwx-cos-uploader 关联 QcloudOCRFullAccess + diet/insight 真机验证；V0.1.42 跑群深化 + 训练计划配置化 + setErrorHandler 修（V0.1.40~42）** — **45 表 / 30 module / 38 页 / 577 单元 / 19 迁移**（V0.1.100 实际为 51 表 / 30 module / 42 页 / 580 单元 / 27 迁移，见 Changelog）；V0.1.40 profile 完整（User +5 字段 gender/birthday/region/height/weight）；V0.1.41 TrainingPlan+UserPlanEnrollment 表 + training +3 action（joinPlan/myActivePlan/leavePlan）+ admin +2 + myPlans 改读 DB + calcPlanProgress；V0.1.42 Group +announce + sport +3 action（groupDetail/groupMembers/announceGroup）；修 setErrorHandler 时机（Fastify 4 route 前注册，修 401/403/404 返默认格式 bug）；CT400 推 v0.1.40/41/42 tag + 生产部署 V0.1.42 — **V0.1.34 家庭空间 family**（2026-07-04，pic 2776 家庭方向，/zcf:workflow 方案1 完整 family module）— **2 新表 Family #42 + FamilyMember #43**（迁移 `20260704000000_family`，FamilyMember.userId `@unique` 强制一人一家庭，onDelete Cascade）+ **Goal 表 +familyId**（null=个人目标，有值=家庭目标，onDelete Cascade）+ **User 加双 relation**：familiesOwned（`@relation("FamilyOwner")`，创建的家庭）+ familyMember（1:1）+ **新 module family**（28→29，6 action：createFamily/joinFamily/myFamily/leaveFamily/familyRanking/inviteInfo，8 位 inviteCode hex 短码 randomUUID slice 8 + toUpperCase）+ **goal module 扩展**（calcGoalProgress 改 `userIds: string[]` 参数，DRY 复用 — 个人=[userId]/家庭=成员 userIds；list/myProgress 加 familyId:null 过滤；+addFamilyGoal/myFamilyGoals 2 新 action）；前端 pages/family（家庭卡+邀请复制+本月跑量榜+家庭目标+创建/加入+添加目标弹层）；**3 决策**（方案2 A 家庭组+B 跑量榜+C 家庭目标 / 一人一家庭 @@unique / 复用 Goal+familyId DRY）；**3 坑沉淀**（User 双 Family relation 必须 @relation("FamilyOwner") 消歧义，范式累计第 3 次：NotifActor V0.1.31 / Follower V0.1.32 / FamilyOwner V0.1.34 / inviteCode 8 位 @unique 兜底极小概率重复报错让用户重试 YAGNI / familyRanking Promise.all 并发 aggregate mockResolvedValueOnce 顺序不保证 → mockImplementation 按 userId 区分）；测试 530→**545**（family +10：createFamily 2 + joinFamily 2 + myFamily 2 + leaveFamily 2 + familyRanking 1 + inviteInfo 1；goal +5：addFamilyGoal 3 含 forbidden + myFamilyGoals 2 含 where userId in 断言）；**43 表 / 29 module / 34 页 / 17 迁移** — **V0.1.33 BLE 设备品牌识别**（2026-07-03，/zcf:workflow 方案1 MVP，**零 schema 改**：复用 DeviceBinding.accessTokenEnc 存设备名 + brandMeta 透传不持久化；shared device-brands `xiaomi` available true→开放 + garmin desc 加"BLE 实时心率 + OAuth 历史" + 新增 `BLE_VENDOR_PATTERNS` + `matchBleVendor(name)` 函数 + `BleVendor` type（前后端单一数据源）；device.schema `BindBleDeviceInputSchema` 加 `vendor` enum + `brandMeta` optional；device.service `bindBleDevice` 接 vendor 按 `[userId, vendor]` upsert（可同时绑多设备 garmin+xiaomi+ble 共存，**service 层兜底 `input.vendor ?? 'ble'`**）+ `myBindings` 加 `garminBleBound: boolean`（**BLE 绑定优先，OAuth 降级**）；前端 utils/ble.ts 加 `readBattery`（0x180F / 2A19）+ `readDeviceInfo`（0x180A：2A29 Manufacturer + 2A24 Model）+ `readCharValue` 通用 GATT 读取工具（微信 `readBLECharacteristicValue` 值在 `onBLECharacteristicValueChange` 回调，非 success）；前端 device-bind 页改造（matchBleVendor 自动识别 + 品牌标签 + onSelectDevice 流程 connect → Promise.all([readBattery, readDeviceInfo]) → 0x180A Manufacturer 二次验证 → 未识别 wx.showActionSheet 手选兜底 + 心率卡电量/型号/厂商 + garmin OAuth 降级段）；**3 坑沉淀**（service 层 vendor 兜底 / wx.readBLE 值在回调非 success / 小程序 TS 类型 3 坑：TextDecoder 非 DOM lib / offBLECharacteristicValueChange 签名不接受参数 / OnBLECharacteristicValueChangeCallbackResult 类型不存在）；**41 表 / 28 module / 33 页 / 530 单元 / 16 迁移（均不变，只加 device 品牌化逻辑 + 3 新单测）**）— **V0.1.32 关注关系 follow + training wxss 中文 selector 修复**（2026-07-03，pic 2 社交向深化；**新表 Follow #41** + follow module 6 action（follow/unfollow/isFollowing/myFollowing/myFollowers/myCounts）+ 复用 notify(type=follow) + 前端 pages/user（用户主页：头像+关注/粉丝数+关注按钮乐观更新+isSelf 自己不显示）+ feed 头像跳用户主页闭环 + follow +10 单测 + 🐛 training wxss 中文 selector 修复（levelKey 英文 class + level 中文显示）；41 表 / 28 module / 33 页 / 527 单元 / 16 迁移）— **V0.1.31 消息中心 notification（pic 2 社交向收尾）**（2026-07-03，**新表 Notification #40** + notification module 4 action（list/unreadCount/markRead/markAllRead）+ **导出 `notify()` 集成函数**被 feed 复用 + 前端 pages/notification（列表卡+红点+全部已读+点击乐观标记+跳 feed+分页+下拉刷新）+ mine 入口带未读徽标 + feed.service 集成 notify（like/comment 事务后 try/catch）+ feed.service.test 重构 mock（vi.mock notify 隔离）+ notification +8 单测；40 表 / 27 module / 32 页 / 517 单元 / 15 迁移）— **V0.1.30 运动动态 feed（pic 2 社交向核心）**（2026-07-03，**3 新表 Feed+FeedLike+FeedComment #37-39** + feed module 6 action（$transaction 回调维护 likeCount/commentCount）+ 动态前端页（点赞乐观更新）+ vi.hoisted 修复 createPrismaMock hoisting 坑；39 表 / 26 module / 31 页 / 509 单元 / 14 迁移）— **V0.1.29 收藏（pic 3 向社交向首功能，最 KISS）**（2026-07-03，**新表 Favorite #36** + favorite module 4 action + stats.service 覆盖 39→100% + 总覆盖 80.66→82.11%；36 表 / 25 module / 30 页 / 499 单元 / 13 迁移）— **V0.1.28 跑步目标 + 我的证书**（2026-07-03，pic 2768 跑者向：**新表 Goal #35** + goal module 4 action + stats +myCertificates 动态生成；35 表 / 24 module / 29 页 / 487 单元 / 12 迁移）— **V0.1.27 sport 跑鞋 picker + 年度报告 + 蓝牙调试面板**（2026-07-03，**零 schema 改** / 28 页 / 479 单元不变 / stats +myAnnualReport action）— **我的跑鞋**（V0.1.26，2026-07-03，pic 2768：跑鞋里程管理 + 800km 更换提醒；34 表 / 23 module / 27 页 / 479 单元 / 15 缓存热路径 / 11 迁移）— **pic 3 张全新功能页**（V0.1.25，2026-07-03：今日健康 + 蓝牙绑定 + 锻炼训练；33 表 / 22 module / 26 页 / 472 单元）— **B 电商三连击**（2026-07-02~03：购物车/积分签到/分类 + 地址/优惠券 + 分销中心/天天跑）— **佳明（Garmin）数据全链路**（2026-07-01）— V0.1.17 部署加固 + 云端链路打通（qingmulife.cn）+ admin 重构 + P0-1 修复（2026-06-29）— V0.1.x Cache **15** 热路径 + OpenAPI 3.1 契约（2026-06-17）— Phase 4.1 微信支付完整闭环（2026-06-14）

---

## 🎯 职责

Node.js + TypeScript 后端（Fastify 4），对外提供 **34 个 module**（V0.2.1 第 34 个 ocr；V0.1.142 删商城前端 16 页但后端 module 保留：cart/points/address/coupon/distribution/group-buy 全闭环保留待复用）+ **domain 层** + **jobs** + **CLI 工具**。
**唯一权威**：openid、积分、余额、订单状态、微信支付回调、**分销佣金**、**心率缓存**（ble:hr:{userId}）、**血氧缓存**（spo2:{userId}）、**微信运动步数**（WeRunRecord 每日 upsert）、**跑鞋累计里程**（Checkin.shoeId → incrementShoeKm）、**年度汇总**（stats.myAnnualReport）、**跑步目标进度**（goal.calcGoalProgress 复用 Checkin aggregate，**V0.1.34 扩 userIds 支持家庭目标**）、**证书颁发**（stats.myCertificates 动态生成）、**收藏红心状态**（favorite.isFavorited 批量查）、**动态点赞/评论计数**（feed.$transaction 回调维护 likeCount/commentCount）、**消息通知**（notification.notify() 集成函数被 feed/follow 复用）、**关注关系**（follow.myCounts 用户主页一次拿全）、**BLE 设备品牌识别**（device.bindBleDevice 接 vendor，BLE 绑定优先 OAuth 降级）、**健康历史**（device.myHealthHistory 心率/血氧/睡眠 type+dateRange）、**onboarding 状态**（User.onboardingDone 字段 + user.resetOnboarding）、**家庭空间**（family.createFamily/joinFamily/myFamily + 家庭目标 goal.addFamilyGoal/myFamilyGoals 复用 Goal+familyId）、**AI 私教对话**（ai-coach.chat/chatStream 多轮记忆 + GLM v4 流式 + 4 人设 + 建议卡片 + 计划追踪 + 限流）、**每日 AI 健康简报**（DailyReport 表 #58 healthScore 0-100 + AI 解读文本 alertText + steps/restingHr/sleepHours）、**天气查询**（stats.weather 4 action：实时/预报/空气质量/日出日落 — 和风天气 coord 补 V0.1.148）都在这里产生和变更。

---

## 🏃 快速上手

```bash
# 1. 装依赖（monorepo 根）
cd ../.. && pnpm install

# 2. 起 PostgreSQL + Redis（推荐 docker compose）
docker compose up -d

# 3. 准备环境变量
cp .env.example .env
# 编辑 .env，至少填 DATABASE_URL / REDIS_URL / JWT_SECRET / WX_APPID / WX_SECRET
# V0.1.139+ 需填 LLM_BASE_URL / LLM_API_KEY（智谱 GLM v4）/ LLM_MODEL
# V0.1.148+ 可选 QWEATHER_API_KEY / QWEATHER_API_HOST（和风天气 — 见 docs/qweather-api.md）
# 沙箱可空 WX_MCH_*；真生产必填（见 docs/PHASE-4-2-PREP.md）

# 4. 初始化数据库
pnpm prisma:generate
pnpm prisma:migrate

# 5. 跑起来
pnpm dev
# 访问 http://localhost:3000/health 应返回 { status: 'ok', uptime, env, timestamp }
```

---

## 📂 目录结构

```
apps/server/
├── src/
│   ├── app.ts                        # buildApp() — Fastify 装配（无 listen，无 jobs）
│   ├── server.ts                     # 启动入口（buildApp + listen + BullMQ + 优雅关闭）
│   ├── config/
│   │   └── env.ts                    # 环境变量 Zod 校验（含 WX_MCH_* 6 字段 + LLM_* + QWEATHER_*）
│   ├── common/
│   │   ├── errors.ts                 # BusinessError 统一类
│   │   ├── logger.ts                 # Pino 日志封装
│   │   ├── openapi-spec.ts           # OpenAPI 3.1 spec（V0.1.4/13，/openapi.json）
│   │   ├── docs.ts                   # API 文档辅助
│   │   ├── csv.ts                    # CSV 导出工具（admin.exportOrders/exportUsers，working tree）
│   │   ├── helpers/
│   │   │   └── parse.ts              # parseOrBadRequest 统一 Zod 解析（V0.1.24 新 module 复用）
│   │   ├── middleware/
│   │   │   ├── auth.ts               # JWT 鉴权插件（public 路由跳过）+ requireLogin helper
│   │   │   └── feature-gate.ts       # 功能开关守卫（requireFeature）
│   │   └── integrations/wx/
│   │       └── code2session.ts       # 微信 code2Session（session_key 缓存 Redis）
│   ├── infra/
│   │   ├── prisma.ts                 # PrismaClient 单例
│   │   ├── redis.ts                  # ioredis 单例
│   │   └── cache.ts                  # Cache.wrap 抽象（V0.1.x，接入 23 热路径 V0.2.3，含 myTodayHealth / myCertificates / aiCoach / V0.2.3 stats.weatherAnalysis/userProfile + goal.list/myProgress + shoes.list/myStats + training.myPlans/myActivePlan）
│   ├── domain/                       # 跨 module 业务规则（Phase 4.1）
│   │   └── order-state.ts            # Order 状态机：7 态 + TRANSITIONS 白名单 + assertTransition
│   ├── modules/                      # 34 个业务 module（V0.2.1 +ocr 第 34 个）
│   │   ├── auth / user / sport / mall / content / wallet / weekly-report
│   │   ├── upload / admin / app-config / wxpay                  # V1 + Phase 4
│   │   ├── device (V2 部分实现·佳明+蓝牙+今日健康+V0.1.33 品牌化 bindBleDevice(vendor) + myBindings garminBleBound + V0.1.43 +syncWeRun/myWeRun/myHealthHistory/submitSpO2 + 心率/血氧/睡眠落库 + 小米 OAuth stub + 蓝牙 retry3 强化) / stats (V0.1.144~147 +myDailyReport/+generateDailyReport + V0.1.148 +weather 4 action coord 补 + V0.2.0 +weatherAnalysis/userProfile + V0.2.3 接 Cache) / ranking
│   │   ├── recipe / ludong (V2 stub)                            # V2
│   │   ├── cart / points / address / coupon / distribution      # B 电商 (2026-07-02~03，V0.1.142 前端下线后端保留)
│   │   ├── training (V0.1.25 + V0.1.41 配置化 + **V0.2.3 myPlans/myActivePlan 接 Cache**)
│   │   ├── shoes (V0.1.26 + V0.1.133 +getDetail/getMileageHistory/updateThreshold + V0.1.137 +compareShoes + **V0.2.3 list/myStats 接 Cache**)
│   │   ├── goal (V0.1.28；V0.1.34 扩 family：calcGoalProgress userIds + addFamilyGoal/myFamilyGoals；V0.1.135 +4 customMilestone；**V0.2.3 list/myProgress 接 Cache**)
│   │   ├── favorite                                             # 收藏 (V0.1.29，content|product 通用，批量关联避免 N+1)
│   │   ├── feed                                                 # 运动动态 (V0.1.30，$transaction 回调维护 likeCount/commentCount；V0.1.31 集成 notify()；V0.1.136 +shoeId)
│   │   ├── notification                                         # 消息中心 (V0.1.31，pic 2 社交向收尾，导出 notify() 被 feed/follow 复用)
│   │   ├── follow                                               # 关注关系 (V0.1.32，pic 2 社交向深化，myCounts 用户主页一次拿全)
│   │   ├── family                                               # 家庭空间 (V0.1.34，pic 2776 家庭方向，6 action + 一人一家庭 @@unique + 8 位 inviteCode 短码)
│   │   ├── group-buy (V0.1.142 前端下线后端保留)
│   │   ├── review                                               # 评价系统 (V0.1.113 第 31 个；V0.1.118 +replyContent/repliedAt 字段；V0.1.137 鞋评双分发)
│   │   ├── ai-coach                                             # AI 私教 (V0.1.139 第 32 个；V0.1.140 4 人设+suggestion+planTracking+rate-limit；V0.1.141 speed 优化；V0.1.142 tab 化；V0.1.144~147 完善)
│   │   ├── food (V0.2.0 第 33 个，FatSecret OAuth2 + Meal.items 宏量 + FoodCache 1h)
│   │   └── ocr (V0.2.1 第 34 个，腾讯云 SDK 替手写 TC3 + 3 action + 复用 COS KEY)
│   ├── jobs/                         # BullMQ 定时任务
│   │   ├── queue.ts                  # startJobs / stopJobs / enqueueCloseOrder
│   │   ├── scheduler.ts              # BullMQ repeatable（cron）
│   │   ├── weekly-report.job.ts      # 每周日 20:00 聚合周报
│   │   ├── close-order.job.ts        # 30 分钟超时关单（Phase 4.1）
│   │   ├── refresh-certs.job.ts      # 微信平台证书定时刷新（V0.1.1）
│   │   ├── garmin-import.job.ts      # 佳明活动入 Checkin（concurrency=2，5min 桶去重）
│   │   ├── ludong-sync.job.ts        # 律动同步 stub（V0.1.43）
│   │   └── upload-parse.job.ts       # 上传异步解析 worker（V0.1.150 5→6 worker）
│   └── ...
├── scripts/                          # CLI 工具
│   ├── reconcile.ts                  # `pnpm reconcile -- YYYY-MM-DD` 微信账单比对
│   └── import-garmin.ts              # `pnpm garmin-import` 佳明全量入 Checkin（500/事务）
├── prisma/
│   ├── schema.prisma                 # **59 张表**（V0.1.150 +UploadRecord #59；V0.1.139 +ConversationTurn #57 / V0.1.144~147 +DailyReport #58；前期累计 V0.1.43 健康 4 表 + V0.1.113 Review + V0.1.127 BodyComp + V0.1.128 Coros + V0.1.134 RaceResult + V0.1.135 User.customMilestones + V0.1.136 Feed.shoeId + V0.1.140 User.aiCoachPersona）— 见下方表清单
│   ├── seed.ts                       # 初始数据（feature_flags + 8 商品 + AppConfig）
│   ├── sql/permissions.sql           # 角色权限参考
│   └── migrations/                   # Prisma 迁移历史（43 个 V0.2.1 init #10 实测；init #8 声明 45 是误）
├── tests/
│   ├── modules/                      # 单元测试（vi.mock Prisma/Redis）— **1035 it() occurrences**（init #12 Grep 实测；声明 1042 V0.2.3 沿用）
│   │   ├── user/sport/mall/content/wallet/weekly-report/admin/app-config...
│   │   ├── wxpay/{service,notify}.test.ts
│   │   ├── mall/{order,refund}.service.test.ts
│   │   ├── wallet/{service,repo}.test.ts
│   │   ├── jobs/{queue,close-order.job,upload-parse.job}.test.ts
│   │   ├── domain/order-state.test.ts
│   │   ├── device/{garmin,service,routes,health,bindings,coros-*}.test.ts
│   │   ├── stats / ranking / cart / points / address / coupon
│   │   ├── distribution/distribution.service.test.ts             # **17 用例**（V0.1.24）
│   │   ├── training/training.service.test.ts                     # **12 用例**（V0.1.25 + V0.1.41 + V0.2.3 cache 隔离）
│   │   ├── shoes/shoes.service.test.ts                           # **21 用例**（V0.1.26 + V0.1.133 + V0.1.137 + V0.2.3 cache 隔离）
│   │   ├── goal/goal.service.test.ts                             # **20 用例**（V0.1.28 + V0.1.34 + V0.1.135 + V0.2.3 cache 隔离）
│   │   ├── favorite/favorite.service.test.ts                     # **6 用例**（V0.1.29）
│   │   ├── feed/feed.service.test.ts                             # **10 用例**（V0.1.30；V0.1.31 重构 mock）
│   │   ├── notification/notification.service.test.ts             # **8 用例**（V0.1.31）
│   │   ├── follow/follow.service.test.ts                         # **10 用例**（V0.1.32）
│   │   ├── family/family.service.test.ts                         # **10 用例**（V0.1.34）
│   │   ├── ai-coach/{stub,glm,context-builder,service,routes}.test.ts  # **35 用例**（V0.1.139 +V0.1.140 完善）
│   │   ├── food/food.{service,routes}.test.ts                    # **22 用例**（V0.2.0 第 33 module）
│   │   ├── ocr/ocr.{client,service,routes}.test.ts               # **18 用例**（V0.2.1 第 34 module）
│   │   ├── upload/{upload-service,upload-record.service,upload.routes}.test.ts  # V0.1.149/150
│   │   └── device/huawei-export.parser.test.ts                   # V0.2.2 20 用例
│   ├── e2e/                          # 端到端测试（真 PG/Redis, RUN_E2E=1）— 54 用例 / 11 files
│   │   ├── sport-flow / weekly-report / mall-flow / wxpay-notify
│   │   ├── refund-flow / close-order / openapi (19 tests, OpenAPI CI gate)
│   │   └── prod-smoke / user-flow / admin-audit                   # 云端链路 + P0-1 回归
│   ├── helpers/                      # 测试基建（mockErrors / mockPrisma / README）
│   └── fixtures/                     # 测试 fixtures（user/product/order/group）
├── Dockerfile                        # 多阶段构建（deps → build → runner）
├── vitest.config.ts                  # alias src/xxx.js → ./src/xxx.ts
├── tsconfig.json                     # 开发用（含 sourceMap）
├── tsconfig.build.json               # 构建用（rootDir="src", paths → dist）
└── .env.example                      # 环境变量模板（含 WX_MCH_* 6 字段 + WX_REFUND_NOTIFY_URL + LLM_* + QWEATHER_* V0.1.148 coord 补 + COS_* V0.1.149 + FATSECRET_* V0.2.0）
```

---

## 🚪 API 协议

**统一前缀**：`/api/{module}`
**RESTful action**：各 module 自定义 action 路由（POST body 含 action/payload，或 REST path）。
**统一返回**：`{ code: 0, data } | { code: 4xx/5xx, msg }`。
**鉴权**：除 `config.public: true` 路由外，全部需 JWT Bearer token。

### 34 个 Module 清单（V1 11 + Phase 4 wxpay + 佳明 2 + V2 stub 2 + B 电商 5 + pic 训练 1 + 跑鞋 1 + 目标 1 + 收藏 1 + 动态 1 + 通知 1 + 关注 1 + 家庭 1 + 团购 1 + 评价 1 + AI 私教 1 + food 1 + ocr 1）

| Module | 路由前缀 | Service | Schema | 测试 | 状态 |
| --- | --- | --- | --- | --- | --- |
| **auth** | `/api/auth` | — (route 内联) | — | — | ✅ 微信登录 + code2Session |
| **user** | `/api/user` | ✅ | ✅ | **21 单元**（V0.1.148 init #8 修） | ✅ **+19 relation 字段累计**（inviteCode/distributorLevel V0.1.24 + shoes V0.1.26 + goals V0.1.28 + favorites V0.1.29 + feeds/feedLikes/feedComments V0.1.30 + notifications/notifActions V0.1.31 + following/followers V0.1.32 + familiesOwned/familyMember V0.1.34 + 5 profile V0.1.40 + onboardingDone V0.1.43 + phone/email/passwordHash/username V0.1.129 + customMilestones V0.1.135 + scaleBind V0.1.127 + aiCoachPersona V0.1.140） |
| **sport** | `/api/sport` | ✅ | ✅ | **43 单元 + 3 e2e**（V0.1.148 init #8 修） | ✅ 打卡/统计/群榜单/建群 + shoeId 集成 V0.1.26 + picker V0.1.27 + V0.1.42 +3 group action |
| **mall** | `/api/mall` | ✅ **service + order.service 352 行（V0.1.148 init #8 修正：原以为仅 service+refund） + refund.service 116 行** | ✅ 64 行 | **64 单元 + 1 e2e**（V0.1.148 init #8 修） | ✅ 商品/分类/下单/取消/退款 + 分销集成 V0.1.24 + **V0.1.142 前端下线后端保留** |
| **content** | `/api/content` | ✅ 93 行 | ✅ 36 行 | 8 单元 | ✅ 内容列表/详情/报名（公开）+ V0.1.134 +3 race action |
| **wallet** | `/api/wallet` | ✅ 114 行 + wallet.repo 64 行 | ✅ 29 行 | **18 单元**（V0.1.148 init #8 修） | ✅ 余额/充值/消费/退款 + ensureWalletInTx（被 settle/clawback 复用） |
| **weekly-report** | `/api/weekly-report` | ✅ 185 行 | ✅ 14 行 | 2 e2e | ✅ 周报聚合 + BullMQ 定时 |
| **upload** | `/api/upload` | ✅ upload.service + upload-record.service（V0.1.150） | — | 21 单元（V0.1.149/150） | ✅ 文件上传 + COS 派发 + UploadRecord 表 #59（V0.1.150） |
| **admin** | `/api/admin` | ✅ admin.service（**25+** action / 522 行） | ✅ admin.schema（143 行） | 22 + 12 单元 | ✅ 全功能 + V0.1.41 +2 upsertTrainingPlan/listTrainingPlans + V0.1.38 +2 upsertGroupBuy/listGroupBuys + V0.1.134 +2 race + V0.1.150 +2 upload (listUploads/retryParse) |
| **app-config** | (内嵌) | — | — | — | ✅ AppConfig 表 + 功能开关 |
| **wxpay** | `/api/wxpay` | ✅ 350 行 | ✅ 80 行 | 8 单元 + 2 e2e | ✅ Phase 4 + 4.1 + 赛事 |
| **device** | `/api/device` | ✅ ~450 行 | ✅ ~130 行 | 6 files / ~35 用例 | 🚧 V2 部分实现 — 佳明 + 蓝牙 + 微信运动 + 体脂秤 + COROS Terra + BLE 品牌识别 + huawei_export parser (V0.2.2) |
| **stats** | `/api/stats` | ✅ | ✅ | 25 单元（V0.2.3 cache 隔离调整） | ✅ myRunnerStats + myAnnualReport V0.1.27 + myCertificates V0.1.28 + V0.1.148 weather 4 action + V0.2.0 +weatherAnalysis +userProfile（**V0.2.3 weatherAnalysis/userProfile 接 Cache.wrap 120s**） |
| **ranking** | `/api/ranking` | ✅ | ✅ | 4 单元 | ✅ groupRankingMulti 多维榜单 |
| **recipe** | `/api/recipe` | ✅ 66 行 | ✅ 67 行 | 7 路由层 | 🚧 V2 stub — 菜谱 |
| **ludong** | `/api/ludong` | ✅ 57 行 | ✅ 45 行 | 6 路由层 | 🚧 V2 stub — 律动对接 |
| **cart** | `/api/cart` | ✅ | ✅ | 6 单元 | ✅ B 电商 V0.1.22（**V0.1.142 前端下线后端保留**） |
| **points** | `/api/points` | ✅ | ✅ | 5 单元 | ✅ B 电商 V0.1.22（**V0.1.142 前端下线后端保留**） |
| **address** | `/api/address` | ✅ | ✅ | 4 单元 | ✅ 个人中心电商版 V0.1.23（**V0.1.142 前端下线后端保留**） |
| **coupon** | `/api/coupon` | ✅ | ✅ | 5 单元 | ✅ 个人中心电商版 V0.1.23（**V0.1.142 前端下线后端保留**） |
| **distribution** | `/api/distribution` | ✅ 408 行（含 settle/clawback） | ✅ 16 行 | **17 单元** | ✅ B 分销中心 V0.1.24（**V0.1.142 前端下线后端保留**） |
| **training** | `/api/training` | ✅ | ✅ | **12 单元**（V0.2.3 cache 隔离） | ✅ pic 训练 V0.1.25 + V0.1.41 配置化 + **V0.2.3 myPlans/myActivePlan 接 Cache.wrap 120s** |
| **shoes** | `/api/shoes` | ✅ | ✅ | **21 单元**（V0.2.3 cache 隔离） | ✅ 我的跑鞋 V0.1.26 + V0.1.133 + V0.1.137 + **V0.2.3 list/myStats 接 Cache.wrap 120s** |
| **goal** | `/api/goal` | ✅ | ✅ | **20 单元**（V0.2.3 cache 隔离） | ✅ 跑步目标 V0.1.28 + V0.1.34 扩 family + V0.1.135 +4 customMilestone + **V0.2.3 list/myProgress 接 Cache.wrap 120s** |
| **favorite** | `/api/favorite` | ✅ | ✅ | **6 单元** | ✅ 收藏 V0.1.29（**V0.1.142 前端下线后端保留**） |
| **feed** | `/api/feed` | ✅ | ✅ | **10 单元** | ✅ 运动动态 V0.1.30（V0.1.136 +shoeId） |
| **notification** | `/api/notification` | ✅ | ✅ | **8 单元** | ✅ 消息中心 V0.1.31 |
| **follow** | `/api/follow` | ✅ | ✅ | **10 单元** | ✅ 关注关系 V0.1.32 |
| **family** | `/api/family` | ✅ | ✅ | **10 单元** | ✅ 家庭空间 V0.1.34 |
| **group-buy** | `/api/group-buy` | ✅ | ✅ | **8 单元** | ✅ 团购 MVP V0.1.37~38（**V0.1.142 前端下线后端保留**） |
| **review** | `/api/review` | ✅ | ✅ | **21 单元** | ✅ 评价系统 V0.1.113（V0.1.142 product-detail/review-* 前端下线，**评价 API 保留**用于 V0.1.137 鞋评等） |
| **ai-coach**（**V0.1.139 第 32 个**） | `/api/ai-coach` | ✅ ai-coach.service + context-builder + providers/{stub,glm,types} | ✅ ai-coach.schema | **35 单元** | ✅ AI 私教 V0.1.139 MVP + V0.1.140 4 人设 + V0.1.142 tab 化 + V0.1.148 UI 优化 |
| **food**（**V0.2.0 第 33 个**） | `/api/food` | ✅ food.service + client.ts（FatSecret OAuth2） | ✅ food.schema | **22 单元** | ✅ 饮食搜索 V0.2.0 — 5 action（search/nutrition/record/myMeals/removeMeal）+ Meal.items 宏量升级 + FoodCache 1h TTL |
| **ocr**（**V0.2.1 第 34 个**） | `/api/ocr` | ✅ ocr.service + ocr.client.ts（腾讯云 SDK 单例） | ✅ ocr.schema | **18 单元** | ✅ OCR V0.2.1 — 3 action（generalBasic/generalAccurate/idCard）+ 复用 COS KEY + 替 V0.1.151 手写 TC3 |

### 数据库表（59 张，V0.1.150 +UploadRecord #59；V0.1.144~147 +DailyReport #58；V0.1.139 +ConversationTurn #57；V0.1.134 +RaceResult #56；V0.1.43 +WeRunRecord/HeartRateRecord/SpO2Record/SleepRecord；V0.1.42 +Group.announce；V0.1.41 +TrainingPlan+UserPlanEnrollment；V0.1.40 +User 5 profile 字段；V0.1.37 +GroupBuy+GroupBuyMember；V0.1.34 +Family+FamilyMember + Goal.familyId；V0.1.32 +Follow；V0.1.31 +Notification；V0.1.30 +Feed+FeedLike+FeedComment；V0.1.29 +Favorite；V0.1.28 +Goal；V0.1.26 +Shoe + Checkin.shoeId）

| # | 表名 | Module | V1/V2 | 引入版本 |
|---|--- |--- |--- |--- |
| 1 | User | user | V1 | （+累计 21 relation 字段：inviteCode/distributorLevel V0.1.24；shoes V0.1.26；goals V0.1.28；favorites V0.1.29；feeds/feedLikes/feedComments V0.1.30；notifications/notifActions V0.1.31；following/followers V0.1.32；familiesOwned/familyMember V0.1.34；5 profile V0.1.40；onboardingDone V0.1.43；phone/email/passwordHash/username V0.1.129；customMilestones V0.1.135；aiCoachPersona V0.1.140） |
| 2 | Checkin | sport | V1 | （+dataSource/garminActivityId/sportType V0.1.25；+shoeId? V0.1.26；+V0.1.34 family 复用；+weatherTemp/humidity/aqi/lat/lon V0.2.0） |
| 3 | Group / GroupMember | sport | V1 | （V0.1.42 Group +announce） |
| 4 | Product | mall | V1 | |
| 5 | Order / OrderItem | mall | V1 | （V0.1.24 +分销字段；V0.1.38 +groupBuyId；V0.1.119 +contentType/contentId 赛事） |
| 6 | PointsRecord | wallet | V1 | |
| 7 | Wallet / WalletTransaction | wallet | V1 | （V0.1.24 +commission） |
| 8 | Content / Enrollment | content | V1 | （V0.1.119 +orderId 回调关联；V0.1.134 +raceResult relation） |
| 9 | AppConfig | app-config | V1 | |
| 10 | GroupReport | weekly-report | V1 | |
| 11 | AuditLog | admin | V1 | V0.1.18 |
| 12 | DeviceBinding | device | V2 | V0.1.25 +vendor; V0.1.33 扩 |
| 13 | RawActivity | device | V2 | 佳明 |
| 14 | GarminSleep | device | V2 | |
| 15 | GarminMetric | device | V2 | |
| 16 | GarminFitnessAge | device | V2 | |
| 17 | Recipe | recipe | V2 stub | |
| 18 | FoodCache | recipe V0.2.0 启用 / food | V2→V1 | V0.2.0 food module 启用 + 1h TTL |
| 19 | Meal | recipe V0.2.0 启用 / food | V2→V1 | V0.2.0 food module 启用 + items 宏量字段升级 |
| 20 | IdMapping | ludong | V2 stub | |
| 21 | SyncOutbox | ludong | V2 stub | |
| 22 | InboundEvent | ludong | V2 stub | |
| 23 | **Cart** | cart | V1 | V0.1.22 |
| 24 | **SigninRecord** | points | V1 | V0.1.22 |
| 25 | **Address** | address | V1 | V0.1.23 |
| 26 | **Coupon** | coupon | V1 | V0.1.23 |
| 27 | **DistributionOrder** | distribution | V1 | V0.1.24 |
| 28 | **Team** | distribution | V1 | V0.1.24 |
| 29 | **CommissionLog** | distribution | V1 | V0.1.24 |
| 30 | Blacklist | admin | V1 | V0.1.18 |
| 31-34 | (占位) | | | |
| 35 | **Goal** | goal | V1 | V0.1.28 + V0.1.34 familyId |
| 36 | **Favorite** | favorite | V1 | V0.1.29 |
| 37 | **Feed** | feed | V1 | V0.1.30 + V0.1.36 +topic/videoUrl + V0.1.136 +shoeId |
| 38 | **FeedLike** | feed | V1 | V0.1.30 |
| 39 | **FeedComment** | feed | V1 | V0.1.30 |
| 40 | **Notification** | notification | V1 | V0.1.31 |
| 41 | **Follow** | follow | V1 | V0.1.32 |
| 42 | **Family** | family | V1 | V0.1.34 |
| 43 | **FamilyMember** | family | V1 | V0.1.34 |
| 44 | **GroupBuy** | group-buy | V1 | V0.1.37 |
| 45 | **GroupBuyMember** | group-buy | V1 | V0.1.37 |
| 46 | **TrainingPlan** | training | V1 | V0.1.41 |
| 47 | **UserPlanEnrollment** | training | V1 | V0.1.41 |
| 48 | **WeRunRecord** | device | V1 | V0.1.43 |
| 49 | **HeartRateRecord** | device | V1 | V0.1.43 |
| 50 | **SpO2Record** | device | V1 | V0.1.43 |
| 51 | **SleepRecord** | device | V1 | V0.1.43 |
| 52 | **Review** | review | V1 | V0.1.113 + V0.1.118 replyContent/repliedAt 字段 + V0.1.137 targetType='shoe' |
| 53 | **WithdrawalRequest** | distribution | V1 | V0.1.106 |
| 54 | **BodyCompositionRecord** | device | V1 | V0.1.127 |
| 55 | **CorosRawEvent** | device | V1 | V0.1.128 |
| 56 | **RaceResult** | content | V1 | V0.1.134 |
| 57 | **ConversationTurn** | ai-coach | V1 | **V0.1.139 AI 私教多轮记忆** — userId/conversationId/role/content/createdAt；index[userId,conversationId,createdAt]；onDelete Cascade |
| 58 | **DailyReport** | ai-coach | V1 | **V0.1.144~147 AI 健康简报** — userId/date(YYYY-MM-DD)/healthScore(0-100)/reportText(AI 解读)/alertText?/steps/restingHr?/sleepHours?/createdAt；`@@unique([userId,date])` 防重；index[userId,date]；onDelete Cascade |
| 59 | **UploadRecord** | upload | V1 | **V0.1.150 COS 中转 + 异步解析留底** — userId/type/cosUrl/objectKey/mime/size/status(pending\|parsing\|parsed\|failed)/password?/parsedResult?/errorMsg?/createdAt；index[userId,createdAt]+[status]；onDelete Cascade |

> 💡 **Prisma 迁移历史**（**43 个**，init #10 实测；init #8 声明 45 是误）：init→wallet_tx→qmwx→auditlog→garmin×3→cart→address→distribution→shoe→goal→favorite→feed→notification→follow→family→feed_topic_video→group_buy→order_groupbuy→user_profile_fields→training_plan→group_announce→werun_record→hr_spo2_record→sleep_record→onboarding→withdrawal_request→order_pickup→review→review_reply→order_content_enroll→body_composition→coros_raw_event→user_auth_fields→**race_result(V0.1.134)**→**user_custom_milestones(V0.1.135)**→**feed_shoe_id(V0.1.136)**→**ai_coach(V0.1.139)**→**ai_coach_persona(V0.1.140)**→**daily_report(V0.1.144~147)**→**upload_record(V0.1.150)**→**checkin_weather_geo(V0.2.0)**

---

## 📦 依赖

- **运行时**：`fastify@4` `@fastify/cors` `@fastify/helmet` `@fastify/jwt` `@fastify/multipart` `@fastify/rate-limit` `@fastify/static` `@prisma/client` `ioredis` `bullmq` `zod` `dotenv` `pino-pretty` `cos-nodejs-sdk-v5`（V0.1.149）`tencentcloud-sdk-nodejs-ocr`（V0.2.1）`fast-xml-parser`（V0.1.151）`fit-file-parser`（V0.1.128）
- **开发**：`tsx` `vitest` `@vitest/coverage-v8` `prisma` `supertest` `typescript`
- **共享**：`@qm-wx/shared`（workspace 协议）

---

## 🧪 测试

```bash
# 单元测试（vi.mock，不连 DB）— **1035 it() occurrences**（init #12 Grep 实测；声明 1042 V0.2.3 沿用）
pnpm test

# 端到端（真 PG/Redis）— 54 用例 / 11 files
RUN_E2E=1 pnpm test

# 覆盖率
pnpm test:coverage                 # v8 provider → html/lcov；**V0.2.3 funcs 86.39%**（声明沿用；> 86 阈值）
```

**测试策略**：
- **单元测试**（`tests/modules/*.test.ts`）：vi.mock Prisma/Redis
- **域测试**（`tests/domain/*.test.ts`）：纯函数 + 状态机白名单
- **E2E 测试**（`tests/e2e/*.e2e.test.ts`）：用 `buildApp()` + supertest inject
- **`RUN_E2E=1`** 环境变量控制 e2e 启停
- **`tests/helpers/{mockErrors,mockPrisma}.ts`**（方案 B 引入）：统一 mock 工厂
- **V0.2.3 cache 隔离范式**（新增）：接 Cache.wrap 的 service 测试必加 `vi.mock('../../infra/redis.js')` + `beforeEach(() => cacheStore.clear())` 防 cacheStore 跨用例串扰

**测试覆盖审查**：stats.service 覆盖率 39→**100%**（V0.1.29）；全局 funcs V0.2.3 声明 86.39% > 86 阈值（V0.2.3 +0.76pp）。

**关键设计模式**：
- `buildApp()`（`app.ts`）：抽离装配逻辑
- `parseOrBadRequest`（`common/helpers/parse.ts`，V0.1.24）：新 module 统一 Zod 解析
- `ensureWalletInTx`（`wallet.repo.ts`）：事务内复用入口
- `Cache.wrap`（`infra/cache.ts`，V0.1.x）：**23 热路径**（V0.2.3 +8：stats.weatherAnalysis/userProfile + goal.list/myProgress + shoes.list/myStats + training.myPlans/myActivePlan）统一缓存抽象
- `incrementShoeKm`（`shoes.service.ts` V0.1.26）
- `myAnnualReport`（`stats.service` V0.1.27）
- `calcGoalProgress`（`goal.service` V0.1.28 + V0.1.34 扩 userIds）
- `myCertificates`（`stats.service` V0.1.28）
- `favorite.list 批量关联`（`favorite.service` V0.1.29）
- `feed $transaction 回调`（`feed.service` V0.1.30）
- `vi.hoisted + createPrismaMock`（V0.1.30）
- `notify()` 集成函数（`notification.service` V0.1.31）
- `@relation("name")` 消歧义（V0.1.31/32/34）
- `matchBleVendor + 0x180A 二次验证 + 手选兜底`（V0.1.33）
- `readCharValue` GATT 工具（`utils/ble.ts` V0.1.33）
- `calcGoalProgress userIds`（V0.1.34）
- `syncWeRun session_key AES-128-CBC 解密`（`device.service` V0.1.43）
- `submitHeartRate 5s 批量`（`device.health.ts` V0.1.43）
- `hasHr + retry3 + 去 services 过滤`（V0.1.43）
- **`LLMProvider 抽象 + Stub/GLM 双轨`**（`ai-coach/providers/`，V0.1.139）
- **`asciiFrame SSE 中文转义`**（`ai-coach.service`，V0.1.139）
- **`reply.hijack Fastify 4 流式`**（`ai-coach.service`，V0.1.139）
- **`4 人设 DRY + PERSONA_PROMPTS`**（`ai-coach/context-builder`，V0.1.140）
- **`Redis 限流 30/分/用户`**（`ai-coach.service`，V0.1.140）
- **`weather 4 action`**（`stats.service`，V0.1.148 coord 补 — realtime/forecast/air/sunrise，QWEATHER_API_KEY）
- **`V0.2.3 Cache 范式`**（commit `0198f2f` / `41ab4c3` / `b0cecfd` / `b3e761b`）：抽 compute* 内部纯函数 + service 层包 Cache.wrap + 测试加 redis mock + `beforeEach(() => cacheStore.clear())` 防缓存串扰；**training.myPlans cacheKey 不含 userId**（全 user 共享 active 计划模板，admin 维护）

---

## 🐳 Docker

```bash
# 构建
docker build -t qm-wx-server .

# 运行（通过 docker compose）
docker compose --profile prod up -d --build

# 或独立运行
docker run -p 3000:3000 --env-file .env qm-wx-server
```

镜像启动时会自动 `prisma migrate deploy`（Dockerfile CMD）。

---

## 📌 当前状态

- ✅ Fastify 启动 + 优雅关闭（SIGINT/SIGTERM）
- ✅ **34** 个 module 路由（含 V0.2.0 food 第 33 + V0.2.1 ocr 第 34；30 个有 service 实现 + 2 V2 stub + device 部分实现 + ai-coach V0.1.139）
- ✅ **23 个 Cache.wrap 热路径**（V0.2.3 +8：stats.weatherAnalysis/userProfile + goal.list/myProgress + shoes.list/myStats + training.myPlans/myActivePlan；含 mall×3 / user / sport×3 / content×2 / weekly-report / 佳明×4 / device.myTodayHealth / stats.myCertificates / aiCoach contextBuilder/loadHistory）
- ✅ JWT 鉴权 + 功能开关中间件 + 公开端点（content/mall/wxpay）
- ✅ 微信 code2Session（session_key 缓存 Redis）
- ✅ Prisma **59** 张表 + **43** 个迁移（init #10 实测；init #8 声明 45 是误）
- ✅ **Domain 层**：order-state 状态机
- ✅ **BullMQ jobs 7 个**：周报 + 超时关单 + 微信平台证书刷新 + garmin-import + ludong-sync stub + upload-parse（V0.1.150）
- ✅ **Wallet repo**：ensureWallet / ensureWalletInTx
- ✅ **CLI 2 个**：reconcile + import-garmin
- ✅ Dockerfile 多阶段构建
- ✅ **1035 单元测试（it() occurrences 实测；声明 1042）** + 54 e2e / **V0.2.3 funcs 86.39% > 86 阈值**（声明沿用，未实跑）
- ✅ CI/CD（GitHub Actions ci.yml + deploy-staging.yml）
- ✅ **wxpay** refund + notify + 幂等 + 关单保护全链路
- ✅ **OpenAPI 3.1 spec**：`/openapi.json` + `openapi.e2e` CI gate
- ✅ **34 个 module 级 CLAUDE.md**（V0.2.2 init #11 GAP-12 100% 关闭，含 V0.2.3 4 个 module 补 V0.2.3 段）
- ✅ **V0.2.3**：stats/goal/shoes/training 4 个 module 8 个接口接 Cache.wrap 120s
- ✅ **V0.2.1**：ocr module 第 34 个（腾讯云官方 SDK 替手写 TC3）
- ✅ **V0.2.0**：food module 第 33 个（FatSecret OAuth2）+ stats 阶段 2/3 收官（weatherAnalysis + userProfile）+ Checkin +5 字段
- ✅ **V0.1.150/151**：UploadRecord 表 #59 + 上传 COS 异步解析 pipeline（6 解析器 + BullMQ worker）
- ✅ **V0.1.149**：腾讯云 COS 集成（混合模式 fallback + CDN）
- ✅ **V0.1.148**：品牌色 #0FAF8E→#2D9D78 + AI 私教 UI 全面优化 + weather 4 action
- ✅ **V0.1.144~147**：AI 健康助手化（DailyReport #58）+ Vant 美化 + MQTT polyfill
- ✅ **V0.1.142**：删商城前端 16 页（后端 module 保留待复用）+ AI 私教 tab 化
- ✅ **V0.1.139~141**：AI 私教 MVP + 4 人设 + 速度优化
- ✅ **V0.1.113~137**：评价系统 + 赛事服务 MVP + 跑鞋增强 2 期 + 收藏/动态/消息/关注/家庭/团购
- ✅ **Phase 4.1**：wxpay（V3 完整闭环）
- ✅ **B 电商三连击**（V0.1.22~24）
- ✅ **V0.1.43**：微信运动 + 小米 OAuth + 健康持久化 + onboarding 4 步式
- ✅ **V0.1.26~42**：跑鞋/目标/收藏/动态/消息/关注/家庭/团购/跑群深化/训练计划配置化/profile 完整

---

🤙 `pnpm dev` 起来看见 `/health: ok` 就是活着的。**V0.2.3 init #12 已完成**（4 module Cache 接入 perf 优化收官）：**34 module / 59 表 / 43 迁移 / 20 页 / 10 组件 / 34 module CLAUDE.md 100% 覆盖 / 1035 单元 it() occurrences（声明 1042）/ funcs 86.39%（声明沿用，未实跑）/ 23 热路径**；V0.2.3 4 commit perf（commit `0198f2f` / `41ab4c3` / `b0cecfd` / `b3e761b`）— 统一范式「抽 compute* 内部函数 + service 层 Cache.wrap + 测试加 redis mock + `beforeEach(() => cacheStore.clear())` 防缓存串扰」；下一步：huawei 真实样本回归 + diet/insight 真机验证 + wxpay 真生产切流 + AI 私教 voice 插件。
