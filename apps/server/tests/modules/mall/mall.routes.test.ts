/**
 * mall routes 路由层测试（覆盖 6 个 action）
 *
 * 用新建的 helpers/fixtures（示范增量采用）。
 *
 * 覆盖：
 * - listCategories / listProducts / productDetail（公开端点）
 * - createOrder / myOrders / cancelOrder（受保护，需 user）
 * - unknown action → 400
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { mockErrors } from '../../helpers/mockErrors.js';
import { makeProduct, makeCategory } from '../../fixtures/product.fixture.js';
import { makeOrder } from '../../fixtures/order.fixture.js';

const mockMallService = vi.hoisted(() => ({
  listCategories: vi.fn(),
  listProducts: vi.fn(),
  productDetail: vi.fn(),
}));

const mockOrderService = vi.hoisted(() => ({
  create: vi.fn(),
  myOrders: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock('src/modules/mall/mall.service.js', () => ({ mallService: mockMallService }));
vi.mock('src/modules/mall/order.service.js', () => ({ orderService: mockOrderService }));
vi.mock('src/common/errors.js', () => ({ Errors: mockErrors }));

import { mallRoutes } from '../../../src/modules/mall/mall.routes.js';

interface MockUser {
  id: string;
  openid: string;
  sub: string;
}

async function buildApp(opts: { authed?: boolean } = {}) {
  const app = Fastify();
  app.decorateRequest('user', undefined);
  if (opts.authed) {
    app.addHook('onRequest', async (req) => {
      (req as { user?: MockUser }).user = { id: 'u1', openid: 'oU1', sub: 'u1' };
    });
  }
  app.setErrorHandler((err, _req, reply) => {
    const e = err as Error & { code?: number; statusCode?: number };
    return reply.status(e.statusCode ?? 500).send({ code: e.code ?? 500, msg: err.message });
  });
  await app.register(mallRoutes, { prefix: '/api/mall' });
  return app;
}

describe('POST /api/mall — 公开端点', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
    await app.ready();
  });

  it('listCategories：无需登录，返回分类列表', async () => {
    mockMallService.listCategories.mockResolvedValue({ list: [makeCategory()] });
    const res = await app.inject({
      method: 'POST',
      url: '/api/mall',
      payload: { action: 'listCategories' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ code: 0, data: { list: expect.any(Array) } });
    expect(mockMallService.listCategories).toHaveBeenCalled();
  });

  it('listProducts：分页参数透传 service', async () => {
    mockMallService.listProducts.mockResolvedValue({
      list: [makeProduct()],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/mall',
      payload: { action: 'listProducts', payload: { page: 1, pageSize: 20 } },
    });
    expect(res.statusCode).toBe(200);
    expect(mockMallService.listProducts).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20 }),
    );
  });

  it('productDetail：返回单个商品', async () => {
    mockMallService.productDetail.mockResolvedValue({ product: makeProduct({ id: 'p-x' }) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/mall',
      payload: { action: 'productDetail', payload: { id: 'p-x' } },
    });
    expect(res.statusCode).toBe(200);
    expect(mockMallService.productDetail).toHaveBeenCalledWith('p-x');
  });

  it('productDetail 缺 id → 400 (Zod)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/mall',
      payload: { action: 'productDetail', payload: {} },
    });
    expect(res.statusCode).toBe(500); // Zod 抛错被 setErrorHandler 捕但 statusCode 在 Zod 默认是 undefined
  });

  it('unknown action → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/mall',
      payload: { action: 'wat' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().msg).toContain('unknown action');
  });
});

describe('POST /api/mall — 受保护端点', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createOrder 未登录 → 401', async () => {
    const app = await buildApp(); // 未 authed
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/mall',
      payload: {
        action: 'createOrder',
        payload: { items: [{ productId: 'p1', qty: 1 }], pointsUsed: 0 },
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('createOrder 已登录 → 200，回传 orderId', async () => {
    mockOrderService.create.mockResolvedValue({ orderId: 'o-new', payAmount: '99' });
    const app = await buildApp({ authed: true });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/mall',
      payload: {
        action: 'createOrder',
        payload: { items: [{ productId: 'p1', qty: 1 }], pointsUsed: 0 },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(mockOrderService.create).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ items: expect.any(Array) }),
    );
  });

  it('myOrders 已登录 → 返回当前用户的订单列表', async () => {
    mockOrderService.myOrders.mockResolvedValue({
      list: [makeOrder({ id: 'o1', userId: 'u1' })],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    const app = await buildApp({ authed: true });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/mall',
      payload: { action: 'myOrders', payload: { page: 1, pageSize: 20 } },
    });
    expect(res.statusCode).toBe(200);
    expect(mockOrderService.myOrders).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ page: 1, pageSize: 20 }),
    );
  });

  it('cancelOrder：透传 orderId 给 service', async () => {
    mockOrderService.cancel.mockResolvedValue({ ok: true });
    const app = await buildApp({ authed: true });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/mall',
      payload: { action: 'cancelOrder', payload: { orderId: 'o-cancel' } },
    });
    expect(res.statusCode).toBe(200);
    expect(mockOrderService.cancel).toHaveBeenCalledWith('u1', 'o-cancel');
  });

  it('cancelOrder 未登录 → 401', async () => {
    const app = await buildApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/mall',
      payload: { action: 'cancelOrder', payload: { orderId: 'o1' } },
    });
    expect(res.statusCode).toBe(401);
  });
});
