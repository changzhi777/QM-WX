/**
 * ai-coach module business logic（V0.1.139 AI 私教）
 *
 * 4 action：
 * - chat：非流式对话（多轮记忆最近 10 轮 + 落 ConversationTurn）
 * - chatStream：流式对话（provider.chatStream 逐 token 写 SSE + 流完落库；reply.hijack 手动写 reply.raw）
 * - generatePlan：生成结构化训练计划（不落库，返回 plan 给前端展示）
 * - adoptPlan：采纳计划（create TrainingPlan status=archived + upsert UserPlanEnrollment）
 *
 * Provider 选择：LLM_API_KEY 已配 → OpenAICompatible；否则 Stub（feature_flags.ai 在 route 层守卫入口隐藏）
 *
 * 关键范式：
 * - reply.hijack() + reply.raw 写 SSE（Fastify 4 流式标准范式）
 * - 多轮记忆：findMany 最近 N 轮 + createMany 落本轮 user+assistant
 * - adoptPlan 不调 training.joinPlan（它校验 active 会拒绝 archived AI 计划），自己 upsert
 */
import { randomUUID } from 'crypto';
import type { FastifyReply } from 'fastify';
import { prisma } from '../../infra/prisma.js';
import { buildSystemPrompt } from './context-builder.js';
import { stubProvider } from './providers/stub.js';
import { glmProvider } from './providers/glm.js';
import type { LLMProvider, ChatMessage } from './providers/types.js';
import type { ChatInput, GeneratePlanInput, PlanStructure, HistoryQuery, RegenerateInput, DeleteConversationInput } from './ai-coach.schema.js';

const HISTORY_TURNS = 10;

/**
 * SSE 帧 ASCII-safe 序列化（V0.1.139）
 * 把中文/emoji 转成 \uXXXX，使整个 SSE 帧为纯 ASCII。
 * 小程序 onChunkReceived 拿 ArrayBuffer 后用 String.fromCharCode 逐字节解码，
 * 无需 TextDecoder，且跨 chunk 不会因多字节 UTF-8 断裂而乱码。
 */
function asciiFrame(obj: unknown): string {
  return JSON.stringify(obj).replace(/[-￿]/g, (ch) =>
    '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'),
  );
}

/** provider 切换：有 LLM_API_KEY 用真模型，否则 Stub */
async function pickProvider(): Promise<LLMProvider> {
  return process.env.LLM_API_KEY ? glmProvider : stubProvider;
}

export const aiCoachService = {
  /** 非流式对话（多轮记忆 + 落库） */
  async chat(userId: string, input: ChatInput) {
    const conversationId = input.conversationId || randomUUID();
    const provider = await pickProvider();
    const system = await buildSystemPrompt(userId);
    const history = await loadHistory(userId, conversationId);
    const messages: ChatMessage[] = [...history, { role: 'user', content: input.message }];
    const reply = await provider.chat(messages, system);
    await saveTurns(userId, conversationId, input.message, reply);
    return { reply, conversationId };
  },

  /** 流式对话（逐 token 写 SSE + 流完落库） */
  async chatStream(userId: string, input: ChatInput, reply: FastifyReply) {
    const conversationId = input.conversationId || randomUUID();
    const provider = await pickProvider();
    const system = await buildSystemPrompt(userId);
    const history = await loadHistory(userId, conversationId);
    const messages: ChatMessage[] = [...history, { role: 'user', content: input.message }];

    // hijack Fastify reply，手动写 SSE 流
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    let full = '';
    try {
      for await (const token of provider.chatStream(messages, system)) {
        full += token;
        reply.raw.write(`data: ${asciiFrame({ t: token })}\n\n`);
      }
      await saveTurns(userId, conversationId, input.message, full);
      reply.raw.write(`data: ${asciiFrame({ done: true, conversationId })}\n\n`);
    } catch (e) {
      // AI 服务异常：发 error 事件（前端展示降级提示）+ 仍落 user 轮（保留上下文）
      await prisma.conversationTurn
        .create({ data: { userId, conversationId, role: 'user', content: input.message } })
        .catch(() => {});
      reply.raw.write(`data: ${asciiFrame({ error: 'AI 服务暂不可用，请稍后重试' })}\n\n`);
    } finally {
      reply.raw.end();
    }
  },

  /** 生成训练计划（不落库，返回 plan 给前端展示 + 采纳） */
  async generatePlan(userId: string, input: GeneratePlanInput) {
    const provider = await pickProvider();
    const system = await buildSystemPrompt(userId);
    const content =
      input.message ||
      [input.goal, input.weeks ? `${input.weeks} 周` : '', input.level ? `难度 ${input.level}` : '']
        .filter(Boolean)
        .join('，') ||
      '请帮我生成一份训练计划';
    const plan = await provider.generatePlan([{ role: 'user', content }], system);
    return { plan };
  },

  /** 采纳计划（create TrainingPlan status=archived + upsert UserPlanEnrollment） */
  async adoptPlan(userId: string, plan: PlanStructure) {
    // AI 计划落 TrainingPlan：status=archived 避免污染 myPlans active 模板；key 唯一避免冲突
    const created = await prisma.trainingPlan.create({
      data: {
        key: `ai:${userId}:${Date.now()}`,
        name: plan.title,
        weeks: plan.weeks,
        level: plan.level,
        goal: plan.goal,
        desc: plan.days.map((d) => `${d.day} ${d.content}`).join('；'),
        weeklyMileage: plan.weeklyMileage,
        targetKm: plan.targetKm,
        status: 'archived',
      },
    });
    // upsert UserPlanEnrollment（1人1活跃；绕过 training.joinPlan 的 active 校验，因 AI 计划是 archived）
    const enrollment = await prisma.userPlanEnrollment.upsert({
      where: { userId },
      create: { userId, planId: created.id },
      update: { planId: created.id, joinedAt: new Date() },
    });
    return {
      planId: created.id,
      planName: created.name,
      joinedAt: enrollment.joinedAt.toISOString(),
    };
  },

  /**
   * 加载历史会话（V0.1.139 完善）
   * - 传 conversationId → 返该会话全部消息（时间正序）
   * - 不传 → 取用户最近一个会话；无任何会话返空（前端显欢迎语）
   */
  async history(userId: string, input: HistoryQuery) {
    let conversationId = input.conversationId;
    if (!conversationId) {
      const latest = await prisma.conversationTurn.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { conversationId: true },
      });
      conversationId = latest?.conversationId ?? '';
    }
    if (!conversationId) return { conversationId: '', messages: [] };

    const turns = await prisma.conversationTurn.findMany({
      where: { userId, conversationId },
      orderBy: { createdAt: 'asc' },
      take: input.limit ?? 50,
    });
    return {
      conversationId,
      messages: turns.map((t) => ({ role: t.role, content: t.content })),
    };
  },

  /**
   * 重新生成最后一条 assistant（V0.1.139 完善）
   * 删旧 assistant → 用其前的历史重新调 provider → 落新 assistant
   * 无 assistant（如首条）→ 返空 reply，前端兜底
   */
  async regenerate(userId: string, input: RegenerateInput) {
    const turns = await prisma.conversationTurn.findMany({
      where: { userId, conversationId: input.conversationId },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    let lastAssistantIdx = -1;
    for (let i = turns.length - 1; i >= 0; i--) {
      if (turns[i].role === 'assistant') {
        lastAssistantIdx = i;
        break;
      }
    }
    if (lastAssistantIdx < 0) return { reply: '', conversationId: input.conversationId };

    await prisma.conversationTurn.delete({ where: { id: turns[lastAssistantIdx].id } });
    const history: ChatMessage[] = turns
      .slice(0, lastAssistantIdx)
      .slice(-HISTORY_TURNS * 2)
      .map((t) => ({ role: t.role as 'user' | 'assistant', content: t.content }));

    const provider = await pickProvider();
    const system = await buildSystemPrompt(userId);
    const reply = await provider.chat(history, system);
    await prisma.conversationTurn.create({
      data: { userId, conversationId: input.conversationId, role: 'assistant', content: reply },
    });
    return { reply, conversationId: input.conversationId };
  },

  /**
   * 会话列表（V0.1.139 完善：多会话管理）
   * 单次 findMany + 内存 groupBy conversationId（避免 N+1），返每个会话最近消息预览 + 时间 + 消息数
   * take 500 限制（最近 500 条消息覆盖的会话，足够）
   */
  async conversations(userId: string) {
    const all = await prisma.conversationTurn.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const map = new Map<string, { conversationId: string; lastMessage: string; lastTime: string; messageCount: number }>();
    for (const t of all) {
      const ex = map.get(t.conversationId);
      if (!ex) {
        map.set(t.conversationId, {
          conversationId: t.conversationId,
          lastMessage: t.content.slice(0, 50),
          lastTime: t.createdAt.toISOString(),
          messageCount: 1,
        });
      } else {
        ex.messageCount++;
      }
    }
    return { conversations: Array.from(map.values()) };
  },

  /** 删除整个会话（V0.1.139 完善）*/
  async deleteConversation(userId: string, input: DeleteConversationInput) {
    await prisma.conversationTurn.deleteMany({
      where: { userId, conversationId: input.conversationId },
    });
    return { ok: true };
  },
};

/** 加载最近 N 轮对话（user+assistant 成对，时间正序） */
async function loadHistory(userId: string, conversationId: string): Promise<ChatMessage[]> {
  const turns = await prisma.conversationTurn.findMany({
    where: { userId, conversationId },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_TURNS * 2,
  });
  return turns.reverse().map((t) => ({ role: t.role as 'user' | 'assistant', content: t.content }));
}

/** 落本轮 user + assistant（createMany 一次写两条） */
async function saveTurns(userId: string, conversationId: string, userMsg: string, assistantMsg: string) {
  await prisma.conversationTurn.createMany({
    data: [
      { userId, conversationId, role: 'user', content: userMsg },
      { userId, conversationId, role: 'assistant', content: assistantMsg },
    ],
  });
}
