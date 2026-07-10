/**
 * group-buy routes 路由层测试（V0.1.112 GAP-3.5）
 *
 * 覆盖 4 action + 鉴权 + 未知 action 400
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const mockGroupBuyService = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  join: vi.fn(),
  myJoined: vi.fn(),
}));

vi.mock('src/modules/group-buy/group-buy.service.js', () => ({ groupBuyService: mockGroupBuyService }));
vi.mock('src/modules/group-buy/group-buy.schema.js', () => {
  const passthrough = { parse: (v: unknown) => v };
  return { GroupBuyIdSchema: passthrough, GroupBuyPageSchema: passthrough };
});
vi.mock('src/common/errors.js', () => ({
  Errors: {
    unauthorized: () => Object.assign(new Error('unauthorized'), { code: 401, statusCode: 401 }),
    badRequest: (msg: string) => Object.assign(new Error(msg), { code: 400, statusCode: 400 }),
    notFound: (msg: string) => Object.assign(new Error(msg), { code: 404, statusCode: 404 }),
    forbidden: () => Object.assign(new Error('forbidden'), { code: 403, statusCode: 403 }),
  },
}));

import { groupBuyRoutes } from '../../../src/modules/group-buy/group-buy.routes.js';

interface MockUser { id: string; openid: string; sub: string }

async function buildApp(opts: { authed?: boolean } = {}) {
  const app = Fastify();
  app.decorateRequest('user', undefined);
  if (opts.authed) {
    app.addHook('onRequest', async (req) => {
      (req as { user?: MockUser }).user = { id: 'u1', openid: 'oU1', sub: 'u1' };
    });
  }
  await app.register(groupBuyRoutes);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('group-buy routes', () => {
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

  it('list → 透传分页 input', async () => {
    mockGroupBuyService.list.mockResolvedValue({ list: [] });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'list', payload: { page: 2 } },
    });
    expect(mockGroupBuyService.list).toHaveBeenCalledWith('u1', { page: 2 });
    await app.close();
  });

  it('detail → 透传 id input', async () => {
    mockGroupBuyService.detail.mockResolvedValue({ id: 'gb1' });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'detail', payload: { id: 'gb1' } },
    });
    expect(mockGroupBuyService.detail).toHaveBeenCalledWith('u1', { id: 'gb1' });
    await app.close();
  });

  it('join → 透传 id input', async () => {
    mockGroupBuyService.join.mockResolvedValue({ ok: true });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'join', payload: { id: 'gb1' } },
    });
    expect(mockGroupBuyService.join).toHaveBeenCalledWith('u1', { id: 'gb1' });
    await app.close();
  });

  it('myJoined → 透传分页 input', async () => {
    mockGroupBuyService.myJoined.mockResolvedValue({ list: [] });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'myJoined', payload: { page: 1 } },
    });
    expect(mockGroupBuyService.myJoined).toHaveBeenCalledWith('u1', { page: 1 });
    await app.close();
  });
});
