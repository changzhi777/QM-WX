/**
 * mall module routes — POST /api/mall
 *
 * listCategories / listProducts / productDetail 公开；
 * createOrder / myOrders / cancelOrder 需登录。
 * 整 endpoint 标 public，受保护 action 内部手工 jwtVerify。
 */
import type { FastifyInstance } from 'fastify';
import { mallService } from './mall.service.js';
import { orderService } from './order.service.js';
import { requireLogin } from '../../common/middleware/auth.js';
import {
  ListCategoriesInputSchema,
  ListProductsInputSchema,
  ProductDetailInputSchema,
  CreateOrderInputSchema,
  MyOrdersInputSchema,
  CancelOrderInputSchema,
} from './mall.schema.js';

export async function mallRoutes(app: FastifyInstance) {
  app.post(
    '/',
    {
      config: { public: true }, // 列表/详情公开；下单/我的订单/取消内部自鉴权
    },
    async (req, reply) => {
      const { action, payload } = req.body as { action: string; payload?: unknown };

      switch (action) {
        case 'listCategories': {
          const input = ListCategoriesInputSchema.parse(payload ?? {});
          return { code: 0, data: await mallService.listCategories(input) };
        }
        case 'listProducts': {
          const input = ListProductsInputSchema.parse(payload ?? {});
          return { code: 0, data: await mallService.listProducts(input) };
        }
        case 'productDetail': {
          const input = ProductDetailInputSchema.parse(payload);
          return { code: 0, data: await mallService.productDetail(input.id) };
        }
        case 'createOrder': {
          const user = await requireLogin(req);
          const input = CreateOrderInputSchema.parse(payload);
          return { code: 0, data: await orderService.create(user.id, input) };
        }
        case 'myOrders': {
          const user = await requireLogin(req);
          const input = MyOrdersInputSchema.parse(payload ?? {});
          return { code: 0, data: await orderService.myOrders(user.id, input) };
        }
        case 'cancelOrder': {
          const user = await requireLogin(req);
          const input = CancelOrderInputSchema.parse(payload);
          return { code: 0, data: await orderService.cancel(user.id, input.orderId) };
        }
        default:
          return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
      }
    },
  );
}
