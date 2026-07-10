# apps/server — 后端服务

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../CLAUDE.md) → **apps/server/**（这里）
> 架构依据：[docs/ARCHITECTURE-V2.md](../../docs/ARCHITECTURE-V2.md)
>
> ## 📋 变更记录 (Changelog)
>
> - **2026-07-10** — 🎯 **V0.1.113 评价系统（电商闭环最后一块）**：+Review 表（#52，`@@unique([userId,productId,orderId])` 防重 + onDelete Cascade）+ review module（**第 31 个**，5 action：create/list/stats/myReviews/remove）+ Product/User/Order +reviews relation + app.ts 注册；create 5 校验链（订单存在/属于用户/已支付/商品在订单/防重）；productStats groupBy rating 分布缺星补 0；+21 单测（service 14 + routes 7）；**30→31 module / 51→52 表 / 755→776 passed / 全局 86.64%**
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

> ✅ **已 commit + 推 GitHub origin**（V0.1.100 commit `a21de50`，main 分支已推 changzhi777/QM-WX 私有；ct400 Gitea 保留不同步保留 V0.1.43 tag；V0.1.24~42 全部 commit + 推 CT400，main 推到 bc34aff，v0.1.40/41/42 tag 已推；生产部署 V0.1.42）。以下为 V0.1.24~42 历史改动描述（保留备查）：V0.1.24 = distribution 三表 + 5 新 module（cart/points/address/coupon/distribution）+ 7 表迁移 + 分销全闭环集成（mall.createOrder / wxpay.notify.settle / refund.clawback）+ User +inviteCode/distributorLevel + Order +sourceUserId + common/helpers/parse.ts；V0.1.25 = pic 3 页 + **training module**（myPlans/mySportRecords）+ device 扩 5 action（myTodayHealth/myBindings/bindBleDevice/unbind/submitHeartRate）+ utils/ble.ts（蓝牙 BLE）+ **零 schema 改动**（vendor=ble 复用 DeviceBinding）；V0.1.26 = 新表 Shoe（#34）+ Checkin +shoeId（外键 ON DELETE SET NULL）+ User +shoes relation + shoes module（5 action）+ sport.checkin 集成 incrementShoeKm（shoeId 空跳过，向后兼容）+ 迁移 20260703140000_shoe；V0.1.27 = 零 schema 改：stats 加 myAnnualReport action（年汇总+月度分布+最长单次+活跃天数，单次 groupBy 性能优化）+ 前端 sport 打卡加跑鞋 picker（联动 incrementShoeKm → 跑鞋里程闭环）+ 前端 device-bind 加调试面板（操作日志+心率回调计数，可观测性，后端无改动）；V0.1.28 = 新表 Goal（#35）+ User +goals relation + goal module（4 action：list/add/remove/myProgress，calcGoalProgress 复用 Checkin aggregate DRY）+ stats 加 myCertificates action（动态生成零建表：里程碑证书 100/500/1000/3000km + 赛事证书 marathon + 下一里程碑进度，Cache 120s）+ 迁移 20260703150000_goal + goal +7 单测；V0.1.29 = 新表 Favorite（#36，userId + targetType(content|product) + targetId + unique 防重 + 索引 [userId, targetType]）+ User +favorites relation + favorite module（4 action：list 含详情**批量关联避免 N+1**/add upsert 幂等/remove/isFavorited 批量红心）+ 迁移 20260703160000_favorite + favorite +6 单测 + stats.service 补单测（myAnnualReport/myCertificates 覆盖 39→100%）；总覆盖 80.66→82.11%；**V0.1.30 = 3 新表 Feed+FeedLike+FeedComment（#37-39，迁移 20260703170000_feed，onDelete Cascade 删动态级联点赞/评论；Feed 索引 [createdAt]+[userId,createdAt]；FeedLike `@@unique([feedId,userId])` 防重；FeedComment 索引 [feedId,createdAt]）+ User 加 feeds/feedLikes/feedComments relation + feed module（6 action：list 含作者+liked 状态 / myFeeds / publish 可关联 checkinId+distanceKm / like / unlike / comment，$transaction 回调维护 likeCount/commentCount）+ 迁移 20260703170000_feed + feed +10 单测（list 2 + publish 1 + like 3 + unlike 2 + comment 2）；vi.hoisted 修复 createPrismaMock hoisting 坑**；**V0.1.31 = 新表 Notification（#40，userId/actorId/type(like|comment|follow|system)/targetType?/targetId?/content?/isRead 默认 false/createdAt，索引 [userId,isRead,createdAt]+[userId,createdAt]，onDelete CASCADE(user)+RESTRICT(actor)，User 加 notifications/notifActions(@relation("NotifActor")) 双 relation，迁移 20260703180000_notification）+ notification module（4 action：list 含 actor 头像/昵称 + 分页 / unreadCount 红点轻量 count / markRead 鉴权仅本人（n.userId !== userId → forbidden）/ markAllRead updateMany 幂等）+ **导出 `notify()` 集成函数**（DRY，被 feed 复用，`if (userId === actorId) return` 自己赞自己跳过，不在内部 try/catch — 调用方决定容错）+ feed.service 集成（like/comment 事务后 `try { await notify(...) } catch {}` 吞错，通知写库失败不阻塞主链路；comment content 50 字截断作摘要；type=like/comment，targetType=feed）+ notification +8 单测（list 2 含 hasMore + unreadCount 1 + markRead 2 含 forbidden + markAllRead 1 + notify 2 含自己跳过）+ feed.service.test 重构 mock（加 `vi.mock('src/modules/notification/notification.service.js', () => ({ notify: vi.fn() }))` 隔离 + 断言集成调用，替代原 try/catch 吞 TypeError 碰巧通过的脆弱写法）+ 前端 pages/notification（列表卡 actor 头像+昵称+文案+内容摘要+时间+未读红点 + 全部已读按钮 + 点击乐观标记已读 + 跳 feed + onReachBottom 分页 + 下拉刷新）+ mine 入口带未读徽标**；**V0.1.32 = 新表 Follow（#41，followerId/followeeId/createdAt，`@@unique([followerId,followeeId])` 防重 + 索引 [followerId]+[followeeId] + onDelete CASCADE 任一用户删级联，User 加 following(@relation("Follower"))+followers(@relation("Followee")) 双 relation — **坑：同 model 双 relation 必须 @relation("name") 消歧义，否则 prisma generate 报 P1012 Ambiguous relation**（范式同 V0.1.31 NotifActor），迁移 20260703190000_follow）+ follow module（6 action：follow upsert 幂等 + 不能关注自己 badRequest + 复用 notify(type=follow) try/catch 吞错 / unfollow deleteMany 幂等 / isFollowing 批量查按钮状态 Set 拼装 / myFollowing 分页含 user / myFollowers 分页含 user / myCounts 一次拿全 user+followingCount+followerCount+isFollowing+isSelf 用户主页用 — 复用 V0.1.31 notify 集成函数 type=follow 是第 3 个 type 继 like/comment 之后）+ 前端 pages/user（用户主页：头像+昵称+关注数/粉丝数+关注按钮**乐观更新**失败回滚 + isSelf 自己不显示按钮；调 follow.myCounts 一次拿全 / follow.follow / follow.unfollow）+ feed wxml feed-head 加 data-uid + bindtap onTapUser 跳用户主页（关注闭环入口）+ follow +10 单测（follow 3 含自己/notFound/通知 + unfollow 1 + isFollowing 1 + myFollowing 1 + myFollowers 1 + myCounts 3 含 isSelf/notFound）+ mock notify 隔离范式（vi.mock notification.service.js → notify: vi.fn()，同 feed.test.ts V0.1.31 范式）+ 🐛 training wxss 中文 selector 修复（原 `.plan-card.入门/进阶/挑战/极限` 4 个中文 class selector 编译报 `unexpected � at pos 1725`，wxss 编译器对中文 selector 解析失败 → 分离 levelKey 英文 beginner/intermediate/challenge/extreme 作 class + level 中文显示，前端 LEVEL_KEY_MAP 映射；全 miniprogram wxss 扫描确认无中文 selector 残留）**；**V0.1.33 = BLE 设备品牌识别（零 schema 改 / 方案1 MVP）：① shared device-brands.ts 改 `xiaomi` available false→**true**（小米手环可绑定）+ garmin.desc 加"BLE 实时心率 + OAuth 历史" + 新增 `BLE_VENDOR_PATTERNS: Record<string, RegExp[]>`（garmin: /garmin|forerunner|fenix|vivoactive|edge/i；xiaomi: /mi\s*band|xiaomi|小米|redmi/i）+ 新增 `matchBleVendor(name): 'garmin' | 'xiaomi' | 'ble'` 函数（按设备名匹配，未中返 'ble'）+ `BleVendor` type（**前后端单一数据源**）；② device.schema.ts `BindBleDeviceInputSchema` 加 `vendor: z.enum(['ble','garmin','xiaomi']).default('ble')` + `brandMeta: {manufacturer?, model?}.optional()`（透传不持久化）；③ device.service.ts `bindBleDevice` 接受 vendor 按 `[userId, vendor]` upsert（**可同时绑多设备：garmin+xiaomi+ble 共存**，**service 层兜底 `input.vendor ?? 'ble'`** — route Zod default 不覆盖 service 直接调用，如测试）+ `myBindings` 加 `garminBleBound: boolean`（DeviceBinding vendor=garmin 存在）+ 保留 garminAutoConnected/garminActivityCount（OAuth 数据）→ **BLE 绑定优先，OAuth 降级**；deviceName 逻辑扩 garmin/xiaomi（accessTokenEnc 存设备名）；④ 前端 utils/ble.ts 新增 `readBattery(deviceId): Promise<number | null>`（0x180F / 2A19 电量百分比）+ `readDeviceInfo(deviceId): Promise<{manufacturer, model}>`（0x180A：2A29 Manufacturer Name + 2A24 Model Number）+ `readCharValue` 通用工具（微信 `readBLECharacteristicValue` 值通过 `onBLECharacteristicValueChange` 回调拿，success 不返 value → 临时监听 + serviceId/characteristicId 过滤 + 超时返 null 容错）；⑤ 前端 device-bind 页改造（扫描结果 matchBleVendor 自动识别 + 品牌标签佳明蓝 .brand-garmin / 小米橙 .brand-xiaomi / 通用灰 .brand-ble；`onSelectDevice` 流程 connect → Promise.all([readBattery, readDeviceInfo]) → 品牌识别（设备名 + 0x180A Manufacturer 二次验证）→ 未识别 wx.showActionSheet 手选兜底（佳明/小米/通用）→ subscribeHeartRate → bindBleDevice 传 vendor+brandMeta；心率卡显示电量/型号/厂商 hr-meta-item；garmin OAuth 降级段 `garminAutoConnected && !garminBleBound` 时显示"历史数据已连接（OAuth）"提示可 BLE 绑定；`onTapBrand` ble/garmin/xiaomi 都走 BLE 扫描）；⑥ **3 坑沉淀**（service 层 vendor 兜底 `?? 'ble'` / `wx.readBLECharacteristicValue` 值不在 success 回调（微信文档规定值通过 `onBLECharacteristicValueChange` 回调拿；与 subscribeHeartRate 全局监听共存，按 serviceId 过滤互不干扰）/ 小程序 TS 类型 3 坑：TextDecoder 非 DOM lib 不可用（用 fromCharCode，Manufacturer Name/Model 规范 ASCII 够用）、`offBLECharacteristicValueChange` 类型签名 `()` 不接受参数（运行时支持 cb，@ts-ignore 绕过）、`OnBLECharacteristicValueChangeCallbackResult` 类型不存在（用结构类型 `{serviceId, characteristicId, value}` + @ts-ignore））；⑦ 测试 device.bindings.test.ts 重构 mock（deviceBinding 加 findUnique）+ **3 新测试**（garmin BLE 优先 myBindings + bindBleDevice vendor=garmin + vendor=xiaomi）；**527→530 passed / 0 failed**；41 表 / 28 module / 33 页 / 16 迁移（均不变，零 schema 改）**；**V0.1.34 = 家庭空间 family（pic 2776 家庭方向，/zcf:workflow 方案1 完整 family module）：① **2 新表**（迁移 `20260704000000_family`，表 41→43）：**Family #42**（id / name / ownerId / inviteCode(@unique 8 位 hex 短码，randomUUID slice 8 + toUpperCase) / createdAt；owner User `@relation("FamilyOwner")`；members FamilyMember[]；goals Goal[]）+ **FamilyMember #43**（familyId / `userId @unique`（**一人一家庭强制**）/ role(owner|member, 默认 member) / joinedAt；onDelete Cascade（Family 删→成员级联，User 删→成员级联）；family Family @relation + user User @relation）；② **Goal 表改**（不新表）：+`familyId String?`（null=个人目标，有值=家庭目标）+ 外键 onDelete Cascade + 索引 [familyId]；迁移数 16→17；③ **User 加双 relation**：`familiesOwned Family[] @relation("FamilyOwner")`（创建的家庭）+ `familyMember FamilyMember?`（1:1，一人一家庭）— **坑：User 双 Family relation 必须 @relation("FamilyOwner") 消歧义，范式累计第 3 次**（NotifActor V0.1.31 / Follower V0.1.32 / FamilyOwner V0.1.34）；④ **新 module family**（28→29，6 action）：`createFamily(userId, {name})` 事务内建 Family(ownerId) + FamilyMember(role=owner) + 8 位 inviteCode；已有家庭 → conflict；`joinFamily(userId, {inviteCode})` 按 inviteCode 查 Family → notFound 兜底；已有家庭 → conflict；加 FamilyMember(role=member)；`myFamily(userId)` 家庭卡 + 成员列表含**本月跑量**（Checkin aggregate by member）；无家庭返 family:null；`leaveFamily(userId)` owner 不可离开（badRequest，需转让/解散）；member 删 FamilyMember；`familyRanking(userId, {period: week|month})` 本周/本月 CN 时区（cnWeekRange/cnMonthRange）成员跑量榜按距离降序；`inviteInfo(userId)` 返 family.name + inviteCode（前端分享/复制）；⑤ **goal module 扩展**（复用 Goal，DRY）：`calcGoalProgress` 改 `userIds: string[]` 参数（个人=[userId]，家庭=成员 userIds 列表，`where userId: { in: userIds }`）；`list` / `myProgress` 加 `familyId: null` 过滤（仅个人目标）；`addFamilyGoal(userId, {familyId, type, targetDistance, title?})` 鉴权 member.familyId 必须匹配 input.familyId（forbidden）；goal.create(familyId, userId=创建者)；`myFamilyGoals(userId)` 查 myFamilyId → Goal where familyId + 成员 userIds → 进度按家庭成员聚合；⑥ **前端 pages/family**（页面 33→34）：家庭卡（name+inviteCode+成员数）+ 邀请按钮（复制 inviteCode）+ 本月跑量榜（rank-num+avatar+nickname+家长标+monthDistance）+ 家庭目标进度条 + 创建/加入（无家庭态）+ 添加家庭目标弹层（月度/年度 picker + title + targetDistance）+ leaveFamily 按钮（非 owner）；mine 入口「家庭空间」（19→20 宫格）；⑦ **测试**：family +10 单测（createFamily 2 + joinFamily 2 + myFamily 2 + leaveFamily 2 + familyRanking 1 + inviteInfo 1，**mockImplementation 按 userId 区分**并发 aggregate）；goal +5（addFamilyGoal 3 含 forbidden + myFamilyGoals 2 含 where userId in 断言）；总测试 530→**545 passed / 0 failed**；⑧ **3 决策**：方案 2（A 家庭组 + B 跑量榜 + C 家庭目标）/ 一人一家庭（FamilyMember.userId @@unique）/ 复用 Goal+familyId（calcGoalProgress 扩 userIds，DRY）；⑨ **3 坑沉淀**：① Prisma User 双 Family relation（familiesOwned `@relation("FamilyOwner")` + familyMember 1:1）需 @relation 命名消歧义（范式累计第 3 次）；② inviteCode 8 位 hex 短码（randomUUID slice 8 + toUpperCase）@unique 兜底，极小概率重复时报错让用户重试（YAGNI，不加重试）；③ familyRanking Promise.all 并发 aggregate：mockResolvedValueOnce 顺序不保证 → mockImplementation 按 userId 区分（并发 mock 测试范式）；**43 表 / 29 module / 34 页 / 17 迁移 / 545 单元 / 15 缓存热路径（family 暂未接 Cache，持平）**

> 最新进展：**V0.1.42 跑群深化 + 训练计划配置化 + setErrorHandler 修（V0.1.40~42）** — **45 表 / 30 module / 38 页 / 577 单元 / 19 迁移**（V0.1.100 实际为 51 表 / 30 module / 42 页 / 580 单元 / 27 迁移，见 Changelog）；V0.1.40 profile 完整（User +5 字段 gender/birthday/region/height/weight）；V0.1.41 TrainingPlan+UserPlanEnrollment 表 + training +3 action（joinPlan/myActivePlan/leavePlan）+ admin +2 + myPlans 改读 DB + calcPlanProgress；V0.1.42 Group +announce + sport +3 action（groupDetail/groupMembers/announceGroup）；修 setErrorHandler 时机（Fastify 4 route 前注册，修 401/403/404 返默认格式 bug）；CT400 推 v0.1.40/41/42 tag + 生产部署 V0.1.42 — **V0.1.34 家庭空间 family**（2026-07-04，pic 2776 家庭方向，/zcf:workflow 方案1 完整 family module）— **2 新表 Family #42 + FamilyMember #43**（迁移 `20260704000000_family`，FamilyMember.userId `@unique` 强制一人一家庭，onDelete Cascade）+ **Goal 表 +familyId**（null=个人目标，有值=家庭目标，onDelete Cascade）+ **User 加双 relation**：familiesOwned（`@relation("FamilyOwner")`，创建的家庭）+ familyMember（1:1）+ **新 module family**（28→29，6 action：createFamily/joinFamily/myFamily/leaveFamily/familyRanking/inviteInfo，8 位 inviteCode hex 短码 randomUUID slice 8 + toUpperCase）+ **goal module 扩展**（calcGoalProgress 改 `userIds: string[]` 参数，DRY 复用 — 个人=[userId]/家庭=成员 userIds；list/myProgress 加 familyId:null 过滤；+addFamilyGoal/myFamilyGoals 2 新 action）；前端 pages/family（家庭卡+邀请复制+本月跑量榜+家庭目标+创建/加入+添加目标弹层）；**3 决策**（方案2 A 家庭组+B 跑量榜+C 家庭目标 / 一人一家庭 @@unique / 复用 Goal+familyId DRY）；**3 坑沉淀**（User 双 Family relation 必须 @relation("FamilyOwner") 消歧义，范式累计第 3 次：NotifActor V0.1.31 / Follower V0.1.32 / FamilyOwner V0.1.34 / inviteCode 8 位 @unique 兜底极小概率重复报错让用户重试 YAGNI / familyRanking Promise.all 并发 aggregate mockResolvedValueOnce 顺序不保证 → mockImplementation 按 userId 区分）；测试 530→**545**（family +10：createFamily 2 + joinFamily 2 + myFamily 2 + leaveFamily 2 + familyRanking 1 + inviteInfo 1；goal +5：addFamilyGoal 3 含 forbidden + myFamilyGoals 2 含 where userId in 断言）；**43 表 / 29 module / 34 页 / 17 迁移** — **V0.1.33 BLE 设备品牌识别**（2026-07-03，/zcf:workflow 方案1 MVP，**零 schema 改**：复用 DeviceBinding.accessTokenEnc 存设备名 + brandMeta 透传不持久化；shared device-brands `xiaomi` available true→开放 + garmin desc 加"BLE 实时心率 + OAuth 历史" + 新增 `BLE_VENDOR_PATTERNS` + `matchBleVendor(name)` 函数 + `BleVendor` type（前后端单一数据源）；device.schema `BindBleDeviceInputSchema` 加 `vendor` enum + `brandMeta` optional；device.service `bindBleDevice` 接 vendor 按 `[userId, vendor]` upsert（可同时绑多设备 garmin+xiaomi+ble 共存，**service 层兜底 `input.vendor ?? 'ble'`**）+ `myBindings` 加 `garminBleBound: boolean`（**BLE 绑定优先，OAuth 降级**）；前端 utils/ble.ts 加 `readBattery`（0x180F / 2A19）+ `readDeviceInfo`（0x180A：2A29 Manufacturer + 2A24 Model）+ `readCharValue` 通用 GATT 读取工具（微信 `readBLECharacteristicValue` 值在 `onBLECharacteristicValueChange` 回调，非 success）；前端 device-bind 页改造（matchBleVendor 自动识别 + 品牌标签 + onSelectDevice 流程 connect → Promise.all([readBattery, readDeviceInfo]) → 0x180A Manufacturer 二次验证 → 未识别 wx.showActionSheet 手选兜底 + 心率卡电量/型号/厂商 + garmin OAuth 降级段）；**3 坑沉淀**（service 层 vendor 兜底 / wx.readBLE 值在回调非 success / 小程序 TS 类型 3 坑：TextDecoder 非 DOM lib / offBLECharacteristicValueChange 签名不接受参数 / OnBLECharacteristicValueChangeCallbackResult 类型不存在）；**41 表 / 28 module / 33 页 / 530 单元 / 16 迁移（均不变，只加 device 品牌化逻辑 + 3 新单测）**）— **V0.1.32 关注关系 follow + training wxss 中文 selector 修复**（2026-07-03，pic 2 社交向深化；**新表 Follow #41** + follow module 6 action（follow/unfollow/isFollowing/myFollowing/myFollowers/myCounts）+ 复用 notify(type=follow) + 前端 pages/user（用户主页：头像+关注/粉丝数+关注按钮乐观更新+isSelf 自己不显示）+ feed 头像跳用户主页闭环 + follow +10 单测 + 🐛 training wxss 中文 selector 修复（levelKey 英文 class + level 中文显示）；41 表 / 28 module / 33 页 / 527 单元 / 16 迁移）— **V0.1.31 消息中心 notification（pic 2 社交向收尾）**（2026-07-03，**新表 Notification #40** + notification module 4 action（list/unreadCount/markRead/markAllRead）+ **导出 `notify()` 集成函数**被 feed 复用 + 前端 pages/notification（列表卡+红点+全部已读+点击乐观标记+跳 feed+分页+下拉刷新）+ mine 入口带未读徽标 + feed.service 集成 notify（like/comment 事务后 try/catch）+ feed.service.test 重构 mock（vi.mock notify 隔离）+ notification +8 单测；40 表 / 27 module / 32 页 / 517 单元 / 15 迁移）— **V0.1.30 运动动态 feed（pic 2 社交向核心）**（2026-07-03，**3 新表 Feed+FeedLike+FeedComment #37-39** + feed module 6 action（$transaction 回调维护 likeCount/commentCount）+ 动态前端页（点赞乐观更新）+ vi.hoisted 修复 createPrismaMock hoisting 坑；39 表 / 26 module / 31 页 / 509 单元 / 14 迁移）— **V0.1.29 收藏（pic 3 向社交向首功能，最 KISS）**（2026-07-03，**新表 Favorite #36** + favorite module 4 action + stats.service 覆盖 39→100% + 总覆盖 80.66→82.11%；36 表 / 25 module / 30 页 / 499 单元 / 13 迁移）— **V0.1.28 跑步目标 + 我的证书**（2026-07-03，pic 2768 跑者向：**新表 Goal #35** + goal module 4 action + stats +myCertificates 动态生成；35 表 / 24 module / 29 页 / 487 单元 / 12 迁移）— **V0.1.27 sport 跑鞋 picker + 年度报告 + 蓝牙调试面板**（2026-07-03，**零 schema 改** / 28 页 / 479 单元不变 / stats +myAnnualReport action）— **我的跑鞋**（V0.1.26，2026-07-03，pic 2768：跑者里程管理 + 800km 更换提醒；34 表 / 23 module / 27 页 / 479 单元 / 15 缓存热路径 / 11 迁移）— **pic 3 张全新功能页**（V0.1.25，2026-07-03：今日健康 + 蓝牙绑定 + 锻炼训练；33 表 / 22 module / 26 页 / 472 单元）— **B 电商三连击**（2026-07-02~03：购物车/积分签到/分类 + 地址/优惠券 + 分销中心/天天跑）— **佳明（Garmin）数据全链路**（2026-07-01）— V0.1.17 部署加固 + 云端链路打通（qingmulife.cn）+ admin 重构 + P0-1 修复（2026-06-29）— V0.1.x Cache **15** 热路径 + OpenAPI 3.1 契约（2026-06-17）— Phase 4.1 微信支付完整闭环（2026-06-14）

---

## 🎯 职责

Node.js + TypeScript 后端（Fastify 4），对外提供 **30 个 module** + **domain 层** + **jobs** + **CLI 工具**。
**唯一权威**：openid、积分、余额、订单状态、微信支付回调、**分销佣金**、**心率缓存**（ble:hr:{userId}）、**血氧缓存**（spo2:{userId}）、**微信运动步数**（WeRunRecord 每日 upsert）、**跑鞋累计里程**（Checkin.shoeId → incrementShoeKm）、**年度汇总**（stats.myAnnualReport）、**跑步目标进度**（goal.calcGoalProgress 复用 Checkin aggregate，**V0.1.34 扩 userIds 支持家庭目标**）、**证书颁发**（stats.myCertificates 动态生成）、**收藏红心状态**（favorite.isFavorited 批量查）、**动态点赞/评论计数**（feed.$transaction 回调维护 likeCount/commentCount）、**消息通知**（notification.notify() 集成函数被 feed/follow 复用）、**关注关系**（follow.myCounts 用户主页一次拿全）、**BLE 设备品牌识别**（device.bindBleDevice 接 vendor，BLE 绑定优先 OAuth 降级）、**健康历史**（device.myHealthHistory 心率/血氧/睡眠 type+dateRange）、**onboarding 状态**（User.onboardingDone 字段 + user.resetOnboarding）、**家庭空间**（family.createFamily/joinFamily/myFamily + 家庭目标 goal.addFamilyGoal/myFamilyGoals 复用 Goal+familyId）都在这里产生和变更。

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
│   │   └── env.ts                    # 环境变量 Zod 校验（含 WX_MCH_* 6 字段）
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
│   │   └── cache.ts                  # Cache.wrap 抽象（V0.1.x，接入 15 热路径，含 myTodayHealth / myCertificates）
│   ├── domain/                       # 跨 module 业务规则（Phase 4.1）
│   │   └── order-state.ts            # Order 状态机：7 态 + TRANSITIONS 白名单 + assertTransition
│   ├── modules/                      # 30 个业务 module（见下方详表）
│   │   ├── auth / user / sport / mall / content / wallet / weekly-report
│   │   ├── upload / admin / app-config / wxpay                  # V1 + Phase 4
│   │   ├── device (V2 部分实现·佳明+蓝牙+今日健康+V0.1.33 品牌化 bindBleDevice(vendor) + myBindings garminBleBound + V0.1.43 +syncWeRun/myWeRun/myHealthHistory/submitSpO2 + 心率/血氧/睡眠落库 + 小米 OAuth stub + 蓝牙 retry3 强化) / stats / ranking          # 佳明 + V0.1.25 + V0.1.27 myAnnualReport + V0.1.28 myCertificates（V0.1.29 覆盖 39→100%）+ V0.1.43 健康扩展
│   │   ├── recipe / ludong (V2 stub)                            # V2
│   │   ├── cart / points / address / coupon / distribution      # B 电商 (2026-07-02~03)
│   │   ├── training                                             # pic 训练 (V0.1.25)
│   │   ├── shoes                                                # 我的跑鞋 (V0.1.26)
│   │   ├── goal                                                 # 跑步目标 (V0.1.28；V0.1.34 扩 family：calcGoalProgress userIds + addFamilyGoal/myFamilyGoals)
│   │   ├── favorite                                             # 收藏 (V0.1.29，content|product 通用，批量关联避免 N+1)
│   │   ├── feed                                                 # 运动动态 (V0.1.30，$transaction 回调维护 likeCount/commentCount；V0.1.31 集成 notify())
│   │   ├── notification                                         # 消息中心 (V0.1.31，pic 2 社交向收尾，导出 notify() 被 feed/follow 复用)
│   │   ├── follow                                               # 关注关系 (V0.1.32，pic 2 社交向深化，myCounts 用户主页一次拿全)
│   │   ├── family                                               # 家庭空间 (V0.1.34，pic 2776 家庭方向，6 action + 一人一家庭 @@unique + 8 位 inviteCode 短码)
│   │   └── ...（refund.service / wallet.repo / device.health 内部）
│   ├── jobs/                         # BullMQ 定时任务
│   │   ├── queue.ts                  # startJobs / stopJobs / enqueueCloseOrder
│   │   ├── scheduler.ts              # BullMQ repeatable（cron）
│   │   ├── weekly-report.job.ts      # 每周日 20:00 聚合周报
│   │   ├── close-order.job.ts        # 30 分钟超时关单（Phase 4.1）
│   │   ├── refresh-certs.job.ts      # 微信平台证书定时刷新（V0.1.1）
│   │   ├── garmin-import.job.ts      # 佳明活动入 Checkin（concurrency=2，5min 桶去重）
│   │   └── ludong-sync.job.ts        # 律动同步 stub（V0.1.43）
│   └── ...
├── scripts/                          # CLI 工具
│   ├── reconcile.ts                  # `pnpm reconcile -- YYYY-MM-DD` 微信账单比对
│   └── import-garmin.ts              # `pnpm garmin-import` 佳明全量入 Checkin（500/事务）
├── prisma/
│   ├── schema.prisma                 # **51 张表**（V1 12 + admin AuditLog + V2 13 含佳明 3 表 + 电商 7 表 + 跑鞋 1 + 目标 1 + 收藏 1 + 动态 3 + 通知 1 + 关注 1 + 家庭 2 + 团购 2 + 训练计划 2 + **V0.1.43 健康 4 表 WeRunRecord/HeartRateRecord/SpO2Record/SleepRecord**；V0.1.42 +Group.announce；V0.1.41 +TrainingPlan+UserPlanEnrollment；V0.1.40 +User 5 profile 字段；V0.1.37 +GroupBuy+GroupBuyMember；V0.1.34 +Family+FamilyMember + Goal.familyId；V0.1.32 +Follow；V0.1.31 +Notification；V0.1.30 +Feed+FeedLike+FeedComment；V0.1.29 +Favorite；V0.1.28 +Goal；V0.1.26 +Shoe + Checkin.shoeId；V0.1.33 零 schema 改）
│   │                                # Order 表加：payChannel / prepayId / wxTransactionId / paidAt / sourceUserId（分销）
│   │                                # User 表加：inviteCode(@unique) / distributorLevel(V0-V3)（分销）/ shoes relation（V0.1.26）/ goals relation（V0.1.28）/ favorites relation（V0.1.29）/ feeds+feedLikes+feedComments relation（V0.1.30）/ notifications+notifActions(@relation("NotifActor")) 双 relation（V0.1.31）/ following+followers 双 relation（@relation("Follower")/@relation("Followee")，V0.1.32）/ **familiesOwned+familyMember 双 relation（@relation("FamilyOwner")，V0.1.34）** / **+5 profile 字段 gender/birthday/region/height/weight（V0.1.40）** / **+onboardingDone Boolean（V0.1.43）**
│   │                                # Checkin 表加：shoeId?（V0.1.26，外键 ON DELETE SET NULL，sport.checkin 集成 incrementShoeKm）
│   │                                # Goal 表加：familyId?（V0.1.34，null=个人目标，有值=家庭目标，外键 onDelete Cascade + 索引 [familyId]）
│   │                                # DeviceBinding：vendor 枚举含 ble（V0.1.25，复用 vendorUserId/scopes/accessTokenEnc，零 schema 改动）；V0.1.33 复用 accessTokenEnc 存 BLE 设备名 + brandMeta 透传不持久化
│   ├── seed.ts                       # 初始数据（feature_flags + 8 商品 + AppConfig）
│   ├── sql/permissions.sql           # 角色权限参考
│   └── migrations/                   # Prisma 迁移历史（27 个，见下方表清单）
├── tests/
│   ├── modules/                      # 单元测试（vi.mock Prisma/Redis）— **776 tests**（V0.1.112 routes 全测 + V0.1.113 order.service + review module）
│   │   ├── user/sport/mall/content/wallet/weekly-report/admin/app-config...
│   │   ├── wxpay/{service,notify}.test.ts
│   │   ├── mall/{order,refund}.service.test.ts
│   │   ├── wallet/{service,repo}.test.ts
│   │   ├── jobs/{queue,close-order.job}.test.ts
│   │   ├── domain/order-state.test.ts
│   │   ├── device/{garmin,service,routes,health,bindings}.test.ts  # 6 files / ~35 用例（V0.1.25 +11：health 3 + bindings 7；V0.1.33 +3；V0.1.43 +3：syncWeRun + myWeRun + myHealthHistory）
│   │   ├── stats / ranking / cart / points / address / coupon    # B 电商 + 佳明 + V0.1.27/28 stats（**V0.1.29 stats 补 myAnnualReport/myCertificates 单测，覆盖 39→100%**）
│   │   ├── distribution/distribution.service.test.ts             # **17 用例**（V0.1.24）
│   │   ├── training/training.service.test.ts                     # **5 用例**（V0.1.25）
│   │   ├── shoes/shoes.service.test.ts                           # **7 用例**（V0.1.26：list 2 + add 1 + retire 3 + myStats 1）
│   │   ├── goal/goal.service.test.ts                             # **12 用例**（V0.1.28 +7；V0.1.34 +5）
│   │   ├── favorite/favorite.service.test.ts                     # **6 用例**（V0.1.29）
│   │   ├── feed/feed.service.test.ts                             # **10 用例**（V0.1.30；V0.1.31 重构 mock）
│   │   ├── notification/notification.service.test.ts             # **8 用例**（V0.1.31）
│   │   ├── follow/follow.service.test.ts                         # **10 用例**（V0.1.32）
│   │   └── family/family.service.test.ts                         # **10 用例**（V0.1.34）
│   ├── e2e/                          # 端到端测试（真 PG/Redis, RUN_E2E=1）— 49 用例 / 10 files
│   │   ├── sport-flow / weekly-report / mall-flow / wxpay-notify
│   │   ├── refund-flow / close-order / openapi (19 tests, OpenAPI CI gate)
│   │   └── prod-smoke / user-flow / admin-audit                   # 云端链路 + P0-1 回归
│   ├── helpers/                      # 测试基建（mockErrors / mockPrisma / README）
│   └── fixtures/                     # 测试 fixtures（user/product/order/group）
├── Dockerfile                        # 多阶段构建（deps → build → runner）
├── vitest.config.ts                  # alias src/xxx.js → ./src/xxx.ts
├── tsconfig.json                     # 开发用（含 sourceMap）
├── tsconfig.build.json               # 构建用（rootDir="src", paths → dist）
└── .env.example                      # 环境变量模板（含 WX_MCH_* 6 字段 + WX_REFUND_NOTIFY_URL）
```

---

## 🚪 API 协议

**统一前缀**：`/api/{module}`
**RESTful action**：各 module 自定义 action 路由（POST body 含 action/payload，或 REST path）。
**统一返回**：`{ code: 0, data } | { code: 4xx/5xx, msg }`。
**鉴权**：除 `config.public: true` 路由外，全部需 JWT Bearer token。

### 30 个 Module 清单（V1 11 + Phase 4 wxpay + 佳明 2 + V2 stub 2 + B 电商 5 + pic 训练 1 + 跑鞋 1 + 目标 1 + 收藏 1 + 动态 1 + 通知 1 + 关注 1 + 家庭 1 + 团购 1）

| Module | 路由前缀 | Service | Schema | 测试 | 状态 |
| --- | --- | --- | --- | --- | --- |
| **auth** | `/api/auth` | — (route 内联) | — | — | ✅ 微信登录 + code2Session |
| **user** | `/api/user` | ✅ 150 行 | ✅ 83 行 | 3 单元 | ✅ login + profile + update + **+inviteCode/distributorLevel**（V0.1.24）+ **+shoes relation**（V0.1.26）+ **+goals relation**（V0.1.28）+ **+favorites relation**（V0.1.29）+ **+feeds/feedLikes/feedComments relation**（V0.1.30）+ **+notifications/notifActions(@relation("NotifActor")) 双 relation**（V0.1.31）+ **+following/followers 双 relation**（V0.1.32）+ **+familiesOwned/familyMember 双 relation**（V0.1.34）+ **+5 profile 字段**（V0.1.40）+ **+onboardingDone 字段 + resetOnboarding action**（V0.1.43） |
| **sport** | `/api/sport` | ✅ 311 行 | ✅ 72 行 | 12 单元 + 3 e2e | ✅ 打卡/统计/群榜单/建群 + **+shoeId 集成 incrementShoeKm**（V0.1.26）+ **V0.1.27 前端 picker 联动** + **V0.1.42 +3 action groupDetail/groupMembers/announceGroup** |
| **mall** | `/api/mall` | ✅ 88 行 + refund.service 116 行 | ✅ 64 行 | 7 单元 + 1 e2e | ✅ 商品/分类/下单/取消/退款 + **+分销集成**（createOrder 解析 inviteCode 落 DistrOrder + Team） |
| **content** | `/api/content` | ✅ 93 行 | ✅ 36 行 | 8 单元 | ✅ 内容列表/详情/报名（公开） |
| **wallet** | `/api/wallet` | ✅ 114 行 + wallet.repo 64 行 | ✅ 29 行 | 12 单元 | ✅ 余额/充值/消费/退款 + ensureWalletInTx（**被 settle/clawback 复用**） |
| **weekly-report** | `/api/weekly-report` | ✅ 185 行 | ✅ 14 行 | 2 e2e | ✅ 周报聚合 + BullMQ 定时 |
| **upload** | `/api/upload` | — (route 内联) | — | — | ✅ 文件上传（@fastify/multipart） |
| **admin** | `/api/admin` | ✅ admin.service（**20** action / 522 行） | ✅ admin.schema（143 行） | 22 + 12 单元 | ✅ 全功能 + V0.1.41 +2 upsertTrainingPlan/listTrainingPlans + V0.1.38 +2 upsertGroupBuy/listGroupBuys |
| **app-config** | (内嵌) | — | — | — | ✅ AppConfig 表 + 功能开关 |
| **wxpay** | `/api/wxpay` | ✅ 350 行（refund / queryBill / downloadBill） | ✅ 80 行 | 8 单元 + 2 e2e | ✅ **Phase 4 + 4.1** 微信支付 V3 完整闭环 + **+notify 触发 settleCommission** |
| **device** | `/api/device` | ✅ ~450 行（V0.1.43 扩健康 + 微信运动 + 蓝牙加固） | ✅ ~130 行（V0.1.43 +3 action） | 6 files / ~35 用例（V0.1.43 +3） | 🚧 V2 **部分实现** — 设备绑定 + 佳明 4 查询 + 4 数据处理 + V0.1.25 扩 5 action + V0.1.33 品牌化 + **V0.1.43 扩 5+ action**：syncWeRun（微信运动 session_key AES-128-CBC 解密 → WeRunRecord upsert）/ myWeRun（月度列表 + Cache）/ myHealthHistory（心率/血氧/睡眠 type+dateRange 查询）/ submitHeartRate（首次立即上传 + 5s 批量 + onHide flush + Redis 缓存 ble:hr:{userId}）/ submitSpO2（血氧 0x1822 SFLOAT 解码 → SpO2Record）+ device.health.ts 心率 retry3 + hasHr 策略 + 蓝牙去 services 过滤 + getDeviceServices 诊断 + ludong-sync.job.ts（小米 OAuth stub） |
| **stats** | `/api/stats` | ✅ | ✅ | **6 单元**（V0.1.29 补 myAnnualReport/myCertificates 单测，**覆盖 39→100%**） | ✅ myRunnerStats + V0.1.27 myAnnualReport + V0.1.28 myCertificates |
| **ranking** | `/api/ranking` | ✅ | ✅ | 4 单元 | ✅ groupRankingMulti多维榜单 |
| **recipe** | `/api/recipe` | ✅ 66 行 | ✅ 67 行 | 7 路由层 | 🚧 V2 stub — 菜谱 |
| **ludong** | `/api/ludong` | ✅ 57 行 | ✅ 45 行 | 6 路由层 | 🚧 V2 stub — 律动对接 |
| **cart** | `/api/cart` | ✅ | ✅ | 6 单元 | ✅ **B 电商**（V0.1.22） |
| **points** | `/api/points` | ✅ | ✅ | 5 单元 | ✅ **B 电商**（V0.1.22） |
| **address** | `/api/address` | ✅ | ✅ | 4 单元 | ✅ **个人中心电商版**（V0.1.23） |
| **coupon** | `/api/coupon` | ✅ | ✅ | 5 单元 | ✅ **个人中心电商版**（V0.1.23） |
| **distribution** | `/api/distribution` | ✅ 408 行（含 settle/clawback） | ✅ 16 行 | **17 单元** | ✅ **B 分销中心**（V0.1.24） → [详见 module CLAUDE.md](src/modules/distribution/CLAUDE.md) |
| **training** | `/api/training` | ✅ | ✅ | **5 单元** | ✅ **pic 训练**（V0.1.25 + V0.1.41 配置化） |
| **shoes** | `/api/shoes` | ✅ | ✅ | **7 单元** | ✅ **我的跑鞋**（V0.1.26） |
| **goal** | `/api/goal` | ✅ | ✅ | **12 单元** | ✅ **跑步目标**（V0.1.28；V0.1.34 扩 family 目标） |
| **favorite** | `/api/favorite` | ✅ | ✅ | **6 单元** | ✅ **收藏**（V0.1.29，content\|product 通用，批量关联避免 N+1） |
| **feed** | `/api/feed` | ✅ | ✅ | **10 单元** | ✅ **运动动态**（V0.1.30，$transaction 回调维护计数） |
| **notification** | `/api/notification` | ✅ | ✅ | **8 单元** | ✅ **消息中心**（V0.1.31，导出 notify() 被 feed/follow 复用） |
| **follow** | `/api/follow` | ✅ | ✅ | **10 单元** | ✅ **关注关系**（V0.1.32，myCounts 用户主页一次拿全） |
| **family** | `/api/family` | ✅ | ✅ | **10 单元** | ✅ **家庭空间**（V0.1.34，6 action + 一人一家庭 @@unique + 8 位 inviteCode） |
| **group-buy** | `/api/group-buy` | ✅ | ✅ | **8 单元** | ✅ **团购 MVP + 深化**（V0.1.37~38） |

### 数据库表（51 张，V0.1.43 +WeRunRecord/HeartRateRecord/SpO2Record/SleepRecord + User.onboardingDone；V0.1.42 +Group.announce；V0.1.41 +TrainingPlan+UserPlanEnrollment；V0.1.37 +GroupBuy+GroupBuyMember；V0.1.34 +Family+FamilyMember + Goal.familyId；V0.1.32 +Follow；V0.1.31 +Notification；V0.1.30 +Feed+FeedLike+FeedComment；V0.1.29 +Favorite；V0.1.28 +Goal；V0.1.26 +Shoe + Checkin.shoeId）

| # | 表名 | Module | V1/V2 | 引入版本 |
|---|--- |--- |--- |--- |
| 1 | User | user | V1 | （+inviteCode/@unique + distributorLevel V0-V3 V0.1.24；+shoes V0.1.26；+goals V0.1.28；+favorites V0.1.29；+feeds/feedLikes/feedComments V0.1.30；+notifications/notifActions V0.1.31；+following/followers V0.1.32；+familiesOwned/familyMember V0.1.34；**+5 profile 字段 V0.1.40**；**+onboardingDone Boolean V0.1.43**） |
| 2 | Checkin | sport | V1 | （+dataSource/garminActivityId/sportType V0.1.25 佳明；+shoeId? V0.1.26；V0.1.28 被 goal.calcGoalProgress aggregate 复用；V0.1.30 被 feed.publish 关联；V0.1.34 被 family.myFamily/familyRanking aggregate 复用） |
| 3 | Group / GroupMember | sport | V1 | （V0.1.42 Group +announce 字段） |
| 4 | Product | mall | V1 | （seed 8 商品，V0.1.21） |
| 5 | Order / OrderItem | mall | V1 | （Order +payChannel/prepayId/wxTransactionId/paidAt +sourceUserId V0.1.24；+groupBuyId V0.1.38） |
| 6 | PointsRecord | wallet | V1 | |
| 7 | Wallet / WalletTransaction | wallet | V1 | （type +commission/+commission_clawback V0.1.24） |
| 8 | Content / Enrollment | content | V1 | （V0.1.28 stats.myCertificates 复用 Enrollment type=marathon 作赛事证书源） |
| 9 | AppConfig | app-config | V1 | |
| 10 | GroupReport | weekly-report | V1 | |
| 11 | AuditLog | admin | V1 | V0.1.18 黑名单/审计 |
| 12 | DeviceBinding | device | V2 | （vendor 枚举 +ble V0.1.25；V0.1.33 复用 accessTokenEnc 存 BLE 设备名） |
| 13 | RawActivity | device | V2 | （佳明 vendor=garmin + status/importedAt/importCheckinId） |
| 14 | GarminSleep | device | V2 | 佳明 2026-07-01 |
| 15 | GarminMetric | device | V2 | 佳明，含 sport 列 |
| 16 | GarminFitnessAge | device | V2 | 佳明 |
| 17 | Recipe | recipe | V2 stub | |
| 18 | FoodCache | recipe | V2 stub | |
| 19 | Meal | recipe | V2 stub | |
| 20 | IdMapping | ludong | V2 stub | |
| 21 | SyncOutbox | ludong | V2 stub | |
| 22 | InboundEvent | ludong | V2 stub | |
| 23 | **Cart** | cart | V1 | **B 电商 V0.1.22** |
| 24 | **SigninRecord** | points | V1 | **B 电商 V0.1.22** |
| 25 | **Address** | address | V1 | **个人中心电商版 V0.1.23** |
| 26 | **Coupon** | coupon | V1 | **个人中心电商版 V0.1.23** |
| 27 | **DistributionOrder** | distribution | V1 | **B 分销 V0.1.24** |
| 28 | **Team** | distribution | V1 | **B 分销 V0.1.24** |
| 29 | **CommissionLog** | distribution | V1 | **B 分销 V0.1.24** |
| 30 | Blacklist | admin | V1 | V0.1.18 黑名单 |
| 31 | ...（含 ludong / recipe 中间表，按需查 schema.prisma） | | | |
| 32 | **Shoe** | shoes | V1 | **我的跑鞋 V0.1.26** |
| 33-34 | (索引占位) | | | |
| 35 | **Goal** | goal | V1 | **跑步目标 V0.1.28 + V0.1.34 familyId** |
| 36 | **Favorite** | favorite | V1 | **收藏 V0.1.29** |
| **37** | **Feed** | feed | V1 | **运动动态 V0.1.30 + V0.1.36 +topic+videoUrl** |
| **38** | **FeedLike** | feed | V1 | **运动动态点赞 V0.1.30** |
| **39** | **FeedComment** | feed | V1 | **运动动态评论 V0.1.30** |
| **40** | **Notification** | notification | V1 | **消息中心 V0.1.31** |
| **41** | **Follow** | follow | V1 | **关注关系 V0.1.32** |
| **42** | **Family** | family | V1 | **家庭空间 V0.1.34** |
| **43** | **FamilyMember** | family | V1 | **家庭成员 V0.1.34** |
| 44 | **GroupBuy** | group-buy | V1 | **团购 V0.1.37** |
| 45 | **GroupBuyMember** | group-buy | V1 | **团购成员 V0.1.37** |
| 46 | **TrainingPlan** | training | V1 | **训练计划模板 V0.1.41** |
| 47 | **UserPlanEnrollment** | training | V1 | **训练计划报名 V0.1.41** |
| **48** | **WeRunRecord** | device | V1 | **微信运动步数 V0.1.43** — id / userId / date(YYYY-MM-DD CN 时区) / step / createdAt；`@@unique([userId, date])` upsert 防重；索引 [userId, date]；onDelete Cascade |
| **49** | **HeartRateRecord** | device | V1 | **心率历史 V0.1.43** — id / userId / value(bpm) / timestamp / source(ble\|werun\|manual) / createdAt；索引 [userId, timestamp]；onDelete Cascade |
| **50** | **SpO2Record** | device | V1 | **血氧历史 V0.1.43** — id / userId / value(0-100) / timestamp / createdAt；索引 [userId, timestamp]；onDelete Cascade |
| **51** | **SleepRecord** | device | V1 | **睡眠历史 V0.1.43** — id / userId / date(YYYY-MM-DD) / bedtime? / wakeTime? / durationSeconds? / deepSeconds? / lightSeconds? / remSeconds? / awakeSeconds? / score? / createdAt；onDelete Cascade |

> 💡 **Prisma 迁移历史**（27 个，V0.1.43 +8 段 + V0.1.41/42 +2）：`20260611083609_init` → `20260614090000_wallet_tx_out_refund_no` → `20260618135224_qmwx` → `20260629144948_auditlog_blacklist` → `20260701034725_garmin_tables` → `20260701123150_garmin_metric_sport` → `20260701150000_garmin_import_ranking` → `20260702060000_cart_signin` → `20260702130000_address_coupon` → `20260703120000_distribution` → `20260703140000_shoe` → `20260703150000_goal` → `20260703160000_favorite` → `20260703170000_feed` → `20260703180000_notification` → `20260703190000_follow` → `20260704000000_family` → `20260707000000_feed_topic_video`（V0.1.36 Feed +topic+videoUrl）→ `20260707020000_group_buy`（V0.1.37）→ `20260707030000_order_groupbuy`（V0.1.38 Order +groupBuyId）→ `20260707040000_user_profile_fields`（V0.1.40 User +5 字段）→ `20260707160000_training_plan`（V0.1.41 +TrainingPlan+UserPlanEnrollment）→ `20260707170000_group_announce`（V0.1.42 Group +announce）→ **`20260708090000_werun_record`**（V0.1.43 WeRunRecord）→ **`20260708210000_hr_spo2_record`**（V0.1.43 HeartRateRecord + SpO2Record）→ **`20260709020000_sleep_record`**（V0.1.43 SleepRecord）→ **`20260709150000_onboarding`**（V0.1.43 User +onboardingDone Boolean 默认 false）。**V0.1.27 / V0.1.33 零 schema 改动，无新迁移。**

---

## 📦 依赖

- **运行时**：`fastify@4` `@fastify/cors` `@fastify/helmet` `@fastify/jwt` `@fastify/multipart` `@fastify/rate-limit` `@fastify/static` `@prisma/client` `ioredis` `bullmq` `zod` `dotenv` `pino-pretty`
- **开发**：`tsx` `vitest` `@vitest/coverage-v8` `prisma` `supertest` `typescript`
- **共享**：`@qm-wx/shared`（workspace 协议）

---

## 🧪 测试

```bash
# 单元测试（vi.mock，不连 DB）— **580 passed**（V0.1.43 累加估算）
pnpm test

# 端到端（真 PG/Redis）— 49 用例 / 10 files（含 prod-smoke/user-flow/admin-audit）
RUN_E2E=1 pnpm test

# 覆盖率
pnpm test:coverage                 # v8 provider → html/lcov；**2026-07-03 V0.1.29 实测总覆盖 80.66→82.11%**
```

**测试策略**：
- **单元测试**（`tests/modules/*.test.ts`）：vi.mock Prisma/Redis，跑得快
- **域测试**（`tests/domain/*.test.ts`）：纯函数 + 状态机白名单
- **E2E 测试**（`tests/e2e/*.e2e.test.ts`）：用 `buildApp()` + supertest inject，跑真 PG/Redis
- **`RUN_E2E=1`** 环境变量控制 e2e 启停（默认 skip，CI 启用）
- **`tests/helpers/{mockErrors,mockPrisma}.ts`**（方案 B 引入）：统一 mock 工厂
- **`tests/fixtures/{user,product,order,group}.fixture.ts`**：makeX() 工厂模式

**测试覆盖审查（V0.1.29 中途）**：stats.service 覆盖率 39→**100%**（补 myAnnualReport 单测覆盖年汇总+月度分布+最长单次+活跃天数 reduce 逻辑；补 myCertificates 单测覆盖里程碑证书颁发+赛事证书+下一里程碑进度）；**总覆盖率 80.66→82.11%**；距 80% 阈值已超，距 84% 还差 1.89%。

**关键设计模式**：
- `buildApp()`（`app.ts`）：抽离装配逻辑，e2e 复用路由注册，避开 listen + jobs
- `parseOrBadRequest`（`common/helpers/parse.ts`，V0.1.24）：新 module（distribution/cart/address/coupon/shoes/goal/favorite/feed/notification/follow/family）统一 Zod 解析
- `ensureWalletInTx`（`wallet.repo.ts`）：事务内复用入口，被 wxpay notify / refund / **settleCommission / clawbackCommission** 共享
- `Cache.wrap`（`infra/cache.ts`，V0.1.x）：**15 热路径**统一缓存抽象
- `incrementShoeKm`（`shoes.service.ts` 导出，V0.1.26）：跑鞋里程累加纯函数
- `myAnnualReport`（`stats.service`，V0.1.27）：年汇总 + 月度分布范式
- `calcGoalProgress`（`goal.service` 导出 helper，V0.1.28；**V0.1.34 扩 userIds**）
- `myCertificates`（`stats.service`，V0.1.28）：动态证书生成范式
- `favorite.list 批量关联`（`favorite.service`，V0.1.29）：N+1 规避范式
- **`feed $transaction 回调`**（`feed.service`，V0.1.30）：维护计数范式
- **`vi.hoisted + createPrismaMock`**（`feed.service.test.ts`，V0.1.30）：测试范式
- **`notify() 集成函数`**（`notification.service` 导出，V0.1.31）：跨 module 通知触发范式
- **`@relation("name") 消歧义`**（范式累计 3 次）：NotifActor V0.1.31 / Follower V0.1.32 / FamilyOwner V0.1.34
- **`matchBleVendor + 0x180A 二次验证 + 手选兜底`**（V0.1.33，前后端单一数据源在 shared `device-brands.ts`）
- **`readCharValue` 通用 GATT 读取工具**（`utils/ble.ts`，V0.1.33）
- **`calcGoalProgress userIds 参数`**（`goal.service`，V0.1.34 DRY 聚合维度扩展）
- **`syncWeRun session_key 解密范式`**（`device.service`，V0.1.43）：AES-128-CBC 解密微信运动加密数据（encryptedData + iv + sessionKey）→ 步数明细 JSON → WeRunRecord upsert；session_key 过期自动重登重试（errcode=40001/invalid session → wx.login → code2Session → 重试）
- **`submitHeartRate 5s 批量范式`**（`device.health.ts`，V0.1.43）：BLE notify 实时上传 → 首次立即落库 + 5s 批量落库 + onHide flush + 15s 定时刷 + 本地缓存兜底（断网不丢）
- **`hasHr 策略 + retry3 + 去 services 过滤`**（`utils/ble.ts` + `device.health.ts`，V0.1.43）：BLE 扫描去 services 过滤（不同品牌广播不同服务）→ getDeviceServices 诊断 → connect → 订阅 0x180D notify → hasHr = 心率值是否有效（非 0 / 255 保留值）→ retry3 容错
- **`AES-128-CBC PKCS#7 解密`**（`device.service` V0.1.43）：PKCS#7 解密微信返回的 encryptedData；通用 crypto 工具，可复用 wx.getWeRunData / wx.getShareInfo 等加密数据解析

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
- ✅ **30** 个 module 路由（**28** 个有 service 实现 + 2 V2 stub + device 部分实现）
  - **Phase 4.1**：wxpay（V3 完整闭环，含 refund / queryBill / downloadBill）
  - **B 电商三连击**（V0.1.22~24）：cart / points / address / coupon / **distribution**（含 settle/clawback 集成函数 + LEVEL_RULES 等级规则）
  - **pic 训练**（V0.1.25）：**training**（myPlans 4 套硬编码 + mySportRecords 聚合）+ device 扩 5 action（myTodayHealth/myBindings/bindBleDevice/unbind 实现/submitHeartRate 实现）
  - **我的跑鞋**（V0.1.26，pic 2768）：**shoes**（list/add/update/retire/myStats 5 action）+ **sport.checkin 集成 incrementShoeKm**
  - **V0.1.27**（零 schema 改）：**stats +myAnnualReport**
  - **V0.1.28**（+Goal 表）：**goal**（4 action，calcGoalProgress helper）+ **stats +myCertificates**
  - **V0.1.29**（+Favorite 表）：**favorite**（4 action，list 批量关联避免 N+1）；**测试审查**：stats.service 覆盖 39→100%，总覆盖 80.66→82.11%
  - **V0.1.30**（+Feed+FeedLike+FeedComment 3 表，pic 2 社交向核心）：**feed**（6 action，$transaction 回调维护 likeCount/commentCount）
  - **V0.1.31**（+Notification 表，pic 2 社交向收尾）：**notification**（4 action）+ **导出 notify() 集成函数被 feed/follow 复用**
  - ✅ **关注关系**（V0.1.32，+Follow 表，社交向深化）：**follow**（6 action，myCounts 一次拿全，follow/unfollow 幂等，isFollowing 批量查）+ 复用 notify(type=follow)
  - ✅ **BLE 设备品牌识别**（V0.1.33，零 schema 改，方案1 MVP）：device module 品牌化扩展
  - ✅ **家庭空间**（V0.1.34，pic 2776 家庭方向，+Family+FamilyMember 表）：**family**（6 action）+ goal module 扩 family 目标
  - ✅ **团购 MVP + 深化**（V0.1.37~38，pic 2764）：**group-buy**（4 action）+ Order +groupBuyId 团购价快照
  - ✅ **训练计划配置化**（V0.1.41）：TrainingPlan+UserPlanEnrollment + training +3 action + admin +2
  - ✅ **跑群深化**（V0.1.42）：Group +announce + sport +3 action（groupDetail/groupMembers/announceGroup）
  - ✅ **profile 完整实现**（V0.1.40）：User +5 字段（gender/birthday/region/height/weight）
  - ✅ **V0.1.43 微信运动 + 小米 OAuth + 健康持久化 + 蓝牙加固 + onboarding 4 步式**（4 新表 WeRunRecord/HeartRateRecord/SpO2Record/SleepRecord + User +onboardingDone + device +3 action syncWeRun/myWeRun/myHealthHistory + device.health.ts 心率 retry3 + hasHr + 5s 批量 + 首次立即上传 + onHide flush + 小米 OAuth stub + ludong-sync.job.ts；前端 utils/werun.ts + utils/ble.ts retry3+hasHr+去 services 过滤+getDeviceServices 诊断）
- ✅ JWT 鉴权 + 功能开关中间件 + 公开端点（content/mall/wxpay）
- ✅ 微信 code2Session（session_key 缓存 Redis）
- ✅ Prisma **51** 张表 + **27** 个迁移
- ✅ **Domain 层**：order-state 状态机（7 态 + TRANSITIONS 白名单 + assertTransition 5 处替换）
- ✅ **BullMQ jobs 7 个**：周报（每周日 20:00）+ 超时关单（30min delayed）+ 微信平台证书刷新 + **garmin-import**（concurrency=2，5min 桶去重）+ **ludong-sync**（V0.1.43 stub）
- ✅ **Wallet repo**：ensureWallet / ensureWalletInTx 复用入口（**被 settle/clawback 复用，V0.1.24**）
- ✅ **CLI 2 个**：`pnpm reconcile -- YYYY-MM-DD` 微信账单比对 + `pnpm garmin-import` 佳明全量入 Checkin（500/事务）
- ✅ Dockerfile 多阶段构建
- ✅ **776 单元测试** + 49 e2e（10 files）/ **总覆盖 86.64%**（V0.1.113 review module 后）
- ✅ CI/CD（GitHub Actions ci.yml + deploy-staging.yml，拆 4 parallel job）
- ✅ **wxpay** refund + notify + 幂等 + 关单保护全链路 + **notify 触发 settleCommission**
- ✅ **缓存基础设施**（V0.1.x）：`infra/cache.ts` Cache.wrap 接入 **15 热路径**
- ✅ **OpenAPI 3.1 spec**（V0.1.4/13）：`/openapi.json` + `openapi.e2e` CI gate
- ✅ 切真生产文档（[`docs/PHASE-4-2-PREP.md`](../../docs/PHASE-4-2-PREP.md)）
- ✅ **首个 module 级 CLAUDE.md**：distribution（[`src/modules/distribution/CLAUDE.md`](src/modules/distribution/CLAUDE.md)）
- ✅ **蓝牙 BLE 心率 + 血氧 + 睡眠**（V0.1.25 + V0.1.43 扩）：device.submitHeartRate/spo2/submitXiaomiZip → 落 HeartRateRecord/SpO2Record/SleepRecord + Redis 缓存；V0.1.43 retry3 + hasHr + 去 services 过滤 + 5s 批量 + 首次立即上传 + onHide flush；GAP-9 关闭
- ✅ **微信运动闭环**（V0.1.43）：device.syncWeRun session_key AES-128-CBC 解密 → WeRunRecord upsert；session_key 过期自动重登重试
- ✅ **跑鞋里程强一致**（V0.1.26 + V0.1.27 闭环）：GAP-10 关闭
- ✅ **年度报告**（V0.1.27，零 schema 改）
- ✅ **跑步目标 + 我的证书**（V0.1.28）
- ✅ **收藏**（V0.1.29）
- ✅ **运动动态**（V0.1.30）
- ✅ **消息中心**（V0.1.31）
- ✅ **关注关系**（V0.1.32 + training wxss 中文 selector 修复）
- ✅ **BLE 设备品牌识别**（V0.1.33）
- ✅ **家庭空间**（V0.1.34 + V0.1.39 转让/解散/成就）
- ✅ **团购 MVP + 深化**（V0.1.37~38）
- ✅ **跑群深化**（V0.1.42）+ **setErrorHandler 时机修**（Fastify 4 route 前注册，修 401/403/404 返默认格式 bug）
- ✅ **profile 完整实现**（V0.1.40）
- ✅ **训练计划配置化**（V0.1.41）
- ✅ **V0.1.43 onboarding 4 步式激活向导**（User +onboardingDone + user.resetOnboarding action；前端 onboarding 页 4 步式 welcome→profile→avatar→sync；mine「重新激活授权」入口替退出登录）

---

🤙 `pnpm dev` 起来看见 `/health: ok` 就是活着的。V0.1.100 GitHub 主线起点（V0.1.100 commit `a21de50`，main 推到 changzhi777/QM-WX 私有；ct400 Gitea 保留不同步保留 V0.1.43 tag）+ V0.1.43 微信运动+小米 OAuth+健康持久化+蓝牙加固+onboarding 4 步式激活向导（4 新表 +51 表 / 30 module / 42 页 / 580 单元 / 27 迁移 / 7 jobs）；**GAP 关闭**：GAP-3 覆盖率阈值门禁（V0.1.102）+ GAP-8 module 级 CLAUDE.md 12 个补建（V0.1.103）+ GAP-9 蓝牙 BLE 真机联调（V0.1.43）；**仍开放**：GAP-6 分销二次上线（间推佣金/提现/自提收货）；**下一步**：V0.1.43/V0.1.100 真机验证（微信运动+onboarding+重新激活授权）+ 生产部署 V0.1.43（scp 直传 + 重启 server 容器 + 健康检查）+ 赛事服务 MVP（业务闭环第 3 块）+ 评价系统（电商闭环最后一块）+ 跑鞋：阈值个性化 + 历史里程曲线 + 目标/证书增强 + 收藏/动态社交向扩展 + 用户主页增强。