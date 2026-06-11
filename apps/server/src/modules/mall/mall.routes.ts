/**
 * mall module routes — POST /api/mall
 */
import type { FastifyInstance } from 'fastify';
import { mallService } from './mall.service.js';
import { orderService } from './order.service.js';
import { Errors } from '../../common/errors.js';
import {
  ListProductsInputSchema,
  ProductDetailInputSchema,
  CreateOrderInputSchema,
  MyOrdersInputSchema,
  CancelOrderInputSchema,
  MallActionBodySchema,
} from './mall.schema.js';

export async function mallRoutes(app: FastifyInstance) {
  app.post(
    '/',
    {
      schema: { body: MallActionBodySchema },
    },
    async (req, reply) => {
      const { action, payload } = req.body as { action: string; payload?: unknown };

      switch (action) {
        case 'listProducts': {
          const input = ListProductsInputSchema.parse(payload ?? {});
          return { code: 0, data: await mallService.listProducts(input) };
        }
        case 'productDetail': {
          const input = ProductDetailInputSchema.parse(payload);
          return { code: 0, data: await mallService.productDetail(input.id) };
        }
        case 'createOrder': {
          if (!req.user) throw Errors.unauthorized();
          const input = CreateOrderInputSchema.parse(payload);
          return { code: 0, data: await orderService.create(req.user.id, input) };
        }
        case 'myOrders': {
          if (!req.user) throw Errors.unauthorized();
          const input = MyOrdersInputSchema.parse(payload ?? {});
          return { code: 0, data: await orderService.myOrders(req.user.id, input) };
        }
        case 'cancelOrder': {
          if (!req.user) throw Errors.unauthorized();
          const input = CancelOrderInputSchema.parse(payload);
          return { code: 0, data: await orderService.cancel(req.user.id, input.orderId) };
        }
        default:
          return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
      }
    },
  );
}
