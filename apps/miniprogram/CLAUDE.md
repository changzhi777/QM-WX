# apps/miniprogram — 微信小程序

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../CLAUDE.md) → **apps/miniprogram/**（这里）
> 架构依据：[docs/ARCHITECTURE-V2.md §7](../../docs/ARCHITECTURE-V2.md)
>
> ## 📋 变更记录 (Changelog)
>
> - **2026-07-13** — 🎯 **V0.1.139 AI 私教前端**：**pages/ai-coach/ 新页**（流式 wx.request enableChunked + onChunkReceived + abToAscii 逐字节解码 + 按 \n\n 分帧 + 打字机 setData）+ **components/plan-card/ 新组件**（周计划卡 + 采纳/重新生成/微调，level/type 英文 key→中文 label）+ mine 入口（feature-gate smartAgent）+ app.json +1；**50→51 页 / 9→10 组件**
> - **2026-07-13** — 🎯 **V0.1.137 跑鞋增强 2 期前端**：**pages/shoes-compare/ 新页**（2 列横向对比表 + 胜出项高亮绿，调 shoes.compareShoes）+ pages/shoes 改造（成就 card 调 stats.myCertificates 3 段鞋成就 + 「对比 2 双」按钮）+ app.json +1 路径；**49→50 页**
> - **2026-07-13** — 🎯 **V0.1.136 收藏+动态社交向扩展前端**：pages/feed 改造（chooseMedia 多图选择 9 张上限 + 跑鞋 picker 调 feed.shoesForPicker + shoe badge 显示跑鞋信息点击跳 shoes-detail）+ **pages/user 改造 3 tab**（feeds 调 feed.list / favorites 调 favorite.list / stats 调 stats.myRunnerStats）+ **components/collection-poster/ 新组件**（Canvas 2d 3x3 网格合集海报 + 保存相册）+ pages/favorite 改造（多选分享合集按钮）；**49 页 / 组件 +collection-poster**
> - **2026-07-12** — 🎯 **V0.1.135 目标/证书增强前端**：**components/certificate-poster/ 新组件**（Canvas 2d 海报 + 保存相册）+ **components/goal-share-card/ 新组件**（Canvas 2d 目标达成分享卡）+ pages/certificate 改造（5 段证书展示 + 自定义里程碑编辑表单 addCustomMilestone/removeCustomMilestone + 删除）；**49 页 / 组件 +certificate-poster +goal-share-card**
> - **2026-07-12** — 🎯 **V0.1.134 赛事服务 MVP 前端**：**pages/admin-race-result/ 新页**（admin 鉴权 + admin.listEnrollmentsByContent + 录入表单 finishTimeSec/rank/bibNumber 调 admin.submitRaceResult）+ pages/content-detail 改造（type=marathon 时 4 tab：详情/路线/排行榜/我的 + 前 50 名榜单调 content.getRaceLeaderboard + 我的成绩卡片调 content.getMyRaceResult + 自报成绩弹层调 content.submitRaceResult + 终点照）+ app.json +1 路径；**48→49 页**
> - **2026-07-12** — 🎯 **V0.1.133 跑鞋增强前端**：**pages/shoes-detail/ 新页**（基础信息 + 阈值 slider 编辑器调 shoes.updateThreshold + 累计统计 + Canvas 2d 手绘折线图调 shoes.getMileageHistory）+ **components/mileage-chart/ 新组件**（坐标轴 + 最高点高亮 + dpr 适配）+ pages/shoes 卡点跳详情 + 添加弹层加 slider + app.json +1 路径；**47→48 页 / 组件 +mileage-chart**
> - **2026-07-12** — 🎯 **V0.1.132 init 校准**（纯文档，前端无改动）
> - **2026-07-12** — 🎯 **V0.1.131 qm-admin Web 账号登录 + V0.1.130 bind-apps 前端页**：pages/bind-apps（手机号/邮箱/密码绑定+状态，三 tab 切换 + 验证码输入 + bcrypt 提交）+ UserOutputSchema +email/+username/+hasPassword；P0 修复（独立 route 从 req.body.payload 取，原 P0 是把整个 body 当 payload 解析导致 bindApps 取不到嵌套 payload）；mine「账号绑定」入口
> - **2026-07-12** — 🎯 **V0.1.129 多方式认证扩展（前端配合）**：bind-apps 页 + 验证码输入 + 状态显示；前端 api.call vs wx.request 判断标准统一
> - **2026-07-12** — 🎯 **V0.1.128 COROS 三轨前端**：BLE 设备绑定走通用 device-bind 页 + FIT 文件 chooseMessageFile 选择 → 上传 import + Terra 聚合数据展示（待 Terra API key）
> - **2026-07-12** — 🎯 **V0.1.127 health 页 + health-history 页体成分卡集成**：pages/health 加体成分紫色卡（体重 + BMI + 6 项体成分 + 引导卡 import 流程 + Promise.allSettled 并行拉取）+ pages/health-history 时间戳预格式化 + 体脂秤数据展示（scale GATT 解析）
> - **2026-07-11** — 🎯 **V0.1.119 wxpay 赛事真集成前端**：赛事报名走 wx.requestPayment（signType union MD5/HNA256 坑）+ 报名成功页 + 余额支付降级路径
> - **2026-07-11** — 🎯 **V0.1.117 赛事余额支付 + 用户 tab**：mine 加 my-enrollments 入口 + content-list 赛事报名支持余额/wxpay 双支付
> - **2026-07-10** — **V0.1.113 评价系统前端**：pages/review-publish（选星 1-5 + content 500 字 + 图片最多 9 张 chooseMedia→uploadFile 上传 + 提交调 review.create）+ product-detail 加评价段（loadReviews 调 review.stats 汇总 avg/count + review.list 前 3 条预览 + 暂无评价兜底）+ order-list done/paid/shipped 商品加「去评价」入口（navigateTo review-publish?productId&orderId&productName）+ app.json 注册；**42→43 页**；typecheck 通过；mine「我的评价」入口 + 我的评价页待后续
> - **2026-07-10** — 🎯 **V0.1.100 GitHub 主线起点** + 🎯 **V0.1.43 微信运动 + 小米 OAuth + 健康持久化 + onboarding 4 步式激活向导**：`utils/werun.ts` 新增（syncWeRunToday wx.getWeRunData→AES-128-CBC 解密→upsert + getWeRunHistory + syncWeRunIfFirstToday 每日节流 + cnMonthRange）；`utils/ble.ts` 加固（retry3 + hasHr 策略 + 去 services 过滤 + getDeviceServices 诊断）；**4 新页面**（werun 月度柱状图+汇总+手动同步+月份切换 / onboarding 4 步式 welcome→profile→avatar→sync / health-history 心率/血氧历史曲线 / data-import-guide 小米数据包导入指南）；mine 加「重新激活授权」入口替退出登录（**wx.login 总登回原账号，真退出无意义**，改语义为重新走向导填资料/授权）；`app.ts` 加 envVersion 分支（develop→本地 / trial,release→生产）；首页 onShow 加微信运动每日节流；onboarding step3 一键同步微信运动；**页面 38→42 / 表 45→51 / 单元 577→580 / 迁移 19→27**
> - **2026-07-08** — **V0.1.42 跑群深化** group-detail 改造（群卡+公告+汇总+成员列表）+ **V0.1.41 训练计划配置化** training 进度卡+加入计划 + **V0.1.40 profile 完整** 7 问题修
> - **2026-07-07** — **V0.1.39 family 后续**（转让家长+解散+家庭成就；family 页 owner 操作区 + 家庭成就卡；不增表/页）
> - **2026-07-07** — **V0.1.38 团购深化** group-buy-detail 加"团购下单"按钮
> - **2026-07-07** — **V0.1.37 团购 MVP** 2 新页 group-buy + group-buy-detail + mall 加团购入口
> - **2026-07-07** — **V0.1.36 2771 社交深化** 2 新页 hot（红心广场）+ topic（话题页）
> - **2026-07-06** — **V0.1.35 mine 重构 + index 首页优化** entry-grid 组件（4 列 emoji 网格）
> - **2026-07-04** — **V0.1.34 家庭空间 family** + V0.1.33 device-bind 品牌识别增强
> - **2026-07-03** — **V0.1.32 用户主页 user** + 🐛 training wxss 中文 selector 修复
> - **2026-07-03** — **V0.1.31 消息中心 notification** + V0.1.30 运动动态 feed
> - **2026-07-03** — **V0.1.29 收藏 favorite** + V0.1.28 跑步目标/我的证书 + V0.1.27 sport 跑鞋 picker+年度报告+蓝牙调试面板
> - **2026-07-03** — **V0.1.26 跑鞋 shoes** + V0.1.25 pic 3 页（今日健康+设备绑定+锻炼训练）+ B 电商三连击 + 佳明 3 页

> 最近更新：2026-07-10（**V0.1.100 GitHub 主线起点** + **V0.1.43** 微信运动+小米 OAuth+健康持久化+onboarding 4 步式：utils/werun.ts 新增 + utils/ble.ts retry3+hasHr+去 services 过滤 + 4 新页 werun/onboarding/health-history/data-import-guide + mine「重新激活授权」入口替退出登录 + app.ts envVersion 分支）— **51 表 / 30 module / 42 页 / 580 单元** — V0.1.42 跑群深化 group-detail 改造群卡+公告+成员列表 + V0.1.41 训练计划配置化 training 进度卡+加入计划 + V0.1.40 profile 完整 7 问题修 — V0.1.39 family 后续（转让家长+解散+家庭成就）— V0.1.38 团购深化（成团下单）— V0.1.37 团购 MVP — V0.1.36 2771 社交深化 — V0.1.35 mine 重构 — V0.1.34 家庭空间 family — V0.1.33 BLE 设备品牌识别 — V0.1.32 用户主页 user + training wxss 修复 — V0.1.31 消息中心 notification — V0.1.30 运动动态 feed — V0.1.29 收藏 favorite — V0.1.28 跑步目标/我的证书 — V0.1.27 sport 跑鞋 picker + 年度报告 + 蓝牙调试面板 — V0.1.26 跑鞋 shoes — V0.1.25 pic 3 页（今日健康+设备绑定+锻炼训练）— B 电商三连击 + 佳明 3 页 + 个人中心电商版，pic 2768

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
> V0.1.100 起 `app.ts` 加 envVersion 分支：develop→本地 / trial,release→生产（修原硬编码 prod 导致预览扫码连生产旧后端，新功能 unknown action 全失败 bug）。

---

## 📂 目录结构

```
miniprogram/
├── app.ts                          # 应用入口（静默登录 + 全局 $apiBase/$token + V0.1.100 envVersion 分支）
├── app.json                        # 页面路由 + tabBar + 全局窗口配置（42 页面注册）
├── app.wxss                        # 全局样式（--brand: #0FAF8E，限 300 行内）
├── sitemap.json                    # 搜索接入配置
├── config/
│   └── env.ts                      # baseUrl / 品牌常量
├── utils/
│   ├── auth.ts                     # ensureLogin / logout
│   ├── format.ts                   # 配速/距离/日期格式化
│   ├── ble.ts                      # **蓝牙 BLE 工具**（V0.1.25：扫描/连接/订阅心率服务 0x180D + 心率值解析；V0.1.33：readBattery/readDeviceInfo/readCharValue；**V0.1.43 加固**：retry3 + hasHr 策略 + 去 services 过滤 + getDeviceServices 诊断）
│   └── werun.ts                    # **微信运动工具**（V0.1.43 新增：syncWeRunToday wx.getWeRunData→AES-128-CBC→upsert + getWeRunHistory + syncWeRunIfFirstToday 每日节流 + cnMonthRange）
├── services/
│   └── api.ts                      # **唯一**调后端的地方（含 refresh 一次重试 + actionUrl）
├── components/
│   ├── feature-gate/               # 功能开关守卫组件（读取远程 feature_flags）
│   ├── error-state/                # 通用错误态组件（方案 B 引入）
│   ├── privacy-popup/              # 隐私协议弹窗
│   └── profile-popup/              # 用户资料弹窗
├── pages/
│   ├── index/                      # 首页（tabBar；V0.1.43 onShow 加微信运动每日节流 syncWeRunIfFirstToday）
│   ├── sport/                      # 运动打卡（tabBar；V0.1.27 加跑鞋 picker：调 shoes.list 取 active，打卡传 shoeId → 跑鞋里程闭环）
│   ├── mall/                       # 商城（tabBar）
│   ├── mine/                       # 我的（tabBar；**20 宫格入口** + V0.1.43「重新激活授权」入口替退出登录：调 user.resetOnboarding + onboardingDone=false 重新走向导）
│   ├── tiantian/                   # **天天跑首页**（V0.1.24；搜索 + 3 入口 + 促销横幅 + 功能宫格 + 新人专享商品流，pic 2767）
│   ├── profile/                    # 个人资料（V0.1.40 完整实现：gender/birthday/region/height/weight + 头像持久化）
│   ├── group-detail/               # 跑群详情（V0.1.42 改造：群卡+公告+汇总+成员列表 role+joinedAt+monthDistance）
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
│   ├── device-bind/                # **设备绑定中心**（V0.1.25，pic 2770；9 品牌宫格 + 扫描弹层 + 实时心率 + 蓝牙 BLE 直连走 utils/ble.ts；V0.1.27 加调试面板；V0.1.33 品牌识别增强；V0.1.43 蓝牙加固 retry3+hasHr+去 services 过滤）
│   ├── training/                   # **锻炼训练**（V0.1.25，pic 2775；GO + 4 套计划模板 + 赛事助手 + 跑步记录，调 `training.myPlans/mySportRecords`；V0.1.32 wxss 中文 selector 修复）
│   ├── shoes/                      # **我的跑鞋**（V0.1.26，pic 2768；跑鞋卡 进度条+健康度色码 绿<70%/黄70-100%/红>100% + 更换提醒 + 添加弹层 品牌/型号/昵称/阈值 + 退役按钮 + FAB 悬浮添加，调 `shoes.list/add/retire/myStats`）
│   ├── annual-report/              # **年度报告**（V0.1.27，参考图 2768/2771；渐变大卡 + 月度柱状图（view 宽度模拟）+ 最长单次 + 年份切换 + 分享战报 onShareAppMessage，调 `stats.myAnnualReport`）
│   ├── goal/                       # **跑步目标**（V0.1.28，pic 2768 跑者向；目标卡 进度条+达成徽章 completed + 添加弹层 月度/年度/自定义 picker + targetDistance + title + FAB 悬浮添加 + 删除，调 `goal.list/add/remove/myProgress`）
│   ├── certificate/                # **我的证书**（V0.1.28，pic 2768 跑者向；下一里程碑卡 橙色渐变+进度条 + 里程碑证书🏆（100/500/1000/3000km）+ 赛事证书（已报名马拉松），调 `stats.myCertificates`）
│   ├── favorite/                   # **我的收藏**（V0.1.29，pic 3 向社交向；tab 内容/商品 + 列表卡（封面+标题+摘要）+ 取消收藏按钮 + 点卡跳详情（content-detail/product-detail），调 `favorite.list/add/remove/isFavorited`）
│   ├── feed/                       # **运动动态**（V0.1.30，pic 2 社交向核心；动态卡 作者头像+昵称+时间+内容+图+跑量+点赞❤️+评论💬 + 发布弹层 textarea 500 字 + 点赞**乐观更新**（失败回滚）+ 评论弹层 + FAB 悬浮发布 + 分页 onReachBottom；V0.1.32 feed-head 加 data-uid + bindtap onTapUser）
│   ├── notification/               # **消息中心**（V0.1.31，pic 2 社交向收尾；列表卡 actor 头像+昵称+文案+内容摘要+时间+未读红点 + 全部已读 + 点击乐观标记已读+跳 feed + onReachBottom 分页 + 下拉刷新，调 `notification.list/unreadCount/markRead/markAllRead`）
│   ├── user/                       # **用户主页**（V0.1.32，pic 2 社交向深化；头像+昵称+关注数/粉丝数+关注按钮**乐观更新**（失败回滚）+ isSelf 自己不显示按钮；调 `follow.myCounts`（一次拿全 user+followingCount+followerCount+isFollowing+isSelf）/ `follow.follow` / `follow.unfollow`；从 feed 头像 onTapUser 进入，关注闭环入口）
│   ├── family/                     # **家庭空间**（V0.1.34，pic 2776 家庭方向；家庭卡 name+inviteCode+成员数 + 邀请按钮复制 inviteCode + 本月跑量榜 rank-num+avatar+nickname+家长标+monthDistance + 家庭目标进度条 + 创建/加入（无家庭态）+ 添加家庭目标弹层（月度/年度 picker + title + targetDistance）+ leaveFamily 按钮（非 owner）；调 `family.createFamily/joinFamily/myFamily/leaveFamily/familyRanking/inviteInfo` + `goal.addFamilyGoal/myFamilyGoals`）
│   ├── werun/                      # **微信运动**（V0.1.43 新增；月度柱状图 + 月度汇总 + 手动同步按钮 + 月份切换器 + 首页 onShow 节流 + onboarding step3 一键同步；调 `device.syncWeRun/myWeRun`，session_key 过期自动重登重试）
│   ├── onboarding/                 # **新用户激活向导**（V0.1.43 新增；4 步式：welcome → profile 填资料（gender/birthday/region/height/weight，profile 嵌套字段修复）→ avatar 选微信头像（api.uploadFile 持久化修复原存微信临时 CDN 链接过期 bug）→ sync 一键同步微信运动；完成写 onboardingDone=true；调 `user.updateProfile` + `user.uploadAvatar` + `device.syncWeRun`）
│   ├── health-history/             # **健康历史**（V0.1.43 新增；心率/血氧历史曲线（type=hr/spo2 + dateRange）；调 `device.myHealthHistory`）
│   └── data-import-guide/          # **小米数据包导入指南**（V0.1.43 新增；指导用户从小米运动导出 zip → 后端 upload → device.importXiaomiZip 解析睡眠 JSON → SleepRecord upsert）
└── images/
    └── tabbar/                     # 8 个 tabBar 图标（4 普通 + 4 选中）
```

> 💡 页面数：13（V1 基础）+ 2（佳明 garmin-data/ranking，2026-07-01）+ 3（B 电商核心 cart/points/category，V0.1.22）+ 2（个人中心电商版 address/coupon，V0.1.23）+ 1（分销中心 distribution，V0.1.24）+ 1（天天跑首页 tiantian，V0.1.24）+ 3（pic 新功能页 health/device-bind/training，V0.1.25）+ 1（跑鞋 shoes，V0.1.26）+ 1（年度报告 annual-report，V0.1.27）+ 2（跑步目标 goal + 我的证书 certificate，V0.1.28）+ 1（收藏 favorite，V0.1.29）+ 1（运动动态 feed，V0.1.30）+ 1（消息中心 notification，V0.1.31）+ 1（用户主页 user，V0.1.32）+ 1（家庭空间 family，V0.1.34）+ 1（团购 group-buy + 1 group-buy-detail，V0.1.37）+ 1（红心广场 hot + 1 话题 topic，V0.1.36）+ **4（V0.1.43：werun + onboarding + health-history + data-import-guide）** + **3（V0.1.133/134/137：shoes-detail + admin-race-result + shoes-compare）** = **50 页（V0.1.33 不增页仅 device-bind 内部增强；V0.1.100/132 不增页）**

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
- 端点路径走 `@qm-wx/shared/api-contracts`（含 cart/points/address/coupon/distribution/training/shoes/goal/favorite/feed/notification/follow/family 模块 + stats.myAnnualReport + stats.myCertificates + **V0.1.43 device +3 action syncWeRun/myWeRun/myHealthHistory**），无硬编码

---

## 🎨 设计规范

- **品牌色**：`#0FAF8E`（青沐绿），定义在 `app.wxss` 的 `--brand` 变量
- **页面级 wxss**：必须独立文件；`app.wxss` 只放变量和通用类
- **目录命名**：`kebab-case`
- **⚠️ wxss selector 禁用中文**（V0.1.32 坑）：wxss 编译器对中文 selector 解析失败，编译报 `unexpected � at pos <offset>`；分类样式必须用英文 key 作 class（如 levelKey `beginner/intermediate/challenge/extreme`），中文仅作显示文本（LEVEL_KEY_MAP 映射）；全 miniprogram wxss 已扫描确认无中文 selector 残留
- **⚠️ 小程序 TS 类型 3 坑**（V0.1.33 沉淀）：① **TextDecoder 非 DOM lib 不可用** — BLE Manufacturer Name/Model Number 字符串解码不能用 TextDecoder（小程序 tsconfig 默认不含 DOM lib），但 Manufacturer Name/Model Number 规范是 ASCII，用 `String.fromCharCode(...new Uint8Array(buffer))` 即可；② **`wx.offBLECharacteristicValueChange` 类型签名 `()` 不接受参数** — 但运行时支持 cb 参数（用于取消特定监听），用 `@ts-ignore` 绕过类型检查；③ **`OnBLECharacteristicValueChangeCallbackResult` 类型不存在** — 微信小程序 API typings 无此导出类型名，用结构类型 `{ serviceId: string; characteristicId: string; value: ArrayBuffer }` + `@ts-ignore` 兜底
- **⚠️ 蓝牙扫描去 services 过滤**（V0.1.43 坑）：小米手环用私有 0xFEE0 不广播 0x180D，按 services 过滤扫不到 → 修复去过滤 + matchBleVendor 筛 + 心率订阅容错 + getDeviceServices 诊断；不同品牌广播不同服务范式
- **废弃 API**：`getUserProfile` / `getUserInfo` 全部禁止使用；改 `button open-type="chooseAvatar"` + `input type="nickname"`
- **数字格式化**：金额 / 跑量 / 跑鞋里程 / 目标进度 / 动态点赞数 / 通知未读数 / 关注/粉丝数 / 家庭成员跑量 / 微信运动步数等显示用 `utils/format.ts`（避免 JS 浮点精度，后端返回 Decimal 用 `.toFixed(2)`；未读数 99+ 截断）

---

## 📦 依赖

- **运行时**：`@qm-wx/shared`（workspace 协议；构建产物经 `build-mp-shared.mjs` 注入 `miniprogram_npm/`，因微信不支持 bare import；V0.1.25 含 DEVICE_BRANDS 9 品牌常量；V0.1.27 stats 加 myAnnualReport；V0.1.28 加 goal 模块 + stats.myCertificates；V0.1.29 加 favorite 模块；V0.1.30 加 feed 模块；V0.1.31 加 notification 模块；V0.1.32 加 follow 模块；V0.1.33 device-brands 加 matchBleVendor + BLE_VENDOR_PATTERNS + xiaomi available 开放；V0.1.34 加 family 模块 + goal +addFamilyGoal/myFamilyGoals；**V0.1.43 device +3 action syncWeRun/myWeRun/myHealthHistory**）
- **类型**：`miniprogram-api-typings`（仅 dev）

---

## 🧪 测试

小程序代码 Vitest 单测能力有限（无 jsdom 模拟 wx）。**策略**：
- **业务逻辑**（utils / services）抽成纯函数，单测覆盖
- **页面渲染**走微信开发者工具的真机调试
- **端到端**：未来可接 miniprogram-automator / Playwright

---

## 📌 当前状态

- ✅ **50 个页面**全部就位（4 tabBar + 46 子页面；V0.1.133/134/137 +3 新页）
- ✅ 9 个组件（feature-gate / error-state / privacy-popup / profile-popup + **entry-grid（V0.1.35）/ mileage-chart（V0.1.133）/ certificate-poster + goal-share-card（V0.1.135）/ collection-poster（V0.1.136）**）
- ✅ `app.ts` 静默登录逻辑（`silentLogin` 补全 `me` 调用）+ **V0.1.100 envVersion 分支**
- ✅ `services/api.ts` 统一封装（含 refresh 一次重试 + `actionUrl` 工具）
- ✅ `utils/auth.ts` / `format.ts` / `config/env.ts` + **`utils/ble.ts`**（V0.1.25 蓝牙 BLE 工具；V0.1.33 加 readBattery/readDeviceInfo/readCharValue；**V0.1.43 retry3+hasHr+去 services 过滤+getDeviceServices 诊断**）+ **`utils/werun.ts`**（V0.1.43 微信运动 session_key AES-128-CBC 解密 + 每日节流）
- ✅ `sitemap.json` + `project.config.json`（真 AppID `wx8c37d7ac5b7d0a83`）
- ✅ 品牌色 #0FAF8E 全局应用
- ✅ **「我的」页**：跑量汇总卡 + **20 宫格入口** + **V0.1.43「重新激活授权」入口替退出登录**（调 user.resetOnboarding + onboardingDone=false 重新走向导填资料/授权）
- ✅ **V0.1.43 微信运动闭环**：utils/werun.ts（syncWeRunToday AES 解密 + getWeRunHistory + syncWeRunIfFirstToday 节流）+ pages/werun（月度柱状图 + 汇总 + 手动同步 + 月份切换）+ 首页 onShow 节流 + onboarding step3 一键同步
- ✅ **V0.1.43 onboarding 4 步式**：pages/onboarding（welcome → profile 嵌套字段修复 + 头像持久化 api.uploadFile 修复 + sync 一键同步）+ 重新激活授权入口
- ✅ **V0.1.43 健康历史**：pages/health-history（心率/血氧历史曲线 type+dateRange）
- ✅ **V0.1.43 小米数据包导入指南**：pages/data-import-guide（导出 zip → upload → importXiaomiZip → SleepRecord）
- ✅ **B 电商 8 页**（2026-07-02~03）：cart / points / category / address / coupon / distribution / tiantian + order-list 5 tab
- ✅ **佳明 3 页**（2026-07-01）：garmin-data（数据处理）+ ranking（多维榜单）+ mine（跑量汇总）
- ✅ **pic 3 张全新功能页**（V0.1.25，2026-07-03）：
  - `health`（今日健康，pic 2774）：6 卡片（睡眠/健身年龄/训练指标/今日活动）+ 5 占位，调 `device.myTodayHealth`（Cache 300s，**15 缓存热路径之一**）
  - `device-bind`（设备绑定中心，pic 2770）：9 品牌宫格（DEVICE_BRANDS）+ 扫描弹层 + 实时心率（订阅 0x180D）+ 蓝牙 BLE 直连（`utils/ble.ts`），调 `device.myBindings/bindBleDevice/submitHeartRate`；V0.1.27 加调试面板；V0.1.33 品牌识别增强；V0.1.43 蓝牙加固 retry3+hasHr+去 services 过滤
  - `training`（锻炼训练，pic 2775）：GO 入口（切 sport tab）+ 4 套硬编码计划模板（5K/10K/半马/全马）+ 赛事助手（复用 content.list type=marathon）+ 跑步记录（聚合 Checkin run + RawActivity running），调 `training.myPlans/mySportRecords`；V0.1.32 wxss 中文 selector 修复
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
- 🐛 **蓝牙扫描去 services 过滤**（V0.1.43 沉淀）：
  - **小米手环用私有 0xFEE0，不广播 0x180D**，按 services: [0x180D] 过滤扫不到
  - **修复方案**：去 services 过滤 + 拿到设备名后 matchBleVendor 筛 + 心率订阅容错（小米私有协议不会发 notify）+ getDeviceServices 诊断（扫到设备后遍历服务打印 serviceId 列表）
  - **范式沉淀**：不同品牌 BLE 广播的服务集合差异巨大，**不要在 startBluetoothDevicesDiscovery 里硬编码 services 过滤**；先扫到再说，靠 deviceName + 0x180A Manufacturer 二次识别品牌
- ✅ **家庭空间页**（V0.1.34，pic 2776 家庭方向）：
  - **家庭卡**：家庭名称（family.name）+ inviteCode（8 位 hex 短码，点击复制到剪贴板）+ 成员数（如"3 人"）+ owner 标
  - **邀请按钮**：调 `wx.setClipboardData` 复制 inviteCode（8 位 hex 短码），toast 提示"邀请码已复制"
  - **本月跑量榜**：调 `family.familyRanking({period: 'month'})` 返回成员跑量榜；列表卡 rank-num（前 3 名特殊色）+ avatar 头像 + nickname 昵称 + 家长标（owner role 显示"家长"徽章）+ monthDistance（本月跑量，formatKm 格式化）；按距离降序排列；可切 week/month（CN 时区）
  - **家庭目标进度条**：调 `goal.myFamilyGoals` 返回家庭目标列表（type monthly/yearly + targetDistance + 成员聚合 currentDistance + percent + completed），进度条样式同个人目标页
  - **添加家庭目标弹层**：底部弹起 type picker（月度 monthly / 年度 yearly）+ title 输入（可选）+ targetDistance 输入；调 `goal.addFamilyGoal`（鉴权 member.familyId 必须匹配 input.familyId，forbidden 防越权创建他人家庭目标）
  - **创建/加入（无家庭态）**：myFamily 返 family:null 时显示创建家庭（输入家庭名）+ 加入家庭（输入 inviteCode）双 tab；调 `family.createFamily`（事务内建 Family+FamilyMember role=owner + 8 位 inviteCode hex 短码）/ `family.joinFamily`（按 inviteCode 查 Family，已有家庭 conflict，加 FamilyMember role=member）
  - **leaveFamily 按钮（非 owner）**：role=member 显示"离开家庭"按钮，调 `family.leaveFamily`（删 FamilyMember）；owner 不可离开（后端 badRequest，需转让/解散）
  - mine 入口「家庭空间」（19→20 宫格）
- ✅ **微信运动页**（V0.1.43 新增）：
  - **月度柱状图**：当月每日步数柱状图（view 宽度模拟 + 当日步数标签）
  - **月度汇总**：总步数 + 日均步数 + 达标天数（≥8000 步）
  - **手动同步按钮**：调 `device.syncWeRun`（wx.getWeRunData → 后端 AES-128-CBC 解密 → WeRunRecord upsert）
  - **月份切换器**：上/下月切换（cnMonthRange）
  - **session_key 过期自动重登重试**：后端解密失败（errcode=40001 / invalid session）→ 自动 wx.login → code2Session → 重试解密
  - 首页 onShow 加 `syncWeRunIfFirstToday` 节流（每日首次进入自动同步，避免重复）
  - onboarding step3 一键同步（激活流程收尾）
- ✅ **新用户激活向导**（V0.1.43 新增）：
  - **4 步式**：welcome（欢迎语 + 隐私协议）→ profile（填资料：gender/birthday/region/height/weight，**profile 嵌套字段修复**：原顶层传 → Zod strip 全丢，包进 `profile:{}` 修复）→ avatar（选微信头像，**api.uploadFile 持久化修复**：原存微信临时 CDN 链接会过期，改为调 user.uploadAvatar 持久化到 OSS）→ sync（一键同步微信运动）
  - **完成写 onboardingDone=true**：`user.resetOnboarding` action 设 onboardingDone=false（重新激活用）
  - **首次登录检测**：`app.ts onLaunch` 检查 `user.me.onboardingDone`，false → 跳 onboarding 页
- ✅ **健康历史页**（V0.1.43 新增）：
  - **心率/血氧历史曲线**：type=hr/spo2 + dateRange 查询，调 `device.myHealthHistory`
  - **图表渲染**：简单 line chart（view 高度模拟，可后续接 echarts-for-weixin）
- ✅ **小米数据包导入指南**（V0.1.43 新增）：
  - **步骤指引**：从小米运动 → 我的 → 设置 → 数据导出 → 选择日期范围 → 等待生成 zip → 通过聊天发送给自己 → 长按保存到手机 → 在小程序上传
  - **上传按钮**：调 `upload.uploadFile` → `device.importXiaomiZip` 后端解析睡眠 JSON → `SleepRecord` upsert
- 🚧 **蓝牙 BLE 心率订阅加固**（V0.1.43 沉淀 GAP-9 关闭）：
  - **retry3 + hasHr 策略**：订阅失败重试 3 次；hasHr = 心率值是否有效（非 0 / 255 保留值）；hasHr=false 时延迟重连或提示用户
  - **去 services 过滤**：startBluetoothDevicesDiscovery 不要带 services 参数（不同品牌广播不同服务）
  - **getDeviceServices 诊断**：扫到设备后遍历 serviceId 列表打印（调试面板可见）
  - **小米 10Pro 实测走通**：开心率广播走标准 0x180D，订阅成功 → 心率值解析 → 落库 HeartRateRecord + Redis 缓存 ble:hr:{userId}
- 🚧 **生产部署待办**：V0.1.43/V0.1.100 已 commit 但生产（qingmulife.cn）尚未 scp 重启部署；待生产 OOM 救活（VNC docker stop 旧容器）后 scp 直传 + 重启
- 🚧 tabBar 图标待设计替换（当前占位图）
- 🚧 各页面 UI 待按 Phase 推进完善

---

🤙 别在 tabBar 上反复纠结，先把 `services/api.ts` 跑通。**42 页面已成型**（V0.1.100 GitHub 主线 + V0.1.43 微信运动+onboarding+健康历史+小米数据包导入指南 + V0.1.42 跑群深化 + V0.1.41 训练计划配置化 + V0.1.40 profile 完整 + V0.1.37 团购 2 页 + V0.1.36 红心广场/话题 + V0.1.34 家庭空间），下一步：V0.1.43/V0.1.100 真机验证（微信运动+onboarding+重新激活授权）+ 生产部署 + 赛事服务 MVP（业务闭环第 3 块）+ 评价系统 + 年度报告跑鞋维度 + 目标/证书增强 + 收藏/动态社交向扩展 + 用户主页增强。