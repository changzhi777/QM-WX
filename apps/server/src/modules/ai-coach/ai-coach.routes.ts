/**
 * ai-coach module routes — POST /api/ai-coach（V0.1.139 AI 私教）
 *
 * action：chat（非流式兜底）/ chatStream（流式 SSE）/ generatePlan / adoptPlan
 *
 * chatStream 特殊：reply.hijack 后 service 手动写 SSE，route handler 返回 reply（不再 send data）
 */
import type { FastifyInstance } from 'fastify';
import { aiCoachService } from './ai-coach.service.js';
import { Errors } from '../../common/errors.js';
import { redis } from '../../infra/redis.js';
import { ChatInputSchema, GeneratePlanInputSchema, AdoptPlanInputSchema, HistoryQuerySchema, RegenerateInputSchema, DeleteConversationInputSchema, SetPersonaInputSchema } from './ai-coach.schema.js';

export async function aiCoachRoutes(app: FastifyInstance) {
  app.post('/', async (req, reply) => {
    if (!req.user) throw Errors.unauthorized();
    const userId = req.user.id;
    const { action, payload } = req.body as { action: string; payload?: unknown };

    // V0.1.140 E 限流：LLM 消耗 action 30 次/分/用户（Redis 计数，超 429）
    if (['chat', 'chatStream', 'generatePlan', 'regenerate'].includes(action)) {
      const rlKey = `ai-coach:rl:${userId}`;
      const cnt = await redis.incr(rlKey);
      if (cnt === 1) await redis.expire(rlKey, 60);
      if (cnt > 30) {
        return reply.status(429).send({ code: 429, msg: 'AI 调用太频繁，请稍后再试（30 次/分钟）' });
      }
    }

    switch (action) {
      case 'chat': {
        const input = ChatInputSchema.parse(payload);
        return { code: 0, data: await aiCoachService.chat(userId, input) };
      }
      case 'chatStream': {
        // 流式：service 内 reply.hijack + 手动写 SSE，handler 返回 reply（Fastify 不再自动 send）
        const input = ChatInputSchema.parse(payload);
        await aiCoachService.chatStream(userId, input, reply);
        return reply;
      }
      case 'generatePlan': {
        const input = GeneratePlanInputSchema.parse(payload ?? {});
        return { code: 0, data: await aiCoachService.generatePlan(userId, input) };
      }
      case 'adoptPlan': {
        const input = AdoptPlanInputSchema.parse(payload);
        return { code: 0, data: await aiCoachService.adoptPlan(userId, input.plan) };
      }
      case 'history': {
        const input = HistoryQuerySchema.parse(payload ?? {});
        return { code: 0, data: await aiCoachService.history(userId, input) };
      }
      case 'regenerate': {
        const input = RegenerateInputSchema.parse(payload);
        return { code: 0, data: await aiCoachService.regenerate(userId, input) };
      }
      case 'conversations': {
        return { code: 0, data: await aiCoachService.conversations(userId) };
      }
      case 'deleteConversation': {
        const input = DeleteConversationInputSchema.parse(payload);
        return { code: 0, data: await aiCoachService.deleteConversation(userId, input) };
      }
      case 'setPersona': {
        const input = SetPersonaInputSchema.parse(payload);
        return { code: 0, data: await aiCoachService.setPersona(userId, input) };
      }
      case 'warmup': {
        return { code: 0, data: await aiCoachService.warmup(userId) };
      }
      case 'proactiveAlert': {
        return { code: 0, data: await aiCoachService.proactiveAlert(userId) };
      }
      default:
        return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
    }
  });
}
