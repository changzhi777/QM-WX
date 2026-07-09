# 小米手环标准 BLE 服务最大化 + 后端持久化 + 首页展示

> 任务：方案 1（标准 BLE 服务最大化）+ 追加（首页展示 + 后端存储 API）
> 启动：2026-07-08 21:11
> 范围：小米手环 10 Pro（标准协议）+ 微信运动步数

## 背景

- GAP-9 已闭环（小米 10 Pro 开心率广播 → 标准 0x180D 闭环）
- 当前：心率/电量/设备信息已通（标准 BLE），步数已通（微信运动 V0.1.43）
- submitHeartRate 仅写 Redis 不持久化（YAGNI 注释）→ 现在建表持久化
- myTodayHealth 把 steps/spo2 列入 unavailable → 接入新数据源后移除
- 首页无健康数据展示

## 阶段 1：后端数据层

### 1.1 Prisma +2 表（迁移 `20260708210000_hr_spo2_record`）
- `HeartRateRecord`：id/userId/value Int/timestamp DateTime/source String("ble"|"werun"|"manual")/createdAt + `@@index([userId, timestamp])` + onDelete Cascade
- `SpO2Record`：id/userId/value Int/timestamp DateTime/createdAt + `@@index([userId, timestamp])` + onDelete Cascade
- User +heartRateRecords +spo2Records relation

### 1.2 device.service 扩展
- `submitHeartRate` 改：写 Redis（实时，不变）+ 批量 createMany HeartRateRecord（历史）
- `submitSpO2`（新增）：create SpO2Record
- `myHealthHistory`（新增）：查心率/血氧历史（type=hr|spo2 + dateRange + 分页）
- `myTodayHealth` 扩展：加 latestHr（HeartRateRecord today latest 或 Redis 缓存）+ todaySpO2（SpO2Record latest）+ todaySteps（WeRunRecord today）→ unavailable 移除 steps/spo2

### 1.3 device.schema 加输入类型
- SubmitSpO2InputSchema（value + timestamp?）
- MyHealthHistoryQuerySchema（type + start? + end? + page? + pageSize?）

### 1.4 测试（device.service.test）
- submitHeartRate 落库断言（createMany）
- submitSpO2
- myHealthHistory 分页 + type 过滤

## 阶段 2：BLE 工具层（utils/ble.ts）

- BLE_SERVICES 加 pulseOximeter 0x1822
- 血氧特征：SPO2_SPOT_CHAR 0x2A5F / SPO2_FEATURES_CHAR 0x2A60
- BODY_SENSOR_LOCATION_CHAR 0x2A38
- parseSFLOAT（IEEE 11073-20601 SFLOAT 解析）
- parseSpO2Measurement（0x2A5F：flags + SpO2 SFLOAT + PR SFLOAT）
- parseBodySensorLocation（0x2A38 枚举映射）
- readSpO2SpotCheck（订阅 0x2A5F 一次拿测量，超时返 null）
- readBodySensorLocation（read 0x2A38）

## 阶段 3：device-bind 前端

- getDeviceServices 加 hasSpO2（0x1822）+ 全量服务列表日志
- onSelectDevice 加 readBodySensorLocation + hasSpO2 时 readSpO2SpotCheck（try/catch 容错）
- 心率回调批量上传后端（accumulate 5s 批量 submitHeartRate）
- 血氧测量结果上传后端（submitSpO2）
- data 加 liveSpO2 / liveBodyLocation
- wxml/wxss 加血氧卡 + 佩戴位置

## 阶段 4：首页健康卡（pages/index/）

- loadData 加 device.myTodayHealth（登录态）
- 加"今日健康"卡：心率（❤️ 最新）+ 血氧（🩸%）+ 步数（👟 今日）
- 无数据时引导"绑定设备"

## 阶段 5：shared ENDPOINTS + 测试 + 真机验证

- shared ENDPOINTS device 加 submitSpO2 / myHealthHistory
- typecheck（server + mp + shared）
- 单测全绿
- 真机：device-bind 反馈全量服务列表（0x1822 是否存在）+ 心率/血氧/步数首页展示

## 风险

- 血氧 0x1822 大概率小米私有（不广播标准）→ 真机验证；不可得则 myTodayHealth 的 spo2 仍 null
- 心率批量上传频率控制（5s 批量，避免高频请求）

## 文件清单

后端：
- apps/server/prisma/schema.prisma（+2 表 + User relation）
- apps/server/prisma/migrations/20260708210000_hr_spo2_record/migration.sql（新建）
- apps/server/src/modules/device/device.service.ts（扩展 4 action）
- apps/server/src/modules/device/device.schema.ts（+2 input）
- apps/server/src/modules/device/device.routes.ts（+2 路由）
- apps/server/tests/modules/device/device.service.test.ts（+单测）

前端：
- apps/miniprogram/miniprogram/utils/ble.ts（+血氧/体感位置/SFLOAT）
- apps/miniprogram/miniprogram/pages/device-bind/{index.ts,wxml,wxss}（诊断+血氧+上传）
- apps/miniprogram/miniprogram/pages/index/{index.ts,wxml,wxss}（健康卡）

shared：
- packages/shared/src/api-contracts/endpoints.ts（device +2 action）
