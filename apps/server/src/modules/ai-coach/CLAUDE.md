# ai-coach module — AI 私教

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../../../CLAUDE.md) → [`apps/server/`](../../../CLAUDE.md) → [`modules/`](../) → **ai-coach/**（这里）
> 父级：[apps/server CLAUDE.md](../../../CLAUDE.md) | 同级：[training](../training/)（adoptPlan 复用 TrainingPlan） / [stats](../stats/)（ContextBuilder 聚合源） / [device](../device/)（健康数据源）

> 引入版本：**V0.1.139**（2026-07-13，AI 私教 MVP — 智谱 GLM v4 + 流式对话 + 训练计划生成）

---

## 🎯 模块职责

**AI 跑步私教**：基于跑者全量画像（跑量/目标/跑鞋/计划/心率/睡眠/体成分）的个性化对话 + 训练计划生成。

- **对话**：多轮上下文（最近 10 轮）+ 流式输出（SSE 打字机）
- **计划生成**：AI 生成结构化周计划（JSON）→ 前端计划卡 → 「采纳」写入训练计划
- **双轨 LLM**：Stub（规则话术，无 API key 时）/ **GLM 智谱 v4**（真模型，原生 fetch，不依赖 openai 包）
- **灰度**：`feature_flags.smartAgent` 守卫入口（mine 隐藏）+ provider 自动切换

---

## 🚪 入口与启动

| 文件 | 职责 |
| --- | --- |
| `ai-coach.routes.ts` | POST `/api/ai-coach`（switch action + chatStream Fastify hijack） |
| `ai-coach.service.ts` | 4 action + asciiFrame SSE 序列化 + reply.hijack 流式 |
| `ai-coach.schema.ts` | Zod（ChatInput/GeneratePlanInput/AdoptPlanInput/PlanStructureSchema） |
| `context-builder.ts` | 全量数据聚合 → system prompt（Cache 60s） |
| `providers/types.ts` | LLMProvider 接口 + PLAN_JSON_SCHEMA |
| `providers/stub.ts` | StubProvider（规则话术 + 逐字流式 + 4 套计划模板） |
| `providers/glm.ts` | GLMProvider（智谱 v4 原生 fetch + SSE + json_object） |

注册：`src/app.ts` `app.register(aiCoachRoutes, { prefix: '/api/ai-coach' })`

---

## 📡 对外接口（4 action）

> 统一 POST `/api/ai-coach` body `{ action, payload }`，需 JWT

| action | payload | 返回 | 说明 |
| --- | --- | --- | --- |
| `chat` | `{ message, conversationId? }` | `{ reply, conversationId }` | 非流式对话（多轮记忆 + 落 ConversationTurn） |
| `chatStream` | `{ message, conversationId? }` | SSE 流 `data: {"t":"token"}\n\n` + `data: {"done":true}\n\n` | 流式对话（reply.hijack + asciiFrame） |
| `generatePlan` | `{ goal?, weeks?, level?, message? }` | `{ plan: PlanStructure }` | AI 生成训练计划（不落库） |
| `adoptPlan` | `{ plan: PlanStructure }` | `{ planId, planName, joinedAt }` | 采纳计划（TrainingPlan archived + UserPlanEnrollment upsert） |
| `history` | `{ conversationId?, limit? }` | `{ conversationId, messages[] }` | 完善：加载历史会话（不传 conversationId 取最近；无返空） |
| `regenerate` | `{ conversationId }` | `{ reply, conversationId }` | 完善：删最后 assistant + 用其前历史重新生成 |
| `conversations` | — | `{ conversations[] }` | 完善：会话列表（内存 groupBy，多会话管理） |
| `deleteConversation` | `{ conversationId }` | `{ ok }` | 完善：删除整个会话 |
| `setPersona` | `{ persona: scientist\|coach\|buddy\|strict }` | `{ persona }` | **V0.1.140 A**：设置 AI 私教人设（User.aiCoachPersona + Cache 失效） |

---

## 🗃️ 数据模型

| Model | 用途 |
| --- | --- |
| **ConversationTurn**（V0.1.139 新表 #57） | 多轮记忆：userId/conversationId/role(user\|assistant)/content/createdAt；索引 `[userId,conversationId,createdAt]`；onDelete Cascade |
| TrainingPlan（复用 V0.1.41） | AI 计划落库：status='archived'（不污染 myPlans active 模板）+ key=`ai:{userId}:{ts}` 唯一 |
| UserPlanEnrollment（复用 V0.1.41） | 采纳后 upsert（1人1活跃） |

---

## 🔗 集成点（ContextBuilder 全量聚合源）

- **user**（profile：gender/birthday/height/weight/region）
- **stats**（Checkin aggregate 年/月跑量 + count）
- **goal**（active 目标 + 进度）
- **shoes**（active 跑鞋 + healthRatio）
- **training**（UserPlanEnrollment 当前计划）
- **device**（HeartRateRecord/SleepRecord/WeRunRecord 最近）
- **BodyCompositionRecord**（最新体成分）
- **被前端调用**：pages/ai-coach（聊天页 + 流式）+ mine 入口（feature-gate smartAgent）
- **复用 training**：adoptPlan 落 TrainingPlan（不调 joinPlan，因 AI 计划 archived 绕过 active 校验）

---

## 🧪 测试

```bash
pnpm test ai-coach   # 5 文件 / 35 用例（含 history/regenerate 完善）
```

- `stub.test.ts`（8）：chat 关键词 / chatStream 逐字 / generatePlan level 推断
- `glm.test.ts`（6）：mock fetch 非流式 / SSE 解析（含跨 chunk）/ json_object zod 校验
- `context-builder.test.ts`（2）：全量聚合 / 用户不存在兜底
- `ai-coach.service.test.ts`（6）：chat 多轮 / chatStream asciiFrame + hijack / generatePlan / adoptPlan
- `ai-coach.routes.test.ts`（6）：鉴权 / unknown action / 4 action 透传

---

## 📌 关键范式与坑

1. **智谱 GLM v4 原生 fetch（不用 openai 包）**：endpoint `https://open.bigmodel.cn/api/paas/v4/chat/completions` + Bearer 鉴权（API key 格式 `{id}.{secret}`）+ SSE 流式 + response_format json_object。用户明确要求不用 OpenAI 协议 → 卸载 openai 包，原生 fetch + ReadableStream。

2. **asciiFrame SSE 序列化**：中文/emoji 转 `\uXXXX`，使 SSE 帧纯 ASCII。小程序 `onChunkReceived` ArrayBuffer → `String.fromCharCode` 逐字节解码（无 TextDecoder）+ 按 `\n\n` 分帧。**跨 chunk 多字节 UTF-8 断裂的根治方案**。

3. **reply.hijack() + reply.raw 写 SSE**（Fastify 4 流式范式）：hijack 后手动 writeHead/write/end，handler `return reply`。

4. **adoptPlan 不调 training.joinPlan**：joinPlan 校验 `status==='active'` 会拒绝 AI 的 archived 计划；adoptPlan 自己 upsert UserPlanEnrollment。AI 计划 status='archived' 避免污染 myPlans active 模板列表。

5. **双轨 provider 切换**：`process.env.LLM_API_KEY` 有值 → glmProvider，否则 stubProvider。feature_flags.smartAgent 在 route/前端层守卫（无 key 时 mine 入口隐藏 + provider 走 stub）。

6. **GLM generatePlan 降级**：智谱 json_schema strict 支持不稳，统一用 `response_format:{type:'json_object'}` + PlanStructureSchema zod 校验，失败抛业务错误让前端重试。

7. **ContextBuilder Cache 60s**：画像段（跑量/目标/跑鞋变化慢）Cache，10 个并行查询省到 1 次 Cache 命中。

---

## 🔗 关联

- **training**：adoptPlan 落 TrainingPlan + UserPlanEnrollment
- **stats/goal/shoes/device**：ContextBuilder 聚合源（只读）
- **前端 pages/ai-coach**：流式聊天页 + plan-card 组件
- **shared ENDPOINTS.aiCoach**：4 action 登记

🤙 改 provider 只改 `providers/glm.ts`（或加新 provider 实现 LLMProvider 接口）；改对话 prompt 模板改 `context-builder.ts` SYSTEM_PROMPT_BASE。
