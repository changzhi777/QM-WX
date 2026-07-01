/**
 * ranking module routes — POST /api/ranking
 *
 * 多维榜单（读模型）。复用 sport 的 action/payload 路由范式。
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { rankingService } from './ranking.service.js';
import { Errors } from '../../common/errors.js';
import { GroupRankingMultiInputSchema } from './ranking.schema.js';

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

export async function rankingRoutes(app: FastifyInstance) {
  app.post('/', async (req, reply) => {
    if (!req.user) throw Errors.unauthorized();
    const userId = req.user.id;
    const { action, payload } = req.body as { action: string; payload?: unknown };

    switch (action) {
      case 'groupRankingMulti': {
        const input = parseOrBadRequest(GroupRankingMultiInputSchema, payload);
        return { code: 0, data: await rankingService.groupRankingMulti(userId, input) };
      }
      default:
        return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
    }
  });
}
