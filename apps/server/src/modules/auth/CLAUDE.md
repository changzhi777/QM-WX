# auth module — 多方式认证（V0.1.129）

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../../../CLAUDE.md) → [`apps/server/`](../../../CLAUDE.md) → [`modules/`](../) → **auth/**（这里）
> 父级：[apps/server CLAUDE.md](../../../CLAUDE.md) | 同级：[user](../../user/) | [app-config](../../app-config/)

> 引入版本：**V0.1.129**（2026-07-12，多方式认证扩展 / 参考 logto connector 模式）
> 关联：V0.1.130 bind-apps 前端页 + auth route P0 修复 + UserOutputSchema +email/+username/+hasPassword

---

## 🎯 模块职责

**多方式认证 + 绑定关系**：用户先以**一种主方式**登录（默认微信小程序 code2Session），登录后可绑定**多种辅助方式**（手机号/邮箱/用户名密码），后续任意绑定方式都能登录到**同一 User**（身份不分裂）。

- **设计灵感**：参考 [Logto Connector](https://docs.logto.io/docs/recipes/configure-connectors/) 模式 — 不引入独立服务，**每种登录方式独立 connector**，login 统一 dispatch。
- **核心约束**：**身份唯一**。`User.openid` 仍为主键（兼容小程序原有 user.login），绑定只是 User 表加字段（phone/email/username/passwordHash）。不会因为绑了手机就分裂成两个账号。
- **不自动注册**：手机号/邮箱登录时若未绑定 → notFound 抛错（必须是先微信登录后再 bindApps）。**YAGNI**：暂不做"裸手机号注册"流程（如要做需加 phone→openid 注册流 + 验证码防刷）。
- **refresh token**：保留原 `/api/auth/refresh` 一次性轮换机制（jti 拉黑防重放）。
- **短信/邮件**：**当前为 stub**（`issueSmsCode` / `sendSms` / `sendMail` 仅打印日志），待阿里云/腾讯云短信 + 邮件服务接入。

---

## 🚪 入口与启动

| 文件 | 职责 | 行数 |
| --- | --- | ---: |
| `auth.routes.ts` | POST `/api/auth/login`（统一 4 method dispatch）+ `/api/auth/refresh` + `/api/auth/sms-code` + `/api/auth/send-mail` + **POST `/api/auth/bind-apps`**（V0.1.130 独立路由从 req.body.payload 取） | 139 |
| `auth.service.ts` | `login` dispatcher（4 method）+ `loginByMethod`（phone/email/password）+ bindApps（绑定/解绑辅助方式） | 73 |
| `sms-code.ts` | `issueSmsCode(phone)` — 短信验证码生成 + Redis 缓存 + 5min TTL + stub 发送 | ~50 |
| `connectors/wechat.ts` | wechat connector — 委托给 userService.login（保留兼容） | 13 |
| `connectors/phone.ts` | phone connector — `verifyPhone({phone, code})` 验证码校验 → 返 userId | 14 |
| `connectors/email.ts` | email connector — `verifyEmailPassword({email, password})` bcrypt 校验 → 返 userId | 15 |
| `connectors/password.ts` | admin/password connector — `verifyAdminPassword({username, password})` bcrypt 校验 → 返 userId（**仅 admin 用**，普通用户用 email/password） | 15 |
| `connectors/sms.ts` | 短信发送 stub — `sendSms({phone, code})` console.log，**待生产配阿里云/腾讯云** | 21 |
| `connectors/mail.ts` | 邮件发送 stub — `sendMail({to, subject, html})` console.log，**待生产配邮件服务** | 21 |

注册：`src/app.ts` 内 `app.register(authRoutes, { prefix: '/api/auth' })`

---

## 📡 对外接口（5 endpoint + bindApps）

### 统一登录：POST `/api/auth/login`（public）

| method | payload | 说明 |
| --- | --- | --- |
| `wechat` | `{ code, nickname?, avatarUrl? }` | 委托 `userService.login`（保留 wx.login 全套流程：openid upsert + 首登积分 + ludong sync） |
| `phone` | `{ phone, code }` | 验证码登录（`phone` 先调 sms-code 收验证码，5min TTL）；**不自动注册**，需先微信登录+bindApps |
| `email` | `{ email, password }` | 邮箱密码登录（bcrypt 校验）；**不自动注册**，需先微信登录+bindApps |
| `password` | `{ username, password }` | 用户名密码登录（admin 用，bcrypt 校验）；**不自动注册**，需先微信登录+bindApps |

**返回**：`{ code: 0, data: { accessToken, refreshToken, user } }`，统一通过 `signTokens(app, user)` 签发

### Refresh：POST `/api/auth/refresh`（public）

- body： `{ refreshToken }` — 一次性轮换（jti 拉黑防重放）
- 返回： `{ accessToken, refreshToken }` — 新 jti 新 refresh

### SMS Code：POST `/api/auth/sms-code`（public，rate-limit 兜底）

- body： `{ phone }` — 正则 `/^1[3-9]\d{9}$/`
- 副作用：调 `issueSmsCode(phone)` 生成 6 位验证码 → Redis 缓存 5min → `sendSms` stub

### Send Mail：POST `/api/auth/send-mail`（public，预留）

- body： `{ to, subject, html }`
- 副作用：调 `sendMail` stub

### Bind Apps：POST `/api/auth/bind-apps`（V0.1.130 独立路由，**鉴权**）

- body： `{ action, payload }` — 独立 route 从 `req.body.payload` 取（**P0 修复**：原 P0 是套用公共 schema 把整个 body 当 payload，导致 bindApps 取不到嵌套 payload，V0.1.130 修）
- action 表：
  - `bindPhone` → `{ phone, code }` 验证验证码 + User +phone `@unique` 防重
  - `bindEmail` → `{ email, password }` bcrypt 哈希 + User +email `@unique` 防重
  - `bindPassword` → `{ username, password }` bcrypt 哈希 + User +username `@unique` 防重
  - `unbindPhone` / `unbindEmail` / `unbindUsername` → 当前绑定清除

---

## 🔗 关键依赖与配置

### User 表新增 4 字段（V0.1.129）
```prisma
phone       String? @unique
email       String? @unique
passwordHash String?
username    String? @unique
```

### 复用入口
- **DRY `signTokens(app, user)`**（`common/helpers/sign-tokens.ts`）：微信登录 / 手机号登录 / 邮箱登录 / refresh 都用这个签 access (2h) + refresh (30d)，一致性好维护
- **`toUserOutput(user)`**（`user.service.ts`）：所有登录返 user 时统一脱敏（不返 passwordHash / openid / phone 全量 / email 全量），V0.1.130 UserOutputSchema 加 `email?` / `username?` / `hasPassword` 字段

### 安全要点
- **bcrypt**：password 哈希（不自实现）
- **@unique 防重**：phone/email/username 各自唯一约束，绑定重复值 → conflict
- **rate-limit**：auth 模块由 `@fastify/rate-limit` 插件兜底（防短信轰炸 + 密码爆破）
- **session_key 缓存**：wechat 路径走 `code2Session` + Redis session_key 缓存（与历史一致）

---

## 🧪 测试

`tests/modules/auth/`（V0.1.129）：
- `auth.routes.test.ts` — **7 单元测试**：login 各 method 入口 + bindApps + refresh + 401 边界
- `auth-login.test.ts` — **6 单元测试**：login dispatcher + loginByMethod 4 method 行为
- `sms-code.test.ts` — **4 单元测试**：验证码生成 + Redis 缓存 + 5min TTL + 重发

**mock 策略**：`vi.mock('src/infra/prisma.js')` + mock connectors + signTokens

---

## 📌 常见问题 (FAQ)

**Q：手机号能直接注册新账号吗？**
A：不能。**身份唯一**约束 — 必须先微信登录后再 bindApps 绑手机号。`phone` 登录时若未绑定 → notFound（防裸手机号注册把身份分裂）。

**Q：绑定后能解绑吗？**
A：能。bindApps 暴露 3 个 unbind action（unbindPhone/unbindEmail/unbindUsername），但**至少留 1 个登录方式**（解绑全部会锁死账号，待 V0.1.132+ 加守卫）。

**Q：短信验证码有效期？**
A：5 分钟（300s TTL，Redis 缓存 `sms:code:{phone}`）。

**Q：密码忘了怎么办？**
A：当前**无找回流程**（安全起见不支持短信找回）。bindApps 重新设置或 admin 重置（V0.1.132+ 待补）。

**Q：admin Web 怎么登录？**
A：admin 用 username + password（`bindApps.bindPassword` 设置）。**qm-admin v0.1.131** 已对接：admin 登录页 → POST `/api/auth/login` method=password → 后端校验 bcrypt + signTokens → 前端存 localStorage。**白名单在 User 表 distriOpenid/adminOpenid**（V0.1.131）。详见 qm-admin 独立仓库 `6ba3e16`。

**Q：wechat 还能用吗？**
A：能，且**仍为主方式**（小程序默认）。其他 3 method 是「补充登录」。

---

## 📁 相关文件清单

```
src/modules/auth/
├── auth.routes.ts             # 5 endpoint（login/refresh/sms-code/send-mail/bind-apps）
├── auth.service.ts            # login dispatcher + loginByMethod + bindApps
├── sms-code.ts                # issueSmsCode 验证码生成 + Redis + 5min TTL
├── connectors/
│   ├── wechat.ts              # 委托 userService.login
│   ├── phone.ts               # verifyPhone 验证码
│   ├── email.ts               # verifyEmailPassword bcrypt
│   ├── password.ts            # verifyAdminPassword bcrypt（admin 用）
│   ├── sms.ts                 # sendSms stub（待生产配）
│   └── mail.ts                # sendMail stub（待生产配）
└── CLAUDE.md                  # 本文件

tests/modules/auth/
├── auth.routes.test.ts        # 7 路由单测
├── auth-login.test.ts         # 6 dispatcher 单测
└── sms-code.test.ts           # 4 验证码单测

# 复用入口
src/common/helpers/sign-tokens.ts     # DRY signTokens(app, user)
src/modules/user/user.service.ts      # userService.login + toUserOutput
src/modules/app-config/app-config.repository.ts  # configRepo

# Prisma
prisma/schema.prisma                       # User +phone/email/passwordHash/username @unique
prisma/migrations/20260712090000_user_auth_fields/  # V0.1.129 +4 字段
```

---

## 📝 变更记录 (Changelog)

- **2026-07-12** — 创建（V0.1.129 多方式认证 / 参考 logto connector 模式）：User +4 字段 + auth module 重构为 connectors 架构 + login dispatcher 4 method + bindApps + signTokens DRY
- **2026-07-12** — V0.1.130 bind-apps 前端页 + auth route P0 修复（独立 route 从 req.body.payload 取）+ UserOutputSchema +email/username/hasPassword
- **2026-07-12** — V0.1.131 qm-admin 登录对接（admin 用 username + password method=password；qm-admin 独立仓 6ba3e16）
