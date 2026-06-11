# 06 手表/手环对接设计：蓝牙直连 + 平台授权数据采集

> 项目：青沐生命科技微信小程序
> 目标：① 小程序通过蓝牙(BLE)直连手表/心率设备，跑步时实时采集心率并随打卡入库；② 通过各厂商开放平台的 OAuth 授权（扫码/跳转授权），开通历史运动数据自动采集，替代手动打卡。
> 参考代码仅为文档内容，实现时挂到 02 文档的 `sport`/`user` 云函数与 services 层。

---

## 0. 方案总览：两条路线，解决两类问题

| | 路线 A：蓝牙 BLE 直连 | 路线 B：平台 API 授权采集 |
|---|---|---|
| 解决什么 | **实时**数据：跑步现场心率/实时联动打卡 | **历史/全量**数据：跑步记录、距离、配速、睡眠、步数自动同步 |
| 原理 | 小程序蓝牙 API 订阅标准心率服务 (0x180D) | 用户授权我方访问厂商云端数据（OAuth 2.0），服务器拉取/订阅推送 |
| 不需要 | 厂商合作、服务器 | 现场连接设备 |
| 局限 | 多数品牌手表默认**不**对第三方广播心率，需开"心率广播"模式；手环基本是私有协议连不上 | 各厂商要逐家申请，审核周期数天~数周；个别平台不对外开放 |
| 上线节奏 | V2.0 可直接开发，无外部依赖 | 微信运动可立即做；华为/佳明并行申请 |

**兼容矩阵（指导用户预期，也写进产品 FAQ）**：

| 设备 | 路线A 实时心率 | 路线B 数据同步 |
|---|---|---|
| 标准蓝牙心率带/臂带（魔顿、迈金、Polar H10、佳明HRM等） | ✔ 标准 0x180D，直连最稳 | — |
| 佳明 Garmin 手表 | ✔ 开启"心率广播"后可连 | ✔ Garmin Connect Developer Program（Health/Activity API，详见 §2.3③） |
| 华为手表 | 部分型号支持心率广播 | ✔ 华为 Health Kit（REST API + 订阅） |
| 荣耀手表（2021 后新款） | 部分型号支持心率广播 | △ 荣耀开发者服务平台（详见 §2.3⑤）；2020 前老款荣耀穿戴仍走华为运动健康，被 Health Kit 覆盖 |
| 高驰 COROS | ✔ 开启心率广播 | △ 有开放 API（对接 Strava/悦跑圈等），需商务接洽 |
| 小米手环/手表 | ✘ 私有协议 | △ 小米开放平台可申请运动健康数据接口（详见 §2.3④），政策以审核为准；Zepp Open Platform 需合作申请 |
| Apple Watch | ✘ 不广播 | ✘ HealthKit 数据不出端（无云端 API），引导用户经微信运动间接同步 |
| 微信运动（兜底，所有用户） | — | ✔ `wx.getWeRunData` 拿 30 天步数，零申请成本 |

---

## 1. 路线 A：蓝牙 BLE 直连（实时心率）

### 1.1 前置配置
- `app.json` 权限声明 + 隐私接口声明（`wx.openBluetoothAdapter` 等已列入隐私 API，需在「小程序后台→设置→服务内容声明→用户隐私保护指引」勾选蓝牙、并在 app.json `requiredPrivateInfos`/隐私弹窗中覆盖）。
- Android 上搜索 BLE 需要系统定位开关打开（微信底层限制），iOS 需要系统蓝牙打开——两个失败分支都要给用户可操作的提示文案。

### 1.2 标准协议要点（开发必读）
- 心率服务 Service UUID：`0x180D`；心率测量特征值 Characteristic：`0x2A37`（notify）。
- `0x2A37` 报文解析：第 1 字节为 flags，flags 最低位 = 0 → 心率为第 2 字节 uint8；= 1 → 心率为第 2-3 字节 uint16 小端。
- 扫描时用 `services: ['180D']` 过滤，只发现广播了心率服务的设备，列表干净且省电。

### 1.3 连接状态机与流程

```
[未连接] → openBluetoothAdapter → startBluetoothDevicesDiscovery(180D)
   → onBluetoothDeviceFound(设备列表页) → 用户点选 → createBLEConnection
   → getBLEDeviceServices → getBLEDeviceCharacteristics(180D)
   → notifyBLECharacteristicValueChange(2A37, true)
   → [已连接·接收中] onBLECharacteristicValueChange 持续回调心率
   ├─ onBLEConnectionStateChange(connected=false) → [断线] → 自动重连≤3次 → 失败提示
   └─ 页面卸载/打卡结束 → closeBLEConnection → closeBluetoothAdapter
```

### 1.4 参考代码（utils/ble-hrm.js 心率连接管理器）

```js
// utils/ble-hrm.js —— 心率设备管理器（页面只调 start/stop/onHeartRate）
const HR_SERVICE = '0000180D-0000-1000-8000-00805F9B34FB'
const HR_MEASURE = '00002A37-0000-1000-8000-00805F9B34FB'

class HrmManager {
  constructor() { this.deviceId = null; this.listeners = []; this.samples = [] }

  async start() {
    await wx.openBluetoothAdapter().catch(e => {
      throw new Error(e.errCode === 10001 ? '请先打开手机蓝牙' : '蓝牙初始化失败')
    })
    await wx.startBluetoothDevicesDiscovery({
      services: [HR_SERVICE], allowDuplicatesKey: false
    })
    wx.onBluetoothDeviceFound(res => this.emit('found', res.devices)) // 渲染设备列表
  }

  async connect(deviceId) {
    this.deviceId = deviceId
    await wx.stopBluetoothDevicesDiscovery()
    await wx.createBLEConnection({ deviceId, timeout: 10000 })
    wx.onBLEConnectionStateChange(s => {            // 断线自动重连
      if (!s.connected && this.deviceId) this.reconnect()
    })
    await wx.getBLEDeviceServices({ deviceId })      // 部分安卓需先枚举
    await wx.getBLEDeviceCharacteristics({ deviceId, serviceId: HR_SERVICE })
    await wx.notifyBLECharacteristicValueChange({
      deviceId, serviceId: HR_SERVICE, characteristicId: HR_MEASURE, state: true
    })
    wx.onBLECharacteristicValueChange(res => {
      const hr = parseHeartRate(res.value)
      this.samples.push({ hr, t: Date.now() })
      this.emit('heartRate', hr)                     // 页面实时显示
    })
  }

  summary() {                                        // 打卡结束时取统计值
    const list = this.samples.map(s => s.hr)
    return list.length ? {
      avgHr: Math.round(list.reduce((a, b) => a + b) / list.length),
      maxHr: Math.max(...list), sampleCount: list.length
    } : null
  }

  async stop() {
    this.deviceId && await wx.closeBLEConnection({ deviceId: this.deviceId }).catch(() => {})
    await wx.closeBluetoothAdapter().catch(() => {})
    this.deviceId = null
  }
}

function parseHeartRate(buffer) {                    // 0x2A37 标准解析
  const dv = new DataView(buffer)
  const flags = dv.getUint8(0)
  return (flags & 0x01) ? dv.getUint16(1, true) : dv.getUint8(1)
}
module.exports = new HrmManager()
```

### 1.5 与打卡联动（sport 页）
- 打卡表单新增「连接心率设备」入口 → 设备列表弹层（信号强度排序）→ 连接成功后表单顶部实时显示心率（每秒刷新，>180 bpm 标红提醒）。
- 提交打卡时把 `hrm.summary()` 的 avgHr/maxHr/sampleCount 一并传给 `sport.checkin`；**服务端把带设备采样的打卡标记 `source:'ble'`**，榜单可展示"真实心率"徽标（防作弊的正向激励）。
- 页面 `onUnload` 必须调 `hrm.stop()` 释放蓝牙。

---

## 2. 路线 B：平台 API 授权采集（自动同步运动数据）

### 2.1 统一授权与采集架构（各厂商共用）

```
小程序 bind-app 页                我方服务端(云函数HTTP触发/云托管)            厂商开放平台
┌──────────────┐   ①点"绑定佳明" ┌───────────────────────────┐
│ 设备绑定列表    │ ──────────────► │ GET /oauth/start?vendor=garmin│
│ (含绑定状态)    │   ②返回授权页URL │   生成 state(防CSRF,绑openid) │
└──────────────┘ ◄────────────── └───────────────────────────┘
   ③小程序展示该 URL 的二维码（canvas 生成）或复制链接
   ④用户手机浏览器/厂商App 打开 → 登录厂商账号 → 同意授权 ──────► 授权服务器
   ⑤厂商回调 /oauth/callback?code=..&state=..  ◄──────────────────┘
       └─ 服务端：code 换 access_token + refresh_token → 存 device_bindings
   ⑥数据进入：厂商主动推送(webhook，佳明/华为订阅) 或 定时函数轮询拉取
       └─ 原始数据落 raw_activities → 归一化 → 自动生成 checkins(source:'platform')
   ⑦小程序 bind-app 页轮询绑定状态 → 显示"已绑定·今晨已同步 5.2km"
```

> 为什么要"扫码/外跳"：厂商 OAuth 授权页是网页，微信小程序 web-view 只能打开**业务域名**内页面，无法直接内嵌厂商授权页。标准做法即上图：生成授权链接 → 二维码/复制链接到浏览器完成授权 → 回调进我方服务器。回调地址需要一个 HTTPS 域名（用云开发「云函数 HTTP 触发」或云托管 + 已备案域名）。

### 2.2 数据模型（新增集合）

```js
// device_bindings（一人多厂商）
{ _openid, vendor:'garmin|huawei|coros|zepp|werun',
  accessToken, refreshToken, expireAt,      // 加密存储（云函数内 AES，密钥放环境变量）
  vendorUserId, scopes:[], status:'active|expired|revoked',
  lastSyncAt, createdAt }

// raw_activities（厂商原始数据，留底可追溯）
{ _openid, vendor, vendorActivityId,        // vendor+vendorActivityId 唯一索引防重
  type:'running|walking|cycling', startTime, durationSec,
  distanceMeters, avgHr, maxHr, cadence, raw:{...}, createdAt }
```

**归一化与防双计**：raw_activities 写入后触发归一化——type=running 且 distance≥500m 自动生成 checkin(source:'platform')；若同一用户当日已有手动打卡且时段重叠（开始时间差 < 2h），只保留设备数据并退回手动那笔的积分差额。积分上限规则与手动打卡一致（02 §5.3）。

### 2.3 各平台申请方法与材料

#### ① 微信运动 weRun —— 零申请，先上线
- 无需任何申请。前端 `wx.getWeRunData()` 拿加密包 → 云函数用 `cloud.getOpenData` 解密，得最近 30 天每日步数。
- 局限：只有步数（无距离/心率），适合做"步数榜"和兜底活跃数据。
- 参考代码：
```js
// 前端
const { encryptedData, iv, cloudID } = await wx.getWeRunData()
await call('sport', 'syncWeRun', { weRunData: wx.cloud.CloudID(cloudID) })
// 云函数（cloudID 自动解密）
async function syncWeRun({ OPENID, payload }) {
  const stepList = payload.weRunData.data.stepInfoList   // [{timestamp, step} × 30]
  // upsert 到 raw_activities(vendor:'werun')，步数榜直接聚合此表
}
```

#### ② 华为 Health Kit（覆盖华为/荣耀手表手环，国内占比最高，优先申请）
- 申请材料：华为开发者联盟**企业实名**账号（营业执照+法人信息，审核约 1-3 工作日）、应用信息、隐私政策 URL、数据使用说明（申请每一项读权限都要说明用途）。
- 步骤：开发者联盟创建应用 → 开通「Account Kit 账号服务」→ 申请「Health Kit」并勾选数据权限 scope（跑步记录、心率、步数等，**权限审核按项过**）→ 拿 client_id/client_secret → 实现 OAuth（授权页 → code → token）→ 调 REST API 拉数据，或注册**数据订阅**（数据变化时华为推送到我方回调）。
- 注意：用户须安装华为运动健康 App 且同意授权；申请到的 scope 与实际调用必须一致，多申会被驳回。

#### ③ 佳明 Garmin Connect Developer Program（跑步人群浓度高，接入手册级细节）

**申请**：填写官方 Access Request Form，需提供**法人实体**信息（公司名称、官网、业务说明、预计用户量、数据用途），审核通过后签 API 协议（免费，周期约 1-2 周）。国内用户多在 Garmin Connect 中国区（佳明中国），申请时注明面向中国市场。

**授权协议**：OAuth 2.0 **PKCE** 模式——
1. 我方服务端生成 `code_verifier`（43-128 位随机串）并算出 `code_challenge`；
2. 用户访问授权 URL（带 challenge）登录 Garmin 账号、勾选权限（用户可多选权限如 Activity Export，授权后变更会经 User Permission webhook 通知我方）；
3. 回调拿 code → 用 verifier 换 access_token / refresh_token。

**数据获取（Push 模型，基本不用轮询）**：在开发者门户为每类数据**分别注册回调 URL**——activities（运动记录）、dailies（每日汇总）、epochs（分钟级片段）、sleep、stress、userMetrics（VO2Max）、hrv 等；用户手表一同步，Garmin 就把数据 POST 到对应 webhook。两种通知模式：**Push**（POST body 直接带完整数据，推荐）和 **Ping**（只给回执 URL，需再回调拉取）。历史数据用 **Backfill** 接口补拉（异步返 202，数据走 webhook 送达）。

**开发要点**：webhook 必须 2 秒内应答 200（先落库后异步处理）；按 vendorActivityId 去重；活动明细可取 FIT/GPX 轨迹（二期做轨迹地图再用）。

#### ④ 小米（小米手环/手表，国内出货量最大，值得专项申请）

**现状**：小米健康云历史上主要面向**生态链企业**开放；目前可走 [小米开放平台](https://dev.mi.com/) 自助申请通道，政策以实际审核为准，建议"申请 + 兜底"双轨推进。

**申请路径**：
1. 小米开放平台注册**企业开发者**（营业执照等企业资料，免费，审核约 2-4 个工作日）；
2. 申请「运动健康数据接口」权限：填写应用信息、数据使用说明、隐私政策 URL（审核约 3-5 个工作日），通过后获得 AppID/API 密钥；
3. 实现 OAuth 授权（小米账号登录授权，纳入 §2.1 通用框架，新增 vendors/xiaomi.js 适配器）；
4. 可同步数据：步数、睡眠、心率、运动记录/轨迹（视权限审批范围）。

**兜底**：审核不通过或周期过长时——小米用户引导开启「小米运动健康 → 第三方数据共享 → 微信运动」，我方经 weRun 拿到步数（①已覆盖）；bind-app 页小米项显示"预约登记"收集需求量，作为与小米商务谈判的筹码。

#### ⑤ 荣耀（与华为分家后独立生态，单独申请）

**关键事实**：荣耀 2020 年从华为独立后自建账号与健康生态——**2021 年前的老款荣耀手环/手表仍绑定华为运动健康 App**（数据走华为 Health Kit，②已覆盖，无需额外开发）；**新款荣耀手表绑定「荣耀运动健康」App**，数据在荣耀云，需单独接入。

**申请路径**：
1. [荣耀开发者服务平台](https://developer.honor.com) 注册企业开发者（营业执照实名，流程类似华为）；
2. 申请荣耀账号服务（Honor Account Kit，OAuth 用）+ 运动健康相关 Kit 权限；荣耀对穿戴生态提供 Fitness-Wear Kit 等能力，**云端健康数据 REST 开放范围目前不如华为 Health Kit 完整**，若所需 scope 未开放则提交商务合作申请；
3. 接入纳入 §2.1 通用框架（vendors/honor.js 适配器），授权/回调/同步逻辑与华为同构。

**建议**：优先级排华为/佳明之后；先上"老款走华为 Health Kit + 新款预约登记"，待荣耀云端数据开放确认后再开发适配器。

#### ⑥ 高驰 COROS / Zepp（华米）—— 商务接洽通道
- COROS：有开放 API（已对接 Strava、悦跑圈等），无公开自助申请入口，走 **商务邮件接洽**（提供公司资质与合作方案）。
- Zepp Open Platform（dev.zepp.com）：面向合作伙伴开放数据能力，同样需合作申请。
- 产品策略：bind-app 页对未打通的厂商显示"敬请期待 + 预约登记"，统计预约量反向决定接入优先级。

### 2.3+ 健康数据 API 开放平台全景（备查）

> 回答"还有哪些健康数据开放平台"：按对本项目（微信小程序、中国市场）的可用性分层。

**第一梯队（本项目已规划）**：微信运动 weRun、华为 Health Kit、Garmin Connect Developer Program、小米开放平台、荣耀开发者平台。

**第二梯队（国内可谈/可扩展）**：

| 平台 | 数据能力 | 接入方式 | 备注 |
|---|---|---|---|
| Zepp Open Platform（华米） | 手环手表运动/睡眠/心率 | 合作申请 | dev.zepp.com |
| 高驰 COROS 开放 API | 运动记录（FIT） | 商务接洽 | 已对接 Strava/悦跑圈 |
| OPPO 健康（OHealth） | 手表运动健康数据 | 开发者平台/商务 | 开放度有限，按需接洽 |
| vivo 健康 | 手表手环数据 | 商务接洽 | 无公开自助 API |
| Keep / 咕咚 / 悦跑圈 | App 运动记录 | 开放平台/商务 | 偏 App 互联跳转，数据回流受限 |

**第三梯队（国际平台，做出海或 App 版再考虑）**：

| 平台 | 数据能力 | 授权 | 备注 |
|---|---|---|---|
| Fitbit Web API（Google） | 活动/睡眠/心率 | OAuth2 | 正迁移整合至 Google 健康体系 |
| Polar AccessLink | 训练/HRV/睡眠 | OAuth2 | token 长期有效，接入简单 |
| Suunto Cloud API | 运动记录/步数/睡眠 | OAuth2 | 需正式申请与 onboarding |
| Withings / Oura / WHOOP | 体征（体重/血压/睡眠/恢复） | OAuth2 | 体征类数据丰富 |
| Strava API | 运动社交/活动流 | OAuth2 | 国内跑表用户常双同步到 Strava，可作曲线数据源 |
| Samsung Health / Health Connect | 端侧聚合（Android） | 端侧 SDK | 需自有 App，云端 API 有限 |
| Apple HealthKit | iPhone/Apple Watch 全量 | 端侧（无云 API） | 数据不出端，必须有自有 iOS App |
| Google Fit → Health Connect | Android 聚合 | 端侧为主 | Google Fit API 退役中，向 Health Connect 迁移 |

**聚合服务（一接全有，按量付费）**：Terra API（500+ 设备/应用源）、Thryve 等商业聚合；Open Wearables（开源自托管聚合）。优点是一次接入覆盖 Garmin/Polar/Suunto/Fitbit 等众多平台，缺点是境外服务（数据出境合规需评估）、按用户/调用收费、对国内华为/小米覆盖差。**本项目结论：国内厂商直连为主，聚合服务仅在未来出海版本评估。**

### 2.4 服务端参考代码（OAuth 回调 + 定时同步）

```js
// 云函数 device-oauth（HTTP 触发）/oauth/callback
async function callback(query) {
  const { code, state } = query
  const { openid, vendor } = await verifyState(state)          // state 一次性、5分钟有效
  const token = await exchangeToken(vendor, code)              // code→access_token
  await upsert('device_bindings', { _openid: openid, vendor }, {
    accessToken: encrypt(token.access_token),
    refreshToken: encrypt(token.refresh_token),
    expireAt: Date.now() + token.expires_in * 1000, status: 'active'
  })
  return htmlPage('绑定成功，请返回小程序')                      // 回调落地页
}

// 云函数 device-sync（定时触发器：每小时；佳明走 push 则此函数只兜底）
async function syncAll() {
  const bindings = await db.collection('device_bindings')
    .where({ status: 'active' }).get()
  for (const b of bindings.data) {
    if (b.expireAt < Date.now()) await refreshToken(b)          // 过期先刷新
    const acts = await fetchActivities(b, b.lastSyncAt)         // 各厂商适配器
    for (const a of acts) await saveRawActivity(b._openid, b.vendor, normalize(a))
    await markSynced(b)
  }
}
// vendors/garmin.js、vendors/huawei.js 实现 fetchActivities/exchangeToken 适配器，
// 新增厂商只加一个适配器文件，主流程不动。
```

### 2.5 bind-app 页改造（替换现在的假绑定）
- 列表项三态：未绑定（按钮"去授权"→ 弹二维码/复制链接）｜已绑定（显示最近同步时间 + "立即同步" + "解绑"）｜敬请期待（预约登记）。
- 解绑：删 token、status→revoked，并调厂商 revoke 接口（有则调）。
- 全模块受 `feature_flags.bindApp` 开关控制，厂商逐个开（flags 细化为 `bindApp: {werun:true, huawei:false, garmin:false}`）。

---

## 3. 任务拆解（并入 04 文档，作为 Phase 6）

| ID | 任务 | 前置 | 工作量 | 验收标准 |
|---|---|---|---|---|
| T6-1 | 微信运动接入（getWeRunData + 解密入库 + 步数榜） | Phase 2 | 1.5 天 | 30 天步数入库；同账号重复同步不重复计 |
| T6-2 | BLE 心率管理器（utils/ble-hrm.js）+ 设备列表弹层 | — | 2 天 | 心率带真机连接、断线重连、页面退出释放 |
| T6-3 | 打卡联动心率（source:'ble'，avg/max 入库与展示） | T6-2 | 1 天 | 带心率打卡在榜单显示徽标 |
| T6-4 | OAuth 通用框架（HTTP 触发 + state 防伪 + token 加密存储 + 适配器模式） | 备案域名 | 2 天 | 模拟厂商完成全流程 |
| T6-5 | 华为 Health Kit 申请（负责人）+ 适配器 + 数据订阅 | T6-4、华为审核 | 2.5 天 | 华为手表跑步记录自动生成打卡 |
| T6-6 | 佳明申请（负责人）+ 适配器 + 分类型 webhook + Backfill 补拉 | T6-4、佳明审核 | 2.5 天 | 佳明新活动 10 分钟内入库；历史 30 天可补拉 |
| T6-7 | 归一化与防双计（手动打卡 vs 设备数据去重退分） | T6-5/6 | 1 天 | 重叠时段不重复计分 |
| T6-8 | bind-app 页重做（三态 + 预约登记 + 分厂商开关） | T6-4 | 1 天 | 假绑定代码全部删除 |
| T6-9 | 小米开放平台申请（负责人，企业入驻+数据权限）+ vendors/xiaomi.js 适配器 | T6-4、小米审核 | 2 天 | 小米手环运动记录自动生成打卡；审核被拒则走微信运动兜底 |
| T6-10 | 荣耀接入：老款确认走华为 Health Kit；荣耀开发者平台入驻 + 新款数据开放评估（视开放范围决定是否开发 vendors/honor.js） | T6-5 | 1 天（评估）+2 天（若开发） | 老款荣耀手表数据经华为链路入库；新款给出可/不可接结论 |

风险：① 厂商审核周期不可控（华为权限逐项审、佳明 1-2 周）→ 提前由负责人发起申请，与开发并行；② 蓝牙在部分安卓机型兼容性差 → 准备 3+ 真机回归清单；③ token 泄漏风险 → 加密存储 + 集合权限"仅云函数可读写" + 定期轮换密钥。

**Sources:**
- [微信开放文档 · 蓝牙 (Bluetooth)](https://developers.weixin.qq.com/miniprogram/dev/framework/device/bluetooth.html)
- [华为 Health Kit 服务介绍](https://developer.huawei.com/consumer/cn/hms/huaweihealth/) · [接入流程](https://developer.huawei.com/consumer/cn/doc/atomic-guides/health-application-access-as)
- [Garmin Connect Developer Program](https://developerportal.garmin.com/developer-programs/connect-developer-api) · [Health API](https://developer.garmin.com/gc-developer-program/health-api/) · [Activity API](https://developer.garmin.com/gc-developer-program/activity-api/) · [OAuth2 PKCE 规范](https://developerportal.garmin.com/sites/default/files/OAuth2PKCE_1.pdf) · [Access Request Form](https://www.garmin.com/en-US/forms/GarminConnectDeveloperAccess/)
- [小米开放平台](https://dev.mi.com/) · [小米健康云 SDK 文档](https://dev.mi.com/docs/micloud/health/android_sdk/)
- [荣耀开发者服务平台](https://developer.honor.com) · [荣耀 Fitness-Wear Kit](https://developer.honor.com/cn/kitdoc?kitId=11006&navigation=sdk)
- [Zepp Open Platform](https://dev.zepp.com/)
- 聚合服务：[Terra API](https://tryterra.co/integrations) · [Open Wearables](https://github.com/the-momentum/open-wearables) · [Polar AccessLink 解析](https://openwearables.io/blog/polar-api-training-hrv-nightly-recharge-data)
