/**
 * ludong module routes — POST /api/ludong
 *
 * Phase 7+ 实现。当前全 stub。
 *
 * 注意：律动 webhook 是独立 HTTP 触发路由（/webhook/ludong），不走这里
 */
import type { FastifyInstance } from 'fastify';
import { ludongService } from './ludong.service.js';
import { Errors } from '../../common/errors.js';
import {
  BindLudongInputSchema,
  ListOutboxInputSchema,
} from './ludong.schema.js';

export async function ludongRoutes(app: FastifyInstance) {
  app.post(
    '/',
    async (req, reply) => {
      if (!req.user) throw Errors.unauthorized();
      const { action, payload } = req.body as { action: string; payload?: unknown };

      switch (action) {
        case 'listOutbox': {
          const input = ListOutboxInputSchema.parse(payload ?? {});
          return { code: 0, data: await ludongService.listOutbox(input) };
        }
        case 'flushOutbox': {
          return { code: 0, data: await ludongService.flushOutbox() };
        }
        case 'bindAccount': {
          const input = BindLudongInputSchema.parse(payload);
          return { code: 0, data: await ludongService.bindAccount(req.user.id, input) };
        }
        case 'bindingStatus': {
          return { code: 0, data: await ludongService.bindingStatus(req.user.id) };
        }
        default:
          return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
      }
    },
  );
}
