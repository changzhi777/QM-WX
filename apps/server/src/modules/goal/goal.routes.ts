/**
 * goal module routes — POST /api/goal（V0.1.28，跑者向）
 *
 * 跑步目标：list（含进度）/ add / remove / myProgress
 */
import type { FastifyInstance } from 'fastify';
import { goalService } from './goal.service.js';
import { Errors } from '../../common/errors.js';
import { AddGoalInputSchema, GoalIdInputSchema } from './goal.schema.js';

export async function goalRoutes(app: FastifyInstance) {
  app.post('/', async (req, reply) => {
    if (!req.user) throw Errors.unauthorized();
    const userId = req.user.id;
    const { action, payload } = req.body as { action: string; payload?: unknown };

    switch (action) {
      case 'list':
        return { code: 0, data: await goalService.list(userId) };
      case 'add': {
        const input = AddGoalInputSchema.parse(payload);
        return { code: 0, data: await goalService.add(userId, input) };
      }
      case 'remove': {
        const { id } = GoalIdInputSchema.parse(payload);
        return { code: 0, data: await goalService.remove(userId, id) };
      }
      case 'myProgress':
        return { code: 0, data: await goalService.myProgress(userId) };
      default:
        return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
    }
  });
}
