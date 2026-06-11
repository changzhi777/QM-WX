# 02 重构架构设计

> 项目：青沐生命科技微信小程序
> 本文档是重构的**唯一技术依据**，开发同学按本文实现，遇到与旧代码冲突处一律以本文为准。
> 产品定位（已确认）：大健康生活方式平台 = **运动社群 + 健康/运动商城 + 赛事与本地服务**。钱包/支付因商户号申请中，**全部挂功能开关**。

---

## 1. 设计原则

1. **服务端权威**：身份（openid）、积分、余额、订单状态只能由云函数产生和变更，前端永远只是展示与发起。
2. **能力边界内设计**：不依赖微信未开放的能力（读群消息、向群发消息、抖音发布）。
3. **功能开关**：未就绪的模块（钱包、支付、会员购买、智能体）通过远程配置隐藏，不删代码不堵路。
4. **渐进式重构**：保留云开发技术栈与现有 UI 骨架，按模块逐个替换数据层，避免推倒重来。
5. **单一数据源**：每条业务规则（会员权益、积分规则）只在一处定义（服务端配置 + 前端 constants 镜像）。

## 2. 总体架构

```
┌─────────────────────────── 微信小程序（前端） ───────────────────────────┐
│  pages/                    components/              services/           │
│  index 首页                ranking-list 排行榜       api.js  调用封装     │
│  sport 运动(打卡/我的群)    product-card 商品卡       user.js sport.js    │
│  group-detail 群详情       cell 列表项               mall.js content.js  │
│  mall 商城 / product 详情  empty/loading 状态        wallet.js           │
│  mine 我的 / profile 资料  └── utils/ auth.js format.js constants.js    │
│  wallet 钱包(开关) 等       └── config/ env.js                           │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │ wx.cloud.callFunction
┌──────────────────────────────────▼───────────────────────────────────────┐
│  云函数（6 个，action 路由模式）                                           │
│  user      登录/资料/实名/绑定APP                                          │
│  sport     打卡/统计/积分/群(创建/加入/榜单/周报)                            │
│  mall      商品/购物车/订单                                                │
│  content   赛事/酒店/景区/餐饮/乡村振兴 内容查询与报名意向                    │
│  wallet    余额/流水/支付(开关关闭时全部拒绝)                                │
│  admin     内容管理/配置下发(仅管理员openid白名单)                           │
├──────────────────────────────────────────────────────────────────────────┤
│  云数据库（集合见 §4） │ 云存储（商品图/头像/战报图） │ 定时触发器(周报聚合)   │
└──────────────────────────────────────────────────────────────────────────┘
```

**为什么合并成 6 个云函数**：13 个零散函数 → 每个函数冷启动、部署、权限都要单独管。按领域合并 + `event.action` 路由，是云开发社区的成熟实践，也方便共用鉴权与校验中间层。

## 3. 前端目录结构（目标）

```
miniprogram/
├── app.js / app.json / app.wxss(仅设计变量+通用类<300行)
├── sitemap.json                ← 必须补建
├── config/
│   └── env.js                  // 云环境ID、版本号
├── utils/
│   ├── auth.js                 // 登录态：ensureLogin()、getUser()、logout()
│   ├── format.js               // 配速/距离/日期格式化
│   └── constants.js            // 会员等级、商品分类等枚举（与服务端配置对齐）
├── services/                   // 唯一允许出现 callFunction 的地方
│   ├── api.js                  // call(name, action, data) 统一封装：loading/错误toast/登录态过期重试
│   ├── user.js  sport.js  mall.js  content.js  wallet.js
├── components/
│   ├── ranking-list/  product-card/  cell/  empty-state/  feature-gate/
├── pages/
│   ├── index/                  // 首页（tab1）
│   ├── sport/                  // 运动中心（tab2，原 group 改名拆分）
│   ├── group-detail/           // 群榜单详情
│   ├── mall/                   // 商城（tab3，原 statistics 改名）
│   ├── product-detail/         // 商品详情（从 528 行 wxml 中拆出）
│   ├── order-confirm/ order-list/
│   ├── mine/                   // 我的（tab4，原 settings 改名）
│   ├── profile/  bind-app/  wallet/  membership/
│   └── content-list/ content-detail/   // 赛事/酒店/景区/餐饮/乡村 五合一模板页
└── images/tabbar/*.png         // tabBar 图标（当前缺失）
```

> 改名映射：`statistics→mall`、`group→sport`、`settings→mine`。马拉松/酒店/美食/景区/乡村振兴五个页面**合并为 content-list + content-detail 模板页**，用 `type` 参数区分，消灭五份雷同代码。

## 4. 数据库设计（云数据库集合）

所有集合权限设为「仅创建者可读写」或「所有用户不可读写（仅云函数）」，**禁止前端直连写库**。

### users（用户，merge 现 users/user_details）
```js
{
  _openid, nickname, avatarFileID,
  profile: { name, phone, gender, birthday, region, height, weight },
  certified: false,            // 实名认证（二期）
  memberLevel: 'free|monthly|quarterly|yearly',
  memberExpireAt: Date|null,   // 会员到期时间（服务端写）
  points: 0,                   // 积分余额（仅云函数 inc）
  boundApps: { garmin:false, huawei:false, ... },
  stats: { totalDistance, totalCheckins, totalPoints },  // 冗余汇总，打卡时 inc
  createdAt, updatedAt
}
```

### checkins（打卡记录）
```js
{
  _openid, groupId|null,
  distance: Number,            // km，服务端校验 0.5~50
  durationSec: Number|null,    // 建议新增：时长，可反推配速防伪造
  pace: 'mm:ss', heartRate, cadence,
  points: Number,              // 服务端计算
  date: 'YYYY-MM-DD',          // 用于"当日重复打卡"约束（同日同群最多1次计积分）
  createdAt
}
```

### groups / group_members（跑群）
```js
// groups
{ _id, opengid|null, name, ownerOpenid, memberCount, createdAt }
// group_members
{ groupId, _openid, nickname, avatarFileID, joinedAt, role:'owner|member' }
```

### products / orders（商城）
```js
// products
{ _id, name, category, brand, price, originalPrice, memberDiscount,
  images:[fileID], description, stock, status:'on|off', sort }
// orders
{ _id, _openid, items:[{productId,name,price,qty}], totalAmount,
  pointsUsed, payAmount,
  status:'pending_pay|paid|shipped|done|cancelled',   // 支付开关关闭时只允许 pending_pay→cancelled
  payment:{ transactionId, paidAt }|null, address, createdAt }
```

### points_records（积分流水，只增不改）
```js
{ _openid, change:+10|-100, type:'checkin|signup_bonus|order_deduct|member_gift',
  refId, balance:Number, createdAt }
```

### wallets / wallet_transactions（钱包，开关关闭期仍建好结构）
```js
// wallets：{ _openid, balance:0, status:'active|frozen', updatedAt }
// wallet_transactions：{ _openid, type:'recharge|consume|refund', amount,
//   orderId|null, wxTransactionId|null, status:'success|pending|failed', createdAt }
```
**铁律**：balance 只由 wallet 云函数在「微信支付回调验证成功」或「订单扣减」时变更；任何来自 event 的 balance 字段直接拒绝。

### contents（赛事/酒店/景区/餐饮/乡村振兴 统一内容表）
```js
{ _id, type:'marathon|hotel|scenic|food|rural',
  title, cover:fileID, summary, detail(富文本),
  price|fee, date|validRange, location, tags:[],
  actionType:'enroll|book|link|none',   // 报名/预订/外链/纯展示
  status:'on|off', sort, createdAt }
```

### enrollments（报名/预订意向）
```js
{ _openid, contentId, type, formData:{name,phone,...}, status:'submitted|confirmed|cancelled', createdAt }
```
> 支付未开通前，马拉松报名/酒店预订一律走「意向登记 + 客服跟进」，不收钱。

### app_config（远程配置/功能开关，所有用户只读）
```js
{ _id:'feature_flags',
  wallet:false, payment:false, membershipPurchase:false,
  smartAgent:false, bindApp:false,
  noticeBar:'', minVersion:'1.0.0' }
{ _id:'member_levels', free:{maxGroups:2,discount:1}, monthly:{price:29.9,maxGroups:5,discount:0.9,monthlyGiftPoints:100}, ... }
{ _id:'points_rules', perKm:1, dailyMaxKm:50, dailyMaxCheckins:1, signupBonus:50 }
```

## 5. 关键流程设计

### 5.1 登录（替换现有假登录）
```
小程序启动 app.onLaunch
  └─ wx.login() → code（其实云函数不需要code，云开发自动注入openid）
  └─ call user.login {}
       云函数: openid = cloud.getWXContext().OPENID
               users 中无记录 → 创建(送 signupBonus 积分) ；有 → 返回用户+config
  └─ 本地缓存 user + featureFlags；globalData.user 就绪
首次完善资料（可跳过）：
  button open-type="chooseAvatar" → 头像临时文件 → 上传云存储
  input type="nickname" → 昵称
  call user.updateProfile
```
- 登录页不再是闸口：游客可浏览首页/商城/内容，**打卡、下单、进群时** `auth.ensureLogin()` 拦截补登录。
- 废弃 `getUserProfile/getUserInfo` 全部删除。

### 5.2 跑群（替代「读取微信群消息」的可行方案）
```
创建群：群主在 sport 页点「创建跑群」→ call sport.createGroup → 得 groupId
入群：  群主点「邀请」→ wx.shareAppMessage 转发到微信群（携带 groupId）
        成员点卡片进入 → 若由群聊打开，wx.getGroupEnterInfo 可取 opengid
        （opengid 用于绑定"小程序群↔微信群"，同一微信群只允许建一个跑群）
        call sport.joinGroup {groupId}
打卡：  成员在小程序内填距离/配速（或后续接微信运动步数）→ call sport.checkin
        服务端：校验范围/当日次数 → 写 checkins → inc 用户积分 → inc 群统计
榜单：  call sport.groupRanking {groupId, period:'week|month|year'}
        聚合 checkins（按 date 范围 group by openid）
周报：  云函数定时触发器(每周日20:00) 聚合各群数据 → 写 group_reports
        → 订阅消息推给已订阅成员 + 生成战报分享图，群主一键转发回微信群
```
- 会员等级决定可加入/创建群数量（free 2 / monthly 5 / quarterly 8 / yearly 15，读 app_config）。
- `setInterval`、`ai-robot`、`send-summary`、`get-group-data` 全部删除。

### 5.3 打卡积分（防作弊）
服务端规则（points_rules 配置）：distance ∈ [0.5, 50]；每日计分打卡 ≤1 次；积分 = floor(distance × perKm)；流水写 points_records，余额 `db.command.inc`。前端只展示结果，不上传 points 字段——**云函数收到 points 字段直接忽略**。

### 5.4 下单（支付开关两态）
```
payment=false（现阶段）：
  商品页可加购物车、可生成订单(pending_pay) → 提示「支付功能开通中，可用积分全额兑换或联系客服」
  积分兑换：payAmount==0 且 pointsUsed 足够 → 直接 paid（服务端扣积分）
payment=true（商户号下来后）：
  mall.createOrder → wallet.unifiedOrder（云开发 cloudPay.unifiedOrder）
  → 前端 wx.requestPayment → 支付回调云函数验签 → 订单 paid + 写流水
```

### 5.5 会员购买
同 5.4：开关关闭时「立即开通」按钮显示「敬请期待」；开通后走微信支付，服务端写 memberLevel + memberExpireAt，**删除现在写 localStorage 的假购买**。

## 6. 钱包与微信支付接入（给负责人看的申请清单）

1. 在「微信公众平台 → 微信支付」申请**商户号**（需营业执照、对公账户，约 1-5 个工作日）。
2. 关联 AppID `wx426885831a05f18e`，开通 JSAPI 支付。
3. 云开发控制台绑定商户号后即可用 `cloud.cloudPay.unifiedOrder`（免证书、免回调域名，最省事）。
4. 上线顺序建议：先开「商品直接支付」，**缓上「余额充值」**——余额充值涉及预付卡资质（单用途预付卡需备案），合规成本高。如无强需求，砍掉"充值余额"，保留"积分 + 微信支付"双轨即可。
5. 开关切换：管理员改 app_config.feature_flags.payment=true，前端无需发版。

## 7. 云函数 API 契约（前后端对齐用）

统一调用：`wx.cloud.callFunction({ name, data: { action, payload } })`
统一返回：`{ code: 0, data } | { code: 4xx/5xx, msg }`（前端 api.js 统一弹错）

| 函数 | action | payload | 返回 data | 备注 |
|---|---|---|---|---|
| user | login | — | { user, config } | 首次自动注册 |
| user | updateProfile | { nickname?, avatarFileID?, profile? } | { user } | 字段白名单过滤 |
| user | bindApps | { boundApps } | { boundApps } | flag bindApp 关闭时返回 403 |
| sport | checkin | { distance, durationSec?, pace?, heartRate?, cadence?, groupId? } | { points, todayDone } | 服务端算分 |
| sport | myStats | { period } | { totalDistance, count, avgPace } | 聚合 checkins |
| sport | createGroup / joinGroup / quitGroup | { name } / { groupId, opengid? } | { group } | 数量上限按会员级 |
| sport | groupRanking | { groupId, period } | { members:[...], totals } | |
| mall | listProducts | { category?, brand?, keyword?, page } | { list, total } | |
| mall | productDetail | { id } | { product } | |
| mall | createOrder | { items, address, pointsUsed } | { orderId, payAmount } | |
| mall | myOrders / cancelOrder | { page } / { orderId } | { list } / {} | |
| content | list | { type, page } | { list } | 五类内容统一 |
| content | detail / enroll | { id } / { id, formData } | { content } / { enrollmentId } | enroll 仅登记意向 |
| wallet | get / unifiedOrder / transactions | … | … | flags.wallet=false 时一律 `{code:403,msg:'功能开通中'}` |
| admin | upsertContent / upsertProduct / setConfig | … | … | openid 白名单校验 |

**每个云函数目录必须有 package.json**（`"wx-server-sdk": "~2.6.3"` 或最新），入口统一模板：
```js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()        // 唯一身份来源
  const { action, payload = {} } = event
  try { return { code: 0, data: await handlers[action]({ OPENID, payload }) } }
  catch (e) { return { code: e.code || 500, msg: e.message } }
}
```

## 8. 工程规范

- **app.json**：补 sitemap.json；`debug` 删除；tabBar 配图标（iconPath/selectedIconPath）；新增页面按 §3 注册；考虑分包（mall 相关页一个分包，content 一个分包）。
- **品牌**：主色不再用微信绿 #1aad19，建议青沐品牌青绿色系（如 #0FAF8E，由设计定稿），在 app.wxss 顶部定义 `page { --brand: ...; --brand-light: ...; }` 全局变量。
- **.gitignore**：`project.private.config.json`、`.DS_Store`、`node_modules/`、`cloudfunctions/**/package-lock.json`。
- **错误处理**：services/api.js 统一 `showLoading/hideLoading`、code!==0 时 toast msg、网络失败重试一次。
- **日志**：删除全部 console.log，云函数保留 console.error（云开发有日志检索）。

## 9. 渐进式迁移步骤（与 04 文档任务对应）

1. **打地基**：补 sitemap/.gitignore/package.json、真实云环境 ID、api.js 封装、app_config 集合 + feature-gate 组件。
2. **换身份**：user 云函数 + 新登录流，删除一切 `test_openid` 与 event.openid。
3. **运动闭环**：checkin 服务端化 → 群创建/加入/榜单 → 周报订阅消息。
4. **商城真数据**：products/orders 集合 + admin 录入 + 积分兑换通路。
5. **内容五合一**：contents 集合迁移五个静态页 + 意向登记。
6. **支付接入**（等商户号）：打开开关，会员购买 + 订单支付 + 钱包。
7. **暂缓**：smart-agent 移出小程序、bind-app 等第三方 OAuth、实名认证。
