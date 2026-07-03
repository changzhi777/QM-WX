/**
 * favorite module routes — POST /api/favorite（V0.1.29，社交向）
 *
 * Content/Product 收藏：list（含详情）/ add / remove / isFavorited（批量）
 */
import type { FastifyInstance } from 'fastify';
import { favoriteService } from './favorite.service.js';
import { Errors } from '../../common/errors.js';
import {
  FavoriteTargetInputSchema,
  ListFavoriteQuerySchema,
  IsFavoritedInputSchema,
} from './favorite.schema.js';

export async function favoriteRoutes(app: FastifyInstance) {
  app.post('/', async (req, reply) => {
    if (!req.user) throw Errors.unauthorized();
    const userId = req.user.id;
    const { action, payload } = req.body as { action: string; payload?: unknown };

    switch (action) {
      case 'list': {
        const input = ListFavoriteQuerySchema.parse(payload ?? {});
        return { code: 0, data: await favoriteService.list(userId, input) };
      }
      case 'add': {
        const input = FavoriteTargetInputSchema.parse(payload);
        return { code: 0, data: await favoriteService.add(userId, input) };
      }
      case 'remove': {
        const input = FavoriteTargetInputSchema.parse(payload);
        return { code: 0, data: await favoriteService.remove(userId, input) };
      }
      case 'isFavorited': {
        const input = IsFavoritedInputSchema.parse(payload);
        return { code: 0, data: await favoriteService.isFavorited(userId, input) };
      }
      default:
        return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
    }
  });
}
