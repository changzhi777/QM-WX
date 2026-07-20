# apps/miniprogram — 微信小程序

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../CLAUDE.md) → **apps/miniprogram/**（这里）
> 架构依据：[docs/ARCHITECTURE-V2.md §7](../../docs/ARCHITECTURE-V2.md)
>
> ## 📋 变更记录 (Changelog)
>
> - **2026-07-20** — 🎯 **`/zcf:init-project` 增量校准 #18（V0.2.38 收官）**：本会话 init-architect 实测（**25 页 / 16 组件 ✅**，V0.2.27 init #17 基线 22 页 → +3 新页）；**V0.2.28~V0.2.38 apps/miniprogram 关键改动**：① **V0.2.29 今日页改版 + 月度报告新页**（删「问 AI 深聊」入口 + 删经纬度 + 加天气建议卡蹭 stats.weatherAir + **`pages/report-monthly/` 新页** app.json +1 路径 22→23）；② **V0.2.31 健康助手页对齐原型**（ai-quick-cards 5→4 卡 2×2 grid 删商业装备推荐卡 + AI 气泡渐变优化）；③ **V0.2.32 mine 原型重构**（用户卡 + data-strip + level-card 融合 + 3 组宫格重归类 + **`pages/more/` 待定页** app.json +1 路径 23→24 + level-card 与 invite-bonus-card 融合到 mine 卡片流）；④ **V0.2.34 interpret 上传页**（**`pages/interpret/` 新页** app.json +1 路径 24→25，chooseMessageFile 选佳明 .fit → base64 → POST /api/interpret action:garmin → 展示 result，配合后端 V0.2.33 interpret module）；**WechatSI 插件状态保持 V0.2.25 临时移除**（GAP-18 open）；本次 init #18 **0 代码改动**纯文档增量；下一步：① **miniprogram_npm 需 rebuild**（shared V0.2.33 +ENDPOINTS.interpret，pages/interpret 调用）；② V0.2.29 今日页 + V0.2.32 mine 重构 + V0.2.34 interpret 上传页真机视觉验证（`pnpm wx:auto-preview`）；③ WechatSI 授权加回 → K5 voice 真机验证
> - **2026-07-18** — 🎯 **V0.2.34 interpret 上传页（pages/interpret）**：`feat(v0.2.34)`；配合后端 V0.2.33 interpret module（MiniMax M3 Anthropic 兼容）；**`pages/interpret/{index.ts,wxml,wxss,json}` 新页**：chooseMessageFile 选佳明 .fit → base64 → `api.call('interpret', 'garmin', { fileBase64, inputKey })` POST → 展示 result；**app.json pages +1 路径（24→25）**；**0 新组件 / 0 后端改动（后端 V0.2.33 已就绪）**；真机验证待 minimax key 注入 + 佳明 .fit 样本
> - **2026-07-18** — 🎯 **V0.2.32 mine 原型重构 + pages/more 待定页 + level-card 融合**：`feat(v0.2.32)`；① **pages/mine 照 prototype 重构**（用户卡 + data-strip + level-card 融合 + 3 组宫格重归类：运动/数据/服务）；② **level-card 与 invite-bonus-card 融合到 mine 卡片流**（V0.2.7/V0.2.9 独立组件融合）；③ **`pages/more/` 待定页**（更多入口，承接 mine 重构后的次级入口）；**app.json pages +1 路径（23→24）**；**0 后端改动**；真机验证待做
> - **2026-07-18** — 🎯 **V0.2.31 健康助手页对齐原型（ai-quick-cards 5→4 + AI 气泡）**：`feat(v0.2.31)`；① **pages/ai-coach ai-quick-cards 5→4 卡 2×2 grid**（删商业装备推荐卡，剩 4 卡：膳食/科学/思维/分享）；② **AI 气泡渐变优化**（品牌色 #2D9D78 渐变）；**0 新页 / 0 新组件 / 0 后端改动**；纯 UI 调整；真机验证待做
> - **2026-07-18** — 🎯 **V0.2.29 今日页改版 + 月度报告新页 pages/report-monthly**：`feat(v0.2.29)`；① **pages/index 今日页改版**：删「问 AI 深聊」入口（精简）+ 删经纬度显示（隐私）+ 加天气建议卡（蹭 stats.weatherAir）；② **`pages/report-monthly/{index.ts,wxml,wxss,json}` 新页**（月度报告，调 stats.userProfile / weatherAnalysis 等聚合月度数据，配合后端 V0.2.30 stats buildReportText 三段式重写）；**app.json pages +1 路径（22→23）**；**0 后端改动（V0.2.30 是 apps/server stats 重写）**；真机验证待做
> - **2026-07-17** — 🎯 **`/zcf:init-project` 增量校准 #17（V0.2.27 收官）**：本会话 init-architect + **主智能体交叉实测**（**22 页 / 16 组件 ✅** 与 init #16 一致，0 改动）；**WechatSI 插件状态确认**：app.json 已删 plugins + scope.record（V0.2.25 临时移除，待常智公众平台「插件管理」添加同声传译 wx069ba97219f66d99 后加回，**新 GAP-18 open 跟踪**）；pages/ai-coach `onTapVoice` requirePlugin try/catch 永久防御保留（V0.2.25）；本次 init #17 **0 代码改动**纯文档增量
> - **2026-07-17** — 🎯 **V0.2.26 insight 页展示 AQI×心率 + 体感区间配速（步骤 5 前端）**：`feat(v0.2.26)` commit `817f8f9`；**pages/insight**：① **index.ts** WeatherAnalysisResult 类型扩容（+aqiHr/feelsLikeZones/optimalZone）+ `api.call<Analysis>('stats', 'weatherAnalysis')` + feelsLikeZones `avgPaceSec` → mm:ss 展示转换；② **index.wxml** 加 AQI×心率散点 + 体感区间配速柱状（4 桶）+ optimalZone 高亮；③ **index.wxss** +48 行柱状/散点样式；**0 新页 / 0 新组件 / 后端 V0.2.26 stats 同步**
> - **2026-07-17** — 🎯 **`/zcf:init-project` 增量校准 #16（V0.2.21 收官）**：22 页 / 16 组件 ✅；**V0.2.19 K5 voice 插件真接入**（app.json plugins 段新增 `WechatSI` + permissions 加 `scope.record` + pages/ai-coach onTapVoice 完整实现）；**V0.2.10~V0.2.18 前端零改**；本次 init #16 **0 代码改动**纯文档增量
> - **2026-07-16** — 🎯 **V0.2.13 K1 funcs 升回 86%**（wxpay +5 tests）+ **V0.2.14 K2 视觉验证** + **V0.2.15 K3-K5 物料清单**
- **2026-07-16** — 🎯 **V0.2.12 GAP-14 closed**：22 admin.routes.test.ts RBAC 适配 + funcs **85.54% 首次实测** + threshold funcs 86→84；V0.2.13 K1 升回 86.07%；`pages/report-detail/CLAUDE.md` 新建（V0.2.4 加 init #14 GAP-13 漏的页面级 CLAUDE.md）
- **2026-07-16** — 🎯 **V0.2.9 prototype 借鉴 — 4 新组件 + 4 页集成（健康中心 UI 再深化）**：4 新组件（12→**16**）：uv-alert + level-card + ai-quick-cards + invite-bonus-card；4 页集成；**0 后端改动**
- **2026-07-15** — 🎯 **V0.2.5 健康中心深化 8 子任务 3 批（前端）**：趋势柱底日期 / 快速提问 chips / feed COS / 体脂秤 / 拍照识别 / 历史详情
- **2026-07-16** — 🎯 **V0.2.8 admin RBAC 替白名单 + V0.2.7 avatar-badge 组件 + V0.2.6 membership 新页**（前端子集）：V0.2.7 新组件 `components/avatar-badge/`（11→**12**）+ V0.2.6 新页 `pages/membership/`（21→**22**）；**22 页 / 12 组件 / 34 module 不变**
- **2026-07-15** — 🎯 **V0.2.4 健康中心三页 UI 改版（今日/健康助手/我的 + report-detail 新页 + data-strip 组件）**：新组件 data-strip（10→**11**）+ 新页 report-detail（20→**21**）/ **0 后端改动**
- **2026-07-15** — 🎯 **`/zcf:init-project` 增量校准 #10（V0.2.1 OCR SDK + V0.2.0 饮食/天气关联 + V0.1.150/151 上传 pipeline + diet/insight 页 收官实测）**：20 页 / 10 组件 / 32→34 module
- **2026-07-15** — 🎯 **V0.2.0 diet 页 + insight 页 + V0.2.1 OCR SDK 集成（小程序侧）**：pages/diet + pages/insight 新页（18→**20**）
- **2026-07-14** — 🎯 **`/zcf:init-project` 增量校准 #8（V0.1.148 init #8，post-v0.1.139~148 全量实测重对）**：18 页 / 10 组件 / 32 module / 58 表 / 45 迁移
- **2026-07-14** — 🎯 **V0.1.148 全局品牌色 + 多页 UI 优化**：13 文件批量替换品牌色 **#0FAF8E → #2D9D78** + sport/feed/ai-coach UI 优化
- **2026-07-13~14** — 🎯 **V0.1.144~147 AI 健康助手化 + Vant 美化 + MQTT 推送 + 佳明 4 路线调研**：pages/daily-report 新页 + Vant 美化 12 页 + MQTT polyfill
- **2026-07-13** — 🎯 **V0.1.142 删商城前端 16 页（后端 module 保留）**：删 16 商城页 + tabBar「商城」→「AI 私教」 + ai-coach tab 化（根治入口 bug）；51→35 页
- **2026-07-13** — 🎯 **V0.1.141 AI 私教速度优化（throttle + warmup + flush + Cache）**
- **2026-07-13** — 🎯 **V0.1.140 AI 私教完善（4 人设 + 建议卡片 + 计划追踪 + 分享 + 限流 + voice）**
- **2026-07-13** — 🎯 **V0.1.139 AI 私教前端**：pages/ai-coach 新页（流式 wx.request enableChunked）+ components/plan-card 新组件（9→10）
- **2026-07-12** — 🎯 **V0.1.137 跑鞋增强 2 期前端**（pages/shoes-compare）/ **V0.1.136 收藏+动态社交向扩展前端**（components/collection-poster）/ **V0.1.135 目标/证书增强前端**（components/certificate-poster + goal-share-card）/ **V0.1.134 赛事服务 MVP 前端**（pages/admin-race-result）/ **V0.1.133 跑鞋增强前端**（pages/shoes-detail + components/mileage-chart）
- **2026-07-12** — 🎯 **V0.1.131 qm-admin Web 账号登录 + V0.1.130 bind-apps 前端页 + V0.1.129 多方式认证扩展（前端配合）** / **V0.1.128 COROS 三轨前端** / **V0.1.127 health 页 + health-history 页体成分卡集成**
- **2026-07-11** — 🎯 **V0.1.119 wxpay 赛事真集成前端** / **V0.1.117 赛事余额支付 + 用户 tab** / **V0.1.113 评价系统前端**（pages/review-publish，42→43 页）
- **2026-07-10** — 🎯 **V0.1.100 GitHub 主线起点** + 🎯 **V0.1.43 微信运动 + 小米 OAuth + 健康持久化 + onboarding 4 步式激活向导**：4 新页（werun/onboarding/health-history/data-import-guide）+ utils/werun.ts + utils/ble.ts 加固；**38→42 页**
- **2026-07-08~07-07** — 🎯 **V0.1.42 跑群深化** + **V0.1.41 训练计划配置化** + **V0.1.40 profile 完整** / **V0.1.39 family 后续** / **V0.1.38 团购深化** / **V0.1.37 团购 MVP** / **V0.1.36 社交深化** / **V0.1.35 mine 重构** / **V0.1.34 家庭空间 family** / **V0.1.33 BLE 设备品牌识别** / **V0.1.32 follow** / **V0.1.31 notification** / **V0.1.30 feed** / **V0.1.29 favorite** / **V0.1.28 跑步目标/我的证书** / **V0.1.27 sport 跑鞋 picker+年度报告+蓝牙调试面板** / **V0.1.26 跑鞋 shoes** / **V0.1.25 pic 3 页 + device 扩 5 action** / **B 电商三连击** + 佳明 3 页

> 最近更新：2026-07-20 **V0.2.38 init #18 全量实测**（**init #18 + V0.2.29 + V0.2.31 + V0.2.32 + V0.2.34 共 5 段 changelog 已补本文件顶部**） — **25 页 / 16 组件 / 35 module 后端对接**（V0.2.33 +interpret 第 35）— **V0.2.28-38 apps/miniprogram 关键改动**：① V0.2.29 今日页改版 + pages/report-monthly 新页（22→23）；② V0.2.31 ai-quick-cards 5→4 卡 2×2 grid；③ V0.2.32 mine 原型重构 + pages/more 新页（23→24）；④ V0.2.34 interpret 上传页（24→25）；**miniprogram_npm 需 rebuild**（shared V0.2.33 +ENDPOINTS.interpret，pages/interpret 调用）；WechatSI V0.2.25 临时移除（GAP-18 open）

---

## 🎯 职责

微信小程序前端，业务调用全部走 `services/api.ts`（替代旧 `wx.cloud.callFunction`）。

**当前阶段（V0.2.38 init #18 收官，2026-07-20 11:36）**：**25 页面注册**（V0.1.142 删商城前端 16 页 + V0.1.144~147 简化到 18 + V0.2.0 +diet +insight（18→20）+ V0.2.4 +report-detail（20→21）+ V0.2.6 +membership（21→22）+ **V0.2.29 +report-monthly（22→23）** + **V0.2.32 +more（23→24）** + **V0.2.34 +interpret（24→25）**）/ **16 组件**（V0.2.9 prototype 4 + data-strip V0.2.4 + avatar-badge V0.2.7 + plan-card V0.1.140 + certificate-poster V0.1.135 + collection-poster V0.1.136 + mileage-chart V0.1.133 + 5 基础）/ 后端 **35 module** 全对接（V0.2.33 +interpret 第 35）/ **62 表** / **47 迁移** / 测试 **1119 it() 全仓**（apps/server 1108 + scripts/dev-cli 11）/ **35 module CLAUDE.md**（GAP-12 100% 关闭 35/35，含 interpret/CLAUDE.md V0.2.38）/ **funcs 87.74%** init #17 实测 init #18 沿用 / **WechatSI 插件 V0.2.25 临时移除**（GAP-18 open）/ 品牌色 `#2D9D78`（V0.1.148 全局替换）

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

> V0.1.100 起 `app.ts` 加 envVersion 分支：develop→本地 / trial,release→生产。

---

## 📂 目录结构（V0.2.38 init #18 实测 25 页 + 16 组件）

```
miniprogram/
├── app.ts                          # 应用入口（静默登录 + 全局 $apiBase/$token + V0.1.100 envVersion 分支）
├── app.json                        # 页面路由 + tabBar（**25 页面注册 V0.2.38 init #18 实测** + tabBar: 今日/健康助手/我的）
├── app.wxss                        # 全局样式（--brand: **#2D9D78 V0.1.148 改**）
├── sitemap.json                    # 搜索接入配置
├── config/
│   └── env.ts                      # baseUrl / 品牌常量
├── utils/
│   ├── auth.ts                     # ensureLogin / logout
│   ├── format.ts                   # 配速/距离/日期格式化
│   ├── ble.ts                      # **蓝牙 BLE 工具**（扫描/连接/订阅心率 0x180D + retry3 + 体脂秤）
│   ├── werun.ts                    # **微信运动工具**
│   └── scale.ts                    # **体脂秤 GATT 解析**（V0.2.24 体重系数 0.005）
├── services/
│   └── api.ts                      # **唯一**调后端的地方
├── components/                     # **16 个组件（V0.2.38 init #18 实测）**
│   ├── feature-gate/               # 功能开关守卫
│   ├── error-state/                # 通用错误态
│   ├── privacy-popup/              # 隐私协议弹窗
│   ├── profile-popup/              # 用户资料弹窗
│   ├── entry-grid/                 # V0.1.35 mine 重构引入，4 列网格
│   ├── mileage-chart/              # V0.1.133 跑鞋历史里程曲线 Canvas 2d
│   ├── certificate-poster/         # V0.1.135 证书分享海报 Canvas 2d
│   ├── goal-share-card/            # V0.1.135 目标达成分享卡 Canvas 2d
│   ├── collection-poster/          # V0.1.136 收藏合集海报 Canvas 2d
│   ├── plan-card/                  # **V0.1.140 AI 私教周计划卡**
│   ├── data-strip/                 # **V0.2.4 4 项健康数据条**（type:null 范式）
│   ├── avatar-badge/               # **V0.2.7 头像皇冠+成长徽章**
│   ├── uv-alert/                   # **V0.2.9 UV 强提示黄条**
│   ├── level-card/                 # **V0.2.9 紫色等级卡**（V0.2.32 mine 重构融合）
│   ├── ai-quick-cards/             # **V0.2.9 健康助手分类卡**（V0.2.31 5→4 卡 2×2 grid）
│   └── invite-bonus-card/          # **V0.2.9 3 列邀请奖励卡**（V0.2.32 mine 重构融合）
├── pages/                          # **25 个页面（V0.2.38 init #18 实测 app.json）**
│   ├── index/                      # 首页（tabBar「今日」；V0.1.43 onShow + V0.1.144~147 改造 + **V0.2.29 改版**删深聊/删经纬度/加天气建议卡）
│   ├── ai-coach/                   # **健康助手**（tabBar「健康助手」— V0.1.142 改商城→AI 私教 + V0.1.139 流式 chat + V0.1.140 4 人设 + V0.2.9 ai-quick-cards + **V0.2.31 ai-quick-cards 5→4 卡 2×2 grid**）
│   ├── mine/                       # 我的（tabBar「我的」 — V0.1.35 重构宫格 + V0.2.9 level-card + invite-bonus-card + **V0.2.32 原型重构 + level-card/invite-bonus-card 融合**）
│   ├── sport/                      # 运动打卡
│   ├── profile/                    # 个人资料（V0.1.40 完整实现）
│   ├── agreement/                  # 用户协议
│   ├── ranking/                    # 多维榜单
│   ├── health/                     # 今日健康
│   ├── device/                     # 设备绑定中心
│   ├── training/                   # 锻炼训练
│   ├── shoes/                      # 我的跑鞋
│   ├── runner/                     # 跑者中心
│   ├── feed/                       # 运动动态
│   ├── user/                       # 用户主页
│   ├── onboarding/                 # V0.1.43 新用户激活向导
│   ├── diet/                       # V0.2.0 饮食记录（FatSecret）
│   ├── insight/                    # V0.2.0 AI 洞察（+V0.2.26 AQI×心率散点+体感区间配速）
│   ├── report-detail/              # V0.2.4 完整报告详情
│   ├── membership/                 # V0.2.6 邀请裂变 + 兑换会员
│   ├── report-monthly/             # **V0.2.29 月度报告新页**（配合后端 V0.2.30 buildReportText 三段式）
│   ├── more/                       # **V0.2.32 待定页/更多入口**
│   └── interpret/                  # **V0.2.34 AI 资料解读上传页**（chooseMessageFile 选佳明 .fit → base64 → POST /api/interpret action:garmin → 展示）
```

> 💡 页面数演进：18（V0.1.148 init #8）→ 20（V0.2.0 +diet +insight）→ 21（V0.2.4 +report-detail）→ 22（V0.2.6 +membership）→ **23（V0.2.29 +report-monthly）**→ **24（V0.2.32 +more）**→ **25（V0.2.34 +interpret）**

---

## 🚪 API 调用约定

**唯一入口**：`services/api.ts` 的 `api.call(module, action, payload)`。

```ts
// ✅ 正确
import { api } from '@/services/api';
const { user } = await api.call('user', 'login', { code });
```

**端点路径走 `@qm-wx/shared/api-contracts`**（**35 module**：V0.1.139 aiCoach 11 action + V0.1.43 device +3 + V0.1.142 后端保留端点 + V0.1.148 stats.weather 4 action + V0.2.0 food 6 + ocr 3 + **V0.2.33 interpret 1 action**）

---

## 🎨 设计规范

- **品牌色 V0.1.148**：**`#2D9D78`**（青沐绿深一档，更专业稳重），定义在 `app.wxss` 的 `--brand` 变量；13 文件批量替换自原 `#0FAF8E`；app.json navigationBarBackgroundColor + tabBar.selectedColor 已更新；**#0FAF8E 不再使用**
- **页面级 wxss**：必须独立文件；`app.wxss` 只放变量和通用类
- **目录命名**：`kebab-case`
- **⚠️ wxss selector 禁用中文**（V0.1.32 坑）
- **⚠️ 小程序 TS 类型 3 坑**（V0.1.33 沉淀）
- **⚠️ 蓝牙扫描去 services 过滤**（V0.1.43 坑）
- **⚠️ type:null 绕微信 properties Number+null 类型冲突**（V0.2.4 data-strip 范式）
- **⚠️ 上传文件 base64 走 POST bodyLimit 10MB**（V0.2.34 interpret 上传 .fit 范式：chooseMessageFile → base64 → POST，配合后端 V0.2.35 routes bodyLimit 10MB 防 413）
- **废弃 API**：`getUserProfile` / `getUserInfo` 全部禁止使用；改 `button open-type="chooseAvatar"` + `input type="nickname"`
- **数字格式化**：用 `utils/format.ts`

---

## 📦 依赖

- **运行时**：`@qm-wx/shared`（workspace 协议；构建产物经 `build-mp-shared.mjs` 注入 `miniprogram_npm/`；**V0.2.38 含**：V0.1.25 DEVICE_BRANDS 9 品牌 + V0.1.27 stats.myAnnualReport + V0.1.28 goal + stats.myCertificates + V0.1.29 favorite + V0.1.30 feed + V0.1.31 notification + V0.1.32 follow + V0.1.33 BLE matchBleVendor + V0.1.34 family + V0.1.139 aiCoach 11 action + V0.1.143 review + V0.1.148 stats.weather 4 action + V0.2.6 distribution + V0.2.7 user.redeemMember + V0.2.8 admin RBAC + V0.2.0 food 6 + ocr 3 + **V0.2.33 interpret 1 action**）；**miniprogram_npm 需 rebuild**（shared V0.2.33 +ENDPOINTS.interpret，pages/interpret 调用）
- **类型**：`miniprogram-api-typings`（仅 dev）
- **UI 库（V0.1.144~147 部分接入）**：Vant Weapp

---

## 🧪 测试

小程序代码 Vitest 单测能力有限（无 jsdom 模拟 wx）。**策略**：
- **业务逻辑**（utils / services）抽成纯函数，单测覆盖
- **页面渲染**走微信开发者工具的真机调试
- **端到端**：未来可接 miniprogram-automator / Playwright

---

## 📌 当前状态

- ✅ **25 个页面（V0.2.38 init #18 实测）**（3 tabBar：今日/健康助手/我的 + 22 子页面；V0.2.29 +report-monthly / V0.2.32 +more / V0.2.34 +interpret）
- ✅ **16 个组件**（V0.2.9 prototype 4 + V0.2.4 data-strip + V0.2.7 avatar-badge + V0.1.140 plan-card + certificate-poster + goal-share-card + collection-poster + mileage-chart + 5 基础）
- ✅ `app.ts` 静默登录 + **V0.1.100 envVersion 分支**
- ✅ `services/api.ts` 统一封装（refresh + actionUrl）
- ✅ `utils/{auth,format,ble,werun,scale}.ts`
- ✅ `sitemap.json` + `project.config.json`（真 AppID `wx8c37d7ac5b7d0a83`）
- ✅ **品牌色 #2D9D78 全局应用**（V0.1.148）
- ✅ **V0.2.28-38 主要新功能**：
  - **V0.2.29 今日页改版 + report-monthly 新页**（删深聊/删经纬度/加天气建议卡 + 月度报告新页）
  - **V0.2.31 健康助手页对齐原型**（ai-quick-cards 5→4 卡 2×2 grid）
  - **V0.2.32 mine 原型重构 + more 待定页**（用户卡 + data-strip + level-card 融合 + 3 组宫格 + level-card/invite-bonus-card 融合）
  - **V0.2.34 interpret 上传页**（配合后端 V0.2.33 MiniMax M3 佳明 FIT 解读）
- ⚠️ **WechatSI 插件 V0.2.25 临时移除**（GAP-18 open，待主人公众平台授权后加回）
- ✅ 后端 35 module 全对接（V0.2.33 +interpret 第 35）
- ✅ **miniprogram_npm 需 rebuild**（shared V0.2.33 +ENDPOINTS.interpret）

---

🤙 **V0.2.38 init #18 完成**：小程序侧 **25 页（V0.2.29 +report-monthly / V0.2.32 +more / V0.2.34 +interpret）/ 16 组件 / 35 module 后端对接**；最大改动：V0.2.29 今日页改版 + 月度报告新页 + V0.2.31 健康助手对齐原型 + V0.2.32 mine 原型重构 + V0.2.34 interpret 上传页；下一步：① miniprogram_npm rebuild（shared V0.2.33 +ENDPOINTS.interpret）；② V0.2.29/31/32/34 真机视觉验证（`pnpm wx:auto-preview`）；③ WechatSI 授权加回 → K5 voice 真机验证；④ V0.2.30 buildReportText 配合 report-monthly 月报验证；⑤ minimax key 注入后 interpret 真机验证。
