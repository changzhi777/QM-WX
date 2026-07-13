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
import { ChatInputSchema, GeneratePlanInputSchema, AdoptPlanInputSchema, HistoryQuerySchema, RegenerateInputSchema, DeleteConversationInputSchema } from './ai-coach.schema.js';

export async function aiCoachRoutes(app: FastifyInstance) {
  app.post('/', async (req, reply) => {
    if (!req.user) throw Errors.unauthorized();
    const userId = req.user.id;
    const { action, payload } = req.body as { action: string; payload?: unknown };

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
      default:
        return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
    }
  });
}
