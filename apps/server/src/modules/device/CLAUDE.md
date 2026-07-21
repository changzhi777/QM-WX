# device module — 设备数据 / 多协议接入

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../../../CLAUDE.md) → [`apps/server/`](../../../CLAUDE.md) → [`modules/`](../) → **device/**（这里）
> 父级：[apps/server CLAUDE.md](../../../CLAUDE.md) | 同级：[stats](../stats/) / [user](../../user/) / [admin](../../admin/)

> 引入版本：**V0.1.0**（device V2 stub），**V0.1.25+** 渐次扩展（佳明 / 蓝牙 / 体脂秤 / 微信运动 / COROS）
> 状态：V2 部分实现（28 个 action，覆盖三大品牌 + 心率/血氧/睡眠/体脂/微信运动/COROS）

---

## 🎯 模块职责

**多协议设备数据接入**：服务端权威地接收并持久化各类设备数据，统一包装为「我的活动 / 我的睡眠 / 我的今日健康 / 我的健康历史 / 我的设备绑定」查询 API。

接入协议矩阵：

| 协议 | 数据源 | V0.1.X |
| --- | --- | --- |
| **佳明 OAuth** | Garmin Connect API | V0.1.15/V0.1.43 (4 查询 + 数据处理) |
| **BLE 心率** | 微信 wx BLE API + 0x180D | V0.1.25（device.ts 心率提交 + Redis 缓存） → V0.1.43（首立即上传+5s 批量+onHide flush+retry3） → V0.1.127（体脂秤复用通道） |
| **微信运动** | wx.getWeRunData + AES-128-CBC 解密 | V0.1.43 |
| **COROS 三轨** | BLE 心率（复用 127）+ FIT 文件导入 + Terra 聚合 | V0.1.128 |
| **佳明历史活动** | BullMQ `garmin-import` job | V0.1.43 |
| **小米手环 BLE** | 私有 0xFEE0 + 第三方数据包 zip 解压 | V0.1.43 (ludong-sync stub) + V0.1.127 |

---

## 🚪 入口与启动

| 文件 | 职责 | 行数 |
| --- | --- | ---: |
| `device.service.ts` | 28+ 函数（佳明 4 + BLE 4 + 微信运动 2 + 数据处理 4 + COROS 4 + 杂项） | ~600 |
| `device.routes.ts` | POST `/api/device`（统一 25+ action switch） | ~200 |
| `device.schema.ts` | Zod（BindBleDeviceInput / SubmitHeartRateInput / SubmitSpO2Input / SubmitBodyCompositionInput / 微信运动 + Terra） | ~170 |
| `device.health.ts` | 心率 retry3 + hasHr 策略 + 5s 批量缓冲 + Redis cache `ble:hr:{userId}` | ~80 |
| `terra-client.ts`（V0.1.128） | Terra API 聚合：corosAuthUrl / syncFromTerra / terraWebhook 签名校验 | ~120 |
| `scale.ts`（V0.1.127） | 体脂秤 GATT 协议：解析 impedance + age + weight + 6 项体成分 | ~80 |

注册：`src/app.ts` 内 `app.register(deviceRoutes, { prefix: '/api/device' })`

---

## 📡 对外接口（28+ action，按功能分组）

### 佳明 OAuth（V0.1.15）

| action | 说明 |
| --- | --- |
| `startOAuth(userId, {returnUrl})` | 返 Garmin OAuth 跳转 URL |
| `myActivities(userId, {page,pageSize})` | RawActivity 列表（已入库历史活动） |
| `mySleep(userId, {dateRange})` | GarminSleep 月度聚合 |
| `myMetrics(userId, {dateRange})` | GarminMetric 通用指标 |
| `myFitnessAge(userId, {date})` | GarminFitnessAge |

### 数据处理（V0.1.15+43）

| action | 说明 |
| --- | --- |
| `myPending(userId, ...)` | 未导入佳明活动列表 |
| `myProcessed(userId, ...)` | 已导入活动 |
| `ignoreActivity(userId, {rawId})` | 标记忽略 |
| `importToCheckin(userId, {rawId})` | 导入到 Checkin（BullMQ `garmin-import` 入队） |

### BLE 绑定（V0.1.25+33）

| action | 说明 |
| --- | --- |
| `bindBleDevice(userId, {vendor, brandMeta, deviceName})` | 按 [userId, vendor] upsert（garmin/xiaomi/ble 可共存） |
| `unbind(userId, vendor)` | 解绑（删 DeviceBinding） |
| `myBindings(userId)` | 当前绑定列表（garminBleBound / garminOAuth / xiaomi / ble） |

### 心率 / 血氧 / 体成分（V0.1.25+43+127）

| action | 说明 |
| --- | --- |
| `submitHeartRate(userId, {value, source, timestamp})` | 5s 批量 + 首次立即（device.health.ts），落 HeartRateRecord + Redis cache |
| `submitSpO2(userId, {value, timestamp})` | 0x1822 SFLOAT 解析，落 SpO2Record |
| `submitBodyComposition(userId, {weight, bmi, bodyFat, ...})`（V0.1.127） | 体脂秤数据落 BodyCompositionRecord |

### 微信运动（V0.1.43）

| action | 说明 |
| --- | --- |
| `syncWeRun(userId, {encryptedData, iv, sessionKey})` | AES-128-CBC 解密 → 步数明细 → WeRunRecord upsert |
| `myWeRun(userId, {dateRange})` | 月度列表（Cache 300s） |

### 健康历史 / 今日健康（V0.1.43+25）

| action | 说明 |
| --- | --- |
| `myHealthHistory(userId, {type: 'heart'\|'spo2'\|'sleep'\|'scale', dateRange})` | 统一历史曲线 API |
| `myTodayHealth(userId)` | 今日健康大卡（聚合 4 类数据，Promise.allSettled，Cache 300s） |

### COROS 三轨（V0.1.128）

| action | 说明 |
| --- | --- |
| `corosAuthUrl(userId)` | Terra OAuth 跳转 URL（configured: boolean） |
| `importCorosFit(userId, buffer)` | FIT 文件解析 → upsertCorosRawActivity → CorosRawEvent |
| `terraWebhook(rawBody, signature)` | Terra 回调（含 RSA 签名校验，pending 落 CorosRawEvent） |
| `syncFromTerra(userId, {start, end})` | 主动拉 Terra 数据 |

### 小米 OAuth stub（V0.1.43）

| action | 说明 |
| --- | --- |
| `parseXiaomiZipStructure(buffer)` | zip 内 Mi Band 数据 zip 结构预览 |
| `importXiaomiZip(userId, buffer, password)` | 落库（**ludong-sync.job.ts 触发**，待生产配齐） |

---

## 🔧 关键依赖与配置

### Prisma 表

| 表 | 引入 | 字段要点 |
| --- | --- | --- |
| `DeviceBinding` | V0.1.25 | vendor(garmin/xiaomi/ble) + vendorUserId + scopes + accessTokenEnc + refreshTokenEnc |
| `RawActivity` | V0.1.15 | vendor=garmin + status + importedAt + importCheckinId |
| `GarminSleep` | V0.1.15 | date + durationSeconds + deepSeconds + ... |
| `GarminMetric` | V0.1.15 | 含 sport 列（跑步/骑行/游泳） |
| `GarminFitnessAge` | V0.1.15 | date + age |
| `WeRunRecord` | V0.1.43 | date(YYYY-MM-DD) + step + @@unique([userId, date]) + index |
| `HeartRateRecord` | V0.1.43 | value + timestamp + source(ble/werun/manual) + index |
| `SpO2Record` | V0.1.43 | value(0-100) + timestamp + index |
| `SleepRecord` | V0.1.43 | date + durationSeconds + deepSeconds + lightSeconds + remSeconds + awakeSeconds + score |
| `BodyCompositionRecord` | V0.1.127 | weight + bmi + bodyFat + muscle + bone + water + visceralFat + metabolicAge + impedance |
| `CorosRawEvent` | V0.1.128 | raw JSON + activityType + startTime + duration + distance |

### Redis 缓存

| key | 用途 | TTL |
| --- | --- | --- |
| `ble:hr:{userId}` | 最近心率值（API 实时查询用） | 1h |
| `device:bindings:{userId}` | DeviceBinding 列表（弱缓存，10min） | 10min |
| `device:todayHealth:{userId}` | 今日健康聚合 | 5min |

### Job 依赖

- `garmin-import.job.ts`（V0.1.15）— BullMQ 处理 RawActivity → Checkin，concurrency=2
- `ludong-sync.job.ts`（V0.1.43）— 小米 OAuth stub（待生产配）

---

## 🧪 测试（V0.1.131）

`tests/modules/device/` 共 **6 files / ~50 用例**：

| 文件 | 用例数 | 覆盖 |
| --- | ---: | --- |
| `device.garmin.test.ts` | 6 | startOAuth + 4 查询 |
| `device.service.test.ts` | 17 | mixed 集成 + 心率 hasHr + 微信运动 AES 解密 |
| `device.routes.test.ts` | 7 | 25+ action switch + Fastify inject |
| `device.health.test.ts` | 3 | 5s 批量 + 首次立即 + Redis cache |
| `device.bindings.test.ts` | 11 | garmin/xiaomi/ble 多 vendor + garminBleBound 优先级 |
| `device.coros-fit.test.ts` | 3 | FIT 文件解析 → upsertCorosRawActivity |
| `device.coros-terra.test.ts` | 8 | corosAuthUrl + syncFromTerra + terraWebhook 签名 |
| `device.data-process.test.ts` | 7 | myPending / ignore / import 事务 |
| `scale.test.ts` | 10 | 体脂秤 GATT 解析 6 项 + impedance 校验 |

---

## 🔗 关键集成点

### 与 sport.checkin 集成
- 佳明导入 → Checkin（userId + distance + duration + sportType + garminActivityId）
- `garmin-import.job.ts` 事务内 create + 标记 RawActivity.importedAt

### 与 stats.myTodayHealth 集成
- device.myTodayHealth 聚合 4 类（GarminSleep + GarminMetric + HeartRateRecord + SpO2Record）
- Cache 5min 减少 DB query

### 与 notification 集成（待）
- 心率异常告警 / 目标达成（V0.1.132+ 可加 notify 集成）

---

## 📌 常见问题 (FAQ)

**Q：佳明 OAuth 怎么拉历史数据？**
A：首次绑定调 `startOAuth` → 用户授权 → 回调 → 后台 BullMQ enqueue importToCheckin → garmin-import job 拉过去 24 个月活动入 RawActivity + Checkin。

**Q：心率值怎么去重？**
A：`HeartRateRecord.userId+timestamp` 没强 unique（每秒可能多条），但 frontend 5s 批量让重复少；如需 strict 去重，V0.1.150+ 加 `@unique([userId,timestamp])`。

**Q：小米手环 BLE 怎么连？**
A：`utils/ble.ts` retry3 + 去 services 过滤 + getDeviceServices 诊断（私有 0xFEE0 不广播 0x180D，需 filter 容错）；V0.1.43 已闭环：小米 10Pro 标准 0x180D 心率走通。

**Q：COROS 三轨 Terra 待啥？**
A：用户配 API key 在 configRepo（Terra developer 注册），目前 `configured: false` → corosAuthUrl 不工作。配后 Terra Webhook 自动接，syncFromTerra 主动拉。

**Q：心率缓存 Redis `ble:hr:{userId}` 多大？**
A：value 是最近 1 条 {value, timestamp} JSON，约 100 字节。10k 用户约 1MB。

**Q：怎么知道用户绑了几个 vendor 设备？**
A：`myBindings(userId)` 返列表，含 vendor/name/boundAt/garminBleBound/garminOAuth/... 多状态标志。

**Q：体脂秤数据与体重秤重复怎么去重？**
A：当前两条线（体重秤 → Checkin.weight / 体脂秤 → BodyCompositionRecord），前端用 6 项引导卡明确「体脂秤」专属；如要合并，V0.1.150+ 改 BodyCompositionRecord.userId+date 加 unique。

---

## 📁 相关文件清单

```
src/modules/device/
├── device.service.ts            # 28+ action
├── device.routes.ts             # 25+ action switch
├── device.schema.ts             # Zod
├── device.health.ts             # 心率 retry3 + 5s 批量 + Redis cache
├── terra-client.ts              # Terra 聚合 (V0.1.128)
├── scale.ts                     # 体脂秤 GATT 解析 (V0.1.127)
└── CLAUDE.md                    # 本文件

src/jobs/garmin-import.job.ts    # 佳明 BulkMQ 导入
src/jobs/ludong-sync.job.ts      # 小米 OAuth stub

# 集成
src/modules/sport/sport.service.ts    # garmin-import → Checkin
src/modules/stats/stats.service.ts    # myTodayHealth 聚合查询
```

---

## 📝 变更记录 (Changelog)

- **2026-07-21** — 🎯 **V0.2.47 huawei_export TCX 支持（GAP-17 K3 closed）**：真实 ZIP（肖琦 `exportSportData`）是 **TCX（Garmin 通用 XML）非预期 HiTrack JSON**（华为两种导出：隐私中心 JSON / 运动记录 TCX）→ 新增 `parseTcxXml(text)`（fast-xml-parser ^5.10.0 + TCX_SPORT_MAP Running→run/Cycling→cycling/Swimming→swim 等 + Lap 单/多数组累加 TotalTimeSeconds/DistanceMeters/Calories + AverageHeartRateBpm 派生 avgHr）+ `parseHuaweiExport` 加 **TCX fallback**（motion JSON 找不到 → filter `.tcx` 批量解析，单文件失败 try/catch 优雅降级）；**真实回归 1633 .tcx 全解析**（run 1576/cycling 36/other 21，2023-2026 四年，累计 13982km/1134h）；parseTcxXml 4 单测（sport/多Lap/未知sport/非XML）+ scripts/test-huawei-real.ts 回归工具；**GAP-17 K3 closed ✅**；TCX 是 Garmin/Strava 通用格式，支持后任何 TCX 可导入（不只华为）；详见 memory `v0247-huawei-tcx-gap17-k3-closed.md`；commit 7a6f08b / 生产已部署

- **2026-07-15** — 🎯 **V0.2.2 huawei_export parser 落地（init #11）**：基于 `CTHRU/Hitrava v6.3.0` 逆向 schema（421 stars / 完整 JSON 字段映射表）实现华为运动健康隐私中心 ZIP 导出解析器，**无需主人提供样本**（用合成 JSON 单测 20 例 + 等真实样本回归）。新增 `apps/server/src/modules/device/parsers/huawei-export.parser.ts`（HuaweiActivity 接口 + parseMotionJson/parseAttribute/toCheckin 3 工具 + parseHuaweiExport 主入口 AES 加密 ZIP + unzipper 复用 V0.1.150 importXiaomiZip 范式）；sportType 枚举映射 13 个（4=run / 5=walk / 3=cycle / 101=indoor_run / 102=pool_swim / 103=indoor_cycle / 104=open_water_swim / 111=cross_trainer / 118=cross_country_run / 145=crossfit / 282=hike / 2=mountain_hike / 117=other → QM-WX sport enum）；单位转换（ms/毫卡/m/dm/s 全部正确）；格式兼容降级 2020-07/2021-04/2025-01 三次变更；attribute 优先 > 顶层字段；`device-parser.registry.huawei_export` 替换 stub → 循环 `sportService.checkin(dataSource='huawei_export')`；生产 V0.2.2 healthy 20s + 20 单测全过；调研:init #11 search 完整报告见 memory `huawei-export-search-v0202.md`；commit b7c7327
- **2026-06-29** — V0.1.0 device V2 stub
- **2026-07-01** — V0.1.15 佳明 4 查询 + 数据处理 4 action + 15723 条真数据灌入
- **2026-07-03** — V0.1.25 pic 3 页 + device 扩 5 action（myTodayHealth/myBindings/bindBleDevice/unbind/submitHeartRate）+ utils/ble.ts
- **2026-07-03** — V0.1.33 BLE 设备品牌识别（vendor 区分 garmin/xiaomi/ble，garminBleBound 优先级）
- **2026-07-04** — V0.1.43 微信运动 + 小米 OAuth + 健康持久化（4 表 WeRun/HR/SpO2/Sleep）+ utils/werun + utils/ble retry3
- **2026-07-12** — V0.1.127 体脂秤（BodyCompositionRecord + scale.ts GATT 解析 + submitBodyComposition + P0 bug 修 impedance）
- **2026-07-12** — V0.1.128 COROS 三轨（corosAuthUrl + importCorosFit + terraWebhook + syncFromTerra，terra-client.ts + CorosRawEvent）
- **2026-07-12** — V0.1.131 创建 module 级 CLAUDE.md（**GAP-8 关闭** device 侧）
