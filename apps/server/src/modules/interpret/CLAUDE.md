# interpret module — AI 资料解读

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../../../CLAUDE.md) → [`apps/server/`](../../../CLAUDE.md) → [`modules/`](../) → **interpret/**（这里）
> 父级：[apps/server CLAUDE.md](../../../CLAUDE.md) | 同级：[ai-coach](../ai-coach/)（LLM 范式参考）/ [device](../device/)（fit-file-parser 复用）/ [admin](../admin/)（listInterpret 管理）

> 引入版本：**V0.2.33**（2026-07-18，阶段 1 MVP 后端核心）/ V0.2.34 前端 / V0.2.37 admin
> 状态：阶段 1-3 完成 + **V0.2.57 screenshot 多模态识图**（GLM-4.6V + 数据联动闭环）；阶段 4 真机验证待 minimax/LLM key 注入

---

## 🎯 模块职责

**AI 资料解读**：用户上传健康/运动资料（佳明 FIT / 病历图片 / 运动截图）→ MiniMax M3（Anthropic 兼容协议）解读 → 落 InterpretRecord → 前端展示 + admin 管理。

**架构选型**（C-子集，非 qm-rhythmind 转发）：qm-rhythmind 是 Python 多智能体（AG2），**语言不通不能直接转发**；本模块用 **TS 重写解读核心**（单 agent + minimax，放弃 AG2 多智能体协作），qm-rhythmind 生产（aisport.tech/qm）继续独立跑。

---

## 🚪 入口与启动

| 文件 | 职责 | 行数 |
| --- | --- | ---: |
| `client.ts` | MiniMax M3 Provider（Anthropic 兼容 `/v1/messages`，x-api-key + 原生 fetch） | ~75 |
| `service.ts` | 佳明 FIT parseAsync → minimax 解读 → 落 InterpretRecord | ~85 |
| `routes.ts` | `POST /api/interpret`（bodyLimit 10MB，JWT，action switch） | ~35 |

注册：`src/app.ts` `app.register(interpretRoutes, { prefix: '/api/interpret' })`

---

## 📡 对外接口

### 用户端 `POST /api/interpret`（JWT）

body `{ action, payload }`：

| action | payload | 返回 | 说明 |
| --- | --- | --- | --- |
| `garmin` | `{ fileBase64, inputKey }` | `{ interpretation, recordId }` | 佳明 FIT 解读（V0.2.33） |
| `medical` | — | — | 🚧 阶段 5（病历图片 OCR+解读） |
| `screenshot` | `{ imageUrl, inputKey }` | `{ interpretation, recordId, checkinCreated }` | ✅ **V0.2.57** GLM-4.6V 识图 → checkin → 联动画像 → AI 综合分析 |

- `fileBase64`：FIT 文件 base64（不含 data: 前缀）
- `inputKey`：COS object key 留痕（MVP 用文件名）
- **bodyLimit 10MB**（V0.2.35）：FIT base64 可能超 Fastify 默认 1MB
- 未配 `MINIMAX_API_KEY` → `Errors.featureDisabled`（503）

### admin 端 `POST /api/admin` action `listInterpret`（V0.2.37）

`{ userId?, type?, page, pageSize }` → `{ list, total, page, pageSize }`（admin/operator/super-admin 只读，RBAC 在 OPERATOR_ACTIONS）

---

## 🤖 MiniMax M3 Provider（client.ts）

**Anthropic 兼容协议**（非 OpenAI、非 minimax 原生）：
- endpoint：`POST {MINIMAX_BASE_URL}/v1/messages`（默认 `https://api.minimaxi.com/anthropic` 国内官方）
- header：`x-api-key: {MINIMAX_API_KEY}` + `anthropic-version: 2023-06-01`（**非 Bearer**）
- body：`{ model: 'MiniMax-M3', max_tokens, system, messages: [{role, content}] }`
- 响应：`{ content: [{type:'text', text}], usage: {input_tokens, output_tokens} }`

**实现**：原生 fetch（复用 ai-coach glm.ts 范式），**不依赖 anthropic SDK**。MVP 非 streaming（后续加 SSE）。

⚠️ **key 归属存疑**：`sk-cp-` 前缀不像 minimax 官方格式（更像代理）。真机调官方若 401 → 切代理 base URL（env.ts MINIMAX_BASE_URL 可改）。

---

## 🔧 service.ts 关键范式

### 佳明 FIT 解析（parseFitSummary）

- `FitParser({ force: true, mode: 'list' })` + `parseAsync(buffer as ArrayBuffer)`（**async 版本**，非 callback）
- 字段名对齐 `device.service.importCorosFit`（fit-file-parser 实际输出）：`session.total_distance`（米）/ `total_elapsed_time` / `total_timer_time`（秒）/ `avg_heart_rate`
- sessions 优先，空则 records fallback（聚合 distance/elapsed_time）
- `samples.slice(-20)` 截断防爆 minimax context
- 单位转换：米→km / 秒→min

### GARMIN_SYSTEM_PROMPT

单 agent prompt（数据概况 + 训练负荷评估 + 2-3 条可执行建议，500 字内）。**简化版**（qm-rhythmind 多 agent 协作的 TS 单 agent 替代）。

---

## 🗃️ 数据模型

**InterpretRecord**（V0.2.33 新表 #62，迁移 `20260718000000_interpret_record`）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | String @id cuid | |
| userId | String | FK User |
| type | String | `garmin_fit` / `garmin_zip` / `medical` / `screenshot` |
| inputKey | String | COS object key（留痕） |
| result | String @db.Text | minimax 解读文本 |
| model | String | 模型名（MiniMax-M3） |
| inputTokens | Int? | 输入 token |
| outputTokens | Int? | 输出 token |
| cost | Float? | 估算费用（🚧 后续按 minimax 定价算） |
| createdAt | DateTime | |

索引：`[userId, createdAt]` + `[type]`。onDelete Cascade。

---

## 🧪 测试（32 测，V0.2.33+36+57）

| 文件 | 用例 | 覆盖 |
| --- | ---: | --- |
| `client.test.ts` | 12 | Anthropic 协议 / 401 / 多 block / fetch reject / empty / max_tokens / usage 缺失 + **V0.2.57 GLM-4.6V vision（isGlmVisionConfigured / Bearer+ContentPart[] / 未配抛 / 非2xx 抛）** |
| `service.test.ts` | 9 | FIT happy / 无数据 / minimax 失败 / records fallback / parseAsync throw + **V0.2.57 interpretScreenshot（happy 识图+checkin+联动+落表 / type=other 不 checkin / checkin 失败不阻塞 / GLM 失败传播）** |
| `routes.test.ts` | 11 | 401 / 503 / fileBase64 缺 / inputKey 缺 / unknown / happy / bodyLimit + **V0.2.57 screenshot（GLM 未配 503 / imageUrl 缺 400 / inputKey 缺 400 / happy 透传）** |

**未覆盖**（P2 前置缺）：真 FIT 文件解析（待真 .fit 样本，字段名已对齐 importCorosFit 佐证）/ streaming（MVP 未实现）。

---

## ⚙️ env 配置

```env
MINIMAX_API_KEY=sk-cp-...          # 缺省 routes 返 featureDisabled(503)
MINIMAX_BASE_URL=https://api.minimaxi.com/anthropic  # 国内官方（国际 api.minimax.io）
MINIMAX_MODEL=MiniMax-M3
```

---

## 🔗 集成点

- **被调用方**：小程序 `pages/interpret`（chooseMessageFile → base64 → POST /api/interpret）
- **admin**：`admin.service.listInterpret`（V0.2.37）+ qm-admin Web `pages/Interpret.tsx`
- **复用**：`fit-file-parser`（V0.1.128 COROS 已装）/ `Errors.featureDisabled` / ai-coach glm.ts fetch 范式
- **不调**：qm-rhythmind（C-子集独立实现，qm-rhythmind 生产独立跑）

---

## 📌 关键范式与坑

1. **Anthropic 协议 ≠ OpenAI 协议**：x-api-key（非 Bearer）+ `/v1/messages`（非 /chat/completions）+ `{content:[{text}], usage:{input_tokens}}`（非 choices）。写 client 时易混，测试强制断言 header/url。
2. **FitParser.parseAsync 是 async**（await，非 callback parse）—— importCorosFit 已佐证，别用老 callback 范式。
3. **bodyLimit 10MB**（V0.2.35）：FIT base64 比 binary 大 33%，超 Fastify 默认 1MB → 413。route option `{ bodyLimit: 10*1024*1024 }`。
4. **C-子集 vs qm-rhythmind**：本模块是 TS 独立实现，**不调 qm-rhythmind API**。qm-rhythmind（Python AG2 多智能体）生产继续跑，两套并行（不同定位：qm-rhythmind 深度多 agent / 本模块轻量单 agent）。
5. **key 归属**：sk-cp- 疑似代理，真机 401 切 base URL（env 可改，不硬编码）。
6. **V0.2.57 双 provider 分工**：FIT 文本走 minimax（Anthropic 协议）/ **截图走 GLM-4.6V**（OpenAI vision 协议，复用 ai-coach V0.2.45 + food.recognize 范式）；minimax 不确定支持 vision，截图确定用 GLM-4.6V。routes 按 action 分开关 isMinimaxConfigured / isGlmVisionConfigured 守卫。
7. **V0.2.57 数据联动复用**：`buildUserContext` 从 ai-coach/context-builder **export**（13 路全量画像：跑量/目标/跑鞋/计划/心率/睡眠/体成分/天气/饮食/力量），interpretScreenshot 第二次 GLM 注入画像做综合分析；checkin 复用 `sportService.checkin`（`dataSource='sport_screenshot'`，与 device-parser.registry 一致数据源，无循环依赖——context-builder 只依赖 prisma+Cache）。
8. **V0.2.57 两调 GLM**：第一次 `response_format:json_object` 识图提结构化数据（type/distanceKm/durationSec/heartRate/paceSecPerKm/calorie/metrics/summary）→ 决定是否 checkin；第二次纯文本综合分析（截图数据 + 画像 + 原图）。两次 token 累加落 InterpretRecord。checkin 失败 try/catch 不阻塞解读。

---

## 📝 变更记录 (Changelog)

- **2026-07-18** — 🎯 **V0.2.33 创建（阶段 1 MVP 后端核心）**：minimax client（Anthropic 兼容）+ service（佳明 FIT parseAsync → minimax → 落 InterpretRecord #62）+ routes（POST /api/interpret，JWT）+ env MINIMAX_* + ENDPOINTS.interpret（34→35 module）+ 13 测
- **2026-07-18** — 🎯 **V0.2.34 阶段 2 前端**：小程序 pages/interpret（chooseMessageFile → base64 → POST → 展示）
- **2026-07-18** — 🎯 **V0.2.35 审查优化**：routes bodyLimit 10MB（防大 FIT base64 超 1MB → 413）
- **2026-07-18** — 🎯 **V0.2.36 测试加固**：+7 测（client fetch reject/empty content/max_tokens/usage + service records fallback/parseAsync throw + routes bodyLimit）→ 20 测
- **2026-07-18** — 🎯 **V0.2.37 admin 管理**：admin listInterpret action + RBAC（OPERATOR_ACTIONS）+ qm-admin Web Interpret.tsx（跨仓）
- **2026-07-21** — 🎯 **V0.2.57 screenshot 多模态识图闭环**：interpret `screenshot` action 全栈实现（阶段 5 stub 补全）—— `client.ts` +`callGlmVision`（GLM-4.6V OpenAI vision 协议，Bearer + ContentPart[] + response_format）+ `isGlmVisionConfigured`；`service.ts` +`interpretScreenshot`（① GLM-4.6V 识图提结构化 JSON ② distanceKm>0 → sportService.checkin dataSource='sport_screenshot' ③ buildUserContext 联动 13 路画像 ④ GLM 综合分析 ⑤ 落 InterpretRecord type=screenshot）；`routes.ts` switch +screenshot case（按 action 分开关 minimax/GLM 守卫）；context-builder export buildUserContext；ENDPOINTS +interpret.screenshot；前端 pages/interpret +📷 截图入口（chooseMedia→uploadFile COS→POST→展示 + 已打卡提示）；**+12 测**（client+4 / service+4 / routes+4）→ interpret 20→32 测；0 新表/迁移（InterpretRecord 字段够）；复用 GLM-4.6V（food.recognize 范式）+ context-builder 13 路联动 + parseSportScore/checkin（device pipeline 一致）；与 device sport_screenshot OCR pipeline 互补（同步交互式 vs 异步批量）
