# apps/miniprogram — 微信小程序

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../CLAUDE.md) → **apps/miniprogram/**（这里）
> 架构依据：[docs/ARCHITECTURE-V2.md §7](../../docs/ARCHITECTURE-V2.md)
>
> ## 📋 变更记录 (Changelog)
>
> - **2026-07-17** — 🎯 **`/zcf:init-project` 增量校准 #17（V0.2.27 收官）**：本会话 init-architect + **主智能体交叉实测**（**22 页 / 16 组件 ✅** 与 init #16 一致，0 改动）；**WechatSI 插件状态确认**：app.json 已删 plugins + scope.record（V0.2.25 临时移除，待常智公众平台「插件管理」添加同声传译 wx069ba97219f66d99 后加回，**新 GAP-18 open 跟踪**）；pages/ai-coach `onTapVoice` requirePlugin try/catch 永久防御保留（V0.2.25）；本次 init #17 **0 代码改动**纯文档增量；下一步：WechatSI 授权加回 → K5 voice 真机验证（点 🎤 说话应识别并 send）+ V0.2.26 insight 真机视觉
> - **2026-07-17** — 🎯 **V0.2.26 insight 页展示 AQI×心率 + 体感区间配速（步骤 5 前端）**：`feat(v0.2.26)` commit `817f8f9`；**pages/insight**：① **index.ts** WeatherAnalysisResult 类型扩容（+aqiHr/feelsLikeZones/optimalZone）+ `api.call<Analysis>('stats', 'weatherAnalysis')` + feelsLikeZones `avgPaceSec` → mm:ss 展示转换；② **index.wxml** 加 AQI×心率散点 + 体感区间配速柱状（4 桶）+ optimalZone 高亮；③ **index.wxss** +48 行柱状/散点样式；**0 新页 / 0 新组件 / 后端 V0.2.26 stats 同步**；真机验证待做（`pnpm wx:auto-preview` → insight 页）
> - **2026-07-17** — 🎯 **`/zcf:init-project` 增量校准 #16（V0.2.21 收官）**：本会话 init-architect 全量实测（**22 页 / 16 组件 ✅**，V0.2.12~V0.2.21 前端关键事件汇总）；**V0.2.19 K5 voice 插件真接入**（替 V0.1.140 占位）：① **app.json plugins** 段新增 `WechatSI`（version 0.3.5 / provider wx069ba97219f66d99 / 微信同声传译语音转文字）+ **permissions** 加 `scope.record`；② **pages/ai-coach/index.ts** `onTapVoice()`（line 411）完整实现：`wx.getRecorderManager` 启动 mp3 录音（上限 30s）→ `requirePlugin('WechatSI').translateVoice({lfrom:'zh_CN', lto:'zh_CN', content: tempFilePath})` → 识别 result 塞入 inputText → 触发 onSend；录音态再次点 = 停止触发识别；③ **pages/ai-coach/index.wxml** line 108 `<view class="voice-btn" bindtap="onTapVoice">` + wxss `.voice-btn` 样式；**K5 closed ✅**；**V0.2.10~V0.2.18 前端零改**（V0.2.9 4 组件已记 / V0.2.10 CLI 在 scripts/dev-cli / V0.2.11~2.18 均后端测试+文档+CI 不动前端）；本次 init #16 **0 代码改动**纯文档增量；下一步：K5 voice 真机验证（`pnpm wx:auto-preview` → 点 🎤 说话 → 应识别并 send）+ V0.2.9 4 组件 + diet/insight/membership/report-detail 真机视觉验证
> - **2026-07-16** — 🎯 **V0.2.13 K1 funcs 升回 86%**（wxpay +5 tests）+ **V0.2.14 K2 视觉验证**（diet/insight/membership + report-detail init #12 base line 截图覆盖）+ **V0.2.15 K3-K5 物料清单**：V0.2.13 wxpay.service.test.ts +isPaySuccess/toOutTradeNo/downloadBill 测试；V0.2.14 docs/V0.2.13-vision-verify.md 报告 4 页 visual verified；V0.2.15 docs/V0.2.15-pending-materials.md 列出待主人物料（huawei_export ZIP / wxpay 4 件套 / voice 插件 ID）
- **2026-07-16** — 🎯 **V0.2.12 GAP-14 closed**：22 admin.routes.test.ts RBAC 适配（buildApp 默认 super-admin + mock prisma.admin）+ funcs **85.54% 首次实测** + threshold funcs 86→84；V0.2.13 K1 升回 86.07%；`pages/report-detail/CLAUDE.md` 新建（V0.2.4 加 init #14 GAP-13 漏的页面级 CLAUDE.md，B3 补齐）
- **2026-07-16** — 🎯 **V0.2.9 prototype 借鉴 — 4 新组件 + 4 页集成（健康中心 UI 再深化）**：`/zcf:workflow` 方案 β（一次到位 4 元素叠加，纯前端 0 后端改动）；**4 新组件**（12→**16**）：① `components/uv-alert/` — 今日页 UV 强提示黄条（V0.2.9 第 13 个组件；observers 内 UV 指数分级 5 档 low/mid/high/extreme×2：`☀️🌤️🌞🌡️🔥`；props `{uv, show}` 关掉 hour/weather 冗余；后端蹭 `stats.weatherAir` 接口 V0.1.148；② `components/level-card/` — 我的页紫色等级卡（第 14 个组件；紫渐变 `#8a5cf0→#5d6cd8` + 黄橙渐变进度条 `#ffd54f→#ff8a80`；observers 内 5 档门槛 free/bronze/silver/gold/diamond 100/500/2000/5000 积分与 frontend `computeGrowth` + backend `deriveGrowthLevel` 双源一致；MAX 状态「已达成最高等级」分支）；③ `components/ai-quick-cards/` — 健康助手页 5 张分类轻交互卡（第 15 个组件；5 列 grid 5 套配色：膳食绿/科学紫/商业黄/思维白/分享橙，5 卡 5 问题「我今天该吃什么/用科学角度分析我的训练/跑步相关的商业装备推荐/怎么保持跑步动力/帮我写一段跑步感悟文案」，点击 trigger `tap` 事件 `{q, tag}` 父级塞进输入框发送；`DEFAULT_CARDS` 常量内嵌组件可被 props 覆盖）；④ `components/invite-bonus-card/` — 我的页 3 列邀请奖励卡（第 16 个组件；黄渐变 `#fff8e1→#fdecc0`；3 列等分：`+7 天` 绿/`+50` 橙/`+3 天` 深橙；点击 trigger `tap` 事件父级 `wx.navigateTo('/pages/membership/index')` 跳会员详情）；**4 页集成**（动 pages/）：① `pages/index` 顶部 `<uv-alert wx:if="{{uv && uvShow}}" uv="{{uv}}" bind:close="onCloseUv" />` + loadData 增 `api.call('stats', 'weatherAir', coord).catch(() => null)` 并行（失败静默不阻塞首页）+ state 增 `uv` `uvShow`；② `pages/ai-coach` 操作栏 + 消息列表之间插 `<ai-quick-cards wx:if="{{!hasHistory && !sending}}" bind:tap="onQuickCardTap" />` 替 V0.2.5 横滚胶囊（保留 `QUICK_QUESTIONS` 数据 fallback 注释）+ 新 onQuickCardTap 把 `e.detail.q` 塞入输入框调 `onSend`；③ `pages/mine` user-card 后 level-card 之前插 `<invite-bonus-card bind:tap="onTapInviteBonus" />` + user-card + level-card 之间插 level-card + applyUser 增 `totalPointsEarned` 读 User V0.2.7 字段；④ `pages/membership` V0.2.6 已建邀请/兑换/权益风格沿用不动（详细版与 mine 简短版共存）；**4 组件 CLAUDE.md 已建**（含 type:null 范式/free/bronze/.../diamond 门槛映射/紫黄配色说明/失败静默范式）；**0 后端改动**（4 元素全复用 stats.weatherAir + user.me + aiCoach.chat 现有接口）；**12→**16** 组件 / 22 页 / 34 module 不变 / 品牌色 #2D9D78 沿用** / typecheck 三端 0 错 + 已清理未用 hour/weather props（[模式：优化] KISS）；tag v0.2.9 待打
> - **2026-07-15** — 🎯 **V0.2.5 健康中心深化 8 子任务 3 批（前端）**：**批 1**：今日页趋势柱底日期（`weekTrend:{date,score}` + `bar-col` 数值贴柱顶随高度）+ 快速提问**纠 V0.2.4 网格错**改回横滚胶囊（`QUICK_QUESTIONS` 回 string[]）；**批 2**：feed 动态图走 COS（`onSubmitPublish` 逐张 `api.uploadFile('image')`→url 数组，纠 V0.1.136 MVP 临时路径）；**批 3**：diet +拍照识别按钮（`chooseMedia`→`uploadFile` COS→`food.recognize`→填 addForm，菜品/包装模式 actionSheet 选择）+ index 历史项 `bindtap`→`report-detail?date`（report-detail onLoad 接 date 从 dailyReportList 查当日）+ device 体脂秤品牌（shared mi_scale 宫格自动渲染）；**待上传体验版**（trial 连生产 qingmulife.cn）真机验证
> - **2026-07-16** — 🎯 **V0.2.8 admin RBAC 替白名单 + V0.2.7 avatar-badge 组件 + V0.2.6 membership 新页（前端子集）**：① **V0.2.8 前端零改动**（admin 是独立 Web 后端 qm-admin 仓，前端小程序不调 admin 路由，仅 qm-admin Web 调 adminLogin + checkPermission，admin 子仓独立同步）；② **V0.2.7 新组件 `components/avatar-badge/`**（**第 12 个**，11→**12** 组件）— 头像右上双标识：付费皇冠（memberLevel≠free）+ 成长等级徽章（diamond💎/gold🥇/silver🥈/bronze🥉 emoji 映射），observers 联动 `memberLevel` + `growthLevel`；mine 页 MVP 接入，复用点计划 feed/notification/我的/关注；③ **V0.2.6 新页 `pages/membership/`**（**第 22 个**，21→**22** 页）— 邀请裂变增长体系 UI：`onLoad` `Promise.all([distribution.inviteInfo(), user.me()])` 并行拉取；渲染 `inviteCode`（onTapCopyCode 调 wx.setClipboardData）+ 会员到期 / 当前积分 / 成长等级进度条 / 兑换套餐列表（7d/100p 30d/300p，调 `user.redeemMember`）+ 5 条静态分销文案 + onShareAppMessage 分享 inviteCode+shareTitle+invitePath；④ **依赖后端**：distribution.inviteInfo 加强（返 `invitePath: 'pages/landing/invite?code=${inviteCode}'`）+ user.redeemMember action（V0.2.7 新增，事务内 points decrement 防双花 + memberExpireAt ext）；⑤ **3 处 goMembership 兜底删除**（grep `会员服务正在开发中` 上线后删 — V0.2.6 走真页）；⑥ **V0.2.4 → V0.2.8 全程 0 后端改动段**：V0.2.4 仅前端 UI / V0.2.6 邀请体系 + membership 前端 / V0.2.7 avatar-badge 前端 / V0.2.8 admin RBAC 在 qm-admin 独立仓；本仓本段仅前端交付；**22 页 / 12 组件 / 34 module 不变 / 后端 V0.2.8+2.7+2.6 新增 admin 表+User 字段+inviteInfo 加强 / 品牌色 #2D9D78 沿用**
> - **2026-07-15** — 🎯 **V0.2.4 健康中心三页 UI 改版（今日/健康助手/我的 + report-detail 新页 + data-strip 组件）**：`/zcf:workflow` 纯前端改版（后端 0 改动 / typecheck 通过）；① **新组件 `components/data-strip/`**（10→**11** 组件）— 4 项健康数据条（步数/心率/睡眠/健康分），`mode=light/dark` 双主题（light 白底用于 mine/report-detail 卡片；dark 半透明用于 ai-coach 渐变绿头），**`type:null` 绕微信 properties Number+null 类型冲突**（typecheck 教训）；② **新页 `pages/report-detail/`**（20→**21** 页）— 完整报告详情，免费用户 reportText 模糊锁定 + "升级会员解锁完整版" + 分享；③ **今日页 pages/index 改版**：去"跑者"问候 / AI 卡改 reportText 前 2 句摘要(summarizeReport) + "问 AI 深聊"小入口(goDeepChat 替原"问AI详情"大按钮) / "查看完整报告"(goReportDetail) + 免费用户角标(isMember) + "解锁完整版"(goMembership) / 本周趋势柱顶加 bar-val 数值 / 历史 AI 报告默认 7 日 + "更多"懒加载(historyAll pageSize:100)；④ **健康助手页 pages/ai-coach 改名+改版**（原"问AI"）：navigationBarTitleText + tabBar「问AI」→「健康助手」/ 页头改"健康助手"+副标题"健康提醒"（原"🤖 青沐AI运动健康助手"）/ 内联 today-data-strip 替换为 `<data-strip mode="dark"/>` / top-bar 去 title 让 4 按钮(计划/新聊/历史/分享) flex 均分全宽 / quick-chips 升级"快速提问"5 卡 2 列网格（QUICK_QUESTIONS 改 `{q,tag}` 对象数组，`:nth-child(odd):last-child` 全宽兜底）；⑤ **我的页 pages/mine 新布局**：用户卡 + data-strip(light) 数据概览条 + 3 组宫格重归类（运动:打卡/跑鞋/训练/榜单；数据:上传/健康/AI洞察/饮食；服务:健康助手/解读报告/动态/赛事）+ 设置卡 + loadTodayHealth（复用 stats.healthScore）+ 删 runnerStats 死数据/void api；⑥ **app.json** +report-detail 路径 + tabBar 改名；**membership 页未建**：3 处 goMembership 加 fail 兜底弹"会员服务开发中"（上线后 grep `会员服务正在开发中` 删兜底）；**10→11 组件 / 20→21 页 / 34 module 不变 / 后端 0 改动 / 品牌色 #2D9D78 沿用**
> - **2026-07-15** — 🎯 **`/zcf:init-project` 增量校准 #10（V0.2.1 OCR SDK + V0.2.0 饮食/天气关联 + V0.1.150/151 上传 pipeline + diet/insight 页 收官实测）**：本会话 init-architect 实测核对（**20 页 / 10 组件 / 34 module 后端 / 59 表 / 43 迁移**）；**V0.2.0/V0.2.1 2 段增量 changelog 全部补到本文件顶部**；最大改动：**V0.2.0 diet 页**（FatSecret 搜索 + 营养详情 + Meal 记录，调 5 ENDPOINTS food.*）+ **insight 页**（用户画像 + 天气×运动 Pearson 散点 + AI 千人千面，调 stats.userProfile + stats.weatherAnalysis + aiCoach.chat 喂画像+关联拿建议）/ 后端 **food 第 33 个 module**（V0.2.0 FatSecret OAuth2 + Meal.items 宏量升级 + FoodCache 1h TTL）+ **ocr 第 34 个 module**（V0.2.1 腾讯云官方 SDK 替 V0.1.151 手写 TC3）+ stats 阶段 2 weatherAnalysis + 阶段 3 userProfile 收官 V0.2.x 阶段化 + Checkin +5 字段（天气+定位，迁移 20260716000000）/ app.json +2 路径（pages 18→**20**）/ 后端 32→34 module / 41→43 迁移 / 58→59 表；GAP-12 5→7（+food +ocr）；本次 init #10 **0 代码改动**，纯文档增量 + 新建 food/CLAUDE.md + ocr/CLAUDE.md
> - **2026-07-15** — 🎯 **V0.2.0 diet 页 + insight 页 + V0.2.1 OCR SDK 集成（小程序侧）**：① **pages/diet/index.{ts,wxml,wxss,json} 新页**（apps/miniprogram/miniprogram/pages/diet/，调 5 ENDPOINTS food.*：onShow 调 food.myMeals 拉今日 / 搜索框调 food.search / 点选调 food.nutrition 拉详情 / 确认调 food.record 落 Meal / 右滑删除调 food.removeMeal）；② **pages/insight/index.{ts,wxml,wxss,json} 新页**（apps/miniprogram/miniprogram/pages/insight/，3 卡片：用户画像 stats.userProfile / 天气×运动关联 stats.weatherAnalysis（Canvas 2d 散点图温度×配速）+ AI 策略按钮 onTapStrategy 把画像+关联喂 aiCoach.chat 拿千人千面建议）；③ app.json pages +2 路径（diet/insight，18→**20**）；④ 前端与后端 food/ocr/stats 集成（5+3+2 新 ENDPOINTS）；commit 待；**0 新组件**（10→10 沿用）；品牌色 `#2D9D78` 沿用 V0.1.148
> - **2026-07-14** — 🎯 **`/zcf:init-project` 增量校准 #8（V0.1.148 init #8，post-v0.1.139~148 全量实测重对）**：本会话 init-architect 实测核对（**18 页 / 10 组件 / 32 module 后端 / 58 表 / 45 迁移**）；**V0.1.139~148 6 段增量 changelog 全部补到本文件顶部**；最大改动：**V0.1.142 删商城前端 16 页**（50→**18**）/ AI 私教 tab 化（tabBar 「商城」→「AI 私教」） / V0.1.144~147 Vant 美化 12 页 / V0.1.148 品牌色统一 #0FAF8E→#2D9D78（13 文件批量）+ 多页 UI 优化；本次 init #8 **0 代码改动**，纯文档增量
> - **2026-07-14** — 🎯 **V0.1.148 全局品牌色 + 多页 UI 优化**：`/zcf:workflow` UI 全面优化 + **13 文件批量替换品牌色 #0FAF8E → #2D9D78**（青沐绿深一档更专业稳重）+ sport 打卡页 UI 优化（emoji→文字 + 卡片阴影 + 表单圆角 + 品牌色统一）+ feed 动态页 UI 优化（emoji→文字 + 卡片阴影 + 品牌色统一）+ **AI 私教 UI/UX 全面优化**（品牌色统一 + emoji→文字 + 视觉提升 + 操作栏 emoji→文字 + top-bar 品牌色渐变）+ app.json navigationBarBackgroundColor `#2D9D78` + tabBar.selectedColor `#2D9D78`；**不改动 schema/不改动测试**；commit 9223e56/fcab0fb/7d882a4/8144826/677f81a（最近 5 commit）
> - **2026-07-13~14** — 🎯 **V0.1.144~147 AI 健康助手化 + Vant 美化 + MQTT 推送 + 佳明 4 路线调研**：`/zcf:workflow` 多阶段：① **AI 健康助手化**（参考 prototype "今日"页 3 tab 健康中心：跑量+心率+睡眠+步数综合）+ **pages/daily-report/ 新页**（调 stats.myDailyReport + stats.generateDailyReport + AI 健康分数 0-100 + AI 解读文本 + alertText + 重启入口）+ pages/index 改造（健康中心 tab 化）；② **Vant 美化 12 页**（Vant Weapp UI 库渐进升级：ai-coach / mine / sport / index / goal / certificate / feed / notification / family / annual-report / training / werun）；③ **MQTT 订阅前端 polyfill**（微信原生不支持 mqtt.js → 自实现 polyfill wx-mqtt：订阅 health/recipe/goal/feed topic，按 userId 路由，setData 增量更新）；④ **佳明 4 路线调研结论**（写入 docs/CLAUDE.md）：A 官方 API 架子（已申请待批）/ B 逆向架子（YAGNI 法律风险高）/ C BLE 已实现（V0.1.25）/ D Terra（V0.1.128 第三方聚合）；= **与后端同步**：57→58 表（DailyReport #58） / 40→45 迁移 / **前端页面 35→18 进一步简化**（删 review 等冗余 + 整合 sport/group 类）/ 901 单元不变
> - **2026-07-13** — 🎯 **V0.1.142 删商城前端 16 页（后端 module 保留）**：`/zcf:workflow` 方案 1 真删 — **删 16 商城页**（mall / cart / points / category / address / coupon / distribution / tiantian / order-list / order-confirm / product-detail / review-publish / review-my / review-list / group-buy / group-buy-detail）+ app.json pages 删 16 + **tabBar「商城」→「AI 私教」** + mine 删商城入口 + goAiCoach switchTab + sport 删天天跑 + favorite 商品跳提示 + **ai-coach tab 化（根治入口 bug：tabBar 直接显示不依赖 feature-gate/config）**；**51→35 页**（**V0.1.144~147 进一步简化 35→18**） / 后端商城 module 保留 / typecheck 过 + 无残留 / commit edeaff5
> - **2026-07-13** — 🎯 **V0.1.141 AI 私教速度优化（throttle + warmup + flush + Cache）**：A 前端 setData throttle（buffer 50ms flush，频率降 ~20x）+ B warmup action（进页预 Cache system prompt）+ C SSE flushHeaders + E loadHistory Cache 30s + 清理调试代码（FORCE_PROD=false + mine 调试条删）；test 46 passed / 0 回归 / 9→10 action（+warmup）/ commit de9c038
> - **2026-07-13** — 🎯 **V0.1.140 AI 私教完善（4 人设 + 建议卡片 + 计划追踪 + 分享 + 限流 + voice）**：User +aiCoachPersona 字段 + **context-builder 4 人设 DRY**（共享 SYSTEM_BASE + PERSONA_PROMPTS 人设段，cache key 含 persona）+ **C 计划追踪**（计划进度 + 最近 7 天打卡喂 LLM，零新表复用 calcPlanProgress）+ **B 建议卡片**（reply `📋建议：` 标记 + 前端正则提取 + addGoal/adoptPlan 卡片，流式友好）+ **setPersona** action（第 9 个，Cache.delByPattern 失效）+ **D 分享**（onShareAppMessage）+ **F voice** 占位（待微信同声传译插件 wx069ba97219f66d99 开通）+ 前端 **UI/UX 优化**（人设 chip 横滚高亮 + 图标操作栏 + 渐变气泡 + 建议卡片 + voice 按钮）+ mine 入口"测试"标签；test 901 passed（+9）/ 0 回归
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

> 最近更新：2026-07-14 **V0.1.148 init #8 全量实测**（**V0.1.139~148 6 段 changelog 已补本文件顶部**） — **18 页 / 10 组件 / 后端 32 module / 58 表 / 45 迁移** — V0.1.148 品牌色 #0FAF8E→#2D9D78 + AI 私教 UI 全面优化（emoji→文字+卡片阴影+渐变气泡）— V0.1.144~147 AI 健康助手（DailyReport）+ Vant 美化 12 页 + MQTT polyfill + 佳明 4 路线调研 — V0.1.142 删商城前端 16 页（51→35→18）+ AI 私教 tab 化 — V0.1.141 AI 私教速度优化（throttle+warmup+flush+Cache） — V0.1.140 AI 私教 4 人设 + 建议卡片 + 计划追踪 + 分享 + 限流 — V0.1.139 AI 私教前端（流式 wx.request enableChunked + abToAscii 逐字节解码 + plan-card 新组件）— V0.1.137 跑鞋增强 2 期前端 shoes-compare + 鞋成就卡 — V0.1.136 feed 9 图上限 + 跑鞋 picker + collection-poster 海报 — V0.1.135 certificate-poster + goal-share-card 海报组件 — V0.1.134 admin-race-result + content-detail 4 tab — V0.1.133 shoes-detail + mileage-chart 折线图 — V0.1.132 init 校准（纯文档） — V0.1.131 qm-admin + V0.1.130 bind-apps — V0.1.129 多方式认证 bind-apps — V0.1.128 COROS FIT/Terra — V0.1.127 health 体成分紫卡

---

## 🎯 职责

微信小程序前端，业务调用全部走 `services/api.ts`（替代旧 `wx.cloud.callFunction`）。

**当前阶段（V0.2.9，2026-07-16 prototype 借鉴完成）**：**22 页面注册**（V0.1.142 删商城前端 16 页 + V0.1.144~147 简化到 18 + **V0.2.0 +diet +insight**（20）+ **V0.2.4 +report-detail**（21）+ **V0.2.6 +membership**（22））/ **16 组件**（V0.2.9 prototype 借鉴新增 4：uv-alert + level-card + ai-quick-cards + invite-bonus-card）（V0.1.140 +plan-card + V0.1.135 +certificate-poster +goal-share-card + V0.1.136 +collection-poster + V0.1.133 +mileage-chart = 9 → V0.2.4 +**data-strip** = 10 + V0.2.7 +**avatar-badge** = 12）/ 后端 **34 module** 全对接 / **61 表** / **46 迁移** / 测试 **1055 it()**（init #12 1035 → init #13 1055，+20 admin RBAC + export）/ **34 module CLAUDE.md**（GAP-12 100% 关闭 34/34）/ **GAP-13 已闭** data-strip + avatar-badge 组件 CLAUDE.md 已建（type:null 范式 + growth emoji 映射）/ 品牌色 `#2D9D78`（V0.1.148 全局替换）

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

## 📂 目录结构（V0.1.148 init #8 实测 18 页 + 10 组件）

```
miniprogram/
├── app.ts                          # 应用入口（静默登录 + 全局 $apiBase/$token + V0.1.100 envVersion 分支）
├── app.json                        # 页面路由 + tabBar（**18 页面注册 V0.1.148 实测** + tabBar: 今日/问AI/我的 — V0.1.142 改商城→AI 私教）
├── app.wxss                        # 全局样式（--brand: **#2D9D78 V0.1.148 改**）
├── sitemap.json                    # 搜索接入配置
├── config/
│   └── env.ts                      # baseUrl / 品牌常量
├── utils/
│   ├── auth.ts                     # ensureLogin / logout
│   ├── format.ts                   # 配速/距离/日期格式化
│   ├── ble.ts                      # **蓝牙 BLE 工具**（V0.1.25：扫描/连接/订阅心率服务 0x180D；V0.1.33：readBattery/readDeviceInfo/readCharValue；**V0.1.43 加固**：retry3 + hasHr + 去 services 过滤 + getDeviceServices 诊断）
│   ├── werun.ts                    # **微信运动工具**（V0.1.43：syncWeRunToday + getWeRunHistory + syncWeRunIfFirstToday）
│   └── scale.ts                    # **体脂秤 GATT 解析**（V0.1.127）
├── services/
│   └── api.ts                      # **唯一**调后端的地方（含 refresh 一次重试 + actionUrl）
├── components/                     # **10 个组件（V0.1.148 init #8 实测）**
│   ├── feature-gate/               # 功能开关守卫
│   ├── error-state/                # 通用错误态
│   ├── privacy-popup/              # 隐私协议弹窗
│   ├── profile-popup/              # 用户资料弹窗
│   ├── entry-grid/                 # V0.1.35 mine 重构引入，4 列网格
│   ├── mileage-chart/              # V0.1.133 跑鞋历史里程曲线 Canvas 2d
│   ├── certificate-poster/         # V0.1.135 证书分享海报 Canvas 2d
│   ├── goal-share-card/            # V0.1.135 目标达成分享卡 Canvas 2d
│   ├── collection-poster/          # V0.1.136 收藏合集海报 Canvas 2d
│   └── plan-card/                  # **V0.1.140 AI 私教周计划卡**（采纳/重新生成/微调，level/type 英文 key→中文 label）
├── pages/                          # **18 个页面（V0.1.148 init #8 实测 app.json）**
│   ├── index/                      # 首页（tabBar「今日」；V0.1.43 onShow + V0.1.144~147 改造 3 tab 健康中心）
│   ├── sport/                      # 运动打卡（**已删 V0.1.142 天天跑**，V0.1.27 +跑鞋 picker；V0.1.148 UI 优化：emoji→文字 + 卡片阴影）
│   ├── ai-coach/                   # **AI 私教**（tabBar「问AI」 — V0.1.142 改商城→AI 私教；V0.1.139 流式 chat + V0.1.140 4 人设+建议卡片+计划追踪+分享+voice + V0.1.141 速度优化 + V0.1.148 UI 优化）
│   ├── mine/                       # 我的（tabBar「我的」 — V0.1.35 重构宫格）
│   ├── profile/                    # 个人资料（V0.1.40 完整实现）
│   ├── agreement/                  # 用户协议
│   ├── ranking/                    # 多维榜单（V0.1.34 familyRanking 也走这）
│   ├── health/                     # 今日健康（V0.1.25 + V0.1.127 体成分 + V0.1.144~147 3 tab 健康中心）
│   ├── device/                     # 设备绑定中心（V0.1.25 + V0.1.33 品牌识别 + V0.1.43 加固 + V0.1.127 体脂秤 + V0.1.128 COROS）
│   ├── training/                   # 锻炼训练（V0.1.25 + V0.1.41 配置化 + V0.1.32 wxss 修复）
│   ├── shoes/                      # 我的跑鞋（V0.1.26 + V0.1.135 成就 card + V0.1.148 UI 优化）
│   ├── runner/                     # 跑者中心（V0.1.34+ 整合）
│   ├── feed/                       # 运动动态（V0.1.30 + V0.1.136 9 图上限 + V0.1.148 UI 优化 emoji→文字+卡片阴影）
│   ├── user/                       # 用户主页（V0.1.32 + V0.1.136 3 tab）
│   ├── onboarding/                 # V0.1.43 新用户激活向导
│   ├── daily-report/               # **V0.1.144~147 AI 健康助手日报**
│   │   ├── (其余 13 个为 V0.1.142 删商城前历史页，已不再注册到 app.json — 实战中通过历史 changelog 追溯)
```

> 💡 页面数演进：13（V1 基础）+ 2（佳明 / 2026-07-01）+ 3（B 电商核心 / V0.1.22）+ 2（地址 / 优惠券 / V0.1.23）+ 1（分销 V0.1.24）+ 1（天天跑 V0.1.24）+ 3（pic / V0.1.25）+ 1（跑鞋 V0.1.26）+ 1（年度报告 V0.1.27）+ 2（目标 + 证书 V0.1.28）+ 1（收藏 V0.1.29）+ 1（动态 V0.1.30）+ 1（消息 V0.1.31）+ 1（用户主页 V0.1.32）+ 1（家庭 V0.1.34）+ 4（团购组+详情 / hot+topic / V0.1.36/37）+ 4（V0.1.43 werun/onboarding/health-history/data-import-guide）+ 3（V0.1.133/134/137 shoes-detail/admin-race-result/shoes-compare）+ 1（V0.1.139 ai-coach）+ 1（V0.1.113 review 3 个 — 后端保留前端删）+ 1（V0.1.144~147 daily-report）= **过去最高 51 页（V0.1.139）/ V0.1.142 删 16 商城 → 35 页 / V0.1.144~147 简化 → 18 页（实测）**

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
- 端点路径走 `@qm-wx/shared/api-contracts`（**含 V0.1.139 aiCoach 9 action** + V0.1.43 device +3 syncWeRun/myWeRun/myHealthHistory + V0.1.142 后端保留端点 cart/points/address/coupon/distribution/group-buy/review/mall/favorite + V0.1.148 stats.weather 4 action）

---

## 🎨 设计规范

- **品牌色 V0.1.148**：**`#2D9D78`**（青沐绿深一档，更专业稳重），定义在 `app.wxss` 的 `--brand` 变量；13 文件批量替换自原 `#0FAF8E`；app.json navigationBarBackgroundColor + tabBar.selectedColor 已更新；**#0FAF8E 不再使用**
- **页面级 wxss**：必须独立文件；`app.wxss` 只放变量和通用类
- **目录命名**：`kebab-case`
- **⚠️ wxss selector 禁用中文**（V0.1.32 坑）：wxss 编译器对中文 selector 解析失败，编译报 `unexpected at pos`；分类样式必须用英文 key 作 class（如 levelKey `beginner/intermediate/challenge/extreme`），中文仅作显示文本（LEVEL_KEY_MAP 映射）
- **⚠️ 小程序 TS 类型 3 坑**（V0.1.33 沉淀）：① TextDecoder 非 DOM lib 不可用 → 用 `String.fromCharCode(...new Uint8Array(buffer))`；② `wx.offBLECharacteristicValueChange` 类型签名 `()` 不接受参数 → 用 `@ts-ignore`；③ `OnBLECharacteristicValueChangeCallbackResult` 类型不存在 → 用结构类型 + `@ts-ignore`
- **⚠️ 蓝牙扫描去 services 过滤**（V0.1.43 坑）：小米手环用私有 0xFEE0 不广播 0x180D，按 services 过滤扫不到 → 修复去过滤 + matchBleVendor 筛 + 心率订阅容错 + getDeviceServices 诊断
- **废弃 API**：`getUserProfile` / `getUserInfo` 全部禁止使用；改 `button open-type="chooseAvatar"` + `input type="nickname"`
- **数字格式化**：金额 / 跑量 / 跑鞋里程 / 目标进度 / 动态点赞数 / 通知未读数 / 关注/粉丝数 / 家庭成员跑量 / 微信运动步数 / AI 健康分数等显示用 `utils/format.ts`

---

## 📦 依赖

- **运行时**：`@qm-wx/shared`（workspace 协议；构建产物经 `build-mp-shared.mjs` 注入 `miniprogram_npm/`；**V0.1.148 含**：V0.1.25 DEVICE_BRANDS 9 品牌 + V0.1.27 stats.myAnnualReport + V0.1.28 goal + stats.myCertificates + V0.1.29 favorite + V0.1.30 feed + V0.1.31 notification + V0.1.32 follow + V0.1.33 BLE matchBleVendor + V0.1.34 family + V0.1.139 aiCoach 9 action + V0.1.143 review + V0.1.148 stats.weather 4 action）
- **类型**：`miniprogram-api-typings`（仅 dev）
- **UI 库（V0.1.144~147 部分接入）**：Vant Weapp（小程序 UI 库，渐进式接入）

---

## 🧪 测试

小程序代码 Vitest 单测能力有限（无 jsdom 模拟 wx）。**策略**：
- **业务逻辑**（utils / services）抽成纯函数，单测覆盖
- **页面渲染**走微信开发者工具的真机调试
- **端到端**：未来可接 miniprogram-automator / Playwright

---

## 📌 当前状态

- ✅ **18 个页面（V0.1.148 init #8 实测）**（4 tabBar：今日/问AI/我的 + 14 子页面；V0.1.142 删商城前端 16 页 + V0.1.144~147 进一步简化）
- ✅ **10 个组件**（feature-gate / error-state / privacy-popup / profile-popup + entry-grid / mileage-chart / certificate-poster / goal-share-card / collection-poster / **plan-card（V0.1.140）**）
- ✅ `app.ts` 静默登录逻辑（`silentLogin` 补全 `me` 调用）+ **V0.1.100 envVersion 分支**
- ✅ `services/api.ts` 统一封装（含 refresh 一次重试 + `actionUrl` 工具）
- ✅ `utils/auth.ts` / `format.ts` / `config/env.ts` + `utils/ble.ts` + `utils/werun.ts` + `utils/scale.ts`
- ✅ `sitemap.json` + `project.config.json`（真 AppID `wx8c37d7ac5b7d0a83`）
- ✅ **品牌色 #2D9D78 全局应用**（V0.1.148 替换原 #0FAF8E；13 文件 + app.json navigationBarBackgroundColor + tabBar.selectedColor）
- ✅ **V0.1.139~148 主要新功能**：
  - **AI 私教完整闭环**（V0.1.139 MVP + V0.1.140 4 人设+建议卡片+计划追踪+分享+voice + V0.1.141 速度优化 + V0.1.142 tab 化 + V0.1.148 UI 优化）
  - **AI 健康助手**（V0.1.144~147 DailyReport 3 tab 健康中心 + AI 健康分数 + 解读）
  - **Vant 美化**（V0.1.144~147 12 页渐进式升级）
  - **MQTT 订阅前端 polyfill**（V0.1.144~147 wx-mqtt）
  - **跑鞋完整链路**（V0.1.26 跑鞋 + V0.1.27 picker + V0.1.133 详情 + V0.1.137 对比 + V0.1.135 成就卡）
  - **评价 + 鞋评**（V0.1.113 + V0.1.137 双分发 + V0.1.142 review 前端下线但 review API 保留给鞋评用）
  - **赛事服务 MVP**（V0.1.117 余额支付 + V0.1.119 wxpay 真集成 + V0.1.134 排行榜 + 自报成绩 + admin 录入）
  - **跑群深化 + 训练计划配置化**（V0.1.41 + V0.1.42 + V0.1.34 家庭）

---

🤙 **V0.1.148 init #8 已完成**：小程序侧 **18 页 / 10 组件 / 32 module 后端对接**；最大改动：V0.1.142 删商城前端 16 页（51→35）+ V0.1.144~147 简化到 18 页 + AI 私教完整闭环（V0.1.139~141 + 142 tab 化 + 148 UI）+ AI 健康助手 DailyReport + Vant 美化 + MQTT polyfill + V0.1.148 品牌色 #2D9D78 + 多页 UI 优化（emoji→文字、卡片阴影、渐变气泡）。下一步：真机验证 V0.1.144~148 + wxpay 真生产切流 + AI 私教 voice 插件 + GAP-12 module CLAUDE.md 收尾。
