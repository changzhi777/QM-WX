# boohee — 薄荷科学.AI 食物数据 module

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../CLAUDE.md) → [`apps/server/CLAUDE.md`](../../CLAUDE.md) → **apps/server/src/modules/boohee/**（这里）
>
> **第 37 个 module**（V0.3.35 新增，2026-07-29）/ GAP-12 37/37

---

## 🎯 职责

对接**薄荷科学.AI**（ai.boohee.com）食物数据开放 API，提供 **160 万+ 食物库**搜索 + 详情（含 **GI/GL/NRV/health_light**，营养维度远超 FatSecret）。

**核心价值**：薄荷详情接口的营养结构比 FatSecret 多出 **GI（血糖生成指数）/ GL（血糖负荷）/ NRV（营养素参考值）/ health_light（红绿灯）**，对糖尿病/减脂/健康饮食场景价值极高。

**与 food module 的关系**：
- food.module（FatSecret）**保留**为降级备选，互不干扰
- boohee.module 独立运行，feature flag `boohee` 控制开关
- 未来可加 provider 抽象层统一切换（FoodProvider interface）

---

## 📂 文件清单

| 文件 | 说明 |
| --- | --- |
| `boohee.client.ts` | HTTP 客户端（X-Api-Key + envelope 解包 + 10s timeout） |
| `boohee.service.ts` | 7 action 业务逻辑 + Cache.wrap 分级缓存 |
| `boohee.routes.ts` | Fastify action dispatch（POST /api/boohee） |
| `boohee.schema.ts` | Zod 输入校验（SearchSchema / DetailSchema 等） |

---

## 🚪 对外接口（7 action）

POST `/api/boohee` body `{ action, payload }`，需 JWT 鉴权。

| action | 接口 | Cache TTL | 说明 |
| --- | --- | --- | --- |
| search | GET /v1/food/search | 120s | 关键词搜索（keyword 1-30 + page/per_page/sort） |
| detail | GET /v1/food/detail | 300s | 详情（GI/GL/NRV/health_light，营养维度最丰富） |
| categories | GET /v1/food/categories | 3600s | 分类列表（极少变） |
| categoryFoods | GET /v1/food/category/foods | 300s | 分类下食物列表 |
| foodUnits | GET /v1/food/units | 3600s | 食物单位（克数换算） |
| batchNutrition | GET /v1/food/batch_nutrition | 300s | 批量营养（codes 排序后 join 做 cacheKey） |
| foodRanking | GET /v1/food/ranking | 600s | 排行榜 |

---

## 🔑 关键设计

### X-Api-Key 认证（非 OAuth2）

薄荷提供 2 种认证：
1. **X-Api-Key**（本 module 用）— header 直接带 Key，无需 token 管理
2. Bearer JWT — 需 RSA-SHA256 签名（app_id + timestamp + sign），复杂度高

选 X-Api-Key 因其**零 token 管理开销**，client.ts 极轻量（vs FatSecret OAuth2 client credentials + token 缓存刷新）。

### envelope 解包

```typescript
// 薄荷统一返回 { code, message, data }
// code === 0 → 返 data
// code !== 0 → 抛 Errors.badRequest(message)
const data = await booheeGet<T>(path, params);
```

### Cache.wrap 分级（与 stats/shoes V0.2.3 范式一致）

| 级别 | TTL | 场景 |
| --- | --- | --- |
| search | 120s | 高频变（用户搜索词多样） |
| detail / categoryFoods / batch | 300s | 中频（食物详情较稳定） |
| categories / foodUnits | 3600s | 低频（分类/单位极少变） |
| ranking | 600s | 中低频 |

### batchNutrition cacheKey 排序

`codes.slice().sort().join(',')` 做 cacheKey，防不同顺序同内容致缓存不命中（DRY 范式）。

---

## 📦 依赖与配置

**env**（`config/env.ts`）：
```bash
BOOHEE_API_KEY=sk-xxx          # 薄荷控制台创建的 X-Api-Key
BOOHEE_BASE_URL=https://api.boohee.com/open-apis  # 默认值
```

**feature flag**（`seed.ts DEFAULT_FEATURE_FLAGS`）：
```typescript
boohee: false,  // 默认关，部署后 admin 远程开启
```

**npm 依赖**：0 新增（原生 fetch + AbortSignal.timeout，Node 18+ 内置）

---

## 🧪 测试（23 测）

| 文件 | 测数 | 覆盖 |
| --- | --- | --- |
| boohee.client.test.ts | 5 | fetch mock + envelope 解包 + code≠0 抛错 + HTTP 非 200 + params 过滤 |
| boohee.service.test.ts | 8 | 7 action + Cache 命中/穿透 + batchNutrition 排序 cacheKey |
| boohee.routes.test.ts | 10 | 7 action dispatch + 鉴权 401 + unknown action + Zod 校验 |

---

## 🔗 集成点

- `app.ts`：`app.register(booheeRoutes, { prefix: '/api/boohee' })`
- `packages/shared ENDPOINTS.boohee`：7 action（miniprogram_npm rebuild 后前端可用）
- `packages/shared FeatureFlag 'boohee'`：feature-gate 守门
- `app-config DEFAULT_FEATURE_FLAGS.boohee`：默认 false

---

## 📌 关键范式与坑

1. **X-Api-Key > JWT**：绕过 RSA-SHA256 签名复杂度（与 FatSecret OAuth2 / interpret minimax Anthropic 兼容协议范式对比）
2. **Cache 分级 TTL**：search 120s / detail 300s / categories 3600s（与 stats/shoes/training V0.2.3 同范式）
3. **envelope 解包统一**：`{ code: 0 成功, message, data }` — code !== 0 抛 Errors.badRequest
4. **营养结构保留薄荷原始字段**：GI/GL/NRV/health_light（FatSecret 没有的增值数据，前端按需展示）
5. **FatSearch 保留降级**：food.module 不动，boohee.module 独立运行，未来可加 provider 抽象

---

## 📝 变更记录

- **2026-07-29 (V0.3.35 boohee module 创建 — 第 37 个 module)** — 🎯 **薄荷科学.AI 食物数据 API 对接**（7 action，**0 schema/迁移**，纯 API 对接）：① **client.ts** X-Api-Key 认证 + envelope 解包 + 10s timeout（原生 fetch + AbortSignal，0 新依赖）；② **service.ts** 7 action + Cache.wrap 分级（search 120s / detail 300s / categories 3600s / ranking 600s）；③ **routes.ts** action dispatch + JWT 鉴权；④ **schema.ts** Zod 5 schema（Search/Detail/CategoryFoods/BatchNutrition/Ranking）；⑤ **feature flag boohee** 默认 false（DEFAULT_FEATURE_FLAGS + FEATURE_FLAGS shared）；⑥ **23 测**（client 5 + service 8 + routes 10）/ typecheck exit 0 / funcs 维持 ≥ 86 threshold；**凭证**：X-Api-Key `sk-81d2...`（控制台创建）/ App ID `ocz24cfcqu`（备用 JWT 方式）；**FatSearch 保留降级**（food.module 不动，互不干扰）；**测试验证**：browserFetch 实测食物搜索 + 详情通过（苹果 53kcal 蛋白0.4g 脂肪0.2g 碳水13.7g + GI 36 + GL 4）
