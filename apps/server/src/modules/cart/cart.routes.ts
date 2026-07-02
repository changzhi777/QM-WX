/** cart module routes — POST /api/cart（V0.1.22 B-核心） */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { cartService } from './cart.service.js';
import { Errors } from '../../common/errors.js';
import { CartAddInputSchema, CartRemoveInputSchema, CartUpdateQtyInputSchema } from './cart.schema.js';

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

export async function cartRoutes(app: FastifyInstance) {
  app.post('/', async (req, reply) => {
    if (!req.user) throw Errors.unauthorized();
    const userId = req.user.id;
    const { action, payload } = req.body as { action: string; payload?: unknown };

    switch (action) {
      case 'add':
        return { code: 0, data: await cartService.add(userId, parseOrBadRequest(CartAddInputSchema, payload)) };
      case 'remove':
        return { code: 0, data: await cartService.remove(userId, parseOrBadRequest(CartRemoveInputSchema, payload).productId) };
      case 'list':
        return { code: 0, data: await cartService.list(userId) };
      case 'updateQty':
        return { code: 0, data: await cartService.updateQty(userId, parseOrBadRequest(CartUpdateQtyInputSchema, payload)) };
      case 'clear':
        return { code: 0, data: await cartService.clear(userId) };
      default:
        return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
    }
  });
}
