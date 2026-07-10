/**
 * review module routes — POST /api/review（V0.1.113 电商评价闭环）
 *
 * 评价：create（校验已购）/ list（商品评价列表）/ stats（评分汇总）/ myReviews / remove
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { reviewService } from './review.service.js';
import { Errors } from '../../common/errors.js';
import {
  CreateReviewSchema,
  ProductReviewListSchema,
  ReviewPageSchema,
  ProductIdSchema,
  ReviewIdSchema,
} from './review.schema.js';

/** 统一把 Zod 错误转 BusinessError（与 cart/stats 范式一致） */
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

export async function reviewRoutes(app: FastifyInstance) {
  app.post('/', async (req, reply) => {
    if (!req.user) throw Errors.unauthorized();
    const userId = req.user.id;
    const { action, payload } = req.body as { action: string; payload?: unknown };

    switch (action) {
      case 'create':
        return { code: 0, data: await reviewService.create(userId, parseOrBadRequest(CreateReviewSchema, payload)) };
      case 'list': {
        const input = parseOrBadRequest(ProductReviewListSchema, payload);
        return { code: 0, data: await reviewService.listByProduct(input.productId, input) };
      }
      case 'stats':
        return { code: 0, data: await reviewService.productStats(parseOrBadRequest(ProductIdSchema, payload).productId) };
      case 'myReviews':
        return { code: 0, data: await reviewService.myReviews(userId, parseOrBadRequest(ReviewPageSchema, payload ?? {})) };
      case 'remove':
        return { code: 0, data: await reviewService.remove(userId, parseOrBadRequest(ReviewIdSchema, payload).id) };
      default:
        return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
    }
  });
}
