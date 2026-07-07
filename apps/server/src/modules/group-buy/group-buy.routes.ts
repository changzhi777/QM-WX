/**
 * group-buy module routes — POST /api/group-buy（V0.1.37，2764 电商团购）
 *
 * 团购：list / detail / join / myJoined
 */
import type { FastifyInstance } from 'fastify';
import { groupBuyService } from './group-buy.service.js';
import { Errors } from '../../common/errors.js';
import { GroupBuyIdSchema, GroupBuyPageSchema } from './group-buy.schema.js';

export async function groupBuyRoutes(app: FastifyInstance) {
  app.post('/', async (req, reply) => {
    if (!req.user) throw Errors.unauthorized();
    const userId = req.user.id;
    const { action, payload } = req.body as { action: string; payload?: unknown };

    switch (action) {
      case 'list': {
        const input = GroupBuyPageSchema.parse(payload ?? {});
        return { code: 0, data: await groupBuyService.list(userId, input) };
      }
      case 'detail': {
        const input = GroupBuyIdSchema.parse(payload);
        return { code: 0, data: await groupBuyService.detail(userId, input) };
      }
      case 'join': {
        const input = GroupBuyIdSchema.parse(payload);
        return { code: 0, data: await groupBuyService.join(userId, input) };
      }
      case 'myJoined': {
        const input = GroupBuyPageSchema.parse(payload ?? {});
        return { code: 0, data: await groupBuyService.myJoined(userId, input) };
      }
      default:
        return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
    }
  });
}
