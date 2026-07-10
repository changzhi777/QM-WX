/**
 * favorite routes 路由层测试（V0.1.112 GAP-3.5）
 *
 * 覆盖 4 action + 鉴权 + 未知 action 400
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const mockFavoriteService = vi.hoisted(() => ({
  list: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  isFavorited: vi.fn(),
}));

vi.mock('src/modules/favorite/favorite.service.js', () => ({ favoriteService: mockFavoriteService }));
vi.mock('src/modules/favorite/favorite.schema.js', () => {
  const passthrough = { parse: (v: unknown) => v };
  return {
    FavoriteTargetInputSchema: passthrough,
    ListFavoriteQuerySchema: passthrough,
    IsFavoritedInputSchema: passthrough,
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

import { favoriteRoutes } from '../../../src/modules/favorite/favorite.routes.js';

interface MockUser { id: string; openid: string; sub: string }

async function buildApp(opts: { authed?: boolean } = {}) {
  const app = Fastify();
  app.decorateRequest('user', undefined);
  if (opts.authed) {
    app.addHook('onRequest', async (req) => {
      (req as { user?: MockUser }).user = { id: 'u1', openid: 'oU1', sub: 'u1' };
    });
  }
  await app.register(favoriteRoutes);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('favorite routes', () => {
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

  it('list → 透传 query input', async () => {
    mockFavoriteService.list.mockResolvedValue({ favorites: [] });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'list', payload: { targetType: 'content' } },
    });
    expect(mockFavoriteService.list).toHaveBeenCalledWith('u1', { targetType: 'content' });
    await app.close();
  });

  it('add → 透传 target input', async () => {
    mockFavoriteService.add.mockResolvedValue({ ok: true });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'add', payload: { targetType: 'product', targetId: 'p1' } },
    });
    expect(mockFavoriteService.add).toHaveBeenCalledWith('u1', { targetType: 'product', targetId: 'p1' });
    await app.close();
  });

  it('remove → 透传 target input', async () => {
    mockFavoriteService.remove.mockResolvedValue({ ok: true });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'remove', payload: { targetType: 'content', targetId: 'c1' } },
    });
    expect(mockFavoriteService.remove).toHaveBeenCalledWith('u1', { targetType: 'content', targetId: 'c1' });
    await app.close();
  });

  it('isFavorited → 透传批量 input', async () => {
    mockFavoriteService.isFavorited.mockResolvedValue({ results: [] });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'isFavorited', payload: { items: [{ targetType: 'content', targetId: 'c1' }] } },
    });
    expect(mockFavoriteService.isFavorited).toHaveBeenCalledWith('u1', {
      items: [{ targetType: 'content', targetId: 'c1' }],
    });
    await app.close();
  });
});
