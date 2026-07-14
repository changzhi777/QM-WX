# 和风天气 API 对接说明

> 青沐运动 QM-WX 项目 — 和风天气（QWeather）API 对接文档
> 最后更新：2026-07-14（V0.1.148）

---

## 1. 概述

后端 `stats.weather` action 调用和风天气 API，获取实时天气数据（温度/天气描述/湿度/体感/风向风速）+ 逆地理（经纬度→城市名），供前端"今日"tab 展示。

- **API Host**：`nf5b5vtkcp.re.qweatherapi.com`（开发者专属域名）
- **认证方式**：API KEY（header `X-QW-Api-Key`）
- **文档**：https://dev.qweather.com/docs/

> ⚠️ **本文件名 kebab-case 修正史（2026-07-14）**：原文档误写为 `QWEATHER-API.md`（PascalCase），违反 [`docs/CLAUDE.md`](CLAUDE.md) 的"文件名 kebab-case"规范，本次重命名为 `qweather-api.md` 并删除明文凭据。

---

## 2. 凭据

| 项 | 值 / 说明 |
|---|---|
| **凭据 ID** | `HE2203011255591652`（应用 IoTchange_API 在控制台申请的标识，非敏感） |
| **API KEY** | 通过后端 `.env` 注入（**严禁提交 git / 写进文档 / 进日志 / 进前端 bundle**），见 §3 |
| **API Host** | `nf5b5vtkcp.re.qweatherapi.com` |
| **应用名** | IoTchange_API |

> 🔴 **历史安全事件（2026-07-14）**：本凭据 KEY 曾因临时文档 `docs/QWEATHER-API.md` 明文写入工作区（虽然 `git status` 一直标记为未追踪 `??`）。本次该文件已删除 + 重命名为本 `qweather-api.md`，KEY 明文清空。
>
> **强烈建议**：立刻在 [和风控制台](https://console.qweather.com/setting) 轮换旧 API KEY，然后在生产 `.env` 部署新 KEY。轮换期间 `stats.weather` 会自动 fallback 到 stub（长沙晴 25°C），不影响主功能。

---

## 3. 环境变量

```bash
# apps/server/.env（不提交 git）
QWEATHER_KEY=<your-api-key-from-qweather-console>
QWEATHER_API_HOST=nf5b5vtkcp.re.qweatherapi.com
```

`apps/server/.env.example` 已有同名占位（提交到 git 的是占位，不是真实 KEY）。

---

## 4. API 调用

### 4.1 实时天气

```
GET https://{API_HOST}/v7/weather/now?location={lon},{lat}
Header: X-QW-Api-Key: {API_KEY}
```

**参数**：
- `location`：经度,纬度（如 `112.94,28.23`）

**返回**（Gzip 压缩 JSON）：
```json
{
  "code": "200",
  "now": {
    "temp": "37",
    "feelsLike": "39",
    "icon": "101",
    "text": "多云",
    "humidity": "45",
    "windDir": "西南风",
    "windScale": "5",
    "windSpeed": "33"
  }
}
```

### 4.2 逆地理（城市查询）

```
GET https://{API_HOST}/geo/v2/city/lookup?location={lon},{lat}
Header: X-QW-Api-Key: {API_KEY}
```

**返回**：
```json
{
  "code": "200",
  "location": [{
    "name": "岳麓",
    "adm2": "长沙",
    "adm1": "湖南省",
    "country": "中国"
  }]
}
```

> 城市名取 `adm2`（如"长沙"），而非 `name`（如"岳麓"）。

---

## 5. 后端实现

### 文件：`apps/server/src/modules/stats/stats.service.ts`

```typescript
async weather(userId: string, input?: { lat?: number; lon?: number }) {
  const key = env.QWEATHER_KEY;
  const lat = input?.lat ?? 28.23;   // 默认长沙
  const lon = input?.lon ?? 112.94;
  const location = `${lon.toFixed(2)},${lat.toFixed(2)}`;

  if (!key) {
    // stub 兜底（无 key 返固定天气）
    return { city: '长沙', text: '晴', temperature: 25, ... };
  }

  const apiHost = env.QWEATHER_API_HOST;
  const headers = { 'X-QW-Api-Key': key };
  const [cityRes, weatherRes] = await Promise.all([
    fetch(`https://${apiHost}/geo/v2/city/lookup?location=${location}`, { headers }),
    fetch(`https://${apiHost}/v7/weather/now?location=${location}`, { headers }),
  ]);
  // 解析 → 返 { city, text, temperature, feelsLike, humidity, icon, updatedAt }
}
```

### 前端调用

```typescript
// pages/index/index.ts — 今日 tab
api.call('stats', 'weather', { lat: this.data.latitude, lon: this.data.longitude })
```

前端通过 `wx.getLocation` 获取用户经纬度，传给后端。未授权定位时用默认长沙。

---

## 6. 默认值

| 项 | 默认值 | 说明 |
|---|---|---|
| 经纬度 | 28.23, 112.94 | 长沙 |
| stub 城市 | 长沙 | 无 API KEY 时 |
| stub 天气 | 晴 25°C | 无 API KEY 时 |

---

## 7. 注意事项

1. **Gzip**：和风 API 默认 Gzip 压缩。Node.js `fetch` 自动解压（`Accept-Encoding`）。
2. **公共 API 废弃**：`devapi.qweather.com` / `geoapi.qweather.com` 2026 起逐步停用，必须用 API Host。
3. **JWT 方式**：和风也支持 JWT（Ed25519 签名），但 API KEY 方式更简单（一行 header），推荐用 API KEY。
4. **缓存**：天气数据变化慢，可加 Cache 300s（当前未加，YAGNI）。
5. **额度**：和风免费版每日 1000 次。当前按用户请求（进 tab 拉 1 次），足够。
6. **凭据安全**：API KEY 严禁写入文档 / git / 日志 / 前端 bundle。仅 `.env` 注入。

---

## 8. 验证

```bash
# 用 .env 里的 KEY 测（替换 <YOUR_KEY>）
curl -s --compressed \
  -H "X-QW-Api-Key: <YOUR_KEY>" \
  "https://nf5b5vtkcp.re.qweatherapi.com/v7/weather/now?location=112.94,28.23"
```

预期返回长沙实时天气 JSON（`code=200`，`now.temp` 等字段）。

> V0.1.148 单测覆盖：见 `apps/server/src/modules/stats/stats.service.test.ts::weather`。前端联调：在"今日"tab 看页面渲染的城市 + 温度 + 天气图标。

---

## 9. 参考链接

- [和风天气开发文档](https://dev.qweather.com/docs/)
- [API Host 说明](https://dev.qweather.com/docs/configuration/api-host/)
- [API 配置（认证方式）](https://dev.qweather.com/docs/configuration/api-config/)
- [实时天气 API](https://dev.qweather.com/docs/api/weather/weather-now/)
- [城市查询 API](https://dev.qweather.com/docs/api/geolocation/city-lookup/)
- [控制台](https://console.qweather.com/setting)
