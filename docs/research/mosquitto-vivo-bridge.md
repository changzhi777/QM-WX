# VIVO 手环 / vivo WATCH 接入方案调研（V0.2.140-153 V0.3.0 入口配套）

> 📍 文档状态：草案 v1（2026-07-26 init #20 V0.2.143 部署后补）
> 关联：`docs/智能手表数据对接计划.md`（6 阶段 33 任务）/ `apps/server/src/modules/device/device.service.ts` `syncVivo()` / `apps/server/src/modules/device/CLAUDE.md` / `device-integration-research-2026-07-23.md` memory

## 1. 背景

V0.2.140 mega commit 在 device UI 加了 VIVO 手环卡片 + 新建 `DeviceDailyActivity` 表占位，但**实际蓝牙直连协议未开放**（init-architect stage B 臆想的 syncVivo 已被 V0.2.143 补 stub）。本文档评估 VIVO 手环 / vivo WATCH 三条接入路径，给后续 Mosquitto VIVO Bridge（V0.2.140 changelog 预留）一个可执行的实施路线。

## 2. VIVO 接入能力调研（2026-07-26）

| 路径 | 状态 | 评估 |
|---|---|---|
| **A. VIVO 官方运动健康 API** | ❌ 未公开 | vivo 在国内消费级手环/手表有「健康」App（同步步数/睡眠/运动），但**无公开 OAuth/数据导出 API**（与小米健康数据黑洞类似，封闭生态）。企业接入需走 vivo 开放平台（企业资质审核，3-6 月），**短期不可行** |
| **B. BLE 私有协议逆向** | 🟡 理论可行 | vivo WATCH / vivo 手环 BLE GATT 走 vivo 私有 service（类似小米手环 0xFEE0/0xFEE1 模式）。标准 0x180D（心率）/ 0x180F（电池）会广播，但**计步/睡眠/血氧走私有 service**，需逆向（无 openScale 等开源项目可参考） |
| **C. 微信运动通道** | ✅ 已实现 V0.2.113 | 「诚实标注数据源」路线：vivo 健康 → 微信运动 → wx.getWeRunData → decrypt AES-128-CBC → recordWeRunDevice → Checkin.dataSource='werun'。**当前生产可用方案**，数据只有「步数 + 距离 + 卡路里」，缺睡眠/心率/血氧 |
| **D. Terra 聚合（推荐）** | 🟠 待签约 C3 | Terra 平台官方支持 vivo（[terra.co/sources](https://docs.tryterra.co/reference/data-models)，包含 Vivo 步数 + 睡眠 + 心率 + 运动记录），但需**企业签约 + $399/月**（V0.2.69-71 沉淀决策 Terra C3 暂停待签约） |
| **E. 微信 APP 路线（Android Health Connect）** | 🟠 折中 | VIVO Android 手机有 Health Connect API（Android 14+ 标配），可走 apps/flutter APK → Flutter `health` package → Health Connect → 上传到 server。**缺点**：用户必须用 Android VIVO 手机 + 装我们 APK 才能用，且无法直接拿 vivo 手环的睡眠/心率（需先同步到 Health Connect） |

## 3. Mosquitto Bridge 方案（changelog 预留）

按 V0.2.140 描述：「未来 Mosquitto VIVO Bridge 对接」。Mosquitto 是 MQTT broker，本身与 VIVO 协议无关 — 真实含义是「**自研 BLE 桥接服务 + Mosquitto 作为消息中转**」。

### 3.1 架构

```
VIVO 手环 BLE 私有 GATT
    ↓ (Android/小程序 BLE API)
┌─────────────────────────┐
│ Mosquitto BLE Bridge    │  ← 跑在 Android/iOS 设备上（后台保活）
│ - scan VIVO service     │     或 树莓派/小主机（24h 在线）
│ - connect + subscribe   │
│ - decrypt proprietary   │
│ - publish to MQTT broker│
└──────────┬──────────────┘
           ↓ MQTT over TLS
┌─────────────────────────┐
│ Mosquitto MQTT broker   │  ← 部署在 ECS（qmwx-mosquitto container）
│ - TLS port 8883         │
│ - ACL: device/{deviceId} sub / qmwx server pub
└──────────┬──────────────┘
           ↓ MQTT client subscribe
┌─────────────────────────┐
│ qm-wx-server            │  ← apps/server/src/modules/device/device.service.ts
│ - mqtt.js subscribe     │     +syncVivo() 真实实现（替代 V0.2.143 stub）
│ - upsert DeviceDailyActivity │
└─────────────────────────┘
```

### 3.2 Mosquitto 部署（生产 docker-compose 增量）

```yaml
services:
  mosquitto:
    image: eclipse-mosquitto:2.0
    container_name: qmwx-mosquitto
    ports:
      - "1883:1883"   # MQTT（内网）
      - "8883:8883"   # MQTT over TLS
    volumes:
      - ./mosquitto/conf:/mosquitto/config
      - ./mosquitto/data:/mosquitto/data
      - ./mosquitto/log:/mosquitto/log
    environment:
      MOSQUITTO_USERNAME: ${MQTT_USER}
      MOSQUITTO_PASSWORD: ${MQTT_PASS}
```

### 3.3 mosquitto.conf（最小可用）

```conf
listener 1883
allow_anonymous false
password_file /mosquitto/config/passwd
acl_file /mosquitto/config/acl

listener 8883
protocol mqtt
cafile /mosquitto/config/ca.crt
certfile /mosquitto/config/server.crt
keyfile /mosquitto/config/server.key
require_certificate true
tls_version tlsv1.2

log_dest file /mosquitto/log/mosquitto.log
log_type error
log_type warning
log_type notice
log_type information
persistence true
persistence_location /mosquitto/data/
```

### 3.4 ACL（设备只 pub 自己的 topic）

```conf
# device/{deviceId}/data pub → 限制 device 只 pub 自己的 topic
user device-u1-vivo-watch
topic readwrite device/u1-vivo-watch/#
# server 只读
user qmwx-server
topic read device/+/+/+
```

## 4. 实施路线（按 ROI 排序）

### 阶段 0（前置）— 协议调研
- [ ] **owner 拍板**：是否走 Mosquitto 自研桥接（投入 ~6-8 周）
- [ ] **法务调研**：VIVO BLE 协议逆向的法律风险（参考 COROS/华为案例）
- [ ] **签约决策**：Terra 平台 C3 是否启动（$399/月 + 接入 2 周）

### 阶段 1（短期 1-2 周）— V0.2.113 优化
- [ ] **完善 wx.getWeRunData 通道**：增加睡眠/心率/血氧字段（受限于微信运动开放能力）
- [ ] **前端 device 卡片**：标注「数据来源：微信运动同步 + vivo WATCH 蓝牙未对接」诚实标注（V0.2.140 已做）

### 阶段 2（中期 4-6 周）— Terra 接入（推荐）
- [ ] **签约 Terra**：联系人 sales@tryterra.co（V0.2.69 已调研）
- [ ] **新增 device.service.syncTerra**：oauth callback + 拉取 sleep/heart_rate/activity/daily
- [ ] **recordDeviceDailyActivity 真实写入**：upsert sleepMin / activeMin / distanceM / caloriesKcal
- [ ] **前端 device 卡片**：vino WATCH → onTapTerraAuthUrl → 走 Terra widget
- [ ] **测试 + 真机验证**

### 阶段 3（长期 6-8 周）— Mosquitto 自研（备选）
- [ ] **VIVO BLE GATT 逆向**：find service UUID（参考 openScale 思路）
- [ ] **Android 后台保活 service**：扫描+订阅+解密+MQTT publish
- [ ] **server 端 mqtt.js subscribe**：处理 qmwx-mqtt topic → upsert DeviceDailyActivity
- [ ] **生产部署**：docker-compose 加 mosquitto 服务 + ACL + TLS 证书

## 5. 当前状态（V0.2.143 部署后）

| 项 | 状态 |
|---|---|
| DeviceDailyActivity 表 + 迁移 | ✅ 20260725008000 applied |
| device.service.listDeviceDailyActivity（查询） | ✅ V0.2.140 实现 |
| device.service.recordDeviceDailyActivity（upsert） | ✅ V0.2.143 实现 |
| device.service.syncVivo（stub） | ✅ V0.2.143 实现（不调 recordDeviceDailyActivity，YAGNI） |
| 前端 onTapBrand vivo → onSyncWeRun | ✅ V0.2.140 接入（走微信运动通道） |
| Mosquitto MQTT broker | ❌ 未部署（生产 docker-compose 缺） |
| device.service.syncTerra | ❌ 未实现 |
| mqtt.js subscribe | ❌ 未引入 |

## 6. 下一步行动（按 ROI）

1. **owner 决策 Terra 签约**（最 ROI — 2 周接入 10+ 设备源，包括 vivo）
2. **or 自研 Mosquitto Bridge**（6-8 周投入，BLE 协议逆向有法律风险）
3. **or 维持现状**：前端诚实标注「vivo WATCH 数据经微信运动同步」

## 7. 参考资料

- Terra Vivo source: https://docs.tryterra.co/v2.0/reference/data-models
- Mosquitto 官方: https://mosquitto.org/documentation/
- Eclipse Mosquitto Docker: https://hub.docker.com/_/eclipse-mosquitto
- openScale（小米体脂秤开源参考）: https://github.com/oliexdev/openScale
- `device-integration-research-2026-07-23.md` memory（V0.1.144 全调研）
- `docs/智能手表数据对接计划.md`（6 阶段 33 任务，含 VIVO 优先级 P3）