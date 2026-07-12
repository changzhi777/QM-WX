/**
 * shoes module routes — POST /api/shoes（V0.1.26，跑者向 + V0.1.133 增强）
 *
 * 跑鞋管理：list / add / update / retire / myStats
 * V0.1.133：getDetail / getMileageHistory / updateThreshold
 */
import type { FastifyInstance } from 'fastify';
import { shoesService } from './shoes.service.js';
import { Errors } from '../../common/errors.js';
import {
  AddShoeInputSchema,
  UpdateShoeInputSchema,
  UpdateThresholdInputSchema,
  ShoeIdInputSchema,
} from './shoes.schema.js';

export async function shoesRoutes(app: FastifyInstance) {
  app.post('/', async (req, reply) => {
    if (!req.user) throw Errors.unauthorized();
    const userId = req.user.id;
    const { action, payload } = req.body as { action: string; payload?: unknown };

    switch (action) {
      case 'list':
        return { code: 0, data: await shoesService.list(userId) };
      case 'add': {
        const input = AddShoeInputSchema.parse(payload);
        return { code: 0, data: await shoesService.add(userId, input) };
      }
      case 'update': {
        const input = UpdateShoeInputSchema.parse(payload);
        return { code: 0, data: await shoesService.update(userId, input) };
      }
      case 'retire': {
        const { id } = ShoeIdInputSchema.parse(payload);
        return { code: 0, data: await shoesService.retire(userId, id) };
      }
      case 'myStats':
        return { code: 0, data: await shoesService.myStats(userId) };
      // V0.1.133
      case 'getDetail': {
        const { id } = ShoeIdInputSchema.parse(payload);
        return { code: 0, data: await shoesService.getDetail(userId, id) };
      }
      case 'getMileageHistory': {
        const { id } = ShoeIdInputSchema.parse(payload);
        return { code: 0, data: await shoesService.getMileageHistory(userId, id) };
      }
      case 'updateThreshold': {
        const input = UpdateThresholdInputSchema.parse(payload);
        return { code: 0, data: await shoesService.updateThreshold(userId, input) };
      }
      default:
        return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
    }
  });
}
