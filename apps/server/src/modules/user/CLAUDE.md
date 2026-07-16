# user Module — AI 上下文

> 📍 面包屑：[根目录](../../../../CLAUDE.md) > [apps/server](../../../CLAUDE.md) > modules > **user**

## 职责

用户中心 module。微信登录（code2Session → JWT）、个人资料读写、多方式认证绑定（手机号/邮箱/密码/username）、onboarding 状态管理。**User 表是全项目中心**，被 30 个 module 的 relation 引用（分销/跑鞋/目标/收藏/动态/通知/关注/家庭等），任何 User schema 改动需配套迁移并广播到所有下游。

## 入口

- **路由注册**：`app.ts` 注册 `userRoutes`，namespace `/api/user`
- **路由前缀**：`POST /api/user`（单 endpoint，body 含 `action`）
- **鉴权策略**（**关键**）：
  - 整条 route 标 `config: { public: true }` — 因为 `login` 不需要已登录
  - 但 `me` / `updateProfile` / `bindApps` / `completeOnboarding` / `resetOnboarding` 在 case 内**显式调** `requireLogin(req)` 主动鉴权
  - **P0-1 历史 bug（V0.1.17 修）**：原实现 `if (!req.user) throw 401` — authPlugin 对 `public:true` 路由跳过 jwtVerify → `req.user` 恒 undefined → 所有受保护 action 恒 401。改为 `await requireLogin(req)` 后，带 Bearer token 才解出 `req.user`

## Action 清单

| action | 方法签名 | 功能 | 备注 |
|--------|----------|------|------|
| `login` | `login(app, {code, nickname?, avatarUrl?})` | 微信登录：code → openid → upsert User → 首登送 50 积分 + 写流水 → 签 access+refresh JWT → 加载 config | **public**（不需已登录）；首登事务内 `addPoints(SIGNUP_BONUS)` |
| `updateProfile` | `updateProfile(userId, {nickname?, avatarFileID?, profile?})` | 更新资料：字段白名单（nickname/avatarUrl + profile.{gender/birthday/region/height/weight/name/phone}） | me 缓存精准失效；V0.1.40 修 profile 嵌套字段被 strip 的 P1 bug |
| `bindApps` | `bindApps(userId, {phone?, email?, password?, username?})` | 多方式认证绑定：bcrypt hash password；phone/email/username `@unique` 防重 | V0.1.129 引入；V0.1.130 +username 支持 admin Web 账号登录 |
| `me` | `getById(userId)` | 拿当前 user + config（前端首屏启动调） | **Cache.wrap 30s**，`user:me:{userId}` |
| `completeOnboarding` | `completeOnboarding(userId)` | 标记 `onboardingDone = true` | V0.1.43 引入；失效 me 缓存 |
| `resetOnboarding` | `resetOnboarding(userId)` | 标记 `onboardingDone = false` | V0.1.43 引入；mine「重新激活授权」入口替退出登录（wx.login 总登回原账号，真退出无意义） |

> 三方对齐：`ActionBodySchema.enum` ↔ `routes switch case` ↔ `userService` 导出方法 — **6 个 action 全覆盖**

## 数据模型（Prisma）

| Model | 关键字段 / 索引 | 用途 |
|-------|-----------------|------|
| **User** | `id` `openid @unique` `unionid?` `nickname?` `avatarUrl?`；`phone @unique?` `email @unique?` `username @unique?` `passwordHash?`（V0.1.129）；`inviteCode @unique?` `distributorLevel`（V0.1.24）；`gender?` `birthday?` `region?` `height?` `weight?`（V0.1.40）；`onboardingDone Boolean @default(false)`（V0.1.43）；`customMilestones Json?`（V0.1.135）；`memberLevel` `memberExpireAt?` `points` `certified` `isBanned` `stats Json` | 全项目中枢 |
| **PointsRecord** | `userId` `change` `type` `createdAt`；索引 `[userId, createdAt]` | 积分流水（首登 `signup_bonus` / 后续各场景流水） |

**User 表跨 module relations**（高频加字段轨迹）：
- V0.1.24 distribution：`inviteCode` + `distributorLevel` + `distributorOrders` + `teamInviter`
- V0.1.26 shoes：`shoes Shoe[]`
- V0.1.28 goal：`goals Goal[]`
- V0.1.29 favorite：`favorites Favorite[]`
- V0.1.30 feed：`feeds` + `feedLikes` + `feedComments`
- V0.1.31 notification：`notifications` + `notifActions @relation("NotifActor")` **双 relation**
- V0.1.32 follow：`following @relation("Follower")` + `followers @relation("Followee")` **双 relation**
- V0.1.34 family：`familiesOwned @relation("FamilyOwner")` + `familyMember` **双 relation**
- V0.1.43 onboarding：`onboardingDone Boolean`
- V0.1.129 auth 扩展：`phone/email/passwordHash/username @unique`
- V0.1.135 goal：`customMilestones Json?`

> ⚠️ **同 model 双 relation 必须 `@relation("name")` 消歧义**（范式累计 3 次：NotifActor / Follower-Followee / FamilyOwner），否则 Prisma generate 报 P1012 Ambiguous relation

## 集成点

- **被调用方（前端）**：小程序 `services/api.ts` `api.call('user', 'me' | 'login' | 'updateProfile' | 'bindApps' | 'completeOnboarding' | 'resetOnboarding')`；onboarding 页 / mine 页 / bind-apps 页
- **调用方（service 内）**：
  - `userRepo`（`user.repository.ts`）：`findByOpenid` / `upsertByOpenid` / `findById` / `updateProfile` / `addPoints(tx, userId, change, type)`
  - `signTokens(app, user)`（`common/helpers/sign-tokens.ts`，V0.1.129 DRY 抽离，被 auth connectors 复用）
  - `code2Session(code)`（`common/integrations/wx/code2session.js`，session_key 缓存 Redis）
  - `configRepo.getLoginConfig()`（`app-config.repository.ts`，返 featureFlags + memberLevels + pointsRules）
  - `ludongService.enqueueInTx(prisma, 'user.upsert', ...)`（非事务，失败仅 warn 不阻塞 login）
  - `bcrypt.hash`（bindApps password 加密，10 rounds）
- **缓存**：Cache.wrap **30s** TTL，key `user:me:{userId}`
  - 命中 ~0.5ms（小程序启动查 me 是热路径）
  - 写后精准失效：`updateProfile` / `bindApps` / `completeOnboarding` / `resetOnboarding` 都 `Cache.del(meCacheKey(userId))`
  - 其他写点（打卡/订单/会员变更）由 30s TTL 兜底
  - fail-open：Redis 挂掉时静默降级直查 DB
- **BullMQ**：无（ ludong 入 outbox 由 ludong-sync job 投递）
- **notify**：无

## 测试

| 文件 | 用例数 | 覆盖 action / 场景 |
|------|--------|-------------------|
| `tests/modules/user/user.service.test.ts` | **9** | login 老用户 / login 新用户送积分 / login code2Session 失败 / getById miss+回填 / getById 命中 / getById 不同 userId 不串扰 / getById 不存在不缓存 / updateProfile 删缓存 / updateProfile 失败缓存不动 |
| `tests/modules/user/user.routes.test.ts` | **12** | login public / updateProfile 缺 user 401 / updateProfile 正常 / bindApps 缺 user 401 / bindApps 正常 / me 缺 user 401 / me 正常返 user+config / 缺 action 字段 / action 非法值 + **P0 回归 3**：me 带真 Bearer token 200（修复前恒 401） / me 无 token 401 / updateProfile 带真 token 200 |

**共 21 用例**。**关键范式**：
- `vi.hoisted` 隔离 Redis mock（避免 `vi.clearAllMocks` 清掉 mock 实现）
- `$transaction.mockImplementation(cb)` 让 tx 内的 `addPoints` 调用顶级 mock
- P0 回归测试用真实 `authPlugin + @fastify/jwt` 链路（非 stub），复现 production「public 路由跳过 jwtVerify」语义

## 关键范式与坑

1. **P0-1 requireLogin 修复范式（V0.1.17）**
   - public 路由内受保护 action 必须 `await requireLogin(req)`，不能 `if (!req.user) throw 401`
   - 原因：`authPlugin` 对 `config.public:true` 路由**跳过 jwtVerify** → `req.user` 永远 undefined
   - 回归测试见 `user.routes.test.ts` 末尾「P0 回归」describe block（3 用例复现真 auth 链路）

2. **首登送积分事务范式**
   - `isNew = !(await userRepo.findByOpenid(openid))` 先判存在
   - `upsertByOpenid` 建档
   - 事务内 `addPoints(SIGNUP_BONUS=50, 'signup_bonus')` 写 PointsRecord + inc User.points
   - 事务外重读 user 拿最新 points（事务隔离级别看不到自身写）

3. **me 缓存 30s TTL（V0.1.8）**
   - 短 TTL 平衡：积分/会员/打卡/订单变化频繁，30s 内可能仍看到旧态，业务可接受
   - 写后精准失效：`Cache.del(meCacheKey(userId))` 在 updateProfile/bindApps/completeOnboarding/resetOnboarding 内

4. **bindApps 多方式防重（V0.1.129）**
   - 每个 `@unique` 字段绑定前 `findUnique` 查重：phone/email/username 被其他账号占则 `badRequest`
   - password：`bcrypt.hash(input.password, 10)` 存 `passwordHash`（不存明文）
   - 至少提供一个绑定字段（空 payload → `badRequest`）

5. **profile 嵌套字段（V0.1.40 修 P1 bug）**
   - 原 `updateProfile` 只接顶层 `nickname/avatarUrl`，gender/birthday/region/height/weight 被 Zod strip
   - 修复：schema 加 `profile: { gender, birthday, region, height, weight, name, phone }.optional()`
   - service 内 `const profile = input.profile ?? {}` 拆字段白名单合并到 update data

6. **toUserOutput 序列化（V0.1.130 扩）**
   - Prisma row → API output（含 ISO 时间 `toISOString()`）
   - 关键派生字段：`hasPassword: Boolean(u.passwordHash)` / `stats.totalPoints: u.points`（合并到 stats 视图）
   - 类型严格：参数 `u` 用结构类型而非 Prisma 类型（避免 import 循环 + 测试易 mock）

7. **resetOnboarding 替退出登录（V0.1.43 设计决策）**
   - `wx.login` 总登回原账号（openid 不变），真退出无意义
   - 改语义：resetOnboarding = 重新走向导填资料/授权微信运动
   - mine「退出登录」入口改名为「重新激活授权」

## 版本演进

- **V1（init）** — user module 落地：login + me + updateProfile 3 action + User 表
- **V0.1.8** — me 接 `Cache.wrap` 30s TTL + updateProfile 写后精准失效（缓存基础设施接入）
- **V0.1.17** — **P0-1 修复**：public 路由内 `requireLogin(req)` 替 `if (!req.user) throw 401`（修原恒 401 bug；e2e `user-flow` 6 用例回归）
- **V0.1.24** — User +`inviteCode @unique` + `distributorLevel V0-V3`（分销中心前置）
- **V0.1.26** — User +`shoes Shoe[]` relation（跑鞋模块前置）
- **V0.1.28** — User +`goals Goal[]` relation（跑步目标前置）
- **V0.1.29** — User +`favorites Favorite[]` relation（收藏前置）
- **V0.1.30** — User +`feeds` + `feedLikes` + `feedComments` relation（动态前置）
- **V0.1.31** — User +`notifications` + `notifActions @relation("NotifActor")` 双 relation（消息中心前置）
- **V0.1.32** — User +`following @relation("Follower")` + `followers @relation("Followee")` 双 relation（关注前置）
- **V0.1.34** — User +`familiesOwned @relation("FamilyOwner")` + `familyMember` 双 relation（家庭前置）
- **V0.1.40** — profile 完整实现：User +5 字段（gender/birthday/region/height/weight）+ service 处理 profile 嵌套 + uploadFile 拼 baseUrl + applyUser 回填
- **V0.1.43** — User +`onboardingDone Boolean @default(false)` + 新 action `completeOnboarding` / `resetOnboarding`（onboarding 4 步式激活向导）
- **V0.1.112** — user.routes.test.ts 补完（routes 纳入覆盖率统计）
- **V0.1.129** — User +`phone/email/passwordHash/username @unique` + bindApps 重构为多方式认证（参考 logto connector，不引入服务）；+17 单测
- **V0.1.130** — bind-apps 前端页 + `toUserOutput` +`email`/`+username`/`+hasPassword` + P0 修（独立 route 从 `req.body.payload` 取，原 P0 把整个 body 当 payload）
- **V0.1.131** — bindApps +username 支持（qm-admin Web 账号绑定前置）
- **V0.1.135** — User +`customMilestones Json?`（自定义里程碑，goal module 用）
- **V0.2.7** — 🎯 **邀请裂变增长体系**：① **`User.totalPointsEarned`** `Int @default(0)`（累计挣得积分，**仅在 `addPoints({change>0})` 时同步 inc**，`change<0`（兑换/扣减）不影响累计；驱动前端 `computeGrowth` 与后端 `deriveGrowthLevel` 双源一致，门槛 100/500/2000/5000 = bronze/silver/gold/diamond）；② **`User.invitedBonusDays`** `Int @default(0)`（被邀请赠送天数，**仅 `bindInviter(inviterId)` 邀请场景累加**，校验 ≤ 90 天；兑换/手动赠送不占配额）；迁移 `20260716020000_growth_level`（+totalPointsEarned/invitedBonusDays 字段）+ `20260716030000_invite_cap`（产品配置表 + 周限频）；③ **`user.redeemMember`** action — `{packageId}` 7天/100积分 或 30天/300积分，前端 `REDEEM_PACKAGES` 套餐列表与后端 `REDEEM_PACKAGES` 常量一致，事务内 `points decrement`（条件 `points>=cost` 防双花）+ `addPoints({change: -cost, type: 'redeem_member'})` + `WalletTransaction(type: member_grant)` + `User.memberExpireAt ext + days`（boost 现有）或 `User.memberExpireAt = now + days`（新建）+ PointsRecord；④ **`user.computeGrowthLevel`** 复用函数（service 内部）：`deriveGrowthLevel(totalPointsEarned)` = total<100 'free' / <500 'bronze' / <2000 'silver' / <5000 'gold' / ≥5000 'diamond'，**与前端 `computeGrowth` 函数并列实现**保持单一计算语义；⑤ **me 缓存扩展**：返 `memberLevel`/`memberExpireAt`/`points`/`totalPointsEarned`/`invitedBonusDays`/`growthLevel`（前端 `avatar-badge` 用）—— `Cache.wrap 30s` TTL 兼容（30s 内看旧等级可接受，写后精准失效）；⑥ **route.test** 补 +2 用例：redeemMember points 不足返 400 / 正常兑换续期正确；本次 V0.2.7 后端 0 新 module（与 V0.2.4~V0.2.6 一致）
