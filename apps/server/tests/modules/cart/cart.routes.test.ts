/**
 * cart routes 路由层测试（V0.1.112 GAP-3.5）
 *
 * 覆盖 5 action + 鉴权 + 未知 action 400
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const mockCartService = vi.hoisted(() => ({
  add: vi.fn(),
  remove: vi.fn(),
  list: vi.fn(),
  updateQty: vi.fn(),
  clear: vi.fn(),
}));

vi.mock('src/modules/cart/cart.service.js', () => ({ cartService: mockCartService }));
vi.mock('src/modules/cart/cart.schema.js', () => {
  const passthrough = { parse: (v: unknown) => v };
  return {
    CartAddInputSchema: passthrough,
    CartRemoveInputSchema: passthrough,
    CartUpdateQtyInputSchema: passthrough,
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

import { cartRoutes } from '../../../src/modules/cart/cart.routes.js';

interface MockUser { id: string; openid: string; sub: string }

async function buildApp(opts: { authed?: boolean } = {}) {
  const app = Fastify();
  app.decorateRequest('user', undefined);
  if (opts.authed) {
    app.addHook('onRequest', async (req) => {
      (req as { user?: MockUser }).user = { id: 'u1', openid: 'oU1', sub: 'u1' };
    });
  }
  await app.register(cartRoutes);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('cart routes', () => {
  it('未鉴权 → 401', async () => {
    const app = await buildApp();
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'list' } });
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

  it('add → 透传 input', async () => {
    mockCartService.add.mockResolvedValue({ productId: 'p1', qty: 1 });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'add', payload: { productId: 'p1', qty: 1 } },
    });
    expect(mockCartService.add).toHaveBeenCalledWith('u1', { productId: 'p1', qty: 1 });
    await app.close();
  });

  it('remove → 取 productId 传 service', async () => {
    mockCartService.remove.mockResolvedValue({ ok: true });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'remove', payload: { productId: 'p1' } },
    });
    expect(mockCartService.remove).toHaveBeenCalledWith('u1', 'p1');
    await app.close();
  });

  it('list → 返列表', async () => {
    mockCartService.list.mockResolvedValue({ items: [], totalAmount: '0.00', count: 0 });
    const app = await buildApp({ authed: true });
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'list' } });
    expect(mockCartService.list).toHaveBeenCalledWith('u1');
    await app.close();
  });

  it('updateQty → 透传 input', async () => {
    mockCartService.updateQty.mockResolvedValue({ productId: 'p1', qty: 2 });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'updateQty', payload: { productId: 'p1', qty: 2 } },
    });
    expect(mockCartService.updateQty).toHaveBeenCalledWith('u1', { productId: 'p1', qty: 2 });
    await app.close();
  });

  it('clear → 返 ok', async () => {
    mockCartService.clear.mockResolvedValue({ ok: true });
    const app = await buildApp({ authed: true });
    await app.inject({ method: 'POST', url: '/', payload: { action: 'clear' } });
    expect(mockCartService.clear).toHaveBeenCalledWith('u1');
    await app.close();
  });
});
