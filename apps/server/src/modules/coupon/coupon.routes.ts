/** coupon module routes — POST /api/coupon（V0.1.23 MVP） */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { couponService } from './coupon.service.js';
import { Errors } from '../../common/errors.js';
import { ReceiveCouponSchema, MyCouponsSchema } from './coupon.schema.js';

function parseOrBadRequest<S extends z.ZodTypeAny>(schema: S, payload: unknown): z.output<S> {
  try {
    return schema.parse(payload) as z.output<S>;
  } catch (e) {
    if (e instanceof z.ZodError) {
      throw Errors.badRequest(`${e.issues[0].path.join('.')}: ${e.issues[0].message}`);
    }
    throw e;
  }
}

export async function couponRoutes(app: FastifyInstance) {
  app.post('/', async (req, reply) => {
    if (!req.user) throw Errors.unauthorized();
    const userId = req.user.id;
    const { action, payload } = req.body as { action: string; payload?: unknown };

    switch (action) {
      case 'templates':
        return { code: 0, data: await couponService.templates(userId) };
      case 'myCoupons':
        return { code: 0, data: await couponService.myCoupons(userId, (parseOrBadRequest(MyCouponsSchema, payload ?? {}) ?? {}).status) };
      case 'availableCount':
        return { code: 0, data: { count: await couponService.availableCount(userId) } };
      case 'receive':
        return { code: 0, data: await couponService.receive(userId, parseOrBadRequest(ReceiveCouponSchema, payload).templateId) };
      default:
        return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
    }
  });
}
