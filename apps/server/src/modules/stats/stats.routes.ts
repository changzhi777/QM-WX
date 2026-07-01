/**
 * stats module routes — POST /api/stats
 *
 * 跑者数据汇总（读模型）。复用 sport 的 action/payload 路由范式。
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { statsService } from './stats.service.js';
import { Errors } from '../../common/errors.js';
import { MyRunnerStatsQuerySchema } from './stats.schema.js';

/** 统一把 Zod 错误转 BusinessError（与 sport.routes 一致） */
function parseOrBadRequest<S extends z.ZodTypeAny>(schema: S, payload: unknown): z.output<S> {
  try {
    return schema.parse(payload) as z.output<S>;
  } catch (e) {
    if (e instanceof z.ZodError) {
      const first = e.issues[0];
      throw Errors.badRequest(`${first.path.join('.')}: ${first.message}`);
    }
    throw e;
  }
}

export async function statsRoutes(app: FastifyInstance) {
  app.post('/', async (req, reply) => {
    if (!req.user) throw Errors.unauthorized();
    const userId = req.user.id;
    const { action, payload } = req.body as { action: string; payload?: unknown };

    switch (action) {
      case 'myRunnerStats': {
        const input = parseOrBadRequest(MyRunnerStatsQuerySchema, payload ?? {});
        return { code: 0, data: await statsService.myRunnerStats(userId, input) };
      }
      default:
        return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
    }
  });
}
