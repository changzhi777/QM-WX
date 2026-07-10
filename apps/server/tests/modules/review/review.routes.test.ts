/**
 * review routes 路由层测试（V0.1.113 GAP-3.5 范式）
 *
 * 覆盖 5 action + 鉴权 + 未知 action 400
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const mockReviewService = vi.hoisted(() => ({
  create: vi.fn(),
  listByProduct: vi.fn(),
  productStats: vi.fn(),
  myReviews: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('src/modules/review/review.service.js', () => ({ reviewService: mockReviewService }));
vi.mock('src/modules/review/review.schema.js', () => {
  const passthrough = { parse: (v: unknown) => v };
  return {
    CreateReviewSchema: passthrough,
    ProductReviewListSchema: { parse: (v: unknown) => ({ productId: (v as { productId?: string })?.productId ?? 'p1', page: 1, pageSize: 10 }) },
    ReviewPageSchema: passthrough,
    ProductIdSchema: passthrough,
    ReviewIdSchema: passthrough,
  };
});
vi.mock('src/common/errors.js', () => ({
  Errors: {
    unauthorized: () => Object.assign(new Error('unauthorized'), { code: 401, statusCode: 401 }),
    badRequest: (msg: string) => Object.assign(new Error(msg), { code: 400, statusCode: 400 }),
    notFound: (msg: string) => Object.assign(new Error(msg), { code: 404, statusCode: 404 }),
    forbidden: () => Object.assign(new Error('forbidden'), { code: 403, statusCode: 403 }),
  },
}));

import { reviewRoutes } from '../../../src/modules/review/review.routes.js';

interface MockUser { id: string; openid: string; sub: string }

async function buildApp(opts: { authed?: boolean } = {}) {
  const app = Fastify();
  app.decorateRequest('user', undefined);
  if (opts.authed) {
    app.addHook('onRequest', async (req) => {
      (req as { user?: MockUser }).user = { id: 'u1', openid: 'oU1', sub: 'u1' };
    });
  }
  await app.register(reviewRoutes);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('review routes', () => {
  it('未鉴权 → 401', async () => {
    const app = await buildApp();
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'myReviews' } });
    expect(r.statusCode).toBe(401);
    await app.close();
  });

  it('unknown action → 400', async () => {
    const app = await buildApp({ authed: true });
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'unknown' } });
    expect(r.statusCode).toBe(400);
    expect(r.json().msg).toContain('unknown action');
    await app.close();
  });

  it('create → 透传 input', async () => {
    mockReviewService.create.mockResolvedValue({ id: 'r1' });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'create', payload: { productId: 'p1', orderId: 'o1', rating: 5 } },
    });
    expect(mockReviewService.create).toHaveBeenCalledWith('u1', { productId: 'p1', orderId: 'o1', rating: 5 });
    await app.close();
  });

  it('list → 取 productId + 分页传 service', async () => {
    mockReviewService.listByProduct.mockResolvedValue({ list: [], total: 0 });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'list', payload: { productId: 'p1', page: 1, pageSize: 10 } },
    });
    expect(mockReviewService.listByProduct).toHaveBeenCalledWith('p1', { productId: 'p1', page: 1, pageSize: 10 });
    await app.close();
  });

  it('stats → 取 productId 传 service', async () => {
    mockReviewService.productStats.mockResolvedValue({ avg: 0, count: 0 });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'stats', payload: { productId: 'p1' } },
    });
    expect(mockReviewService.productStats).toHaveBeenCalledWith('p1');
    await app.close();
  });

  it('myReviews → 透传分页 input', async () => {
    mockReviewService.myReviews.mockResolvedValue({ list: [], total: 0 });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'myReviews', payload: { page: 2, pageSize: 5 } },
    });
    expect(mockReviewService.myReviews).toHaveBeenCalledWith('u1', { page: 2, pageSize: 5 });
    await app.close();
  });

  it('remove → 取 id 传 service', async () => {
    mockReviewService.remove.mockResolvedValue({ ok: true });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'remove', payload: { id: 'r1' } },
    });
    expect(mockReviewService.remove).toHaveBeenCalledWith('u1', 'r1');
    await app.close();
  });
});
