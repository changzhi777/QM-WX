# apps/miniprogram — 微信小程序

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../CLAUDE.md) → **apps/miniprogram/**（这里）
> 架构依据：[docs/ARCHITECTURE-V2.md §7](../../docs/ARCHITECTURE-V2.md)
> 最近更新：2026-07-07（V0.1.38 — **团购深化（成团下单）**（group-buy-detail 加"团购下单"按钮：成团 reached+已参与时显示，调 mall.createOrder with groupBuyId 团购价订单 + 跳 order-list；**无新页/表，1 迁移 Order +groupBuyId**）— V0.1.37 — **2764 团购（简化 MVP）**（GroupBuy+Member 表 + group-buy module 4 action：list/detail/join/myJoined + 达目标 reached 循环 notify；2 新页 group-buy/group-buy-detail + 参与乐观更新 + onShareAppMessage 分享；mall 加团购入口；**页面 36→38 / 测试 549→557 / 1 迁移**）— V0.1.36 — **2771 社交深化**（转发微信群 + 话题 + 红心广场 + 视频；Feed +topic+videoUrl + feed list sort=hot/topic 过滤 + hotTopics action；feed 页 onShareAppMessage + `<video>` + topic 标签 + 发布加字段；2 新页 hot+topic；首页加红心广场入口；**页面 34→36 / 测试 545→549 / 1 迁移**）— V0.1.35 — **mine 重构 + 功能分散到 4 tab + index 首页优化**（112.jpg 启发，纯前端重构；新组件 **entry-grid**（4 列 emoji 网格 flexbox + title + badge，DRY 复用 sport/mall/index；components 4→5）+ sport 加运动入口 14 项 4 段（🏃工具/📊数据/💊健康/🎯社交）→ "运动中心" + mall 加商城入口 8 项 → "商城中心" + mine 精简（删 22 项 list + 22 goXxx 方法 + onTapForceProfile 死方法，保留 7 项：消息/家庭/资料/会员/客服/协议/退出 + redirect-card 引导切 tab）+ **index 首页优化**（hero 品牌色渐变 + 本周数据卡悬浮覆盖 + redirect-card 运动/商城中心导流 + 快捷入口 entry-grid 6 高频 page：消息/动态/收藏/家庭/榜单/资料 + 钱包卡）+ UI/UX 优化（sport 打卡卡品牌色底边 + mall 商品卡 box-shadow + entry-grid icon 渐变）；**零后端/零 schema/测试不变 545/页面不变 34/组件 4→5**）— V0.1.34 — **34 页面**：家庭空间 family（pic 2776 家庭方向；/zcf:workflow 方案1 完整 family module）— 家庭卡 name+inviteCode+成员数 + 邀请按钮复制 inviteCode + 本月跑量榜 rank-num+avatar+nickname+家长标+monthDistance + 家庭目标进度条 + 创建/加入（无家庭态）+ 添加家庭目标弹层（月度/年度 picker + title + targetDistance）+ leaveFamily 按钮（非 owner）；调 family.createFamily/joinFamily/myFamily/leaveFamily/familyRanking/inviteInfo + goal.addFamilyGoal/myFamilyGoals；mine 加入口「家庭空间」19→20 宫格）+ V0.1.33 — **device-bind 页品牌识别增强**（matchBleVendor 自动识别 + 0x180A Manufacturer Name 二次验证 + wx.showActionSheet 手选兜底 + 心率卡电量/型号/厂商展示；utils/ble.ts 新增 readBattery（0x180F / 2A19）+ readDeviceInfo（0x180A：2A29 Manufacturer + 2A24 Model）+ readCharValue 通用 GATT 读取工具；**页面数不变 33**；零 schema 改）+ 🐛 小程序 TS 类型 3 坑（TextDecoder 非 DOM lib / offBLECharacteristicValueChange 签名不接受参数 / OnBLECharacteristicValueChangeCallbackResult 类型不存在）；V0.1.32 — **33 页面**：用户主页 user（pic 2 社交向深化；头像+昵称+关注/粉丝数+关注按钮**乐观更新**失败回滚 + isSelf 自己不显示按钮；调 follow.myCounts 一次拿全/follow.follow/follow.unfollow；feed wxml feed-head 加 data-uid + bindtap onTapUser 跳用户主页，关注闭环入口）+ 🐛 training wxss 中文 selector 修复（原 `.plan-card.入门/进阶/挑战/极限` 4 个中文 class selector 编译报 `unexpected � at pos 1725`，wxss 不支持中文 selector → 分离 levelKey 英文 beginner/intermediate/challenge/extreme 作 class + level 中文显示，LEVEL_KEY_MAP 映射；全 miniprogram wxss 扫描无残留）；V0.1.31 消息中心 notification；V0.1.30 运动动态 feed；V0.1.29 收藏页 favorite；V0.1.28 跑步目标 + 我的证书；V0.1.27 年度报告 + sport 打卡加跑鞋 picker + device-bind 调试面板；V0.1.26 跑鞋页 shoes；V0.1.25 pic 3 张全新功能页（今日健康 / 设备绑定 / 蓝牙 BLE / 锻炼训练）；B 电商三连击 + 佳明 3 页 + 个人中心电商版，pic 2768）

---

## 🎯 职责

微信小程序前端，业务调用全部走 `services/api.ts`（替代旧 `wx.cloud.callFunction`）。

---

## 🏃 快速上手

```bash
# 1. 装依赖（monorepo 根）
cd ../.. && pnpm install

# 2. 用微信开发者工具打开本目录
#    路径：apps/miniprogram/
#    AppID：wx8c37d7ac5b7d0a83（已在 project.config.json 配）

# 3. 配置本地后端地址
#    编辑 miniprogram/config/env.ts
#    或在 app.ts onLaunch 里改 $apiBase
```

> 后端未启动时，开发者工具控制台会报网络错误是正常的。

---

## 📂 目录结构

```
miniprogram/
├── app.ts                          # 应用入口（静默登录 + 全局 $apiBase/$token）
├── app.json                        # 页面路由 + tabBar + 全局窗口配置（34 页面注册）
├── app.wxss                        # 全局样式（--brand: #0FAF8E，限 300 行内）
├── sitemap.json                    # 搜索接入配置
├── config/
│   └── env.ts                      # baseUrl / 品牌常量
├── utils/
│   ├── auth.ts                     # ensureLogin / logout
│   ├── format.ts                   # 配速/距离/日期格式化
│   └── ble.ts                      # **蓝牙 BLE 工具**（V0.1.25：扫描/连接/订阅心率服务 0x180D + 心率值解析；**V0.1.33 新增**：readBattery（0x180F / 2A19 电量百分比）+ readDeviceInfo（0x180A：2A29 Manufacturer Name + 2A24 Model Number）+ readCharValue 通用 GATT 读取工具）
├── services/
│   └── api.ts                      # **唯一**调后端的地方（含 refresh 一次重试 + actionUrl）
├── components/
│   ├── feature-gate/               # 功能开关守卫组件（读取远程 feature_flags）
│   ├── error-state/                # 通用错误态组件（方案 B 引入）
│   ├── privacy-popup/              # 隐私协议弹窗
│   └── profile-popup/              # 用户资料弹窗
├── pages/
│   ├── index/                      # 首页（tabBar）
│   ├── sport/                      # 运动打卡（tabBar；V0.1.27 加跑鞋 picker：调 shoes.list 取 active，打卡传 shoeId → 跑鞋里程闭环）
│   ├── mall/                       # 商城（tabBar）
│   ├── mine/                       # 我的（tabBar；**20 宫格入口**：跑量汇总卡 + 佳明活动 + 电商入口 + pic 3 新入口 + 我的跑鞋 + 年度报告 + 跑步目标 + 我的证书 + 我的收藏 + 运动动态 + 消息中心（带未读徽标，V0.1.31）+ 家庭空间（V0.1.34）；feed 头像点进用户主页关注，V0.1.32）
│   ├── tiantian/                   # **天天跑首页**（V0.1.24；搜索 + 3 入口 + 促销横幅 + 功能宫格 + 新人专享商品流，pic 2767）
│   ├── profile/                    # 个人资料
│   ├── group-detail/               # 跑群详情
│   ├── weekly-report/              # 周报战报
│   ├── content-list/               # 内容列表（赛事/酒店/景区等）
│   ├── content-detail/             # 内容详情
│   ├── product-detail/             # 商品详情
│   ├── order-confirm/              # 订单确认（Phase 4）
│   ├── order-list/                 # 订单列表（V0.1.23 5 tab：全部/待付/待发/待收/完成）
│   ├── agreement/                  # 用户协议
│   ├── garmin-data/                # **佳明数据处理**（2026-07-01，待处理/已处理 + 导入/忽略，pic 2769）
│   ├── ranking/                    # **多维榜单**（2026-07-01，跑团子榜，pic 2772）
│   ├── cart/                       # **购物车**（V0.1.22，pic 2765）
│   ├── points/                     # **积分中心**（V0.1.22，签到 +10/天 + 任务列表，pic 2763）
│   ├── category/                   # **全部商品分类**（V0.1.22，pic 2766）
│   ├── address/                    # **地址管理**（V0.1.23，list + form + setDefault）
│   ├── coupon/                     # **优惠券**（V0.1.23，领券中心 + 我的券）
│   ├── distribution/               # **分销中心**（V0.1.24，2762 红卡 + 6 宫格 + 3 tab 列表 + 邀请码复制）
│   ├── health/                     # **今日健康**（V0.1.25，pic 2774；6 卡片：睡眠/健身年龄/训练指标/今日活动 + 5 占位；调 `device.myTodayHealth`）
│   ├── device-bind/                # **设备绑定中心**（V0.1.25，pic 2770；9 品牌宫格 + 扫描弹层 + 实时心率 + 蓝牙 BLE 直连走 utils/ble.ts；**V0.1.27 加调试面板**：操作日志 + 心率回调计数 hrCount + 折叠默认隐藏 + toggleDebug/pushLog，GAP-9 可观测性；**V0.1.33 品牌识别增强**：扫描结果 matchBleVendor 自动识别 + 品牌标签（佳明蓝 .brand-garmin / 小米橙 .brand-xiaomi / 通用灰 .brand-ble）+ onSelectDevice 流程 connect → Promise.all([readBattery, readDeviceInfo]) → 0x180A Manufacturer Name 二次验证 → 未识别 wx.showActionSheet 手选兜底（佳明/小米/通用）→ subscribeHeartRate → bindBleDevice 传 vendor+brandMeta + 心率卡显示电量/型号/厂商（hr-meta-item）+ garmin OAuth 降级段（garminAutoConnected && !garminBleBound 时显示"历史数据已连接（OAuth）"提示可 BLE 绑定）+ onTapBrand ble/garmin/xiaomi 都走 BLE 扫描）
│   ├── training/                   # **锻炼训练**（V0.1.25，pic 2775；GO + 4 套计划模板 + 赛事助手 + 跑步记录，调 `training.myPlans/mySportRecords`；**V0.1.32 wxss 中文 selector 修复**：原 `.plan-card.入门/进阶/挑战/极限` 编译报 `unexpected � at pos 1725`（wxss 不支持中文 selector）→ 分离 levelKey 英文 beginner/intermediate/challenge/extreme 作 class + level 中文显示，前端 LEVEL_KEY_MAP 映射；wxml `class="plan-card {{plan.levelKey}}"` + 显示仍用 `{{plan.level}}`）
│   ├── shoes/                      # **我的跑鞋**（V0.1.26，pic 2768；跑鞋卡 进度条+健康度色码 绿<70%/黄70-100%/红>100% + 更换提醒 + 添加弹层 品牌/型号/昵称/阈值 + 退役按钮 + FAB 悬浮添加，调 `shoes.list/add/retire/myStats`）
│   ├── annual-report/              # **年度报告**（V0.1.27，参考图 2768/2771；渐变大卡 + 月度柱状图（view 宽度模拟）+ 最长单次 + 年份切换 + 分享战报 onShareAppMessage，调 `stats.myAnnualReport`）
│   ├── goal/                       # **跑步目标**（V0.1.28，pic 2768 跑者向；目标卡 进度条+达成徽章 completed + 添加弹层 月度/年度/自定义 picker + targetDistance + title + FAB 悬浮添加 + 删除，调 `goal.list/add/remove/myProgress`）
│   ├── certificate/                # **我的证书**（V0.1.28，pic 2768 跑者向；下一里程碑卡 橙色渐变+进度条 + 里程碑证书🏆（100/500/1000/3000km）+ 赛事证书（已报名马拉松），调 `stats.myCertificates`）
│   ├── favorite/                   # **我的收藏**（V0.1.29，pic 3 向社交向；tab 内容/商品 + 列表卡（封面+标题+摘要）+ 取消收藏按钮 + 点卡跳详情（content-detail/product-detail），调 `favorite.list/add/remove/isFavorited`）
│   ├── feed/                       # **运动动态**（V0.1.30，pic 2 社交向核心；动态卡 作者头像+昵称+时间+内容+图+跑量+点赞❤️+评论💬 + 发布弹层 textarea 500 字 + 点赞**乐观更新**（失败回滚）+ 评论弹层 + FAB 悬浮发布 + 分页 onReachBottom；**V0.1.32 feed-head 加 data-uid + bindtap onTapUser**：点作者头像/昵称跳用户主页，调 `feed.list/myFeeds/publish/like/unlike/comment`）
│   ├── notification/               # **消息中心**（V0.1.31，pic 2 社交向收尾；列表卡 actor 头像+昵称+文案+内容摘要+时间+未读红点 + 全部已读 + 点击乐观标记已读+跳 feed + onReachBottom 分页 + 下拉刷新，调 `notification.list/unreadCount/markRead/markAllRead`）
│   ├── user/                       # **用户主页**（V0.1.32，pic 2 社交向深化；头像+昵称+关注数/粉丝数+关注按钮**乐观更新**（失败回滚）+ isSelf 自己不显示按钮；调 `follow.myCounts`（一次拿全 user+followingCount+followerCount+isFollowing+isSelf）/ `follow.follow` / `follow.unfollow`；从 feed 头像 onTapUser 进入，关注闭环入口）
│   └── family/                     # **家庭空间**（V0.1.34，pic 2776 家庭方向；家庭卡 name+inviteCode+成员数 + 邀请按钮复制 inviteCode + 本月跑量榜 rank-num+avatar+nickname+家长标+monthDistance + 家庭目标进度条 + 创建/加入（无家庭态）+ 添加家庭目标弹层（月度/年度 picker + title + targetDistance）+ leaveFamily 按钮（非 owner）；调 `family.createFamily/joinFamily/myFamily/leaveFamily/familyRanking/inviteInfo` + `goal.addFamilyGoal/myFamilyGoals`）
└── images/
    └── tabbar/                     # 8 个 tabBar 图标（4 普通 + 4 选中）
```

> 💡 页面数：13（V1 基础）+ 2（佳明 garmin-data/ranking，2026-07-01）+ 3（B 电商核心 cart/points/category，V0.1.22）+ 2（个人中心电商版 address/coupon，V0.1.23）+ 1（分销中心 distribution，V0.1.24）+ 1（天天跑首页 tiantian，V0.1.24）+ 已有的 order-list/garmin-data/ranking + 3（pic 新功能页 health/device-bind/training，V0.1.25）+ 1（跑鞋 shoes，V0.1.26）+ 1（年度报告 annual-report，V0.1.27）+ 2（跑步目标 goal + 我的证书 certificate，V0.1.28）+ 1（收藏 favorite，V0.1.29）+ 1（运动动态 feed，V0.1.30）+ 1（消息中心 notification，V0.1.31）+ 1（用户主页 user，V0.1.32）+ 1（家庭空间 family，V0.1.34）= **34 页（V0.1.33 不增页，仅 device-bind 内部增强）**

---

## 🚪 API 调用约定

**唯一入口**：`services/api.ts` 的 `api.call(module, action, payload)`。

```ts
// ✅ 正确
import { api } from '@/services/api';
const { user } = await api.call('user', 'login', { code });

// ❌ 错误：散落 wx.request
wx.request({ url: 'https://...' });
```

**好处**：
- 自动加 token / refresh
- 统一 loading / 错误 toast
- 端点路径走 `@qm-wx/shared/api-contracts`（含 cart/points/address/coupon/distribution/training/**shoes**/**goal**/**favorite**/**feed**/**notification**/**follow**/**family** 模块 + **stats.myAnnualReport** + **stats.myCertificates**，V0.1.34），无硬编码

---

## 🎨 设计规范

- **品牌色**：`#0FAF8E`（青沐绿），定义在 `app.wxss` 的 `--brand` 变量
- **页面级 wxss**：必须独立文件；`app.wxss` 只放变量和通用类
- **目录命名**：`kebab-case`
- **⚠️ wxss selector 禁用中文**（V0.1.32 坑）：wxss 编译器对中文 selector 解析失败，编译报 `unexpected � at pos <offset>`；分类样式必须用英文 key 作 class（如 levelKey `beginner/intermediate/challenge/extreme`），中文仅作显示文本（LEVEL_KEY_MAP 映射）；全 miniprogram wxss 已扫描确认无中文 selector 残留
- **⚠️ 小程序 TS 类型 3 坑**（V0.1.33 沉淀）：① **TextDecoder 非 DOM lib 不可用** — BLE Manufacturer Name/Model Number 字符串解码不能用 TextDecoder（小程序 tsconfig 默认不含 DOM lib），但 Manufacturer Name/Model Number 规范是 ASCII，用 `String.fromCharCode(...new Uint8Array(buffer))` 即可；② **`wx.offBLECharacteristicValueChange` 类型签名 `()` 不接受参数** — 但运行时支持 cb 参数（用于取消特定监听），用 `@ts-ignore` 绕过类型检查；③ **`OnBLECharacteristicValueChangeCallbackResult` 类型不存在** — 微信小程序 API typings 无此导出类型名，用结构类型 `{ serviceId: string; characteristicId: string; value: ArrayBuffer }` + `@ts-ignore` 兜底
- **废弃 API**：`getUserProfile` / `getUserInfo` 全部禁止使用；改 `button open-type="chooseAvatar"` + `input type="nickname"`
- **数字格式化**：金额 / 跑量 / 跑鞋里程 / 目标进度 / 动态点赞数 / 通知未读数 / 关注/粉丝数 / 家庭成员跑量等显示用 `utils/format.ts`（避免 JS 浮点精度，后端返回 Decimal 用 `.toFixed(2)`；未读数 99+ 截断）

---

## 📦 依赖

- **运行时**：`@qm-wx/shared`（workspace 协议；构建产物经 `build-mp-shared.mjs` 注入 `miniprogram_npm/`，因微信不支持 bare import；V0.1.25 含 DEVICE_BRANDS 9 品牌常量；V0.1.27 stats 加 myAnnualReport；V0.1.28 加 goal 模块 + stats.myCertificates；V0.1.29 加 favorite 模块；V0.1.30 加 feed 模块；V0.1.31 加 notification 模块；V0.1.32 加 follow 模块；V0.1.33 device-brands 加 matchBleVendor + BLE_VENDOR_PATTERNS + xiaomi available 开放；**V0.1.34 加 family 模块 + goal +addFamilyGoal/myFamilyGoals**）
- **类型**：`miniprogram-api-typings`（仅 dev）

---

## 🧪 测试

小程序代码 Vitest 单测能力有限（无 jsdom 模拟 wx）。**策略**：
- **业务逻辑**（utils / services）抽成纯函数，单测覆盖
- **页面渲染**走微信开发者工具的真机调试
- **端到端**：未来可接 miniprogram-automator / Playwright

---

## 📌 当前状态

- ✅ **34 个页面**全部就位（4 tabBar + 30 子页面）
- ✅ 4 个组件（feature-gate / error-state / privacy-popup / profile-popup）
- ✅ `app.ts` 静默登录逻辑（`silentLogin` 补全 `me` 调用）
- ✅ `services/api.ts` 统一封装（含 refresh 一次重试 + `actionUrl` 工具）
- ✅ `utils/auth.ts` / `format.ts` / `config/env.ts` + **`utils/ble.ts`（V0.1.25 蓝牙 BLE 工具；V0.1.33 加 readBattery/readDeviceInfo/readCharValue）**
- ✅ `sitemap.json` + `project.config.json`（真 AppID `wx8c37d7ac5b7d0a83`）
- ✅ 品牌色 #0FAF8E 全局应用
- ✅ **「我的」页**：跑量汇总卡 + **20 宫格入口**（优惠券/地址/购物车/积分/分销/天天跑/佳明数据/榜单 + pic 3 新入口 今日健康/设备绑定/锻炼训练 + 我的跑鞋 + 年度报告 + 跑步目标 / 我的证书 + 我的收藏 + 运动动态 + 消息中心（带未读徽标，V0.1.31）+ 家庭空间（V0.1.34））+ 佳明活动数据展示（`api.call('device', 'myActivities')`，2026-07-01）；**V0.1.32 user 页从 feed 头像点进**（mine 不加 follow 入口，关注闭环入口在 feed feed-head onTapUser）
- ✅ **B 电商 8 页**（2026-07-02~03）：cart / points / category / address / coupon / distribution / tiantian + order-list 5 tab
- ✅ **佳明 3 页**（2026-07-01）：garmin-data（数据处理）+ ranking（多维榜单）+ mine（跑量汇总）
- ✅ **pic 3 张全新功能页**（V0.1.25，2026-07-03）：
  - `health`（今日健康，pic 2774）：6 卡片（睡眠/健身年龄/训练指标/今日活动）+ 5 占位，调 `device.myTodayHealth`（Cache 300s，**15 缓存热路径之一**）
  - `device-bind`（设备绑定中心，pic 2770）：9 品牌宫格（DEVICE_BRANDS）+ 扫描弹层 + 实时心率（订阅 0x180D）+ 蓝牙 BLE 直连（`utils/ble.ts`），调 `device.myBindings/bindBleDevice/submitHeartRate`；**V0.1.27 加调试面板**（折叠默认隐藏 + 操作日志适配器/扫描/连接/订阅 + 心率回调计数 hrCount + pushLog 保留 20 条 + toggleDebug，GAP-9 真机联调可观测性）
  - `training`（锻炼训练，pic 2775）：GO 入口（切 sport tab）+ 4 套硬编码计划模板（5K/10K/半马/全马）+ 赛事助手（复用 content.list type=marathon）+ 跑步记录（聚合 Checkin run + RawActivity running），调 `training.myPlans/mySportRecords`；**V0.1.32 wxss 中文 selector 修复**（levelKey 英文 class + level 中文显示，LEVEL_KEY_MAP 映射）
- ✅ **我的跑鞋页**（V0.1.26，pic 2768）：
  - 跑鞋卡：进度条（currentKm/thresholdKm）+ **健康度色码**（绿 <70% / 黄 70-100% / 红 >100%）+ 更换提醒文案（healthRatio≥70% 显示"建议更换"）
  - 添加弹层：品牌 / 型号 / 昵称 / 阈值（thresholdKm 默认 800）
  - 退役按钮：调 `shoes.retire`（active→retired）
  - FAB 悬浮添加（右下角）
  - mine 入口「我的跑鞋」（列表项 +1，调 `shoes.list/add/retire/myStats`）
- ✅ **年度报告页**（V0.1.27，参考图 2768/2771）：
  - **渐变大卡**：年度总览（yearDistance / yearCheckins / yearDurationSec / avgPace）
  - **月度柱状图**：12 个月分布（用 view 宽度模拟，wxml 无 Math，柱高/style 在 js 算好后 setData）
  - **最长单次**（longestRun）+ **活跃天数**（activeDays）
  - **年份切换**：默认当前年，可切上一年
  - **分享战报**：`onShareAppMessage` 转发到微信群（零成本裂变）
  - mine 入口「年度报告」（列表项 +1，调 `stats.myAnnualReport`）
- ✅ **sport 打卡加跑鞋 picker**（V0.1.27，GAP-10 闭环）：
  - sport 打卡页加 `<picker>` 选跑鞋（调 `shoes.list` 取 status=active 列表）
  - 打卡 payload 加 shoeId → 后端 sport.checkin 事务内 incrementShoeKm 自动累计跑鞋里程
  - 跑鞋里程闭环（前后端联动，V0.1.26 后端已就绪，V0.1.27 前端补 UI）
- ✅ **跑步目标页**（V0.1.28，pic 2768 跑者向）：
  - 目标卡：进度条（currentDistance/targetDistance）+ **达成徽章**（completed 状态高亮）+ 百分比展示
  - 添加弹层：**type picker**（月度 monthly / 年度 yearly / 自定义 custom）+ targetDistance 输入 + title 可选
  - 后端 type 自动算周期：monthly → 本月1号-下月1号 / yearly → 今年1/1-明年1/1 / custom → 手传 periodStart/End
  - FAB 悬浮添加（右下角）+ 删除（长按或按钮）
  - mine 入口「跑步目标」（列表项 +1，调 `goal.list/add/remove/myProgress`）
- ✅ **我的证书页**（V0.1.28，pic 2768 跑者向）：
  - **下一里程碑卡**：橙色渐变背景 + 进度条（currentDistance → nextMilestone 阈值）+ 距离差值提示
  - **里程碑证书**（🏆 图标）：总跑量达 100/500/1000/3000km 自动颁发（MILESTONE_CERTS 常量，基于 Checkin aggregate）
  - **赛事证书**：已报名马拉松列表（Enrollment type=marathon + Content 详情）
  - mine 入口「我的证书」（列表项 +1，调 `stats.myCertificates`，Cache 120s）
- ✅ **我的收藏页**（V0.1.29，pic 3 向社交向首功能）：
  - **tab 切换**（内容 / 商品）：分别展示 targetType=content / product 的收藏列表
  - **列表卡**：封面图 + 标题 + 摘要（content 用 description 摘要，product 用价格 + 分类）
  - **取消收藏按钮**：调 `favorite.remove`（deleteMany，不存在也 ok，UI 立即移除）
  - **点卡跳详情**：content → content-detail，product → product-detail
  - mine 入口「我的收藏」（列表项 +1，调 `favorite.list`）
  - 详情页 / 列表页红心状态调 `favorite.isFavorited`（批量查，避免 N+1）
- ✅ **运动动态页**（V0.1.30，pic 2 社交向核心）：
  - **动态卡**：作者头像 + 昵称 + 时间（formatRelativeTime）+ 内容（content）+ 图片（images[] 多图九宫格）+ 跑量（distanceKm，关联 checkinId 时展示）+ 点赞❤️（likeCount + 当前用户 liked 红心高亮）+ 评论💬（commentCount）
  - **发布弹层**：textarea（限 500 字）+ 图片选择（wx.chooseImage）+ 可关联最近打卡（checkinId + distanceKm）
  - **点赞乐观更新**（GAP-... 可观测性范式）：先 UI 立即 +1 + 红心高亮，调 `feed.like` 失败则**回滚**（-1 + 取消高亮 + toast 错误）— 体验流畅；同理 unlike
  - **评论弹层**：底部弹起 textarea + 评论列表（feedId 调 `feed.comment` + 立即追加到列表）
  - **FAB 悬浮发布**（右下角，调起发布弹层）
  - **分页 onReachBottom**：list 分页加载（cursor/页码，调 `feed.list`）
  - mine 入口「运动动态」（列表项 +1，调 `feed.list/myFeeds`）
  - **V0.1.32 feed-head 加 onTapUser**：点作者头像/昵称跳用户主页（带 data-uid，关注闭环入口）
- ✅ **消息中心页**（V0.1.31，pic 2 社交向收尾）：
  - **列表卡**：actor 头像 + 昵称 + 文案 + 内容摘要（comment 50 字截断）+ 时间（formatRelativeTime）+ 未读红点
  - **全部已读按钮**：调 `notification.markAllRead`（updateMany 幂等，UI 立即清空所有红点）
  - **点击乐观标记已读**：先 UI 移除红点，调 `notification.markRead`（鉴权仅本人，失败回滚红点）
  - **跳 feed**：targetType=feed 时点击跳转到 feed 详情（带 feedId）
  - **分页 onReachBottom** + **下拉刷新**（调 `notification.list`）
  - **mine 入口带未读徽标**：调 `notification.unreadCount`，`.badge` 显示数字（99+ 截断），`.right` 包裹（badge + arrow 一组，避免 flex space-between 居中）
- ✅ **用户主页页**（V0.1.32，pic 2 社交向深化）：
  - **头部信息**：头像 + 昵称 + 关注数（followingCount）+ 粉丝数（followerCount）
  - **关注按钮**：调 `follow.follow`（upsert 幂等 + 不能关注自己 badRequest + 复用 notify(type=follow) 通知被关注者）；**乐观更新**（先 UI 立即 +1 + 按钮变"已关注"，调 `follow.follow` 失败则**回滚** -1 + 按钮复原 + toast 错误，体验流畅；同理 unfollow）
  - **isSelf 自己不显示按钮**：viewerId === userId 时隐藏关注按钮（自己不能关注自己）
  - **一次拿全数据**：调 `follow.myCounts`（返回 user + followingCount + followerCount + isFollowing + isSelf，避免多次请求；可查任意 userId 不限于自己，viewerId 算 isFollowing/isSelf）
  - **关注/取消关注按钮**：调 `follow.follow` / `follow.unfollow`（deleteMany 幂等）
  - **入口**：从 feed feed-head onTapUser 跳转（带 data-uid 参数，关注闭环入口）；后续可扩展从 notification actor / ranking 用户昵称等多入口跳转
- ✅ **🐛 training wxss 中文 selector 修复**（V0.1.32）：
  - **原 bug**：training 页 wxss 用 `.plan-card.入门` / `.plan-card.进阶` / `.plan-card.挑战` / `.plan-card.极限` 4 个中文 class selector 区分计划难度配色，编译报 `unexpected � at pos 1725`（wxss 编译器对中文 selector 解析失败）
  - **修复方案**：分离 `levelKey`（英文 beginner/intermediate/challenge/extreme 作 class，承载样式）+ `level`（中文"入门/进阶/挑战/极限"作显示文本）；前端 `LEVEL_KEY_MAP` 映射（入门→beginner / 进阶→intermediate / 挑战→challenge / 极限→extreme）
  - **wxml**：`class="plan-card {{plan.levelKey}}"`（英文 class 拼接）+ 显示仍用 `{{plan.level}}`（中文文本）
  - **全 miniprogram wxss 扫描**：确认无中文 selector 残留（其他页面均未踩此坑，仅 training 一处）
  - **范式沉淀**：wxss selector 禁用中文，分类样式必须用英文 key 作 class + 中文作显示文本；写在新规范段
- ✅ **device-bind 品牌识别增强**（V0.1.33，零 schema 改）：
  - **扫描结果自动识别**：扫描弹层调用 `matchBleVendor(name)`（来自 shared `device-brands.ts`，前后端单一数据源）— garmin: /garmin|forerunner|fenix|vivoactive|edge/i；xiaomi: /mi\s*band|xiaomi|小米|redmi/i；未中返 'ble'
  - **品牌标签**：佳明蓝 `.brand-garmin` / 小米橙 `.brand-xiaomi` / 通用灰 `.brand-ble`，列表项右上角彩色 chip
  - **`onSelectDevice` 多服务读取流程**：connect → `Promise.all([readBattery(deviceId), readDeviceInfo(deviceId)])` → 品牌识别（设备名 matchBleVendor + **0x180A Manufacturer Name 权威字段二次验证**）→ 未识别 `wx.showActionSheet` 手选兜底（佳明/小米/通用，防自定义设备名漏识别）→ subscribeHeartRate（订阅 0x180D）→ bindBleDevice 传 vendor+brandMeta
  - **心率卡显示电量/型号/厂商**：`hr-meta-item` 小字行（电量百分比 + Manufacturer + Model Number）
  - **garmin OAuth 降级段**：`garminAutoConnected && !garminBleBound` 时显示"历史数据已连接（OAuth）"+ 按钮提示"BLE 实时绑定"（BLE 优先，OAuth 历史）
  - **`onTapBrand`**：ble/garmin/xiaomi 三个品牌点击都走 BLE 扫描（V0.1.33 xiaomi available 开放）
- 🐛 **小程序 TS 类型 3 坑**（V0.1.33 沉淀）：
  - **TextDecoder 非 DOM lib 不可用** — 小程序 tsconfig 默认不含 DOM lib，BLE Manufacturer Name/Model Number 字符串不能用 TextDecoder 解码；但 GATT 规范这两个特征值是 ASCII，用 `String.fromCharCode(...new Uint8Array(buffer))` 即可
  - **`wx.offBLECharacteristicValueChange` 类型签名 `()` 不接受参数** — 但运行时支持 cb 参数（用于取消特定监听，与全局监听共存按 serviceId 互不干扰），用 `@ts-ignore` 绕过类型检查
  - **`OnBLECharacteristicValueChangeCallbackResult` 类型不存在** — 微信小程序 API typings 无此导出类型名，用结构类型 `{ serviceId: string; characteristicId: string; value: ArrayBuffer }` + `@ts-ignore` 兜底
- ✅ **家庭空间页**（V0.1.34，pic 2776 家庭方向）：
  - **家庭卡**：家庭名称（family.name）+ inviteCode（8 位 hex 短码，点击复制到剪贴板）+ 成员数（如"3 人"）+ owner 标
  - **邀请按钮**：调 `wx.setClipboardData` 复制 inviteCode（8 位 hex 短码），toast 提示"邀请码已复制"
  - **本月跑量榜**：调 `family.familyRanking({period: 'month'})` 返回成员跑量榜；列表卡 rank-num（前 3 名特殊色）+ avatar 头像 + nickname 昵称 + 家长标（owner role 显示"家长"徽章）+ monthDistance（本月跑量，formatKm 格式化）；按距离降序排列；可切 week/month（CN 时区）
  - **家庭目标进度条**：调 `goal.myFamilyGoals` 返回家庭目标列表（type monthly/yearly + targetDistance + 成员聚合 currentDistance + percent + completed），进度条样式同个人目标页
  - **添加家庭目标弹层**：底部弹起 type picker（月度 monthly / 年度 yearly）+ title 输入（可选）+ targetDistance 输入；调 `goal.addFamilyGoal`（鉴权 member.familyId 必须匹配 input.familyId，forbidden 防越权创建他人家庭目标）
  - **创建/加入（无家庭态）**：myFamily 返 family:null 时显示创建家庭（输入家庭名）+ 加入家庭（输入 inviteCode）双 tab；调 `family.createFamily`（事务内建 Family+FamilyMember role=owner + 8 位 inviteCode hex 短码）/ `family.joinFamily`（按 inviteCode 查 Family，已有家庭 conflict，加 FamilyMember role=member）
  - **leaveFamily 按钮（非 owner）**：role=member 显示"离开家庭"按钮，调 `family.leaveFamily`（删 FamilyMember）；owner 不可离开（后端 badRequest，需转让/解散）
  - mine 入口「家庭空间」（19→20 宫格）
- 🚧 **蓝牙 BLE 真机联调待办**（GAP-9，V0.1.27 已加调试面板提升可观测性；V0.1.33 已加品牌识别 + 多服务读取，代码侧增强完成）— `utils/ble.ts` + device-bind 调试面板 + 品牌识别 + readBattery/readDeviceInfo 就位，仍待真手环/手表实测扫描/读取/订阅链路
- 🚧 tabBar 图标待设计替换（当前占位图）
- 🚧 各页面 UI 待按 Phase 推进完善

---

🤙 别在 tabBar 上反复纠结，先把 `services/api.ts` 跑通。34 页面已成型（V0.1.33 不增页，仅 device-bind 内部增强；V0.1.34 加家庭空间 family），下一步：蓝牙真机联调（V0.1.33 品牌识别 + 多服务读取代码已就位，待实测扫描/读取/订阅链路）+ 训练计划模板可配置化 + 年度报告增加跑鞋维度（年累计/每双鞋分布）+ 目标/证书增强（自定义里程碑 / 多种证书类型 / 证书分享海报）+ 收藏社交向扩展（分享收藏单 / 合集 / 红心广场）+ **动态社交向扩展（图文/视频/带打卡/带跑鞋/话题/转发微信群）**+ **通知扩展（系统公告/红点配置化）**+ **用户主页增强（动态列表 tab / 收藏 tab / 跑量汇总卡 / 关注/粉丝列表分页跳转）** + stats.myAnnualReport/myCertificates 单测（V0.1.29 后端已补，覆盖 39→100%）+ **家庭空间增强（家庭转让/解散 + 家庭路线分享 GPS + 家庭成就）**。
