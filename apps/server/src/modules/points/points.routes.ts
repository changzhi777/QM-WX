/** points module routes — POST /api/points（V0.1.22 B-核心） */
import type { FastifyInstance } from 'fastify';
import { pointsService } from './points.service.js';
import { Errors } from '../../common/errors.js';

export async function pointsRoutes(app: FastifyInstance) {
  app.post('/', async (req, reply) => {
    if (!req.user) throw Errors.unauthorized();
    const userId = req.user.id;
    const { action } = req.body as { action: string; payload?: unknown };

    switch (action) {
      case 'myBalance':
        return { code: 0, data: await pointsService.myBalance(userId) };
      case 'signin':
        return { code: 0, data: await pointsService.signin(userId) };
      case 'myTasks':
        return { code: 0, data: await pointsService.myTasks(userId) };
      case 'awardShare': // V0.2.6 分享得积分（日限 3）
        return { code: 0, data: await pointsService.awardShare(userId) };
      default:
        return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
    }
  });
}
