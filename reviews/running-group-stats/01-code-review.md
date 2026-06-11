# 01 代码审查报告

> 项目：青沐生命科技微信小程序（running-group-stats）
> 审查日期：2026-06-10　|　审查范围：15 个页面、13 个云函数、全局配置，共约 8800 行
> 结论：**当前代码是「可演示的原型」，不是「可上线的产品」。约 80% 的业务逻辑为模拟实现（mock），且存在多个安全级别的致命缺陷，不建议在现有代码上直接补功能，应按 02 号文档的架构做受控重构。**

---

## 1. 总体评估

| 维度 | 评分 (满分5) | 说明 |
|---|---|---|
| 可运行性 | ★★☆☆☆ | 云环境 ID 为占位符、sitemap.json 缺失、3 个被调用的云函数不存在 |
| 安全性 | ★☆☆☆☆ | openid 由前端传入可伪造；钱包余额前端计算可任意篡改 |
| 技术可行性 | ★★☆☆☆ | 核心卖点「自动统计微信群聊消息」无对应微信开放能力，前提不成立 |
| 代码质量 | ★★☆☆☆ | 大量 mock 数据硬编码、重复逻辑、3565 行单文件样式、无封装 |
| 产品完整度 | ★★★☆☆ | 页面骨架和信息架构基本齐全，UI 结构清晰，可作为原型参考 |

**模拟实现占比统计**（"假功能"清单）：

| 模块 | 真实程度 |
|---|---|
| 登录 | 假 — 未调用 `wx.login`，拿不到 openid，全靠 `'test_openid'` 兜底 |
| 群绑定/自动统计 | 假 — `bindToGroup` 用 `Math.random()` 生成假群名（group.js:120-148） |
| 群成员排名/周月年汇总 | 假 — 张三李四王五硬编码（group.js:3-50, 380-657） |
| 商城（statistics 页） | 假 — 8 个商品硬编码，下单只弹 Toast（statistics.js:148-160） |
| 会员购买 | 假 — 确认弹窗后直接写本地缓存，无支付（settings.js:152-178） |
| 钱包充值 | 假 — `setTimeout` 1 秒后本地加余额（wallet.js:96-140） |
| 马拉松报名/酒店预订/马博会购买 | 假 — 调用了**不存在**的云函数 |
| AI 机器人/智能体 | 假 — KIMI、即梦、抖音发布全部为 console.log 模拟 |
| 用户资料、运动APP绑定、打卡入库 | 半真 — 云函数有真实数据库读写，但 openid 链路是断的 |

---

## 2. P0 问题（安全/阻断，必须修复才能上线）

### P0-1 钱包余额由前端计算并整体覆盖写库 —— 可任意篡改资金
- 位置：`pages/wallet/wallet.js:96-140`（doRecharge）、`cloudfunctions/save-wallet-data/index.js`
- 现状：前端 `balance + amount` 后调用 `save-wallet-data` 把 balance、transactions 整体写入数据库；云函数不做任何校验。
- 风险：任何用户用调试工具调用云函数即可把自己余额改成任意数字。**涉及资金的字段绝不允许客户端直写。**
- 修复方向：余额只能由服务端在支付回调/消费扣减中变更（见 02 文档 §6 钱包设计）。当前支付商户号未下来，整个钱包模块应挂功能开关隐藏。

### P0-2 所有云函数信任前端传入的 openid —— 身份可伪造
- 位置：全部 13 个云函数（如 `save-checkin/index.js:11`、`get-wallet-data/index.js:11`）
- 现状：`const { openid } = event`，前端传什么就是谁。任何人可读写他人的资料、钱包、打卡记录。
- 修复方向：云函数内一律使用 `cloud.getWXContext().OPENID`，**删除 event 中的 openid 参数**。这是云开发的标准做法，一行代码的事。

### P0-3 `'test_openid'` 兜底导致全部用户数据混写
- 位置：10 个页面文件共 14 处，如 `index.js:88`、`group.js:573`、`wallet.js:48` 的 `userInfo.openId || 'test_openid'`
- 现状：`getUserProfile` 返回的 userInfo 根本没有 openId 字段，所以**所有真实用户都会落到 'test_openid'**，全员共享同一份资料/钱包/打卡数据。
- 修复方向：随 P0-2 一并消灭；openid 永远不从前端传。

### P0-4 登录链路断裂：从未调用 `wx.login`
- 位置：`pages/login/login.js`、`app.js`
- 现状：登录页只调 `getUserProfile` 拿头像昵称就跳首页；没有 code → `code2Session`/云函数换取 openid 的步骤；无登录态、无路由守卫，未登录也能用全部功能。
- 附带问题：`getUserProfile` 自 2022-10-25 起已回收，返回匿名头像昵称；`getUserInfo`（app.js:18、login.js:33）同样废弃。需改用 `button open-type="chooseAvatar"` + `input type="nickname"` 方案。

### P0-5 调用不存在的云函数（运行时必然报错）
- `save-marathon-registration`（marathon.js:118）
- `save-hotel-booking`（hotel.js:97）
- `save-purchase`（marathon-expo.js:191）
- 三个页面的"成功" Toast 都在云函数调用之外提前弹出，用户看到"报名成功"但什么都没发生。

### P0-6 「自动统计微信群聊消息」技术前提不成立
- 位置：`group.js`（startAutoStats/checkGroupMessages）、`cloudfunctions/ai-robot`、`get-group-data`、`send-summary`
- 事实：**微信不向小程序/云函数开放任何读取群聊消息的 API**，也不能主动向微信群发消息。`ai-robot` 的 `getGroupMessages()` 和 `send-summary` 的 `sendMessageToGroup()` 永远只能是 mock。
- 可行替代（见 02 文档 §5）：
  - 群身份识别：群内转发小程序卡片 → `wx.getGroupEnterInfo` 拿 `opengid`，实现"同群成员看同一份榜单"；
  - 数据来源：成员在小程序内打卡（已有 save-checkin），而非抓群消息；
  - 周报触达：订阅消息（subscribe message）推给个人 + 生成战报图片让群主转发到群。

### P0-7 基础配置占位符 / 缺失文件
- `app.js:8`：`env: 'your-cloud-env-id'` → 所有 `wx.cloud.callFunction` 失败。
- `app.js:35`：`baseUrl: 'https://your-backend-api.com'`（实际无人使用，删除）。
- `index.js:46`：百度地图 AK 为占位符 `'您的百度地图AK'`；且百度 geocoder **v2 已停服**，request 合法域名也未配置。建议改用腾讯位置服务（微信系，有官方小程序 SDK）。
- `app.json:55` 引用 `sitemap.json`，**文件不存在**，构建报错。
- 13 个云函数目录均**无 package.json**，`wx-server-sdk` 依赖未声明，无法部署。
- `app.json:54`：`"debug": true` 上线前必须关闭。

---

## 3. P1 问题（功能缺陷）

| # | 问题 | 位置 | 说明 |
|---|---|---|---|
| P1-1 | 积分由前端计算并上传，可作弊 | group.js:530、update-user-points | `Math.floor(distance)` 在前端算好传给云函数；应服务端按打卡记录计算，并加防作弊上限（如单日 ≤50km） |
| P1-2 | 打卡无任何数据校验 | group.js:516、save-checkin | 距离可为负数/9999，配速格式不校验，可重复提交刷分 |
| P1-3 | `setInterval` 自动统计无意义且泄漏 | group.js:170-176 | 小程序切后台即挂起，定时器不可靠；switch 反复开关会注册多个 interval 且从不清理 |
| P1-4 | `wx.openUrl` 不存在 | smart-agent.js:78 | 小程序无此 API，打开外链需 web-view 或复制链接 |
| P1-5 | onPullDownRefresh 永不触发 | index.js:104 | 页面未配置 `enablePullDownRefresh`（项目里根本没有任何页面级 .json 文件）；且用 `this.onLoad()` 模拟刷新是反模式 |
| P1-6 | 钱包流水存在单文档数组里 | save-wallet-data | 云数据库单文档上限 1MB，流水必须独立集合 |
| P1-7 | 退出登录逻辑无效 | settings.js:130-145 | 删除的 `userInfo` storage 从未被写入过；且 navigateTo 到 login 后用户按返回又回来了，应 reLaunch |
| P1-8 | 首页/我的页数据全部硬编码 | index.wxml:60-80、settings.wxml:18-35 | "128 次打卡 / 365 公里 / 1234 积分"为写死数字，与数据库无关；首页"平均配速 42"语义错误 |
| P1-9 | 会员等级规则双处重复且不一致风险 | group.js:155-168、settings.js:33-60 | 等级→权益映射各写一份，改一处漏一处 |
| P1-10 | 图片资源缺失 | get-group-data 等引用 /images/avatar.png | 项目无 images 目录 |

---

## 4. P2 问题（代码质量/工程规范）

1. **页面命名与功能不符**：`statistics` 实为商城、`group` 实为运动中心、`settings` 实为"我的"。tabBar 文案（首页/运动/商城/我的）与目录名对不上，新人接手必然踩坑。重构时目录改名为 `mall`、`sport`、`mine`。
2. **app.wxss 3565 行单文件**，无页面级 wxss、无设计变量（主色 #1aad19 是微信绿，与"青沐"品牌无关，需定品牌色）。
3. **无任何封装**：`wx.cloud.callFunction` 散落 20+ 处，success/fail 回调风格混杂 async/await；无统一 loading、错误提示、重试。
4. **无组件化**：排行榜项、商品卡片、功能列表项等重复结构应抽 component。
5. **无 .gitignore**：`project.private.config.json`、`.DS_Store` 已入库。
6. **statistics.wxml 528 行**：分类/品牌/详情三层视图挤在一页靠 wx:if 切换，应拆页面或组件。
7. **console.log 残留 40+ 处**；注释里大量"实际项目中这里应该…"——这些就是本报告的待办清单。
8. **smart-agent 模块定位存疑**：在 C 端小程序里放"AI 生成视频并发布抖音"的运营工具，且抖音发布无合规 API，建议移出小程序（见 03 文档 §7）。

---

## 5. 各文件问题速查表

| 文件 | P0 | P1 | P2 | 重构动作 |
|---|---|---|---|---|
| app.js | 环境ID占位、废弃API | — | baseUrl 无用 | 重写（登录态管理） |
| app.json | sitemap 缺失 | debug:true | tabBar 无图标 | 修正 |
| app.wxss | — | — | 3565行 | 拆分到页面/组件 |
| pages/login | 无 wx.login | 废弃 getUserProfile | — | 重写 |
| pages/index | 百度AK/已停服API | 假数据、下拉刷新失效 | — | 重写数据层，UI 保留 |
| pages/group | 群消息前提不成立、test_openid | 定时器泄漏、打卡无校验、积分作弊 | 657行混3个职责 | 拆为 sport + group 两页，按新群方案重写 |
| pages/statistics | — | 假商品、假下单 | 528行wxml | 改名 mall，接数据库 |
| pages/settings | 假会员购买 | 退出登录无效、假数据 | 等级规则重复 | 改名 mine，会员购买挂支付开关 |
| pages/wallet | 余额可篡改 | 流水单文档 | — | 服务端重写 + 功能开关 |
| pages/profile | test_openid | 实名认证为假 | showModal 编辑体验差 | 数据链路修复，认证接微信实名能力或暂下线 |
| pages/bind-app | test_openid | 绑定为假（无 OAuth） | — | 暂改为"敬请期待"或仅记录意向 |
| pages/marathon、hotel、food、scenic、rural-support、marathon-expo | 云函数不存在 | 全假数据 | 结构雷同 | 统一为"内容/服务"模块，数据进数据库（见 02 §7） |
| pages/smart-agent | 抖音发布不可行 | wx.openUrl 不存在 | — | 移出 C 端，独立评估 |
| cloudfunctions/* | openid 信任前端、无 package.json | — | init 风格不一 | 按 02 §8 合并重写为 6 个函数 |

---

## 6. 做得对的地方（保留）

- 选择微信云开发（免运维、免域名备案），适合当前团队规模，**继续沿用**。
- 页面信息架构完整，四个 tab 的产品骨架（首页/运动/商城/我的）方向正确。
- wxml 结构和 class 命名整洁一致，UI 层可大量复用。
- `update-user-points` 用了 `db.command.inc` 原子自增，写法正确。
- save 类云函数普遍有"查询→存在则更新否则新建"的 upsert 意识。

> 下一步请阅读：**02-architecture.md**（目标架构与数据库/API 设计）→ **04-task-breakdown.md**（按此分配开发任务）。
