# apps/server — 后端服务

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../CLAUDE.md) → **apps/server/**（这里）
> 架构依据：[docs/ARCHITECTURE-V2.md](../../docs/ARCHITECTURE-V2.md)
> 最新进展：**V0.1.34 家庭空间 family**（2026-07-04，pic 2776 家庭方向，/zcf:workflow 方案1 完整 family module）— **2 新表 Family #42 + FamilyMember #43**（迁移 `20260704000000_family`，FamilyMember.userId `@unique` 强制一人一家庭，onDelete Cascade）+ **Goal 表 +familyId**（null=个人目标，有值=家庭目标，onDelete Cascade）+ **User 加双 relation**：familiesOwned（`@relation("FamilyOwner")`，创建的家庭）+ familyMember（1:1）+ **新 module family**（28→29，6 action：createFamily/joinFamily/myFamily/leaveFamily/familyRanking/inviteInfo，8 位 inviteCode hex 短码 randomUUID slice 8 + toUpperCase）+ **goal module 扩展**（calcGoalProgress 改 `userIds: string[]` 参数，DRY 复用 — 个人=[userId]/家庭=成员 userIds；list/myProgress 加 familyId:null 过滤；+addFamilyGoal/myFamilyGoals 2 新 action）；前端 pages/family（家庭卡+邀请复制+本月跑量榜+家庭目标+创建/加入+添加目标弹层）；**3 决策**（方案2 A 家庭组+B 跑量榜+C 家庭目标 / 一人一家庭 @@unique / 复用 Goal+familyId DRY）；**3 坑沉淀**（User 双 Family relation 必须 @relation("FamilyOwner") 消歧义，范式累计第 3 次：NotifActor V0.1.31 / Follower V0.1.32 / FamilyOwner V0.1.34 / inviteCode 8 位 @unique 兜底极小概率重复报错让用户重试 YAGNI / familyRanking Promise.all 并发 aggregate mockResolvedValueOnce 顺序不保证 → mockImplementation 按 userId 区分）；测试 530→**545**（family +10：createFamily 2 + joinFamily 2 + myFamily 2 + leaveFamily 2 + familyRanking 1 + inviteInfo 1；goal +5：addFamilyGoal 3 含 forbidden + myFamilyGoals 2 含 where userId in 断言）；**43 表 / 29 module / 34 页 / 17 迁移** — **V0.1.33 BLE 设备品牌识别**（2026-07-03，/zcf:workflow 方案1 MVP，**零 schema 改**：复用 DeviceBinding.accessTokenEnc 存设备名 + brandMeta 透传不持久化；shared device-brands `xiaomi` available true→开放 + garmin desc 加"BLE 实时心率 + OAuth 历史" + 新增 `BLE_VENDOR_PATTERNS` + `matchBleVendor(name)` 函数 + `BleVendor` type（前后端单一数据源）；device.schema `BindBleDeviceInputSchema` 加 `vendor` enum + `brandMeta` optional；device.service `bindBleDevice` 接 vendor 按 `[userId, vendor]` upsert（可同时绑多设备 garmin+xiaomi+ble 共存，**service 层兜底 `input.vendor ?? 'ble'`**）+ `myBindings` 加 `garminBleBound: boolean`（**BLE 绑定优先，OAuth 降级**）；前端 utils/ble.ts 加 `readBattery`（0x180F / 2A19）+ `readDeviceInfo`（0x180A：2A29 Manufacturer + 2A24 Model）+ `readCharValue` 通用 GATT 读取工具（微信 `readBLECharacteristicValue` 值在 `onBLECharacteristicValueChange` 回调，非 success）；前端 device-bind 页改造（matchBleVendor 自动识别 + 品牌标签 + onSelectDevice 流程 connect → Promise.all([readBattery, readDeviceInfo]) → 0x180A Manufacturer 二次验证 → 未识别 wx.showActionSheet 手选兜底 + 心率卡电量/型号/厂商 + garmin OAuth 降级段）；**3 坑沉淀**（service 层 vendor 兜底 / wx.readBLE 值在回调非 success / 小程序 TS 类型 3 坑：TextDecoder 非 DOM lib / offBLECharacteristicValueChange 签名不接受参数 / OnBLECharacteristicValueChangeCallbackResult 类型不存在）；**41 表 / 28 module / 33 页 / 530 单元 / 16 迁移（均不变，只加 device 品牌化逻辑 + 3 新单测）**）— **V0.1.32 关注关系 follow + training wxss 中文 selector 修复**（2026-07-03，pic 2 社交向深化；**新表 Follow #41** + follow module 6 action（follow/unfollow/isFollowing/myFollowing/myFollowers/myCounts）+ 复用 notify(type=follow) + 前端 pages/user（用户主页：头像+关注/粉丝数+关注按钮乐观更新+isSelf 自己不显示）+ feed 头像跳用户主页闭环 + follow +10 单测 + 🐛 training wxss 中文 selector 修复（levelKey 英文 class + level 中文显示）；41 表 / 28 module / 33 页 / 527 单元 / 16 迁移）— **V0.1.31 消息中心 notification（pic 2 社交向收尾）**（2026-07-03，**新表 Notification #40** + notification module 4 action（list/unreadCount/markRead/markAllRead）+ **导出 `notify()` 集成函数**被 feed 复用 + 前端 pages/notification（列表卡+红点+全部已读+点击乐观标记+跳 feed+分页+下拉刷新）+ mine 入口带未读徽标 + feed.service 集成 notify（like/comment 事务后 try/catch）+ feed.service.test 重构 mock（vi.mock notify 隔离）+ notification +8 单测；40 表 / 27 module / 32 页 / 517 单元 / 15 迁移）— **V0.1.30 运动动态 feed（pic 2 社交向核心）**（2026-07-03，**3 新表 Feed+FeedLike+FeedComment #37-39** + feed module 6 action（$transaction 回调维护 likeCount/commentCount）+ 动态前端页（点赞乐观更新）+ vi.hoisted 修复 createPrismaMock hoisting 坑；39 表 / 26 module / 31 页 / 509 单元 / 14 迁移）— **V0.1.29 收藏（pic 3 向社交向首功能，最 KISS）**（2026-07-03，**新表 Favorite #36** + favorite module 4 action + stats.service 覆盖 39→100% + 总覆盖 80.66→82.11%；36 表 / 25 module / 30 页 / 499 单元 / 13 迁移）— **V0.1.28 跑步目标 + 我的证书**（2026-07-03，pic 2768 跑者向：**新表 Goal #35** + goal module 4 action + stats +myCertificates 动态生成；35 表 / 24 module / 29 页 / 487 单元 / 12 迁移）— **V0.1.27 sport 跑鞋 picker + 年度报告 + 蓝牙调试面板**（2026-07-03，**零 schema 改** / 28 页 / 479 单元不变 / stats +myAnnualReport action）— **我的跑鞋**（V0.1.26，2026-07-03，pic 2768：跑者里程管理 + 800km 更换提醒；34 表 / 23 module / 27 页 / 479 单元 / 15 缓存热路径 / 11 迁移）— **pic 3 张全新功能页**（V0.1.25，2026-07-03：今日健康 + 蓝牙绑定 + 锻炼训练；33 表 / 22 module / 26 页 / 472 单元）— **B 电商三连击**（2026-07-02~03：购物车/积分签到/分类 + 地址/优惠券 + 分销中心/天天跑）— **佳明（Garmin）数据全链路**（2026-07-01）— V0.1.17 部署加固 + 云端链路打通（qingmulife.cn）+ admin 重构 + P0-1 修复（2026-06-29）— V0.1.x Cache **15** 热路径 + OpenAPI 3.1 契约（2026-06-17）— Phase 4.1 微信支付完整闭环（2026-06-14）
> ⚠️ **working tree 含未提交**（预期 V0.1.24 + V0.1.25 + V0.1.26 + V0.1.27 + V0.1.28 + V0.1.29 + V0.1.30 + V0.1.31 + V0.1.32 + V0.1.33 + V0.1.34）：V0.1.24 = distribution 三表 + 5 新 module（cart/points/address/coupon/distribution）+ 7 表迁移 + 分销全闭环集成（mall.createOrder / wxpay.notify.settle / refund.clawback）+ User +inviteCode/distributorLevel + Order +sourceUserId + common/helpers/parse.ts；V0.1.25 = pic 3 页 + **training module**（myPlans/mySportRecords）+ device 扩 5 action（myTodayHealth/myBindings/bindBleDevice/unbind/submitHeartRate）+ utils/ble.ts（蓝牙 BLE）+ **零 schema 改动**（vendor=ble 复用 DeviceBinding）；V0.1.26 = 新表 Shoe（#34）+ Checkin +shoeId（外键 ON DELETE SET NULL）+ User +shoes relation + shoes module（5 action）+ sport.checkin 集成 incrementShoeKm（shoeId 空跳过，向后兼容）+ 迁移 20260703140000_shoe；V0.1.27 = 零 schema 改：stats 加 myAnnualReport action（年汇总+月度分布+最长单次+活跃天数，单次 groupBy 性能优化）+ 前端 sport 打卡加跑鞋 picker（联动 incrementShoeKm → 跑鞋里程闭环）+ 前端 device-bind 加调试面板（操作日志+心率回调计数，可观测性，后端无改动）；V0.1.28 = 新表 Goal（#35）+ User +goals relation + goal module（4 action：list/add/remove/myProgress，calcGoalProgress 复用 Checkin aggregate DRY）+ stats 加 myCertificates action（动态生成零建表：里程碑证书 100/500/1000/3000km + 赛事证书 marathon + 下一里程碑进度，Cache 120s）+ 迁移 20260703150000_goal + goal +7 单测；V0.1.29 = 新表 Favorite（#36，userId + targetType(content|product) + targetId + unique 防重 + 索引 [userId, targetType]）+ User +favorites relation + favorite module（4 action：list 含详情**批量关联避免 N+1**/add upsert 幂等/remove/isFavorited 批量红心）+ 迁移 20260703160000_favorite + favorite +6 单测 + stats.service 补单测（myAnnualReport/myCertificates 覆盖 39→100%）；总覆盖 80.66→82.11%；**V0.1.30 = 3 新表 Feed+FeedLike+FeedComment（#37-39，迁移 20260703170000_feed，onDelete Cascade 删动态级联点赞/评论；Feed 索引 [createdAt]+[userId,createdAt]；FeedLike `@@unique([feedId,userId])` 防重；FeedComment 索引 [feedId,createdAt]）+ User 加 feeds/feedLikes/feedComments relation + feed module（6 action：list 含作者+liked 状态 / myFeeds / publish 可关联 checkinId+distanceKm / like / unlike / comment，$transaction 回调维护 likeCount/commentCount）+ 迁移 20260703170000_feed + feed +10 单测（list 2 + publish 1 + like 3 + unlike 2 + comment 2）；vi.hoisted 修复 createPrismaMock hoisting 坑**；**V0.1.31 = 新表 Notification（#40，userId/actorId/type(like|comment|follow|system)/targetType?/targetId?/content?/isRead 默认 false/createdAt，索引 [userId,isRead,createdAt]+[userId,createdAt]，onDelete CASCADE(user)+RESTRICT(actor)，User 加 notifications/notifActions(@relation("NotifActor")) 双 relation，迁移 20260703180000_notification）+ notification module（4 action：list 含 actor 头像/昵称 + 分页 / unreadCount 红点轻量 count / markRead 鉴权仅本人（n.userId !== userId → forbidden）/ markAllRead updateMany 幂等）+ **导出 `notify()` 集成函数**（DRY，被 feed 复用，`if (userId === actorId) return` 自己赞自己跳过，不在内部 try/catch — 调用方决定容错）+ feed.service 集成（like/comment 事务后 `try { await notify(...) } catch {}` 吞错，通知写库失败不阻塞主链路；comment content 50 字截断作摘要；type=like/comment，targetType=feed）+ notification +8 单测（list 2 含 hasMore + unreadCount 1 + markRead 2 含 forbidden + markAllRead 1 + notify 2 含自己跳过）+ feed.service.test 重构 mock（加 `vi.mock('src/modules/notification/notification.service.js', () => ({ notify: vi.fn() }))` 隔离 + 断言集成调用，替代原 try/catch 吞 TypeError 碰巧通过的脆弱写法）+ 前端 pages/notification（列表卡 actor 头像+昵称+文案+内容摘要+时间+未读红点 + 全部已读按钮 + 点击乐观标记已读 + 跳 feed + onReachBottom 分页 + 下拉刷新）+ mine 入口带未读徽标**；**V0.1.32 = 新表 Follow（#41，followerId/followeeId/createdAt，`@@unique([followerId,followeeId])` 防重 + 索引 [followerId]+[followeeId] + onDelete CASCADE 任一用户删级联，User 加 following(@relation("Follower"))+followers(@relation("Followee")) 双 relation — **坑：同 model 双 relation 必须 @relation("name") 消歧义，否则 prisma generate 报 P1012 Ambiguous relation**（范式同 V0.1.31 NotifActor），迁移 20260703190000_follow）+ follow module（6 action：follow upsert 幂等 + 不能关注自己 badRequest + 复用 notify(type=follow) try/catch 吞错 / unfollow deleteMany 幂等 / isFollowing 批量查按钮状态 Set 拼装 / myFollowing 分页含 user / myFollowers 分页含 user / myCounts 一次拿全 user+followingCount+followerCount+isFollowing+isSelf 用户主页用 — 复用 V0.1.31 notify 集成函数 type=follow 是第 3 个 type 继 like/comment 之后）+ 前端 pages/user（用户主页：头像+昵称+关注数/粉丝数+关注按钮**乐观更新**失败回滚 + isSelf 自己不显示按钮；调 follow.myCounts 一次拿全 / follow.follow / follow.unfollow）+ feed wxml feed-head 加 data-uid + bindtap onTapUser 跳用户主页（关注闭环入口）+ follow +10 单测（follow 3 含自己/notFound/通知 + unfollow 1 + isFollowing 1 + myFollowing 1 + myFollowers 1 + myCounts 3 含 isSelf/notFound）+ mock notify 隔离范式（vi.mock notification.service.js → notify: vi.fn()，同 feed.test.ts V0.1.31 范式）+ 🐛 training wxss 中文 selector 修复（原 `.plan-card.入门/进阶/挑战/极限` 4 个中文 class selector 编译报 `unexpected � at pos 1725`，wxss 编译器对中文 selector 解析失败 → 分离 levelKey 英文 beginner/intermediate/challenge/extreme 作 class + level 中文显示，前端 LEVEL_KEY_MAP 映射；全 miniprogram wxss 扫描确认无中文 selector 残留）**；**V0.1.33 = BLE 设备品牌识别（零 schema 改 / 方案1 MVP）：① shared device-brands.ts 改 `xiaomi` available false→**true**（小米手环可绑定）+ garmin.desc 加"BLE 实时心率 + OAuth 历史" + 新增 `BLE_VENDOR_PATTERNS: Record<string, RegExp[]>`（garmin: /garmin|forerunner|fenix|vivoactive|edge/i；xiaomi: /mi\s*band|xiaomi|小米|redmi/i）+ 新增 `matchBleVendor(name): 'garmin' | 'xiaomi' | 'ble'` 函数（按设备名匹配，未中返 'ble'）+ `BleVendor` type（**前后端单一数据源**）；② device.schema.ts `BindBleDeviceInputSchema` 加 `vendor: z.enum(['ble','garmin','xiaomi']).default('ble')` + `brandMeta: {manufacturer?, model?}.optional()`（透传不持久化）；③ device.service.ts `bindBleDevice` 接受 vendor 按 `[userId, vendor]` upsert（**可同时绑多设备：garmin+xiaomi+ble 共存**，**service 层兜底 `input.vendor ?? 'ble'`** — route Zod default 不覆盖 service 直接调用，如测试）+ `myBindings` 加 `garminBleBound: boolean`（DeviceBinding vendor=garmin 存在）+ 保留 garminAutoConnected/garminActivityCount（OAuth 数据）→ **BLE 绑定优先，OAuth 降级**；deviceName 逻辑扩 garmin/xiaomi（accessTokenEnc 存设备名）；④ 前端 utils/ble.ts 新增 `readBattery(deviceId): Promise<number | null>`（0x180F / 2A19 电量百分比）+ `readDeviceInfo(deviceId): Promise<{manufacturer, model}>`（0x180A：2A29 Manufacturer Name + 2A24 Model Number）+ `readCharValue` 通用工具（微信 `readBLECharacteristicValue` 值通过 `onBLECharacteristicValueChange` 回调拿，success 不返 value → 临时监听 + serviceId/characteristicId 过滤 + 超时返 null 容错）；⑤ 前端 device-bind 页改造（扫描结果 matchBleVendor 自动识别 + 品牌标签佳明蓝 .brand-garmin / 小米橙 .brand-xiaomi / 通用灰 .brand-ble；`onSelectDevice` 流程 connect → Promise.all([readBattery, readDeviceInfo]) → 品牌识别（设备名 + 0x180A Manufacturer 二次验证）→ 未识别 wx.showActionSheet 手选兜底（佳明/小米/通用）→ subscribeHeartRate → bindBleDevice 传 vendor+brandMeta；心率卡显示电量/型号/厂商 hr-meta-item；garmin OAuth 降级段 `garminAutoConnected && !garminBleBound` 时显示"历史数据已连接（OAuth）"提示可 BLE 绑定；`onTapBrand` ble/garmin/xiaomi 都走 BLE 扫描）；⑥ **3 坑沉淀**（service 层 vendor 兜底 `?? 'ble'` / `wx.readBLECharacteristicValue` 值不在 success 回调（微信文档规定值通过 `onBLECharacteristicValueChange` 回调拿；与 subscribeHeartRate 全局监听共存，按 serviceId 过滤互不干扰）/ 小程序 TS 类型 3 坑：TextDecoder 非 DOM lib 不可用（用 fromCharCode，Manufacturer Name/Model 规范 ASCII 够用）、`offBLECharacteristicValueChange` 类型签名 `()` 不接受参数（运行时支持 cb，@ts-ignore 绕过）、`OnBLECharacteristicValueChangeCallbackResult` 类型不存在（用结构类型 `{serviceId, characteristicId, value}` + @ts-ignore））；⑦ 测试 device.bindings.test.ts 重构 mock（deviceBinding 加 findUnique）+ **3 新测试**（garmin BLE 优先 myBindings + bindBleDevice vendor=garmin + vendor=xiaomi）；**527→530 passed / 0 failed**；41 表 / 28 module / 33 页 / 16 迁移（均不变，零 schema 改）**；**V0.1.34 = 家庭空间 family（pic 2776 家庭方向，/zcf:workflow 方案1 完整 family module）：① **2 新表**（迁移 `20260704000000_family`，表 41→43）：**Family #42**（id / name / ownerId / inviteCode(@unique 8 位 hex 短码，randomUUID slice 8 + toUpperCase) / createdAt；owner User `@relation("FamilyOwner")`；members FamilyMember[]；goals Goal[]）+ **FamilyMember #43**（familyId / `userId @unique`（**一人一家庭强制**）/ role(owner|member, 默认 member) / joinedAt；onDelete Cascade（Family 删→成员级联，User 删→成员级联）；family Family @relation + user User @relation）；② **Goal 表改**（不新表）：+`familyId String?`（null=个人目标，有值=家庭目标）+ 外键 onDelete Cascade + 索引 [familyId]；迁移数 16→17；③ **User 加双 relation**：`familiesOwned Family[] @relation("FamilyOwner")`（创建的家庭）+ `familyMember FamilyMember?`（1:1，一人一家庭）— **坑：User 双 Family relation 必须 @relation("FamilyOwner") 消歧义，范式累计第 3 次**（NotifActor V0.1.31 / Follower V0.1.32 / FamilyOwner V0.1.34）；④ **新 module family**（28→29，6 action）：`createFamily(userId, {name})` 事务内建 Family(ownerId) + FamilyMember(role=owner) + 8 位 inviteCode；已有家庭 → conflict；`joinFamily(userId, {inviteCode})` 按 inviteCode 查 Family → notFound 兜底；已有家庭 → conflict；加 FamilyMember(role=member)；`myFamily(userId)` 家庭卡 + 成员列表含**本月跑量**（Checkin aggregate by member）；无家庭返 family:null；`leaveFamily(userId)` owner 不可离开（badRequest，需转让/解散）；member 删 FamilyMember；`familyRanking(userId, {period: week|month})` 本周/本月 CN 时区（cnWeekRange/cnMonthRange）成员跑量榜按距离降序；`inviteInfo(userId)` 返 family.name + inviteCode（前端分享/复制）；⑤ **goal module 扩展**（复用 Goal，DRY）：`calcGoalProgress` 改 `userIds: string[]` 参数（个人=[userId]，家庭=成员 userIds 列表，`where userId: { in: userIds }`）；`list` / `myProgress` 加 `familyId: null` 过滤（仅个人目标）；`addFamilyGoal(userId, {familyId, type, targetDistance, title?})` 鉴权 member.familyId 必须匹配 input.familyId（forbidden）；goal.create(familyId, userId=创建者)；`myFamilyGoals(userId)` 查 myFamilyId → Goal where familyId + 成员 userIds → 进度按家庭成员聚合；⑥ **前端 pages/family**（页面 33→34）：家庭卡（name+inviteCode+成员数）+ 邀请按钮（复制 inviteCode）+ 本月跑量榜（rank-num+avatar+nickname+家长标+monthDistance）+ 家庭目标进度条 + 创建/加入（无家庭态）+ 添加家庭目标弹层（月度/年度 picker + title + targetDistance）+ leaveFamily 按钮（非 owner）；mine 入口「家庭空间」（19→20 宫格）；⑦ **测试**：family +10 单测（createFamily 2 + joinFamily 2 + myFamily 2 + leaveFamily 2 + familyRanking 1 + inviteInfo 1，**mockImplementation 按 userId 区分**并发 aggregate）；goal +5（addFamilyGoal 3 含 forbidden + myFamilyGoals 2 含 where userId in 断言）；总测试 530→**545 passed / 0 failed**；⑧ **3 决策**：方案 2（A 家庭组 + B 跑量榜 + C 家庭目标）/ 一人一家庭（FamilyMember.userId @@unique）/ 复用 Goal+familyId（calcGoalProgress 扩 userIds，DRY）；⑨ **3 坑沉淀**：① Prisma User 双 Family relation（familiesOwned `@relation("FamilyOwner")` + familyMember 1:1）需 @relation 命名消歧义（范式累计第 3 次）；② inviteCode 8 位 hex 短码（randomUUID slice 8 + toUpperCase）@unique 兜底，极小概率重复时报错让用户重试（YAGNI，不加重试）；③ familyRanking Promise.all 并发 aggregate：mockResolvedValueOnce 顺序不保证 → mockImplementation 按 userId 区分（并发 mock 测试范式）；**43 表 / 29 module / 34 页 / 17 迁移 / 545 单元 / 15 缓存热路径（family 暂未接 Cache，持平）**

---

## 🎯 职责

Node.js + TypeScript 后端（Fastify 4），对外提供 **29 个 module** + **domain 层** + **jobs** + **CLI 工具**。
**唯一权威**：openid、积分、余额、订单状态、微信支付回调、**分销佣金**、**心率缓存**（ble:hr:{userId}）、**跑鞋累计里程**（Checkin.shoeId → incrementShoeKm）、**年度汇总**（stats.myAnnualReport）、**跑步目标进度**（goal.calcGoalProgress 复用 Checkin aggregate，**V0.1.34 扩 userIds 支持家庭目标**）、**证书颁发**（stats.myCertificates 动态生成）、**收藏红心状态**（favorite.isFavorited 批量查）、**动态点赞/评论计数**（feed.$transaction 回调维护 likeCount/commentCount）、**消息通知**（notification.notify() 集成函数被 feed 复用）、**关注关系**（follow.myCounts 用户主页一次拿全）、**BLE 设备品牌识别**（device.bindBleDevice 接 vendor，BLE 绑定优先 OAuth 降级）、**家庭空间**（family.createFamily/joinFamily/myFamily + 家庭目标 goal.addFamilyGoal/myFamilyGoals 复用 Goal+familyId）都在这里产生和变更。

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
│   ├── modules/                      # 29 个业务 module（见下方详表）
│   │   ├── auth / user / sport / mall / content / wallet / weekly-report
│   │   ├── upload / admin / app-config / wxpay                  # V1 + Phase 4
│   │   ├── device (V2 部分实现·佳明+蓝牙+今日健康+V0.1.33 品牌化 bindBleDevice(vendor) + myBindings garminBleBound) / stats / ranking          # 佳明 + V0.1.25 + V0.1.27 myAnnualReport + V0.1.28 myCertificates（V0.1.29 覆盖 39→100%）
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
│   │   └── ...（refund.service / wallet.repo 内部）
│   ├── jobs/                         # BullMQ 定时任务
│   │   ├── queue.ts                  # startJobs / stopJobs / enqueueCloseOrder
│   │   ├── scheduler.ts              # BullMQ repeatable（cron）
│   │   ├── weekly-report.job.ts      # 每周日 20:00 聚合周报
│   │   ├── close-order.job.ts        # 30 分钟超时关单（Phase 4.1）
│   │   ├── refresh-certs.job.ts      # 微信平台证书定时刷新（V0.1.1）
│   │   └── garmin-import.job.ts      # 佳明活动入 Checkin（concurrency=2，5min 桶去重）
│   └── ...
├── scripts/                          # CLI 工具
│   ├── reconcile.ts                  # `pnpm reconcile -- YYYY-MM-DD` 微信账单比对
│   └── import-garmin.ts              # `pnpm garmin-import` 佳明全量入 Checkin（500/事务）
├── prisma/
│   ├── schema.prisma                 # **43 张表**（V1 12 + admin AuditLog + V2 13 含佳明 3 表 + 电商 7 表 + 跑鞋 1 表 + 目标 1 表 + 收藏 1 表 + 动态 3 表 + 通知 1 表 + 关注 1 表 + 家庭 2 表；V0.1.26 +Shoe + Checkin.shoeId；V0.1.27 零 schema 改；V0.1.28 +Goal；V0.1.29 +Favorite；V0.1.30 +Feed+FeedLike+FeedComment；V0.1.31 +Notification；V0.1.32 +Follow；V0.1.33 零 schema 改，复用 DeviceBinding.accessTokenEnc 存设备名 + brandMeta 透传不持久化；**V0.1.34 +Family +FamilyMember + Goal.familyId + User 加 familiesOwned/familyMember 双 relation**）
│   │                                # Order 表加：payChannel / prepayId / wxTransactionId / paidAt / sourceUserId（分销）
│   │                                # User 表加：inviteCode(@unique) / distributorLevel(V0-V3)（分销）/ shoes relation（V0.1.26）/ goals relation（V0.1.28）/ favorites relation（V0.1.29）/ feeds+feedLikes+feedComments relation（V0.1.30）/ notifications+notifActions(@relation("NotifActor")) 双 relation（V0.1.31）/ following+followers 双 relation（@relation("Follower")/@relation("Followee")，V0.1.32）/ **familiesOwned+familyMember 双 relation（@relation("FamilyOwner")，V0.1.34）**
│   │                                # Checkin 表加：shoeId?（V0.1.26，外键 ON DELETE SET NULL，sport.checkin 集成 incrementShoeKm）
│   │                                # Goal 表加：familyId?（V0.1.34，null=个人目标，有值=家庭目标，外键 onDelete Cascade + 索引 [familyId]）
│   │                                # DeviceBinding：vendor 枚举含 ble（V0.1.25，复用 vendorUserId/scopes/accessTokenEnc，零 schema 改动）；**V0.1.33 复用 accessTokenEnc 存 BLE 设备名 + brandMeta 透传不持久化**
│   ├── seed.ts                       # 初始数据（feature_flags + 8 商品 + AppConfig）
│   ├── sql/permissions.sql           # 角色权限参考
│   └── migrations/                   # Prisma 迁移历史（17 个，见下方表清单）
├── tests/
│   ├── modules/                      # 单元测试（vi.mock Prisma/Redis）— **545 tests**（vitest run 实测累加；V0.1.28 goal +7；V0.1.29 favorite +6 + stats.service 补单测覆盖 39→100%；V0.1.30 feed +10；V0.1.31 notification +8 + feed.service.test 重构 mock；V0.1.32 follow +10；V0.1.33 device +3：garmin BLE 优先 myBindings + bindBleDevice vendor=garmin + vendor=xiaomi；**V0.1.34 family +10：createFamily 2 + joinFamily 2 + myFamily 2 + leaveFamily 2 + familyRanking 1 + inviteInfo 1，mockImplementation 按 userId 区分并发 aggregate；goal +5：addFamilyGoal 3 含 forbidden + myFamilyGoals 2 含 where userId in 断言**）
│   │   ├── user/sport/mall/content/wallet/weekly-report/admin/app-config...
│   │   ├── wxpay/{service,notify}.test.ts
│   │   ├── mall/{order,refund}.service.test.ts
│   │   ├── wallet/{service,repo}.test.ts
│   │   ├── jobs/{queue,close-order.job}.test.ts
│   │   ├── domain/order-state.test.ts
│   │   ├── device/{garmin,service,routes,health,bindings}.test.ts  # ~32 用例（含 V0.1.25 +11：health 3 + bindings 7；**V0.1.33 +3：garmin BLE 优先 + vendor=garmin + vendor=xiaomi**；bindings.test.ts 重构 mock deviceBinding 加 findUnique）
│   │   ├── stats / ranking / cart / points / address / coupon    # B 电商 + 佳明 + V0.1.27/28 stats（**V0.1.29 stats 补 myAnnualReport/myCertificates 单测，覆盖 39→100%**）
│   │   ├── distribution/distribution.service.test.ts             # **17 用例**（V0.1.24）
│   │   ├── training/training.service.test.ts                     # **5 用例**（V0.1.25）
│   │   ├── shoes/shoes.service.test.ts                           # **7 用例**（V0.1.26：list 2 + add 1 + retire 3 + myStats 1）
│   │   ├── goal/goal.service.test.ts                             # **12 用例**（V0.1.28：list 2 + add 3 + remove 2 + myProgress 1；**V0.1.34 +5：addFamilyGoal 3 含 forbidden + myFamilyGoals 2 含 where userId in 断言**）
│   │   ├── favorite/favorite.service.test.ts                     # **6 用例**（V0.1.29：list 3 + add 1 + remove 1 + isFavorited 1）
│   │   ├── feed/feed.service.test.ts                             # **10 用例**（V0.1.30：list 2 + publish 1 + like 3 + unlike 2 + comment 2，vi.hoisted 修复 createPrismaMock hoisting；**V0.1.31 重构 mock：加 vi.mock notify 隔离 + 断言集成调用，替代原 try/catch 吞 TypeError 脆弱写法**）
│   │   ├── notification/notification.service.test.ts             # **8 用例**（V0.1.31：list 2 含 hasMore + unreadCount 1 + markRead 2 含 forbidden + markAllRead 1 + notify 2 含自己跳过）
│   │   ├── follow/follow.service.test.ts                         # **10 用例**（V0.1.32：follow 3 含自己/notFound/通知 + unfollow 1 + isFollowing 1 + myFollowing 1 + myFollowers 1 + myCounts 3 含 isSelf/notFound；vi.mock notify 隔离范式同 feed.test.ts V0.1.31）
│   │   └── family/family.service.test.ts                         # **10 用例**（V0.1.34：createFamily 2 + joinFamily 2 + myFamily 2 + leaveFamily 2 + familyRanking 1 + inviteInfo 1，mockImplementation 按 userId 区分并发 aggregate）
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

### 29 个 Module 清单（V1 11 + Phase 4 wxpay + 佳明 2 + V2 stub 2 + B 电商 5 + pic 训练 1 + 跑鞋 1 + 目标 1 + 收藏 1 + 动态 1 + 通知 1 + 关注 1 + 家庭 1）

| Module | 路由前缀 | Service | Schema | 测试 | 状态 |
| --- | --- | --- | --- | --- | --- |
| **auth** | `/api/auth` | — (route 内联) | — | — | ✅ 微信登录 + code2Session |
| **user** | `/api/user` | ✅ 150 行 | ✅ 83 行 | 3 单元 | ✅ login + profile + update + **+inviteCode/distributorLevel**（V0.1.24）+ **+shoes relation**（V0.1.26）+ **+goals relation**（V0.1.28）+ **+favorites relation**（V0.1.29）+ **+feeds/feedLikes/feedComments relation**（V0.1.30）+ **+notifications/notifActions(@relation("NotifActor")) 双 relation**（V0.1.31）+ **+following/followers 双 relation**（V0.1.32）+ **+familiesOwned/familyMember 双 relation**（V0.1.34） |
| **sport** | `/api/sport` | ✅ 311 行 | ✅ 72 行 | 12 单元 + 3 e2e | ✅ 打卡/统计/群榜单/建群 + **+shoeId 集成 incrementShoeKm**（V0.1.26：CheckinInputSchema 加 shoeId optional，事务内调 shoes.service 导出的 incrementShoeKm，shoeId 空→跳过，向后兼容）+ **V0.1.27 前端 picker 联动**（sport 打卡页加跑鞋 picker 调 shoes.list 取 active → 跑鞋里程闭环） |
| **mall** | `/api/mall` | ✅ 88 行 + refund.service 116 行 | ✅ 64 行 | 7 单元 + 1 e2e | ✅ 商品/分类/下单/取消/退款 + **+分销集成**（createOrder 解析 inviteCode 落 DistrOrder + Team） |
| **content** | `/api/content` | ✅ 93 行 | ✅ 36 行 | 8 单元 | ✅ 内容列表/详情/报名（公开） |
| **wallet** | `/api/wallet` | ✅ 114 行 + wallet.repo 64 行 | ✅ 29 行 | 12 单元 | ✅ 余额/充值/消费/退款 + ensureWalletInTx（**被 settle/clawback 复用**） |
| **weekly-report** | `/api/weekly-report` | ✅ 185 行 | ✅ 14 行 | 2 e2e | ✅ 周报聚合 + BullMQ 定时 |
| **upload** | `/api/upload` | — (route 内联) | — | — | ✅ 文件上传（@fastify/multipart） |
| **admin** | `/api/admin` | ✅ admin.service（**18** action / 522 行） | ✅ admin.schema（143 行） | 22 + 12 单元 | ✅ 全功能（白名单+商品/内容/订单/配置/退款+用户/内容/商品列表/统计+黑名单/审计/报表/导出+缓存失效） |
| **app-config** | (内嵌) | — | — | — | ✅ AppConfig 表 + 功能开关 |
| **wxpay** | `/api/wxpay` | ✅ 350 行（refund / queryBill / downloadBill） | ✅ 80 行 | 8 单元 + 2 e2e | ✅ **Phase 4 + 4.1** 微信支付 V3 完整闭环 + **+notify 触发 settleCommission** |
| **device** | `/api/device` | ✅ ~410 行（V0.1.25 +heartRate/bindings/todayHealth；V0.1.33 +vendor 品牌化） | ✅ ~110 行（V0.1.33 +vendor enum + brandMeta） | 3+ files / ~32 用例（V0.1.25 +11；**V0.1.33 +3：garmin BLE 优先 + vendor=garmin + vendor=xiaomi**） | 🚧 V2 **部分实现** — 设备绑定 + 佳明 4 查询（Cache 300s）+ 4 数据处理（myPending/myProcessed/ignoreActivity/importToCheckin）+ **V0.1.25 扩 5 action**：myTodayHealth（聚合 4 类佳明数据，Cache 300s）/ myBindings（9 品牌+绑定+佳明自动检测）/ bindBleDevice（vendor=ble）/ unbind（stub→实现）/ submitHeartRate（stub→Redis 缓存 ble:hr:{userId} TTL 1h）；**V0.1.27 后端无改动**（前端 device-bind 加调试面板）；**V0.1.33 品牌化 bindBleDevice(vendor)** — BindBleDeviceInputSchema 加 `vendor: z.enum(['ble','garmin','xiaomi']).default('ble')` + `brandMeta: {manufacturer?, model?}.optional()`（透传不持久化），service `input.vendor ?? 'ble'` 兜底（route Zod default 不覆盖 service 直接调用，如测试），按 `[userId, vendor]` upsert（**可同时绑多设备 garmin+xiaomi+ble 共存**）+ **myBindings 加 garminBleBound: boolean**（DeviceBinding vendor=garmin 存在）+ 保留 garminAutoConnected/garminActivityCount（OAuth 数据）→ **BLE 绑定优先，OAuth 降级**；deviceName 逻辑扩 garmin/xiaomi（accessTokenEnc 存设备名）；复用 shared `matchBleVendor` 单一数据源（前后端共用） |
| **stats** | `/api/stats` | ✅ | ✅ | **6 单元**（V0.1.29 补 myAnnualReport/myCertificates 单测，**覆盖 39→100%**） | ✅ myRunnerStats 年/总跑量汇总（Cache）+ **V0.1.27 新增 myAnnualReport**（年汇总：yearDistance/yearCheckins/yearDurationSec/avgPace + 月度分布 12 个月 + longestRun + activeDays；**性能**：单次 groupBy(by date) 拿全年每日 → reduce 月度，避免 12 次 aggregate）+ **V0.1.28 新增 myCertificates**（动态生成零建表：里程碑证书 MILESTONE_CERTS 100/500/1000/3000km 基于 Checkin aggregate 自动颁发 + 赛事证书 Enrollment type=marathon + Content → 已报名马拉松 + 下一里程碑进度 nextMilestone + totalDistance/totalCheckins；Cache 120s） |
| **ranking** | `/api/ranking` | ✅ | ✅ | 4 单元 | ✅ groupRankingMulti多维榜单 |
| **recipe** | `/api/recipe` | ✅ 66 行 | ✅ 67 行 | 7 路由层 | 🚧 V2 stub — 菜谱 |
| **ludong** | `/api/ludong` | ✅ 57 行 | ✅ 45 行 | 6 路由层 | 🚧 V2 stub — 律动对接 |
| **cart** | `/api/cart` | ✅ | ✅ | 6 单元 | ✅ **B 电商**（V0.1.22）add/remove/list/updateQty/clear（userId+productId unique 合并 qty） |
| **points** | `/api/points` | ✅ | ✅ | 5 单元 | ✅ **B 电商**（V0.1.22）myBalance/signin/myTasks（签到 +10/天 + 连续 7 天 +50） |
| **address** | `/api/address` | ✅ | ✅ | 4 单元 | ✅ **个人中心电商版**（V0.1.23）CRUD + setDefault（事务清他处） |
| **coupon** | `/api/coupon` | ✅ | ✅ | 5 单元 | ✅ **个人中心电商版**（V0.1.23）templates/myCoupons/receive/availableCount（MVP 领看不集成下单） |
| **distribution** | `/api/distribution` | ✅ 408 行（含 settle/clawback） | ✅ 16 行 | **17 单元** | ✅ **B 分销中心**（V0.1.24）mySummary/myOrders/myTeam/myCommissionLogs/myLevel/inviteInfo 6 action + **settleCommission/clawbackCommission 集成函数** + LEVEL_RULES 等级规则 → [详见 module CLAUDE.md](src/modules/distribution/CLAUDE.md) |
| **training** | `/api/training` | ✅ | ✅ | **5 单元** | ✅ **pic 训练**（V0.1.25）myPlans 4 套硬编码模板（GO/减脂/跑者/赛事助手）+ mySportRecords 聚合（Checkin run + RawActivity running，importCheckinId 去重）；**V0.1.32 wxss 中文 selector 修复**（前端 levelKey 英文 class + level 中文显示） |
| **shoes** | `/api/shoes` | ✅ | ✅ | **7 单元**（V0.1.26） | ✅ **我的跑鞋**（V0.1.26，pic 2768）list（含 healthRatio = currentKm/thresholdKm*100）/ add / update / retire（active→retired）/ myStats（total/activeCount/retiredCount/totalKm/retiringSoonCount，retiringSoon = healthRatio≥70%）；thresholdKm 默认 800；**导出 incrementShoeKm 供 sport.service.checkin 复用**（DRY）；**V0.1.27 前端 sport 打卡页 picker 联动 shoes.list 取 active**（跑鞋里程闭环） |
| **goal** | `/api/goal` | ✅ | ✅ | **12 单元**（V0.1.28 +7；**V0.1.34 +5**） | ✅ **跑步目标**（V0.1.28，pic 2768 跑者向）list（含进度 currentDistance + percent + completed，复用 calcGoalProgress helper）/ add（type 自动算周期：monthly 本月1号0时→下月1号0时 / yearly 今年1/1→明年1/1 / custom 手传 periodStart/End）/ remove（硬删）/ myProgress（仅 status=active）；**calcGoalProgress helper**（list + myProgress 复用，DRY）— Checkin aggregate（date "YYYY-MM-DD" 在 periodStart-End 范围 → sum distance）；Goal 表 type(monthly/yearly/custom) + targetDistance(Float) + periodStart/End + status(active/archived 默认 active) + 索引 [userId, status]；迁移 `20260703150000_goal`；**V0.1.34 扩 family 目标**：`calcGoalProgress` 改 `userIds: string[]` 参数（个人=[userId]，家庭=成员 userIds 列表，`where userId: { in: userIds }`）；`list` / `myProgress` 加 `familyId: null` 过滤（仅个人目标）；**+addFamilyGoal**（鉴权 member.familyId 必须匹配 input.familyId，forbidden；goal.create(familyId, userId=创建者)）/ **+myFamilyGoals**（查 myFamilyId → Goal where familyId + 成员 userIds → 进度按家庭成员聚合）；5 新单测（addFamilyGoal 3 含 forbidden + myFamilyGoals 2 含 where userId in 断言）；Goal 表 +familyId?（null=个人，有值=家庭）外键 onDelete Cascade + 索引 [familyId] |
| **favorite** | `/api/favorite` | ✅ | ✅ | **6 单元**（V0.1.29） | ✅ **收藏**（V0.1.29，pic 3 向社交向首功能）list（含 Content/Product 详情，**批量关联避免 N+1**：先 findMany 收藏，再 findMany where id in 取详情，Map 拼装）/ add（upsert 幂等，重复收藏不报错）/ remove（deleteMany，不存在也 ok）/ isFavorited（批量红心状态查询，详情页/列表页用，传 targetType + targetIds[]，返 {targetId: boolean} Map）；Favorite 表 targetType(content\|product) + targetId + `@@unique([userId, targetType, targetId])` 防重 + `@@index([userId, targetType])`；迁移 `20260703160000_favorite` |
| **feed** | `/api/feed` | ✅ | ✅ | **10 单元**（V0.1.30，V0.1.31 重构 mock） | ✅ **运动动态**（V0.1.30，pic 2 社交向核心）list（含作者 User + 当前用户 liked 状态）/ myFeeds（仅当前用户动态）/ publish（可关联 checkinId + distanceKm，从打卡延伸）/ like（**$transaction 回调**：create FeedLike + Feed.likeCount+1，依赖 unique 约束幂等）/ unlike（$transaction 回调：delete FeedLike + Feed.likeCount-1）/ comment（$transaction 回调：create FeedComment + Feed.commentCount+1）；Feed 表 content/images[]/checkinId?/distanceKm?/likeCount(默认0)/commentCount(默认0) + 索引 [createdAt]+[userId,createdAt] + onDelete RESTRICT；FeedLike `@@unique([feedId,userId])` 防重 + onDelete CASCADE（Feed 删级联）；FeedComment 索引 [feedId,createdAt] + onDelete CASCADE；User 加 feeds/feedLikes/feedComments relation；迁移 `20260703170000_feed`；**V0.1.31 feed.service 集成 notify()**（like/comment 事务后 `try { await notify(...) } catch {}` 吞错，通知写库失败不阻塞主链路；comment content 50 字截断作摘要；type=like/comment，targetType=feed） |
| **notification** | `/api/notification` | ✅ | ✅ | **8 单元**（V0.1.31） | ✅ **消息中心**（V0.1.31，pic 2 社交向收尾）list（分页 include actor 头像/昵称）/ unreadCount（红点轻量 count）/ markRead（鉴权仅本人，`n.userId !== userId → forbidden`）/ markAllRead（updateMany 幂等）；**导出 `notify()` 集成函数**（DRY，被 feed 复用）：`if (userId === actorId) return`（自己赞自己跳过），不在内部 try/catch — 调用方决定容错；Notification 表 userId/actorId/type(like\|comment\|follow\|system)/targetType?/targetId?/content?/isRead(默认 false)/createdAt + 索引 [userId,isRead,createdAt]+[userId,createdAt] + onDelete CASCADE(user)+RESTRICT(actor)；User 加 notifications/notifActions(@relation("NotifActor")) 双 relation；迁移 `20260703180000_notification` |
| **follow** | `/api/follow` | ✅ | ✅ | **10 单元**（V0.1.32） | ✅ **关注关系**（V0.1.32，社交向深化）follow（upsert 幂等 + 不能关注自己 badRequest + 复用 notify(type=follow) try/catch 吞错）/ unfollow（deleteMany 幂等）/ isFollowing（批量查按钮状态 Set 拼装）/ myFollowing（分页含 user）/ myFollowers（分页含 user）/ myCounts（一次拿全：user + followingCount + followerCount + isFollowing + isSelf，用户主页用，可查任意 userId 不限于自己，viewerId 算 isFollowing/isSelf）；Follow 表 followerId（关注者）+ followeeId（被关注者）+ createdAt + `@@unique([followerId,followeeId])` 防重 + 索引 [followerId]+[followeeId] + onDelete CASCADE（任一用户删→关系级联）；User 加 following(@relation("Follower"))+followers(@relation("Followee")) 双 relation；**复用 V0.1.31 notify 集成函数**（type=follow 是第 3 个 type，继 like/comment 之后）；迁移 `20260703190000_follow` |
| **family** | `/api/family` | ✅ | ✅ | **10 单元**（V0.1.34） | ✅ **家庭空间**（V0.1.34，pic 2776 家庭方向）createFamily（事务内建 Family(ownerId) + FamilyMember(role=owner) + 8 位 inviteCode hex 短码 randomUUID slice 8 + toUpperCase；已有家庭 → conflict）/ joinFamily（按 inviteCode 查 Family → notFound 兜底；已有家庭 → conflict；加 FamilyMember(role=member)）/ myFamily（家庭卡 + 成员列表含**本月跑量**（Checkin aggregate by member）；无家庭返 family:null）/ leaveFamily（owner 不可离开 badRequest，需转让/解散；member 删 FamilyMember）/ familyRanking（本周/本月 CN 时区 cnWeekRange/cnMonthRange 成员跑量榜按距离降序，period: week\|month）/ inviteInfo（返 family.name + inviteCode 前端分享/复制）；Family 表 id/name/ownerId/inviteCode(@unique 8 位 hex 短码)/createdAt + owner User `@relation("FamilyOwner")` + members FamilyMember[] + goals Goal[]；FamilyMember 表 familyId/`userId @unique`（**一人一家庭强制**）/role(owner\|member 默认 member)/joinedAt + onDelete Cascade（Family 删→成员级联，User 删→成员级联）；User 加 familiesOwned(@relation("FamilyOwner")) + familyMember(1:1) 双 relation；**3 决策**：方案2（A 家庭组 + B 跑量榜 + C 家庭目标）/ 一人一家庭 @@unique / 复用 Goal+familyId（calcGoalProgress 扩 userIds，DRY）；迁移 `20260704000000_family`；**3 坑**：Prisma User 双 Family relation @relation("FamilyOwner") 消歧义（范式累计第 3 次：NotifActor/Follower/FamilyOwner）/ inviteCode 8 位 @unique 兜底（极小概率重复报错让用户重试，YAGNI）/ familyRanking Promise.all 并发 aggregate mockImplementation 按 userId 区分（mockResolvedValueOnce 顺序不保证） |

### 数据库表（43 张，V0.1.34 +Family +FamilyMember + Goal.familyId + User.familiesOwned/familyMember 双 relation；V0.1.33 零 schema 改；V0.1.32 +Follow + User.following/followers 双 relation；V0.1.31 +Notification + User.notifications/notifActions relation；V0.1.30 +Feed+FeedLike+FeedComment + User.feeds/feedLikes/feedComments relation；V0.1.29 +Favorite + User.favorites relation；V0.1.28 +Goal + User.goals relation；V0.1.27 零 schema 改；V0.1.26 +Shoe + Checkin.shoeId）

| # | 表名 | Module | V1/V2 | 引入版本 |
|---|--- |--- |--- |--- |
| 1 | User | user | V1 | （含 +inviteCode/@unique + distributorLevel V0-V3，V0.1.24；+shoes relation，V0.1.26；+goals relation，V0.1.28；+favorites relation，V0.1.29；+feeds/feedLikes/feedComments relation，V0.1.30；+notifications/notifActions(@relation("NotifActor")) 双 relation，V0.1.31；+following/followers 双 relation（@relation("Follower")/@relation("Followee")），V0.1.32；**+familiesOwned(@relation("FamilyOwner"))+familyMember 双 relation，V0.1.34**） |
| 2 | Checkin | sport | V1 | （+dataSource/garminActivityId/sportType，2026-07-01；+shoeId?，V0.1.26 关联跑鞋，外键 ON DELETE SET NULL，sport.checkin 事务内 incrementShoeKm；V0.1.27 前端 picker 联动；V0.1.28 被 goal.calcGoalProgress aggregate 复用作进度源；V0.1.30 被 feed.publish 关联作动态来源；V0.1.34 被 family.myFamily/familyRanking aggregate 复用作家成员跑量） |
| 3 | Group / GroupMember | sport | V1 | |
| 4 | Product | mall | V1 | （seed 8 商品，V0.1.21） |
| 5 | Order / OrderItem | mall | V1 | （Order +payChannel/prepayId/wxTransactionId/paidAt +sourceUserId，V0.1.24） |
| 6 | PointsRecord | wallet | V1 | |
| 7 | Wallet / WalletTransaction | wallet | V1 | （type +commission/+commission_clawback，V0.1.24） |
| 8 | Content / Enrollment | content | V1 | （V0.1.28 stats.myCertificates 复用 Enrollment type=marathon 作赛事证书源） |
| 9 | AppConfig | app-config | V1 | |
| 10 | GroupReport | weekly-report | V1 | |
| 11 | AuditLog | admin | V1 | V0.1.18 黑名单/审计 |
| 12 | DeviceBinding | device | V2 | （**vendor 枚举 +ble，V0.1.25 复用 vendorUserId/scopes/accessTokenEnc，零 schema 改动**；**V0.1.33 零 schema 改，复用 accessTokenEnc 存 BLE 设备名（deviceName），brandMeta 透传不持久化；bindBleDevice 按 [userId, vendor] upsert 可同时绑多设备 garmin+xiaomi+ble 共存**） |
| 13 | RawActivity | device | V2 | （佳明 vendor=garmin 复用 + status/importedAt/importCheckinId；V0.1.25 training.mySportRecords 也读它） |
| 14 | GarminSleep | device | V2 | 佳明，2026-07-01（V0.1.25 myTodayHealth 聚合） |
| 15 | GarminMetric | device | V2 | 佳明，含 sport 列（V0.1.25 myTodayHealth 聚合） |
| 16 | GarminFitnessAge | device | V2 | 佳明（V0.1.25 myTodayHealth 聚合） |
| 17 | Recipe | recipe | V2 stub | |
| 18 | FoodCache | recipe | V2 stub | |
| 19 | Meal | recipe | V2 stub | |
| 20 | IdMapping | ludong | V2 stub | |
| 21 | SyncOutbox | ludong | V2 stub | |
| 22 | InboundEvent | ludong | V2 stub | |
| 23 | **Cart** | cart | V1 | **B 电商 V0.1.22**（userId+productId unique 合并 qty） |
| 24 | **SigninRecord** | points | V1 | **B 电商 V0.1.22**（连续签到，unique date 防重） |
| 25 | **Address** | address | V1 | **个人中心电商版 V0.1.23**（setDefault 事务清他处） |
| 26 | **Coupon** | coupon | V1 | **个人中心电商版 V0.1.23**（单表实例，模板用常量） |
| 27 | **DistributionOrder** | distribution | V1 | **B 分销 V0.1.24**（推广订单 + 佣金快照，status: pending/settled/cancelled） |
| 28 | **Team** | distribution | V1 | **B 分销 V0.1.24**（邀请关系，inviteeId 一人一上线，level 1=直推/2=间推） |
| 29 | **CommissionLog** | distribution | V1 | **B 分销 V0.1.24**（佣金流水，type: settle/clawback，balanceAfter 快照） |
| 30 | Blacklist | admin | V1 | V0.1.18 黑名单 |
| 31 | ...（含 ludong / recipe 中间表，按需查 schema.prisma） | | | |
| 32 | **Shoe** | shoes | V1 | **我的跑鞋 V0.1.26**（pic 2768）— 跑者里程管理：brand/model/nickname?/currentKm(默认0)/thresholdKm(默认800)/status(active\|retired)/purchasedAt?/note?/createdAt/updatedAt；索引 [userId, status]；迁移 `20260703140000_shoe` |
| 33-34 | (索引占位) | | | |
| 35 | **Goal** | goal | V1 | **跑步目标 V0.1.28**（pic 2768 跑者向）— id / userId / type(monthly\|yearly\|custom) / title? / targetDistance(Float) / periodStart(DateTime) / periodEnd(DateTime) / status(active\|archived, 默认 active) / createdAt / updatedAt；索引 [userId, status]；User +goals relation；迁移 `20260703150000_goal`；进度由 calcGoalProgress helper 基于 Checkin aggregate 计算（list + myProgress 复用，DRY）；**V0.1.34 +familyId?（null=个人目标，有值=家庭目标，外键 onDelete Cascade + 索引 [familyId]）；calcGoalProgress 扩 userIds: string[] 参数（个人 [userId] / 家庭 成员 userIds 列表，`where userId: { in: userIds }`）；list/myProgress 加 familyId:null 过滤（仅个人目标）；+addFamilyGoal（鉴权 member.familyId 必须匹配 input.familyId）+ myFamilyGoals（聚合家庭成员进度）** |
| 36 | **Favorite** | favorite | V1 | **收藏 V0.1.29**（pic 3 向社交向首功能）— id / userId / targetType(content\|product) / targetId / createdAt；`@@unique([userId, targetType, targetId])` 防重 + `@@index([userId, targetType])` 提速列表查询；User +favorites relation；迁移 `20260703160000_favorite`；list 用批量关联避免 N+1（findMany where id in + Map 拼装） |
| **37** | **Feed** | feed | V1 | **运动动态 V0.1.30**（pic 2 社交向核心）— id / userId / content / images[] / checkinId?（关联打卡，可选）/ distanceKm?（打卡延伸的跑量）/ likeCount(默认0) / commentCount(默认0) / createdAt / updatedAt；**索引 [createdAt]（按时间线查询）+ [userId,createdAt]（myFeeds 查询）**；**onDelete RESTRICT**（User 删除时阻止，需先删动态）；User +feeds relation；迁移 `20260703170000_feed`；**V0.1.31 feed.service 集成 notify()**（like/comment 触发通知） |
| **38** | **FeedLike** | feed | V1 | **运动动态点赞 V0.1.30** — id / feedId / userId / createdAt；`@@unique([feedId,userId])` 防重（依赖此约束做 like 幂等）；**onDelete CASCADE**（Feed 删除级联删除点赞）；User +feedLikes relation；迁移 `20260703170000_feed` |
| **39** | **FeedComment** | feed | V1 | **运动动态评论 V0.1.30** — id / feedId / userId / content / createdAt；**索引 [feedId,createdAt]**（按动态取评论列表）；**onDelete CASCADE**（Feed 删除级联删除评论）；User +feedComments relation；迁移 `20260703170000_feed` |
| **40** | **Notification** | notification | V1 | **消息中心 V0.1.31**（pic 2 社交向收尾）— id / userId（接收者） / actorId（触发者） / type(like\|comment\|follow\|system) / targetType? / targetId? / content? / isRead(默认 false) / createdAt；**索引 [userId,isRead,createdAt]（unreadCount 红点轻量查询）+ [userId,createdAt]（list 分页）**；**onDelete CASCADE(user 删→通知级联) + RESTRICT(actor 必须先删通知)**；User 加 notifications（接收）+ notifActions(@relation("NotifActor"))（触发）双 relation；迁移 `20260703180000_notification` |
| **41** | **Follow** | follow | V1 | **关注关系 V0.1.32**（pic 2 社交向深化）— id / followerId（关注者，外键→User） / followeeId（被关注者，外键→User） / createdAt；`@@unique([followerId,followeeId])` 防重（依赖此约束做 follow upsert 幂等）；**索引 [followerId]（myFollowing 查询）+ [followeeId]（myFollowers 查询）**；**onDelete CASCADE**（任一用户删→关注关系级联删除）；User 加 following(@relation("Follower"))（关注的人）+ followers(@relation("Followee"))（粉丝）双 relation — **坑：同 model 双 relation 必须 @relation("name") 消歧义，否则 prisma generate 报 P1012 Ambiguous relation**（范式同 V0.1.31 NotifActor）；迁移 `20260703190000_follow` |
| **42** | **Family** | family | V1 | **家庭空间 V0.1.34**（pic 2776 家庭方向）— id / name / ownerId（外键→User `@relation("FamilyOwner")`）/ inviteCode(@unique，8 位 hex 短码 randomUUID slice 8 + toUpperCase) / createdAt；owner User（创建者，1:N）；members FamilyMember[]（成员列表）；goals Goal[]（家庭目标）；**onDelete**：owner User 删除时 RESTRICT（需先转让或解散家庭）；迁移 `20260704000000_family` |
| **43** | **FamilyMember** | family | V1 | **家庭成员 V0.1.34** — id / familyId（外键→Family）/ userId（**`@unique` 强制一人一家庭**，外键→User）/ role(owner\|member, 默认 member) / joinedAt；family Family @relation（反向，Family.members）+ user User @relation（反向，User.familyMember 1:1）；**onDelete Cascade**（Family 删→成员级联；User 删→成员级联）；迁移 `20260704000000_family` |

> 💡 **Prisma 迁移历史**（17 个，V0.1.34 +1）：`20260611083609_init` → `20260614090000_wallet_tx_out_refund_no` → `20260618135224_qmwx` → `20260629144948_auditlog_blacklist` → `20260701034725_garmin_tables` → `20260701123150_garmin_metric_sport` → `20260701150000_garmin_import_ranking` → `20260702060000_cart_signin` → `20260702130000_address_coupon` → `20260703120000_distribution` → `20260703140000_shoe`（V0.1.26：CREATE TABLE Shoe + ALTER Checkin ADD shoeId + 外键 ON DELETE SET NULL）→ `20260703150000_goal`（V0.1.28：CREATE TABLE Goal + 索引 [userId, status] + User.goals relation）→ `20260703160000_favorite`（V0.1.29：CREATE TABLE Favorite + unique [userId, targetType, targetId] + 索引 [userId, targetType] + User.favorites relation）→ `20260703170000_feed`（V0.1.30：CREATE TABLE Feed + FeedLike + FeedComment + 索引 + unique + Cascade 关系 + User feeds/feedLikes/feedComments relation）→ `20260703180000_notification`（V0.1.31：CREATE TABLE Notification + 索引 + CASCADE/RESTRICT 外键 + User notifications/notifActions relation）→ `20260703190000_follow`（V0.1.32：CREATE TABLE Follow + unique [followerId,followeeId] + 索引 [followerId]+[followeeId] + CASCADE 外键 + User following(@relation("Follower"))/followers(@relation("Followee")) 双 relation）→ **`20260704000000_family`**（V0.1.34：CREATE TABLE Family + FamilyMember + FamilyMember.userId @unique 一人一家庭 + Family.inviteCode @unique + Goal +familyId?（外键 onDelete Cascade + 索引 [familyId]）+ User familiesOwned(@relation("FamilyOwner"))/familyMember 双 relation）。**V0.1.27 / V0.1.33 零 schema 改动，无新迁移。**

---

## 📦 依赖

- **运行时**：`fastify@4` `@fastify/cors` `@fastify/helmet` `@fastify/jwt` `@fastify/multipart` `@fastify/rate-limit` `@fastify/static` `@prisma/client` `ioredis` `bullmq` `zod` `dotenv` `pino-pretty`
- **开发**：`tsx` `vitest` `@vitest/coverage-v8` `prisma` `supertest` `typescript`
- **共享**：`@qm-wx/shared`（workspace 协议）

---

## 🧪 测试

```bash
# 单元测试（vi.mock，不连 DB）— **545 passed**（vitest run 实测累加 2026-07-04；V0.1.28 goal +7；V0.1.29 favorite +6 + stats.service 补单测覆盖 39→100%；V0.1.30 feed +10：list 2 + publish 1 + like 3 + unlike 2 + comment 2，vi.hoisted 修复 createPrismaMock hoisting 坑；V0.1.31 notification +8 + feed.service.test 重构 mock：加 vi.mock notify 隔离 + 断言集成调用，替代原 try/catch 吞 TypeError 碰巧通过的脆弱写法；V0.1.32 follow +10：follow 3 含自己/notFound/通知 + unfollow 1 + isFollowing 1 + myFollowing 1 + myFollowers 1 + myCounts 3 含 isSelf/notFound；V0.1.33 device +3：garmin BLE 优先 myBindings + bindBleDevice vendor=garmin + vendor=xiaomi，device.bindings.test.ts 重构 mock deviceBinding 加 findUnique；**V0.1.34 family +10：createFamily 2 + joinFamily 2 + myFamily 2 + leaveFamily 2 + familyRanking 1 + inviteInfo 1，mockImplementation 按 userId 区分并发 aggregate；goal +5：addFamilyGoal 3 含 forbidden + myFamilyGoals 2 含 where userId in 断言**）
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
- `Cache.wrap`（`infra/cache.ts`，V0.1.x）：**15 热路径**统一缓存抽象；Decimal/DateTime 进缓存前显式 `toString()/toISOString()` 序列化（V0.1.25 新增 `device.myTodayHealth` 聚合 4 类佳明数据，TTL 300s；V0.1.28 新增 `stats.myCertificates` 动态生成，TTL 120s）
- `incrementShoeKm`（`shoes.service.ts` 导出，V0.1.26）：跑鞋里程累加纯函数，被 sport.service.checkin 事务内复用（shoeId 空→跳过）；保证跑鞋里程与 Checkin 强一致（DRY，避免双写）；**V0.1.27 前端 picker 联动 → 闭环**
- `myAnnualReport`（`stats.service`，V0.1.27）：年汇总 + 月度分布范式 — 单次 `groupBy({ by: [dateField] })` 拿全年每日记录 → reduce 月度（避免 12 次 aggregate，性能优化范式，可复用于其他时间维度汇总）
- `calcGoalProgress`（`goal.service` 导出 helper，V0.1.28；**V0.1.34 扩 userIds**）：跑步目标进度计算纯函数 — Checkin aggregate（date "YYYY-MM-DD" 在 periodStart-End 范围 → sum distance）→ 返回 { currentDistance, percent, completed }；list + myProgress 共用（DRY，避免双写）；目标周期由 type 自动算（monthly 本月1号→下月1号 / yearly 今年1/1→明年1/1 / custom 手传）；**V0.1.34 改 `userIds: string[]` 参数**（个人 `[userId]` / 家庭 成员 userIds 列表，`where userId: { in: userIds }`），DRY 复用 — 可扩展群组/团队目标
- `myCertificates`（`stats.service`，V0.1.28）：动态证书生成范式 — MILESTONE_CERTS 常量定义阈值（100/500/1000/3000km）→ Checkin aggregate 算 totalDistance → 阈值达标即颁发（无需建表存证书）；赛事证书复用 Enrollment type=marathon；Cache 120s（动态生成内容建议短 TTL，避免长期缓存过期数据）
- `favorite.list 批量关联`（`favorite.service`，V0.1.29）：N+1 规避范式 — 先 findMany 收藏列表 → 按 targetType 分组收 targetId → 对 Content/Product 各 findMany where id in 一次 → Map 拼装详情；避免循环 await（典型 N+1 反模式）；isFavorited 同样批量查（详情页/列表页红心状态）
- **`feed $transaction 回调`**（`feed.service`，V0.1.30）：维护计数范式 — like/unlike/comment 用 `prisma.$transaction(async (tx) => { ... })` 回调形式（**测试友好**，可 mock $transaction 执行回调）；like 事务内 create FeedLike + update Feed.likeCount+1（依赖 `@@unique([feedId,userId])` 幂等）；unlike 事务内 delete FeedLike + update Feed.likeCount-1；comment 事务内 create FeedComment + update Feed.commentCount+1；**onDelete CASCADE**（Feed 删→FeedLike/FeedComment 自动级联删除，无需手动维护）；Feed + 用户作者 User 关联（onDelete RESTRICT，删用户前需先删动态）
- **`vi.hoisted + createPrismaMock`**（`feed.service.test.ts`，V0.1.30）：测试范式 — vi.mock 是 hoisted（提升到文件顶部），普通 `const mocks = createPrismaMock()` 在 vi.mock 工厂内访问会报 `Cannot access 'mocks' before initialization`；改用 `vi.hoisted(() => require('../helpers/mockPrisma').createPrismaMock())` 让 mock 工厂能拿到 mocks 实例；可复用于其他需要 Prisma mock 的 module 测试
- **`notify() 集成函数`**（`notification.service` 导出，V0.1.31）：跨 module 通知触发范式 — `if (userId === actorId) return` 自己跳过（避免自己赞自己产生通知）；不在内部 try/catch（调用方决定容错）；被 feed.like/comment 复用（事务后 `try { await notify(...) } catch {}` 吞错，通知失败不阻塞主业务）；可扩展 follow/goal_complete/系统公告等触发源（**V0.1.32 follow 已复用 type=follow**）；Content 字段作摘要时调用方负责截断（feed comment 50 字截断）
- **`@relation("name") 消歧义`**（范式累计 **3 次**：NotifActor V0.1.31 / Follower V0.1.32 / **FamilyOwner V0.1.34**）：User 多个 relation 指向同一 model 必须用 `@relation("name")` 消歧义，否则 `prisma generate` 报 P1012 Ambiguous relation。V0.1.31 Notification 的 userId/actorId → User 用 `@relation("NotifActor")`；V0.1.32 Follow 的 followerId/followeeId 都→User 用 `@relation("Follower")` / `@relation("Followee")`；**V0.1.34 Family.ownerId → User 用 `@relation("FamilyOwner")`**（User.familiesOwned 创建的家庭 1:N + User.familyMember 1:1 自身家庭）；**范式**：任何同 model 双 relation 都需 @relation("name") — 后续 User 关系扩展（如 Block 黑名单双向、Friend 好友双向、Mentor 师徒双向）同样适用
- **`matchBleVendor + 0x180A 二次验证 + 手选兜底`**（V0.1.33，前后端单一数据源在 shared `device-brands.ts`）：BLE 设备品牌识别范式 — 设备名正则匹配（`BLE_VENDOR_PATTERNS` 单一数据源，garmin: /garmin|forerunner|fenix|vivoactive|edge/i；xiaomi: /mi\s*band|xiaomi|小米|redmi/i）→ `matchBleVendor(name): 'garmin' | 'xiaomi' | 'ble'`（未中返 'ble'）→ 前端 onSelectDevice 流程 connect → Promise.all([readBattery, readDeviceInfo]) → **0x180A Manufacturer Name 权威字段验证**（2A29）→ 仍无法识别 `wx.showActionSheet` 手选兜底（佳明/小米/通用，防自定义名漏识别）；可扩展 coros/huawei 等品牌（只需在 shared 加 pattern + enum value）；**后端 device.service 复用同一 matchBleVendor 做 vendor 校验**（前后端单一数据源，避免不一致）
- **`readCharValue` 通用 GATT 读取工具**（`utils/ble.ts`，V0.1.33）：微信 `readBLECharacteristicValue` 值在 `onBLECharacteristicValueChange` 回调（**非 success** — 微信文档规定）→ 临时监听 + serviceId/characteristicId 过滤（与 subscribeHeartRate 全局监听按 serviceId 互不干扰）+ 超时返 null 容错；封装后 `readBattery(deviceId)` 读 0x180F/2A19（电量百分比）+ `readDeviceInfo(deviceId)` 读 0x180A/2A29+2A24（manufacturer+model）一行调用；**可复用读步数 0x1814 / 血氧等标准服务**，后续 BLE 健康数据扩展（如步数手环读取）直接复用此工具
- **`calcGoalProgress userIds 参数`**（`goal.service`，V0.1.34 DRY 聚合维度扩展）：进度计算 helper 从单一用户扩到多用户列表 — 个人 `[userId]` / 家庭 成员 userIds 列表，Checkin aggregate `where userId: { in: userIds }`；list/myProgress（个人）和 myFamilyGoals（家庭）共用同一 helper（DRY，避免双写）；**可扩展群组/团队目标**（如跑团目标聚合所有成员）；同时 list/myProgress 加 `familyId: null` 过滤（仅个人目标），addFamilyGoal 鉴权 member.familyId 必须匹配 input.familyId（forbidden 防越权创建他人家庭目标）

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
- ✅ **29** 个 module 路由（**26** 个有 service 实现 + 2 V2 stub + device 部分实现）
  - **Phase 4.1**：wxpay（V3 完整闭环，含 refund / queryBill / downloadBill）
  - **B 电商三连击**（V0.1.22~24）：cart / points / address / coupon / **distribution**（含 settle/clawback 集成函数 + LEVEL_RULES 等级规则）
  - **pic 训练**（V0.1.25）：**training**（myPlans 4 套硬编码 + mySportRecords 聚合）+ device 扩 5 action（myTodayHealth/myBindings/bindBleDevice/unbind 实现/submitHeartRate 实现）
  - **我的跑鞋**（V0.1.26，pic 2768）：**shoes**（list/add/update/retire/myStats 5 action，thresholdKm 默认 800，healthRatio 计算，retiringSoon≥70%）+ **sport.checkin 集成 incrementShoeKm**（事务内调 shoes.service 导出函数，shoeId 空→跳过，向后兼容）
  - **V0.1.27**（零 schema 改）：**stats +myAnnualReport** action（年汇总 yearDistance/yearCheckins/yearDurationSec/avgPace + 月度分布 12 个月 + longestRun + activeDays，单次 groupBy 性能优化）— 前端 `pages/annual-report/` 渐变大卡 + 月度柱状图 + 年份切换 + 分享战报
  - **V0.1.28**（+Goal 表）：**goal**（list/add/remove/myProgress 4 action，calcGoalProgress helper 复用 Checkin aggregate DRY，type 自动算周期）+ **stats +myCertificates** action（动态生成零建表：里程碑证书 MILESTONE_CERTS 100/500/1000/3000km + 赛事证书 marathon + 下一里程碑进度，Cache 120s）— 前端 `pages/goal/`（进度条+添加弹层）+ `pages/certificate/`（里程碑🏆+赛事+下一里程碑）
  - **V0.1.29**（+Favorite 表）：**favorite**（list/add/remove/isFavorited 4 action，list 批量关联避免 N+1，add upsert 幂等，remove deleteMany，isFavorited 批量红心）— 前端 `pages/favorite/`（tab 内容/商品 + 列表卡 + 取消收藏 + 点卡跳详情）+ mine 入口「我的收藏」；**测试审查**：stats.service 覆盖 39→100%（补 myAnnualReport/myCertificates 单测），总覆盖 80.66→82.11%
  - **V0.1.30**（+Feed+FeedLike+FeedComment 3 表，pic 2 社交向核心）：**feed**（list/myFeeds/publish/like/unlike/comment 6 action，**$transaction 回调维护 likeCount/commentCount**，onDelete Cascade 删动态级联点赞/评论，FeedLike `@@unique([feedId,userId])` 幂等）— 前端 `pages/feed/`（动态卡 + 发布弹层 + 点赞**乐观更新** + 评论弹层 + FAB + 分页 onReachBottom）+ mine 入口「运动动态」；feed +10 单测（list 2 + publish 1 + like 3 + unlike 2 + comment 2，vi.hoisted 修复 createPrismaMock hoisting 坑）
  - **V0.1.31**（+Notification 表，pic 2 社交向收尾）：**notification** module（4 action：list 含 actor 头像/昵称 + 分页 / unreadCount 红点轻量 count / markRead 鉴权仅本人 `n.userId !== userId → forbidden` / markAllRead updateMany 幂等）+ **导出 `notify()` 集成函数**（`if (userId === actorId) return` 自己赞自己跳过，不在内部 try/catch — 调用方决定容错，可扩展 follow/goal_complete/系统公告）+ **feed 集成**（feed.service like/comment 事务后 `try { await notify(...) } catch {}` 吞错，通知写库失败不阻塞点赞/评论主链路；comment 的 content 50 字截断作摘要；type=like/comment，targetType=feed）— 前端 `pages/notification/`（列表卡 actor 头像+昵称+文案+内容摘要+时间+未读红点 + 全部已读按钮 + 点击乐观标记已读 + 跳 feed + onReachBottom 分页 + 下拉刷新）+ mine 入口带未读徽标（调 notification.unreadCount，99+ 截断）；notification +8 单测（list 2 含 hasMore + unreadCount 1 + markRead 2 含 forbidden + markAllRead 1 + notify 2 含自己跳过）；feed.service.test 重构 mock（加 `vi.mock('src/modules/notification/notification.service.js', () => ({ notify: vi.fn() }))` 隔离 + 断言集成调用，替代原 try/catch 吞 TypeError 碰巧通过的脆弱写法）
  - ✅ **关注关系**（V0.1.32，+Follow 表，社交向深化）：**follow** module（6 action：follow upsert 幂等 + 不能关注自己 badRequest + 复用 notify(type=follow) try/catch 吞错 / unfollow deleteMany 幂等 / isFollowing 批量查按钮状态 Set 拼装 / myFollowing 分页含 user / myFollowers 分页含 user / **myCounts 一次拿全** user + followingCount + followerCount + isFollowing + isSelf 用户主页用，可查任意 userId 不限于自己，viewerId 算 isFollowing/isSelf）+ **复用 V0.1.31 notify 集成函数**（type=follow 是第 3 个 type，继 like/comment 之后）+ 前端 `pages/user/`（用户主页：头像+昵称+关注数/粉丝数+关注按钮**乐观更新**失败回滚 + isSelf 自己不显示按钮；调 follow.myCounts 一次拿全 / follow.follow / follow.unfollow）+ feed wxml feed-head 加 data-uid + bindtap onTapUser 跳用户主页（关注闭环入口）；follow +10 单测（follow 3 含自己/notFound/通知 + unfollow 1 + isFollowing 1 + myFollowing 1 + myFollowers 1 + myCounts 3 含 isSelf/notFound；vi.mock notify 隔离范式同 feed.test.ts V0.1.31）；**🐛 training wxss 中文 selector 修复**（原 `.plan-card.入门/进阶/挑战/极限` 4 个中文 class selector 编译报 `unexpected � at pos 1725`，wxss 不支持中文 selector → 分离 levelKey 英文 beginner/intermediate/challenge/extreme 作 class + level 中文显示，前端 LEVEL_KEY_MAP 映射；全 miniprogram wxss 扫描确认无中文 selector 残留；wxml `class="plan-card {{plan.levelKey}}"` + 显示仍用 `{{plan.level}}`）
  - ✅ **BLE 设备品牌识别**（V0.1.33，**零 schema 改**，方案1 MVP）：device module 品牌化扩展 — ① shared `device-brands.ts` 加 `BLE_VENDOR_PATTERNS` + `matchBleVendor(name)` 函数（garmin: /garmin|forerunner|fenix|vivoactive|edge/i；xiaomi: /mi\s*band|xiaomi|小米|redmi/i，未中返 'ble'）+ `xiaomi` available false→**true**（开放）+ garmin desc 加"BLE 实时心率 + OAuth 历史"（**前后端单一数据源**）；② `device.schema.ts` `BindBleDeviceInputSchema` 加 `vendor: z.enum(['ble','garmin','xiaomi']).default('ble')` + `brandMeta: {manufacturer?, model?}.optional()`（透传不持久化）；③ `device.service.ts` `bindBleDevice` 接 vendor 按 `[userId, vendor]` upsert（**可同时绑多设备：garmin+xiaomi+ble 共存**，**service 层兜底 `input.vendor ?? 'ble'`** — route Zod default 不覆盖 service 直接调用，如测试）+ `myBindings` 加 `garminBleBound: boolean`（DeviceBinding vendor=garmin 存在）+ 保留 garminAutoConnected/garminActivityCount（OAuth 数据）→ **BLE 绑定优先，OAuth 降级**；deviceName 逻辑扩 garmin/xiaomi（accessTokenEnc 存设备名）；④ 测试 `device.bindings.test.ts` 重构 mock（deviceBinding 加 findUnique）+ **3 新测试**（garmin BLE 优先 myBindings + bindBleDevice vendor=garmin + vendor=xiaomi）；**3 坑沉淀**：service 层 vendor 兜底 `?? 'ble'`（route Zod default 不覆盖 service 直接调用）/ `wx.readBLECharacteristicValue` 值不在 success 回调（微信文档规定值通过 `onBLECharacteristicValueChange` 回调；与 subscribeHeartRate 全局监听共存，按 serviceId 过滤互不干扰）/ 小程序 TS 类型 3 坑（TextDecoder 非 DOM lib / offBLECharacteristicValueChange 签名不接受参数 / OnBLECharacteristicValueChangeCallbackResult 类型不存在）；device +3 单测（527→530）
  - ✅ **家庭空间**（V0.1.34，pic 2776 家庭方向，+Family+FamilyMember 2 表，/zcf:workflow 方案1 完整 family module）：**family** module（6 action：createFamily 事务内建 Family(ownerId) + FamilyMember(role=owner) + 8 位 inviteCode hex 短码 randomUUID slice 8 + toUpperCase，已有家庭 → conflict / joinFamily 按 inviteCode 查 Family → notFound 兜底，已有家庭 → conflict，加 FamilyMember(role=member) / myFamily 家庭卡 + 成员列表含**本月跑量**（Checkin aggregate by member），无家庭返 family:null / leaveFamily owner 不可离开 badRequest 需转让/解散，member 删 FamilyMember / familyRanking 本周/本月 CN 时区（cnWeekRange/cnMonthRange）成员跑量榜按距离降序，period: week|month / inviteInfo 返 family.name + inviteCode 前端分享/复制）+ **goal module 扩展**（复用 Goal+familyId，DRY：calcGoalProgress 改 `userIds: string[]` 参数，个人=[userId]/家庭=成员 userIds 列表，`where userId: { in: userIds }`；list/myProgress 加 familyId:null 过滤仅个人目标；+addFamilyGoal 鉴权 member.familyId 必须匹配 input.familyId forbidden 防越权；+myFamilyGoals 查 myFamilyId → Goal where familyId + 成员 userIds → 进度按家庭成员聚合）— 前端 `pages/family/`（家庭卡 name+inviteCode+成员数 + 邀请按钮复制 inviteCode + 本月跑量榜 rank-num+avatar+nickname+家长标+monthDistance + 家庭目标进度条 + 创建/加入无家庭态 + 添加家庭目标弹层 月度/年度 picker + title + targetDistance + leaveFamily 按钮 非 owner）+ mine 入口「家庭空间」（19→20 宫格）；family +10 单测（createFamily 2 + joinFamily 2 + myFamily 2 + leaveFamily 2 + familyRanking 1 + inviteInfo 1，**mockImplementation 按 userId 区分**并发 aggregate）；goal +5（addFamilyGoal 3 含 forbidden + myFamilyGoals 2 含 where userId in 断言）；**3 决策**（方案2 A 家庭组 + B 跑量榜 + C 家庭目标 / 一人一家庭 FamilyMember.userId @@unique / 复用 Goal+familyId calcGoalProgress 扩 userIds DRY）；**3 坑沉淀**（User 双 Family relation 必须 `@relation("FamilyOwner")` 消歧义，范式累计第 3 次：NotifActor V0.1.31 / Follower V0.1.32 / FamilyOwner V0.1.34 / inviteCode 8 位 @unique 兜底极小概率重复报错让用户重试 YAGNI 不加重试 / familyRanking Promise.all 并发 aggregate mockResolvedValueOnce 顺序不保证 → mockImplementation 按 userId 区分）；**43 表 / 29 module / 34 页 / 17 迁移 / 545 单元 / 15 缓存热路径（family 暂未接 Cache，持平）**
- ✅ JWT 鉴权 + 功能开关中间件 + 公开端点（content/mall/wxpay）
- ✅ 微信 code2Session（session_key 缓存 Redis）
- ✅ Prisma **43** 张表 + 17 个迁移（V0.1.34 +Family+FamilyMember + Goal.familyId + User.familiesOwned/familyMember 双 relation；V0.1.33 零 schema 改；V0.1.32 +Follow + User following/followers 双 relation；V0.1.31 +Notification + User notifications/notifActions relation；V0.1.30 +Feed+FeedLike+FeedComment + User feeds/feedLikes/feedComments relation；V0.1.29 +Favorite + User.favorites relation；V0.1.28 +Goal + User.goals relation；V0.1.27 零 schema 改；V0.1.26 +Shoe + Checkin.shoeId；V0.1.25 零新表，DeviceBinding.vendor 加 ble 枚举值复用现有字段）
- ✅ **Domain 层**：order-state 状态机（7 态 + TRANSITIONS 白名单 + assertTransition 5 处替换）
- ✅ **BullMQ jobs 6 个**：周报（每周日 20:00）+ 超时关单（30min delayed）+ 微信平台证书刷新 + **garmin-import**（concurrency=2，5min 桶去重）
- ✅ **Wallet repo**：ensureWallet / ensureWalletInTx 复用入口（**被 settle/clawback 复用，V0.1.24**）
- ✅ **CLI 2 个**：`pnpm reconcile -- YYYY-MM-DD` 微信账单比对（5 类 diff + 退出码 0/1/2）+ `pnpm garmin-import` 佳明全量入 Checkin（500/事务）
- ✅ Dockerfile 多阶段构建
- ✅ **545 单元测试** + 49 e2e（10 files）/ **总覆盖 82.11%**（V0.1.29 实测；stats.service 100%；V0.1.30 feed +10 单测；V0.1.31 notification +8 单测 + feed.service.test 重构 mock；V0.1.32 follow +10 单测；V0.1.33 device +3 单测 garmin BLE 优先 + vendor=garmin + vendor=xiaomi；**V0.1.34 family +10 单测 createFamily/joinFamily/myFamily/leaveFamily/familyRanking/inviteInfo + goal +5 addFamilyGoal/myFamilyGoals**）
- ✅ CI/CD（GitHub Actions ci.yml + deploy-staging.yml，拆 4 parallel job）
- ✅ **wxpay** refund + notify + 幂等 + 关单保护全链路 + **notify 触发 settleCommission**
- ✅ **缓存基础设施**（V0.1.x）：`infra/cache.ts` Cache.wrap 接入 **15 热路径**（sport/mall/content/user/weekly-report + 佳明 4 查询 myActivities/Sleep/Metrics/FitnessAge，TTL 300s + V0.1.25 新增 device.myTodayHealth 聚合睡眠/健身年龄/训练指标/今日活动，TTL 300s + V0.1.28 新增 stats.myCertificates 动态生成，TTL 120s；shoes/goal/favorite/feed/notification/follow/family 暂未接 Cache；V0.1.27 stats.myAnnualReport 暂未接 Cache，后续可加）
- ✅ **OpenAPI 3.1 spec**（V0.1.4/13）：`/openapi.json` + `openapi.e2e` CI gate（9 paths + 16 schemas）
- ✅ 切真生产文档（[`docs/PHASE-4-2-PREP.md`](../../docs/PHASE-4-2-PREP.md)）
- ✅ **首个 module 级 CLAUDE.md**：distribution（[`src/modules/distribution/CLAUDE.md`](src/modules/distribution/CLAUDE.md)）
- ✅ **蓝牙 BLE 心率**（V0.1.25）：`device.submitHeartRate` 写 `ble:hr:{userId}` Redis TTL 1h；`myTodayHealth` 读最近活动；小程序 `utils/ble.ts` 扫描/连接/订阅 0x180D（心率服务）；**V0.1.27 前端 device-bind 加调试面板**（操作日志 + 心率回调计数 hrCount + 折叠，GAP-9 可观测性）；**V0.1.33 品牌化**（matchBleVendor 识别 + readBattery/readDeviceInfo 多服务读取 + 0x180A 二次验证 + 手选兜底）
- ✅ **跑鞋里程强一致**（V0.1.26）：Checkin.shoeId 关联 Shoe，sport.checkin 事务内 incrementShoeKm 累加 currentKm；shoeId 为空跳过（向后兼容旧调用）；**V0.1.27 前端 sport 打卡 picker 联动 → 跑鞋里程闭环**（GAP-10 关闭）
- ✅ **年度报告**（V0.1.27，零 schema 改）：stats.myAnnualReport 年汇总 + 月度分布 12 月 + longestRun + activeDays；性能优化范式（单次 groupBy → reduce 月度）
- ✅ **跑步目标 + 我的证书**（V0.1.28，+Goal 表）：goal module（4 action，calcGoalProgress helper 复用 Checkin aggregate DRY，type 自动算周期 monthly/yearly/custom）+ stats.myCertificates（动态生成零建表，MILESTONE_CERTS 阈值 + 赛事证书 marathon + 下一里程碑，Cache 120s）
- ✅ **收藏**（V0.1.29，+Favorite 表，pic 3 向社交向首功能）：favorite module（4 action，list 批量关联避免 N+1 / add upsert 幂等 / remove deleteMany / isFavorited 批量红心，content|product 通用）；测试审查：stats.service 覆盖 39→100%（补 myAnnualReport/myCertificates 单测）；总覆盖 80.66→82.11%
- ✅ **运动动态**（V0.1.30，+Feed+FeedLike+FeedComment 3 表，pic 2 社交向核心）：feed module（6 action，**$transaction 回调维护 likeCount/commentCount**，list 含作者+liked 状态 / publish 可关联 checkinId+distanceKm / like/unlike 幂等（依赖 FeedLike unique）/ comment 事务内 commentCount+1；onDelete Cascade 删动态级联点赞/评论）；前端 `pages/feed/`（动态卡 + 发布弹层 + 点赞**乐观更新** + 评论弹层 + FAB + 分页 onReachBottom）；feed +10 单测（vi.hoisted 修复 createPrismaMock hoisting 坑）
- ✅ **消息中心**（V0.1.31，+Notification 表，pic 2 社交向收尾）：notification module（4 action：list 含 actor / unreadCount 红点 / markRead 鉴权仅本人 / markAllRead updateMany）+ **导出 notify() 集成函数**（自己赞自己跳过，调用方 try/catch 吞错，可扩展 follow/goal_complete/系统公告）+ feed 集成（like/comment 事务后 try/catch notify，content 50 字截断）；前端 `pages/notification/`（列表卡+红点+全部已读+点击乐观标记+跳feed+分页+下拉刷新）+ mine 入口带未读徽标；notification +8 单测 + feed 重构 mock（vi.mock notify 隔离）
- ✅ **关注关系**（V0.1.32，+Follow 表，pic 2 社交向深化）：follow module（6 action，myCounts 用户主页一次拿全 user + counts + isFollowing + isSelf，可查任意 userId 不限于自己；follow upsert 幂等 + 不能关注自己 badRequest + 复用 notify(type=follow) try/catch 吞错；unfollow deleteMany 幂等；isFollowing 批量查按钮状态 Set 拼装；myFollowing/myFollowers 分页含 user）+ **复用 V0.1.31 notify 集成函数**（type=follow 是第 3 个 type，继 like/comment 之后）+ 前端 `pages/user/`（用户主页：头像+昵称+关注/粉丝数+关注按钮**乐观更新**失败回滚 + isSelf 自己不显示按钮）+ feed wxml feed-head 加 onTapUser 跳用户主页（关注闭环入口）；follow +10 单测（mock notify 隔离范式同 feed.test.ts V0.1.31）；**🐛 training wxss 中文 selector 修复**（原 `.plan-card.入门/进阶/挑战/极限` 编译报 `unexpected � at pos 1725`，wxss 不支持中文 selector → 分离 levelKey 英文 class + level 中文显示，LEVEL_KEY_MAP 映射；全 miniprogram wxss 扫描无残留）
- ✅ **BLE 设备品牌识别**（V0.1.33，零 schema 改，方案1 MVP）：device module bindBleDevice 品牌化 — shared `BLE_VENDOR_PATTERNS` + `matchBleVendor` 单一数据源（前后端共用）+ BindBleDeviceInputSchema `vendor` enum + `brandMeta` optional（透传不持久化）+ service `[userId, vendor]` upsert（可同时绑多设备）+ myBindings `garminBleBound`（**BLE 绑定优先 OAuth 降级**）+ 前端 utils/ble.ts readBattery（0x180F/2A19）+ readDeviceInfo（0x180A/2A29+2A24）+ readCharValue 通用 GATT 读取（微信 readBLE 值在 onBLECharacteristicValueChange 回调非 success）+ device-bind 页 onSelectDevice 流程（connect → Promise.all([readBattery, readDeviceInfo]) → matchBleVendor + 0x180A 二次验证 → 手选兜底 → subscribeHeartRate → bindBleDevice 传 vendor+brandMeta）+ garmin OAuth 降级段（`garminAutoConnected && !garminBleBound` 提示可 BLE 绑定）+ 心率卡显示电量/型号/厂商；**3 坑沉淀**（service 层 vendor 兜底 / wx.readBLE 值在回调非 success / 小程序 TS 类型 3 坑：TextDecoder 非 DOM lib / offBLECharacteristicValueChange 签名不接受参数 / OnBLECharacteristicValueChangeCallbackResult 类型不存在）；device +3 单测（527→530）
- ✅ **家庭空间**（V0.1.34，pic 2776 家庭方向，+Family+FamilyMember 表）：family module（6 action：createFamily 事务内建 Family+FamilyMember(role=owner)+8 位 inviteCode hex 短码 / joinFamily 按 inviteCode 查 + 加 FamilyMember(role=member) / myFamily 家庭卡+成员列表含本月跑量 / leaveFamily owner 不可离开 badRequest / familyRanking 本周/本月 CN 时区成员跑量榜按距离降序 / inviteInfo 返 name+inviteCode）+ goal module 扩展（calcGoalProgress 扩 userIds 参数 DRY 复用 — 个人=[userId]/家庭=成员 userIds 列表；list/myProgress 加 familyId:null 过滤；addFamilyGoal 鉴权 member.familyId 必须匹配；myFamilyGoals 聚合家庭成员进度）+ 前端 `pages/family/`（家庭卡+邀请复制+本月跑量榜+家庭目标+创建/加入+添加目标弹层+leaveFamily 非 owner）+ mine 入口「家庭空间」（19→20 宫格）；**3 决策**（方案2 A 家庭组+B 跑量榜+C 家庭目标 / 一人一家庭 @@unique / 复用 Goal+familyId DRY）；**3 坑沉淀**（User 双 Family relation @relation("FamilyOwner") 消歧义，范式累计第 3 次：NotifActor/Follower/FamilyOwner / inviteCode 8 位 @unique 兜底极小概率重复报错让用户重试 YAGNI / familyRanking Promise.all 并发 aggregate mockImplementation 按 userId 区分）；family +10 单测 + goal +5 单测（530→545）

---

🤙 `pnpm dev` 起来看见 `/health: ok` 就是活着的。Phase 4.1 完整闭环 + B 电商三连击 + V0.1.25 pic 3 页（训练/蓝牙/今日健康）+ V0.1.26 跑鞋（sport.checkin 集成 incrementShoeKm）+ V0.1.27（sport 跑鞋 picker 闭环 + 年度报告 + 蓝牙调试面板，零 schema 改）+ V0.1.28（Goal 表 + goal module + stats.myCertificates 动态证书 + 目标/证书 2 前端页 + 7 单测）+ V0.1.29（Favorite 表 + favorite module + 收藏前端页 + 6 单测 + stats.service 覆盖 39→100% + 总覆盖 82.11%）+ V0.1.30（Feed+FeedLike+FeedComment 3 表 + feed module 6 action + 动态前端页（点赞乐观更新+评论+FAB+分页）+ feed +10 单测 + vi.hoisted 修复）+ V0.1.31（Notification 表 + notification module 4 action + 导出 notify() 集成函数被 feed 复用 + feed.service 集成（like/comment 触发通知，事务后 try/catch 吞错）+ 前端 pages/notification（列表卡+红点+全部已读+点击乐观标记+跳 feed+分页+下拉刷新）+ mine 入口带未读徽标 + notification +8 单测 + feed.service.test 重构 mock）+ V0.1.32（Follow 表（#41）+ follow module 6 action（myCounts 用户主页一次拿全 + follow/unfollow 幂等 + isFollowing 批量查 + myFollowing/myFollowers 分页）+ 复用 V0.1.31 notify(type=follow) 集成函数 + 前端 pages/user（用户主页：头像+关注/粉丝数+关注按钮乐观更新+isSelf 自己不显示）+ feed wxml 加 onTapUser 跳用户主页（关注闭环入口）+ follow +10 单测（vi.mock notify 隔离范式）+ 🐛 training wxss 中文 selector 修复（levelKey 英文 class + level 中文显示））+ V0.1.33（BLE 设备品牌识别，零 schema 改：shared 加 BLE_VENDOR_PATTERNS + matchBleVendor 单一数据源 + xiaomi available 开放 + garmin desc 加 BLE 标注；device.schema BindBleDeviceInputSchema +vendor enum +brandMeta optional；device.service bindBleDevice 按 [userId,vendor] upsert 可同时绑多设备 + myBindings +garminBleBound BLE 优先 OAuth 降级；前端 utils/ble.ts +readBattery(0x180F) +readDeviceInfo(0x180A) +readCharValue 通用 GATT 读取（微信 readBLE 值在回调非 success）；device-bind 页 matchBleVendor 自动识别 + 品牌标签 + onSelectDevice 多服务读取 + 0x180A 二次验证 + 手选兜底 + garmin OAuth 降级段 + 心率卡电量/型号/厂商；3 坑沉淀；device +3 单测 527→530）+ **V0.1.34（家庭空间 family，pic 2776 家庭方向：2 新表 Family+FamilyMember + Goal +familyId + User 加 familiesOwned/familyMember 双 relation；family module 6 action createFamily/joinFamily/myFamily/leaveFamily/familyRanking/inviteInfo + 一人一家庭 @@unique + 8 位 inviteCode hex 短码；goal module 扩展 calcGoalProgress 改 userIds DRY + addFamilyGoal/myFamilyGoals；前端 pages/family 家庭卡+邀请复制+本月跑量榜+家庭目标+创建/加入+添加目标弹层；3 决策 + 3 坑：User 双 Family relation @relation("FamilyOwner") 消歧义范式累计第 3 次 NotifActor/Follower/FamilyOwner / inviteCode @unique 兜底 / familyRanking mockImplementation 并发 mock 范式；family +10 单测 + goal +5 单测 530→545；43 表 / 29 module / 34 页 / 17 迁移 / 15 缓存热路径持平）** 已落；545 单元全绿；working tree 待 commit V0.1.24~V0.1.34。
