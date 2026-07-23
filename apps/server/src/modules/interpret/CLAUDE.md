# interpret module — AI 资料解读

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../../../CLAUDE.md) → [`apps/server/`](../../../CLAUDE.md) → [`modules/`](../) → **interpret/**（这里）
> 父级：[apps/server CLAUDE.md](../../../CLAUDE.md) | 同级：[ai-coach](../ai-coach/)（LLM 范式参考）/ [device](../device/)（fit-file-parser 复用）/ [admin](../admin/)（listInterpret 管理）

> 引入版本：**V0.2.33**（2026-07-18，阶段 1 MVP 后端核心）/ V0.2.34 前端 / V0.2.37 admin
> 状态：阶段 1-3 + V0.2.57 screenshot 多模态识图（GLM-4.6V + 数据联动闭环）+ V0.2.60 P1 加固（用户确认 checkin + 去重 + 限流）+ V0.2.63 H5 fallback + V0.2.65-66 mp 提审 API；阶段 4 真机验证待 minimax/LLM key 注入

---

## 🎯 模块职责

**AI 资料解读**：用户上传健康/运动资料（佳明 FIT / 病历图片 / 运动截图）→ MiniMax M3（Anthropic 兼容协议）解读 → 落 InterpretRecord → 前端展示 + admin 管理。

**架构选型**（C-子集，非 qm-rhythmind 转发）：qm-rhythmind 是 Python 多智能体（AG2），**语言不通不能直接转发**；本模块用 **TS 重写解读核心**（单 agent + minimax，放弃 AG2 多智能体协作），qm-rhythmind 生产（aisport.tech/qm）继续独立跑。

---

## 🚪 入口与启动

| 文件 | 职责 | 行数 |
| --- | --- | ---: |
| `client.ts` | MiniMax M3 Provider（Anthropic 兼容 `/v1/messages`，x-api-key + 原生 fetch）+ **V0.2.57 GLM-4.6V Provider（OpenAI vision 协议，Bearer + ContentPart[] + response_format）** + **V0.2.60 callGlm 文本版（不传图省 ~50% token）** | ~110 |
| `service.ts` | 佳明 FIT parseAsync → minimax 解读 → 落 InterpretRecord + **V0.2.57 interpretScreenshot（GLM-4.6V 识图 → checkin → 13 路画像联动 → 落 InterpretRecord type=screenshot）** + **V0.2.60 confirmScreenshotCheckin（用户确认打卡 + 去重 + 日期对齐）** | ~140 |
| `routes.ts` | `POST /api/interpret`（bodyLimit 10MB，JWT，action switch）+ **V0.2.63 +issueH5Token/verifyH5Token/H5 token routes + /api/interpret/h5（token 鉴权 multipart→COS→interpretScreenshot）** + **V0.2.65-66 路由分发保留 admin 提审端点** | ~70 |

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
| `screenshotCheckin` | `{ recordId }` | `{ checkinCreated }` | ✅ **V0.2.60** 用户确认打卡（前端识别卡+确认按钮，防误识别污染跑量） |
| `issueH5Token` | `{ userId }` | `{ token, expiresIn }` | ✅ **V0.2.63** H5 fallback token（小程序上传失败引导浏览器重试） |
| `myInterpretHistory` | `{ page?, pageSize? }` | `{ items, total }` | ✅ **V0.2.63** 历史解读回看 |

- `fileBase64`：FIT 文件 base64（不含 data: 前缀）
- `inputKey`：COS object key 留痕（MVP 用文件名）
- **bodyLimit 10MB**（V0.2.35）：FIT base64 可能超 Fastify 默认 1MB
- 未配 `MINIMAX_API_KEY` → `Errors.featureDisabled`（503）
- 未配 `LLM_API_KEY` / `LLM_VISION_MODEL` → screenshot action 503

### H5 fallback `POST /api/interpret/h5`（V0.2.63，token 鉴权）

body multipart/form-data：
- `token`：5min Redis token
- `file`：截图二进制（jpeg/png）

→ `interpretScreenshot` 流程 + 落 InterpretRecord。

### admin 端 `POST /api/admin` action `listInterpret`（V0.2.37）+ `getMpCategory/uploadMpMedia/submitMpAudit`（V0.2.65-66）

`{ userId?, type?, page, pageSize }` → `{ list, total, page, pageSize }`（admin/operator/super-admin 只读，RBAC 在 OPERATOR_ACTIONS）。

---

## 🤖 双 Provider 范式（V0.2.57 起）

**Anthropic 兼容协议**（非 OpenAI、非 minimax 原生 — V0.2.33）：
- endpoint：`POST {MINIMAX_BASE_URL}/v1/messages`（默认 `https://api.minimaxi.com/anthropic` 国内官方）
- header：`x-api-key: {MINIMAX_API_KEY}` + `anthropic-version: 2023-06-01`（**非 Bearer**）
- body：`{ model: 'MiniMax-M3', max_tokens, system, messages: [{role, content}] }`
- 响应：`{ content: [{type:'text', text}], usage: {input_tokens, output_tokens} }`

**OpenAI vision 协议**（V0.2.57 新增 — GLM-4.6V）：
- endpoint：`POST {LLM_BASE_URL}/chat/completions`
- header：`Authorization: Bearer {LLM_API_KEY}`
- body：`{ model: 'glm-4.6v', messages: [{role, content: [{type:'text', text}, {type:'image_url', image_url:{url}}]}], response_format: {type:'json_object'} }`

**实现**：原生 fetch（复用 ai-coach glm.ts 范式），**不依赖 anthropic / openai SDK**。MVP 非 streaming（后续加 SSE）。

⚠️ **key 归属存疑**：`sk-cp-` 前缀不像 minimax 官方格式（更像代理）。真机调官方若 401 → 切代理 base URL（env.ts MINIMAX_BASE_URL 可改）。

**双 provider 分工**：FIT 文本走 minimax（Anthropic 协议）/ **截图走 GLM-4.6V**（OpenAI vision 协议，复用 ai-coach V0.2.45 + food.recognize 范式）；minimax 不确定支持 vision，截图确定用 GLM-4.6V。routes 按 action 分开关 isMinimaxConfigured / isGlmVisionConfigured 守卫。

**V0.2.60 token 优化**：第二次 GLM 分析改纯文本调用（不重传 image_url），省 ~50% token。

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

### V0.2.57 interpretScreenshot 闭环

```
GLM-4.6V 识图（imageUrl + response_format:json_object）
  → 结构化 JSON：type/distanceKm/durationSec/heartRate/paceSecPerKm/calorie/metrics/summary
  → distanceKm > 0 → sportService.checkin({dataSource:'sport_screenshot'})
  → buildUserContext（context-builder 13 路画像：跑量/目标/跑鞋/计划/心率/睡眠/体成分/天气/饮食/力量）
  → GLM-4.6V 第二次分析（纯文本 + 画像 + 原图）
  → 落 InterpretRecord type=screenshot
```

checkin 失败 try/catch 不阻塞解读；type=other（如步数截图）不 checkin。

### V0.2.60 confirmScreenshotCheckin 用户确认

前端识别卡 + 确认按钮（防误识别污染跑量）：
```
POST /api/interpret { action:'screenshotCheckin', payload:{ recordId } }
  → 查 InterpretRecord.extract
  → Checkin findFirst({ userId, date, distance, dataSource:'sport_screenshot' }) 重复拒
  → sportService.checkin({ dataSource:'sport_screenshot', checkinConfirmedAt:now })
  → InterpretRecord.checkinConfirmedAt = now
```

去重逻辑：同 userId + date + distance + dataSource 拒重复。

---

## 🗃️ 数据模型

**InterpretRecord**（V0.2.33 新表 #62，迁移 `20260718000000_interpret_record` + **V0.2.60 P1 加固迁移 `20260721000000_interpret_screenshot_p1`**）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | String @id cuid | |
| userId | String | FK User |
| type | String | `garmin_fit` / `garmin_zip` / `medical` / `screenshot` |
| inputKey | String | COS object key（留痕） |
| result | String @db.Text | minimax / GLM 解读文本 |
| **extract** | **Json?** | **V0.2.60 P1** screenshot 识图结构化 JSON（type/distanceKm/...），供 screenshotCheckin 查重用 |
| model | String | 模型名（MiniMax-M3 / glm-4.6v） |
| inputTokens | Int? | 输入 token |
| outputTokens | Int? | 输出 token |
| cost | Float? | 估算费用（🚧 后续按 minimax 定价算） |
| **checkinConfirmedAt** | **DateTime?** | **V0.2.60 P1** 用户确认打卡时间（未确认 = null） |
| createdAt | DateTime | |

索引：`[userId, createdAt]` + `[type]`。onDelete Cascade。

---

## 🧪 测试（45 测，V0.2.33+36+57+60+63+66）

| 文件 | 测数 | 覆盖 |
| --- | ---: | --- |
| `client.test.ts` | 14 | Anthropic 协议 / 401 / 多 block / fetch reject / empty / max_tokens / usage 缺失 + **V0.2.57 GLM-4.6V vision（isGlmVisionConfigured / Bearer+ContentPart[] / 未配抛 / 非2xx 抛）** + V0.2.60 第二次分析 callGlm 文本 + 限流 30/分 |
| `service.test.ts` | 15 | FIT happy / 无数据 / minimax 失败 / records fallback / parseAsync throw + **V0.2.57 interpretScreenshot（happy 识图+checkin+联动+落表 / type=other 不 checkin / checkin 失败不阻塞 / GLM 失败传播）** + V0.2.60 screenshotCheckin 确认打卡 4 测（去重 + 日期对齐 + 用户确认）+ V0.2.63 H5 token verify |
| `routes.test.ts` | 16 | 401 / 503 / fileBase64 缺 / inputKey 缺 / unknown / happy / bodyLimit + **V0.2.57 screenshot（GLM 未配 503 / imageUrl 缺 400 / inputKey 缺 400 / happy 透传）** + V0.2.60 screenshotCheckin routes 分支 + V0.2.63 H5 routes（issueH5Token / verifyH5Token / h5/checkin） + V0.2.66 mp-audit super-admin 守卫 |

**累计 45 测**（V0.2.33 13 + V0.2.36 +7 = 20 → V0.2.57 +12 = 32 → V0.2.60 +8 = 40 → V0.2.63 +3 + V0.2.66 +2 ≈ 45，含跨版本累加 + 调整）

**未覆盖**（P2 前置缺）：真 FIT 文件解析（待真 .fit 样本，字段名已对齐 importCorosFit 佐证）/ streaming（MVP 未实现）/ H5 fallback 完整流程（前端 e2e 覆盖）。

---

## ⚙️ env 配置

```env
# V0.2.33 资料解读（MiniMax M3 Anthropic 兼容）
MINIMAX_API_KEY=sk-cp-...          # 缺省 routes 返 featureDisabled(503)
MINIMAX_BASE_URL=https://api.minimaxi.com/anthropic  # 国内官方（国际 api.minimax.io）
MINIMAX_MODEL=MiniMax-M3

# V0.2.57 GLM-4.6V 多模态识图（与 ai-coach V0.2.45 + food.recognize 共享）
LLM_API_KEY=...
LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
LLM_VISION_MODEL=glm-4.6v
```

---

## 🔗 集成点

- **被调用方**：小程序 `pages/interpret`（chooseMessageFile → base64 → POST /api/interpret）+ **V0.2.60 识别卡 + 确认按钮** + **V0.2.63 失败引导 H5**
- **admin**：`admin.service.listInterpret`（V0.2.37）+ qm-admin Web `pages/Interpret.tsx`
- **复用**：`fit-file-parser`（V0.1.128 COROS 已装）/ `Errors.featureDisabled` / ai-coach glm.ts fetch 范式 / **V0.2.57 buildUserContext**（context-builder export 13 路画像）/ **V0.2.57 sportService.checkin**（dataSource='sport_screenshot'，与 device-parser.registry 一致数据源，无循环依赖——context-builder 只依赖 prisma+Cache）
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
9. **V0.2.60 用户确认 checkin**：识别卡 + 确认按钮防误识别污染跑量；去重（同 userId+date+distance+dataSource）+ checkinConfirmedAt 时间戳。
10. **V0.2.60 token 优化**：第二次 GLM 分析改纯文本调用（不重传 image_url），省 ~50% token。
11. **V0.2.63 H5 fallback**：小程序截图上传失败 → 引导 H5（@fastify/static 路由 + Redis 5min token + verifyH5Token 鉴权 + myInterpretHistory 历史回看）。
12. **V0.2.65-66 mp 提审**：admin `getMpCategory/uploadMpMedia/submitMpAudit` SUPER_ONLY，infra/wx-token.ts getMpAccessToken cgi-bin/token Redis 7000s 缓存。

---

## 📝 变更记录 (Changelog)

- **2026-07-18** — 🎯 **V0.2.33 创建（阶段 1 MVP 后端核心）**：minimax client（Anthropic 兼容）+ service（佳明 FIT parseAsync → minimax → 落 InterpretRecord #62）+ routes（POST /api/interpret，JWT）+ env MINIMAX_* + ENDPOINTS.interpret（34→35 module）+ 13 测
- **2026-07-18** — 🎯 **V0.2.34 阶段 2 前端**：小程序 pages/interpret（chooseMessageFile → base64 → POST → 展示）
- **2026-07-18** — 🎯 **V0.2.35 审查优化**：routes bodyLimit 10MB（防大 FIT base64 超 1MB → 413）
- **2026-07-18** — 🎯 **V0.2.36 测试加固**：+7 测（client fetch reject/empty content/max_tokens/usage + service records fallback/parseAsync throw + routes bodyLimit）→ 20 测
- **2026-07-18** — 🎯 **V0.2.37 admin 管理**：admin listInterpret action + RBAC（OPERATOR_ACTIONS）+ qm-admin Web Interpret.tsx（跨仓）
- **2026-07-21** — 🎯 **V0.2.57 screenshot 多模态识图闭环**：interpret `screenshot` action 全栈实现（阶段 5 stub 补全）—— `client.ts` +`callGlmVision`（GLM-4.6V OpenAI vision 协议，Bearer + ContentPart[] + response_format）+ `isGlmVisionConfigured`；`service.ts` +`interpretScreenshot`（① GLM-4.6V 识图提结构化 JSON ② distanceKm>0 → sportService.checkin dataSource='sport_screenshot' ③ buildUserContext 联动 13 路画像 ④ GLM 综合分析 ⑤ 落 InterpretRecord type=screenshot）；`routes.ts` switch +screenshot case（按 action 分开关 minimax/GLM 守卫）；context-builder export buildUserContext；ENDPOINTS +interpret.screenshot；前端 pages/interpret +📷 截图入口（chooseMedia→uploadFile COS→POST→展示 + 已打卡提示）；**+12 测**（client+4 / service+4 / routes+4）→ interpret 20→32 测；0 新表/迁移（InterpretRecord 字段够）；复用 GLM-4.6V（food.recognize 范式）+ context-builder 13 路联动 + parseSportScore/checkin（device pipeline 一致）；与 device sport_screenshot OCR pipeline 互补（同步交互式 vs 异步批量）
- **2026-07-21** — 🎯 **V0.2.60 screenshot P1 加固（6 项 P1 全修）**：审查 13 项 → 修 6 P1：P1.1 第二次分析改 `callGlm` 文本（不重传图省 ~50% token）/ **P1.2 自动 checkin → 用户确认**（service 重构 `interpretScreenshot` 不 auto checkin + 新 `confirmScreenshotCheckin` 查 record.extract + 去重 + checkin + 标 checkinConfirmedAt，前端识别卡+确认按钮防误识别污染跑量）/ P1.3 EXTRACT_PROMPT +date 字段 / P1.4 去重（同 userId+date+distance+dataSource='sport_screenshot' 拒）/ P1.5 routes 限流 30/分 / P1.6 前端隐私提示；**1 迁移** InterpretRecord +extract Json? +checkinConfirmedAt DateTime?（20260721000000）/ +8 测（32→40）/ 0 回归 / 生产部署 49 migrations up to date
- **2026-07-21** — 🎯 **V0.2.63-66 H5 fallback + 提审 API**：① **V0.2.63** interpret +issueH5Token/verifyH5Token（Redis 5min token）+ myInterpretHistory + routes `/api/interpret/h5`（token 鉴权 multipart→COS→interpretScreenshot）+ `/h5/checkin` + `myInterpretHistory`（历史回看）+ @fastify/static `/h5/`（interpret.html 单页）+ 小程序失败引导（剪贴板）→ **+3 测**（40→43）；② **V0.2.64** auth.ts URL 前缀跳过 /h5/ + /uploads/（@fastify/static 路由 401 修复）；③ **V0.2.65-66** infra/wx-token.ts getMpAccessToken（cgi-bin/token Redis 7000s）+ admin getMpCategory/uploadMpMedia/submitMpAudit（mp API 转发，SUPER_ONLY 独占发布）→ **+2 测**（43→45）；interpret 累计 45 测 / **0 迁移**（InterpretRecord V0.2.60 字段够）/ typecheck exit 0 / admin 89 测无回归 / 生产 `/h5/` 200 + `/api/interpret/h5` 401 + server healthy
- **2026-07-23** — 🎯 **`/zcf:init-project` 增量校准 #19（V0.2.79 收官）**：本文件 changelog 顶部补 V0.2.60-66 共 3 段；测试段从「32 测」改为「45 测」并按 client/service/routes 分列详细覆盖；新增 `screenshotCheckin` / `issueH5Token` / `myInterpretHistory` 三个 user 端 action 文档；新增 H5 fallback 路由 + admin 提审端点段；新增 P1 加固与 H5 fallback 范式点 9-12；**0 代码改动纯文档增量**