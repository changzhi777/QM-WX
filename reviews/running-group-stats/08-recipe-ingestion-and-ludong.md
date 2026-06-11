# 08 菜谱数据接入采集方案 + 律动平台对接设计

> 项目：青沐生命科技微信小程序
> 前提（已确认）：律动平台 = 公司**内部运营/管理后台**，已有 HTTP API；对接为双向——小程序→律动（用户与运动数据、订单/积分），律动→小程序（内容下发），并做用户账号打通。
> 本文承接 07 文档（API 盘点），回答"数据怎么进来、怎么管、怎么和律动互通"。

---

## Part 1 菜谱数据接入采集综合分析

### 1.1 核心结论：不做"实时透传"，做"采集入库制"

第三方菜谱 API 按次计费、格式互不相同、随时可能停服。正确姿势是把它们当作**一次性/周期性的数据源**，采集进自己的库，小程序只读自己的库：

```
   数据源(可多个、可替换)                  我方数据资产                     消费端
┌─────────────────────┐      ┌──────────────────────────────┐
│ A 商用API(聚合/极速/天行)│──┐  │ recipes 集合(统一Schema)        │   小程序 food 模块
│ B 数据授权采购(成分表等) │──┼─►│ 采集→清洗→去重→转存图片→草稿     │──► 律动后台(审核/编辑)
│ C 运营人工录入(律动后台) │──┤  │ →人工审核→发布(status=on)       │   未来App/H5复用
│ D 用户UGC投稿(远期)     │──┘  └──────────────────────────────┘
└─────────────────────┘   ✘ E 爬虫(下厨房/豆果等)——侵权+反爬+审核风险，明确不做
```

四种来源对比与采用策略：

| 来源 | 成本 | 质量 | 版权 | 策略 |
|---|---|---|---|---|
| A 商用 API 批量采集 | 按次付费，万级数据约数百元 | 中，需清洗 | 按购买条款商用，留源标注 | **主力**：V2 一次性采集建库 + 每月增量 |
| B 数据授权采购 | 一次性数千~数万元 | 高（权威） | 清晰 | 营养成分表走这条（07 §3.4） |
| C 运营录入（律动后台） | 人力 | 最高（品牌调性） | 自有 | **精选内容**：跑者餐单等 30-50 篇自产 |
| D 用户投稿 | 低 | 不稳，需审核 | 用户授权协议 | 远期社区化再开 |

### 1.2 统一数据模型（recipes 集合）

所有来源归一到一个 Schema，消费端与来源解耦：

```js
{
  _id, title, coverFileID,                  // 图片一律转存云存储（防外链失效/盗链限制）
  category: 'breakfast|prerun|postrun|lowcal|homedish|...',  // 我方业务分类（非源分类）
  tags: ['高蛋白','补碳','减脂'],
  ingredients: [{ name:'鸡胸肉', amount:'200g', isMain:true }],
  steps: [{ order:1, text:'...', imageFileID }],
  nutrition: { calorie, protein, fat, carb, per:'100g'|'serving' } | null,  // 关联营养库
  durationMin, difficulty: 1-5, servings,
  source: { type:'api|licensed|editorial|ugc', vendor:'juhe', vendorId:'8512', license:'商用授权-留源' },
  audit: { status:'draft|reviewing|on|off', reviewer, reviewedAt },
  stats: { views, favorites },
  fingerprint,                              // 去重指纹（见1.3）
  createdAt, updatedAt
}
```

### 1.3 采集管道（ETL，云函数实现）

```
recipe-ingest 云函数（手动触发批量 / 定时增量）
 ① 拉取：按分类遍历源 API（限速 ≤2 req/s，断点续采：记录游标到 ingest_jobs）
 ② 映射：vendors/juhe-recipe.js 等适配器 → 统一 Schema（字段映射表见下）
 ③ 清洗：
    - 单位标准化（"适量/少许"保留原文；克/毫升统一）
    - 文本过滤：敏感词、医疗化表述（"治疗""降血压"→ 拦截人工处理）
    - 步骤完整性校验（无步骤/无主料的丢弃，记入 ingest_rejects）
 ④ 去重：fingerprint = sha1(normalize(title) + '|' + 主料排序拼接)
    命中已有 → 跳过或按 updatedAt 更新；跨源重复以先入库者为准
 ⑤ 图片转存：源图 URL 下载 → 压缩(≤300KB) → 云存储 → 替换为 fileID
 ⑥ 落库：audit.status = 'draft'
 ⑦ 审核发布：运营在律动后台改分类/标签/排版 → status='on' 后小程序可见
```

字段映射表（开发对照用，节选）：

| 统一字段 | 聚合数据 | 极速数据 | 天行 |
|---|---|---|---|
| title | title | name | cp_name |
| ingredients | yuanliao/tiaoliao | material[] | yuanliao |
| steps | zuofa(分步) | process[].pcontent | zuofa |
| coverFileID | albums[0] | pic | — |

### 1.4 运营与质量闭环
- **量级建议**：V2 首批采集 3000-5000 道（覆盖常见家常+运动餐分类即可，不求十万级——没人翻得完，审核也审不完）；精选 50 篇编辑内容置顶。
- **增量**：每月增量采集一次新分类；用户搜索无结果的关键词记录到 search_misses，作为下批采集清单（按需采集，最省钱）。
- **下线机制**：用户举报/审核抽查 → status='off'，保留数据可追溯。
- **合规**：详情页尾部固定"内容来源：XX数据，仅供参考，不构成医疗建议"。

---

## Part 2 律动平台对接设计

### 2.1 总体拓扑与原则

```
微信小程序 ──callFunction──► 云函数层（唯一对接点） ◄──HTTPS──► 律动平台 HTTP API
                              │  sync_outbox 出站队列(上报：用户/运动/订单/积分)
                              │  webhook 入站接收(下发：菜谱/内容/商品/活动)
                              │  id_mappings 账号映射(openid ↔ ludongUserId)
                              └  每日对账任务
```

原则：
1. **小程序永不直连律动**——所有交互经云函数，律动地址/密钥放云函数环境变量。
2. **双向都走事件 + 幂等**：每条数据带全局唯一 `eventId`，重发不重复入账（at-least-once 投递）。
3. **各自数据库为各自主权**：运动明细以小程序侧为准（source of truth），内容以律动侧为准，订单以小程序侧为准、律动只读镜像；**不做双写同一业务**，避免脑裂。

### 2.2 服务间认证（与律动后端约定）

- 传输：HTTPS；如律动在内网，经公司网关暴露专用域名 + IP 白名单（云函数出口 IP 段在云开发控制台可查）。
- 签名：HMAC-SHA256。请求头 `X-App-Id`、`X-Timestamp`、`X-Nonce`、`X-Signature = HMAC(secret, method+path+timestamp+nonce+sha256(body))`；时间窗 ±5 分钟防重放。双向调用各发一对 AppId/Secret。
- 敏感字段（手机号）传输前脱敏或字段级加密，按最小必要原则给。

### 2.3 账号打通（id_mappings）

```
绑定流程（一次性）：
小程序「我的→绑定律动账号」→ 输入手机号 → 律动 API 发短信验证码 → 校验通过
→ 律动返回 ludongUserId → 写 id_mappings { _openid, ludongUserId, boundAt }
→ 此后所有上报/下发都带双方 ID
未绑定用户：运动数据照常上报（只带 openid），律动侧建影子账号，待绑定后合并
```

### 2.4 接口清单（与律动后端对齐的契约草案）

**方向 A：小程序 → 律动（云函数出站，批量+实时结合）**

| 接口 | 触发 | 载荷要点 |
|---|---|---|
| POST /open/v1/users/upsert | 注册/资料变更（实时） | eventId, openid, ludongUserId?, profile 脱敏字段 |
| POST /open/v1/checkins/batch | 定时 5 分钟批量 | events[]：打卡/设备同步记录（distance、avgHr、source） |
| POST /open/v1/orders/sync | 订单状态变更（实时） | eventId, orderId, status, items, payAmount |
| POST /open/v1/points/sync | 积分流水（定时批量） | points_records 增量（游标=createdAt） |

**方向 B：律动 → 小程序（内容下发）**

| 接口 | 模式 | 说明 |
|---|---|---|
| POST <云函数HTTP触发>/webhook/ludong | 律动有变更即推 | type: recipe/content/product/banner + 数据体；验签后 upsert 到 recipes/contents/products，status 直接进 'on'（律动后台已审核） |
| GET /open/v1/contents/changes?cursor= | 每小时定时拉（兜底） | webhook 丢失时按 updatedAt 游标补拉，保证最终一致 |

> 菜谱采集管道（Part 1）与律动的关系：**采集入库后 audit 流转放在律动后台做**——律动加"菜谱审核"模块读写 recipes 集合（经方向 B 同样的 API 通道），运营在熟悉的后台完成审核/编辑/上下架，小程序侧零运营界面。

### 2.5 可靠性设计

- **出站队列 sync_outbox**：业务写库成功时同事务写一条 outbox 记录（pending）→ 定时函数批量投递 → 律动应答 200 + ackEventId 置 done；失败指数退避重试（1/5/30 分钟），超 24h 转 dead 并告警。**业务永不因律动宕机而失败**。
- **入站幂等**：webhook 按 eventId 查重表 inbound_events，处理过直接 200。
- **对账**：每日 03:00 双方交换前一日计数摘要（用户数/打卡数/订单数/积分净额），不一致触发明细比对任务并告警到企业微信。
- **监控**：outbox 积压量、webhook 失败率写入 app_config 可视化（律动后台展示）。

### 2.6 参考代码（云函数侧）

```js
// utils/ludong-client.js —— 出站签名客户端
const crypto = require('crypto')
async function callLudong(method, path, body) {
  const ts = Date.now().toString(), nonce = crypto.randomUUID()
  const bodyHash = crypto.createHash('sha256').update(JSON.stringify(body || {})).digest('hex')
  const sign = crypto.createHmac('sha256', process.env.LUDONG_SECRET)
    .update([method, path, ts, nonce, bodyHash].join('\n')).digest('hex')
  return axios({ method, url: process.env.LUDONG_BASE + path, data: body,
    headers: { 'X-App-Id': process.env.LUDONG_APPID, 'X-Timestamp': ts,
               'X-Nonce': nonce, 'X-Signature': sign }, timeout: 8000 })
}

// 云函数 sync-outbox（定时触发：每5分钟）
async function flushOutbox() {
  const batch = await db.collection('sync_outbox')
    .where({ status: 'pending', nextRetryAt: _.lte(Date.now()) })
    .orderBy('createdAt', 'asc').limit(50).get()
  for (const e of batch.data) {
    try {
      await callLudong('POST', e.path, { eventId: e._id, ...e.payload })
      await db.collection('sync_outbox').doc(e._id).update({ data: { status: 'done' } })
    } catch (err) {
      const retry = (e.retryCount || 0) + 1
      await db.collection('sync_outbox').doc(e._id).update({ data: {
        retryCount: retry, status: retry >= 6 ? 'dead' : 'pending',
        nextRetryAt: Date.now() + Math.min(retry * retry, 36) * 5 * 60e3, lastError: err.message
      }})
    }
  }
}

// 云函数 webhook-ludong（HTTP 触发）—— 内容下发接收
exports.main = async (event) => {
  const req = parseHttp(event)
  if (!verifyHmac(req)) return { statusCode: 401 }
  const { eventId, type, data } = JSON.parse(req.body)
  if (await seen(eventId)) return { statusCode: 200 }            // 幂等
  const handler = { recipe: upsertRecipe, content: upsertContent,
                    product: upsertProduct }[type]
  if (!handler) return { statusCode: 400 }
  await handler(data); await markSeen(eventId)
  return { statusCode: 200, body: JSON.stringify({ ack: eventId }) }
}
```

### 2.7 任务拆解（Phase 7）

| ID | 任务 | 前置 | 工作量 | 验收 |
|---|---|---|---|---|
| T8-1 | 与律动后端联合定稿 §2.4 接口契约 + 密钥交换 | 律动团队 | 1 天（会议+文档） | 双方签认契约文档 |
| T8-2 | ludong-client 签名客户端 + sync_outbox 队列 + 定时投递 | T8-1 | 2 天 | 律动停机 1 小时后恢复，数据零丢失自动补投 |
| T8-3 | webhook 接收 + 内容/菜谱/商品 upsert + 兜底拉取 | T8-1 | 1.5 天 | 律动改一篇菜谱，小程序 1 分钟内可见 |
| T8-4 | 账号绑定流程（手机号验证 + id_mappings + 影子账号合并） | T8-1 | 1.5 天 | 绑定后历史打卡在律动侧归到正确用户 |
| T8-5 | 菜谱采集管道（recipe-ingest + 三源适配器 + 去重清洗 + 图片转存） | 07 文档选型 | 3 天 | 首批 3000 道入库为 draft，重复率 <1% |
| T8-6 | 律动后台菜谱审核模块（律动团队开发，我方提供 API） | T8-3/5 | 律动侧 | 审核→发布→小程序可见全链路通 |
| T8-7 | 每日对账 + 积压告警 | T8-2 | 1 天 | 人为制造差异能在次日告警 |

风险：① 律动 API 变更无版本管理 → 契约文档 + /v1 路径版本化；② 手机号绑定涉及个人信息共享 → 隐私政策列明"与公司内部系统共享"，绑定页单独勾选同意；③ 采集图片转存量大 → 云存储费用预估（5000 道 ×2 图 ×300KB ≈ 3GB，费用可忽略）。
