# apps/flutter/ — 沐禾健康 Android 客户端

> 📍 你正在读 **Flutter APP** CLAUDE.md。项目根级 CLAUDE.md 见 [`/QM-WX/CLAUDE.md`](../../CLAUDE.md)。
>
> 面包屑：`QM-WX/apps/flutter/` → 这里

---

## 职责

沐禾健康（产品显示名；公司名仍为**湖南青沐生命科技有限公司**）的 **Android 原生客户端**，复用后端 Fastify API（apps/server）+ 与微信小程序（apps/miniprogram）业务并行的第二条前端通道。

> 🏷️ **品牌命名区分**（V0.2.58 + V0.2.67 沉淀）：产品显示名 = **沐禾健康**；公司名 = **湖南青沐生命科技有限公司**；App 包名 = `com.qingmu.muhehealth`；微信小程序名 = **沐禾健康**；二者共用同套后端 API。

---

## 入口与启动

- **入口**：`lib/main.dart`（app 启动 → provider 树注入 → go_router 配置）
- **路由**：`lib/app/router.dart`（go_router 14.x）
- **主框架**：`lib/app/main_shell.dart`（4-tab BottomNavigationBar）
- **本地调试**：`cd apps/flutter && flutter run -d <device>`

---

## 技术栈

| 维度 | 选型 | 备注 |
|---|---|---|
| 框架 | Flutter（3.x，Dart 3） | Android 原生打 APK（V0.2.67-72 阶段无 iOS） |
| 状态管理 | **Riverpod 2.5** | `flutter_riverpod` + `riverpod_annotation`（Code Gen） |
| 路由 | **go_router 14** | 单 navigator + shell route（4-tab） |
| 网络 | **dio 5.7** | 拦截器统一 JWT + base URL + 错误归一 |
| 存储 | shared_preferences + sqflite | token / 缓存 / 本地表 |
| UI | **Material 3**（M3）+ #2D9D78 品牌色 | 与小程序一致 |
| 地图 | 高德 Android SDK | GPS 轨迹 / 逆地理 / POI |
| 微信 | `fluwx` 或 `wxapi`（接入微信 APP 支付/登录，V0.2.69 Phase1.5） | Phase 1.5 待办 |
| Lint | `flutter_lints` + `analysis_options.yaml` | Phase1 batch1-4 ✅ analyze 0 warning |
| 测试 | `flutter_test` + `flutter_lints` | widget_test.dart **20 测试**（实测） |

---

## 目录结构

```
apps/flutter/
├── lib/
│   ├── main.dart                 # app 入口
│   ├── app/                      # 应用骨架
│   │   ├── router.dart           # go_router 配置（4-tab shell + child routes）
│   │   └── main_shell.dart       # 4-tab BottomNavigationBar
│   ├── core/                     # 跨 feature 共享
│   │   ├── config/               # 环境 / API base URL / feature flag
│   │   ├── design_system/        # 主题 + 组件库 + 品牌色 #2D9D78
│   │   ├── legal/                # 用户协议 / 隐私政策 MD 文本（V0.2.58 沐禾健康协议）
│   │   ├── location/             # 高德定位封装
│   │   ├── network/              # dio 客户端 + 拦截器
│   │   └── storage/              # shared_preferences + sqflite 封装
│   └── features/                 # feature-first 21 feature（V0.2.67-72）
│       ├── agreement/            # 用户协议（V0.2.58 沐禾健康）
│       ├── ai_coach/             # AI 私教（流式 SSE + 多模态）
│       ├── auth/                 # 登录 / 注册 / JWT
│       ├── certificates/         # 跑步证书（5 段）
│       ├── checkin/              # 打卡（GPS + 截图 + 手环同步）
│       ├── daily_report/         # 每日报告
│       ├── favorite/             # 收藏（赛事/商品）
│       ├── feed/                 # 动态（评论 V0.2.72）
│       ├── follow/               # 关注/粉丝
│       ├── food/                 # 饮食记录
│       ├── goal/                 # 跑步目标
│       ├── gps_track/            # GPS 轨迹绘制
│       ├── group/                # 跑群
│       ├── insight/              # 健康中心（数据洞察）
│       ├── membership/           # 会员订阅
│       ├── notification/         # 消息中心
│       ├── profile/              # 我的
│       ├── settings/             # 设置
│       ├── shoes/                # 跑鞋
│       ├── strength/             # 训记式力量训练（与后端 strength module 同源）
│       └── today/                # 今日页（GPS / 心率 / 任务）
├── test/
│   └── widget_test.dart          # widget 测试 20 测（实测）
├── android/                      # Android 工程
├── pubspec.yaml                  # 依赖声明
└── README.md
```

---

## 21 个 feature 清单（V0.2.67-72 完整）

每 feature 标准结构：
```
features/<name>/
├── data/
│   ├── models/        # DTO + JSON 序列化
│   └── repositories/  # 调 dio → 远程 backend
├── domain/
│   └── entities/      # 纯 dart 业务实体（无外部依赖）
└── presentation/
    ├── pages/         # 页面 widget
    └── providers/     # Riverpod provider（state notifier / future / stream）
```

| # | feature | 关键点 |
|---|---|---|
| 01 | **agreement** | 沐禾健康协议文本展示（V0.2.58） |
| 02 | **ai_coach** | SSE 流式打字机（postAction 统一 action body + GraphQL-like stream） |
| 03 | **auth** | JWT + openid + bind phone |
| 04 | **certificates** | 完赛证书 5 段 + 海报分享 |
| 05 | **checkin** | GPS / 拍照 / 识图（GLM-4.6V）+ 截图确认打卡（V0.2.60 范式） |
| 06 | **daily_report** | 健康分环 + AI 解读展开 |
| 07 | **favorite** | 收藏列表（赛事/商品，已删除灰显） |
| 08 | **feed** | 动态列表 + 详情评论（V0.2.72）+ 缩略图 |
| 09 | **follow** | 关注/粉丝列表（TabBar 切换） |
| 10 | **food** | 饮食记录 + 餐次 + 手动记录 |
| 11 | **goal** | 跑步目标进度条 |
| 12 | **gps_track** | GPS 轨迹后台采点 + 折线绘制（高德） |
| 13 | **group** | 跑群加入/退出 + 排行榜 |
| 14 | **insight** | 数据洞察（AQI×心率 + 体感区间 + optimalZone） |
| 15 | **membership** | 会员等级 + 成长值 + 兑换 |
| 16 | **notification** | 系统通知 / 互动消息 |
| 17 | **profile** | 我的（用户卡 + 数据条 + 宫格） |
| 18 | **settings** | 设置页（通知 / 单位 / 关于 / 退出） |
| 19 | **shoes** | 跑鞋里程 + 退役 + 对比 |
| 20 | **strength** | 力量训练（与后端 `apps/server/src/modules/strength/` 同源） |
| 21 | **today** | 今日页（GPS / 心率 / 任务 / 改版 V0.2.29 风格） |

---

## 对外接口（与后端对齐）

后端基础 URL 配置在 `lib/core/config/api_config.dart`，**复用** `apps/server` 已有的全部 REST endpoints（含 packages/shared 同步的 36 module endpoints）。

**KPI endpoint 举例**：
- `GET /api/auth/login` — JWT 颁发
- `POST /api/sport/checkin` — 打卡
- `GET /api/today/snapshot` — 今日数据快照
- `POST /api/ai-coach/chat-stream` — AI 私教流式
- `GET /api/interpret/screenshot`（V0.2.60-66）— 截图解读 + 自动确认打卡

---

## 关键范式与坑（V0.2.67-72 沉淀）

1. **postAction 统一 action body**：所有业务接口 body 字段统一用 `postAction: '具体action名'`，后端 switch 路由 — Flutter dio 拦截器自动注入；不要每个 feature 自己拼 endpoint 路径
2. **Riverpod code gen**：`riverpod_generator` + `build_runner` — 改 provider 后必须 `flutter pub run build_runner build`，否则 IDE 红但不报错（编译才断）
3. **go_router shell route**：4-tab 用 `StatefulShellRoute.indexedStack` 保 tab 状态栈，跨 tab 切换不丢滚动位置
4. **SSE 流式**：ai_coach 用 `http.Client().send(Request)` + `Stream<List<int>>` chunk 解析，**不依赖 SSE 库**（与小程序的 `reply.hijack` 范式同思路）
5. **M3 主题**：用 `colorScheme.fromSeed(seedColor: Color(0xFF2D9D78))` 生成整套 M3 调色板，不要硬编码
6. **高德定位**：必须在 `AndroidManifest.xml` 配 `<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>`，缺则 `Location.requestPermission()` 永远拒
7. **品牌名一致性**（grep 范式）：产品名一律「沐禾健康」/ 公司名一律「湖南青沐生命科技有限公司」，**不混用**；用 `grep -rE "青沐|沐禾" lib/` 全量扫
8. **后端基线**：必须 apps/server ≥ V0.2.42（含 strength module），否则 strength feature 调用 404

---

## 测试

- `test/widget_test.dart` — 20 widget 测试（实测，V0.2.72 Phase 1-3 累计）
- 测试命令：`flutter test` 或指定文件 `flutter test test/widget_test.dart`
- 覆盖率：`flutter test --coverage`（输出 `coverage/lcov.info`）
- 关键 widget 覆盖（Phase 3）：auth / today / checkin / gps_track / ai_coach / feed 详情 / strength / food

---

## 构建与发布

```bash
# 开发
cd apps/flutter
flutter run -d <android-device>      # 真机调试

# 构建 APK
flutter build apk --release          # release
flutter build apk --debug            # debug

# 分析 + 测试
flutter analyze                      # lint + 静态分析
flutter test                         # 跑 20 widget 测试
```

构建产物：`build/app/outputs/flutter-apk/app-release.apk`（约 30MB）

---

## 变更记录（init #19 补建，前序沉淀于 memory）

- **2026-07-21 (V0.2.67-72)** — 🎯 **Flutter APP Phase 1-3 全栈交付**：
  - V0.2.67 初始化：Riverpod 2.5 + go_router 14 + M3 + dio 5.7 + 4-tab 骨架（22 feature 初稿）
  - V0.2.68 batch1：`auth` + `today` + `checkin` + `gps_track` — 登录/今日/打卡/GPS轨迹（~30 文件，analyze 0 warning，3 widget 测试）
  - V0.2.69 Phase 1.5：批次 2-3 巩固 + 微信 APP 接入预留（`appId` env，Phase 1.5 待办）
  - V0.2.70 batch2：profile + insight + ai_coach + membership（流式 SSE + postAction 范式）
  - V0.2.71 batch3：notification + group + shoes + goal + feed
  - V0.2.72 batch4：certificates + favorite + follow + food + strength + daily_report + agreement + settings — **21 feature 全部落地**
- **2026-07-23 (init #19)** — 🎯 **module CLAUDE.md 补建**（原缺失，本日新建本文件）；apps/server 36 module 后第 37 个 module 级 CLAUDE.md
- **测试**：20 widget 测试（widget_test.dart 实测）
- **目标用户**（与产品对齐）：常智（Asia/Shanghai 时区）；通过微信 / app 反馈
- **下一步**：
  1. Phase 1.5 微信 APP 接入（`fluwx` 集成 + 微信登录 + 微信支付）
  2. 高德 key 申请 + 实机 GPS 轨迹验证
  3. release APK 签名 + 蒲公英 / TestFlight（Android = 蒲公英）
  4. iOS 端预留（暂未启动，未来 TBD）
  5. 后端 strength module V0.2.42 接口已稳，feature 完成度高；membership 需对接 stripe / 微信支付商户号（GAP-17 K4 待主人物料）

---

🤙 *Be water, my friend.* 沐禾健康 Flutter 客户端 ~80 文件 / 21 feature / 4-tab / **#2D9D78 / Riverpod+go_router+M3 / dio 5.7 / 高德定位** — 与 apps/server 36 module API 全对齐，与 apps/miniprogram 25 页业务并行双端。**Phase 1-3 ✅** / Phase 1.5 微信 APP 接入 open / 20 widget 测试 / **funcs 闭环**（调用后端，无自实现计算逻辑）。
