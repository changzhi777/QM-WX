/**
 * ranking routes 路由层测试（V0.1.112 GAP-3.5）
 *
 * 覆盖 1 action（groupRankingMulti）+ 鉴权 + 未知 action 400
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const mockRankingService = vi.hoisted(() => ({
  groupRankingMulti: vi.fn(),
}));

vi.mock('src/modules/ranking/ranking.service.js', () => ({ rankingService: mockRankingService }));
vi.mock('src/modules/ranking/ranking.schema.js', () => {
  const passthrough = { parse: (v: unknown) => v };
  return { GroupRankingMultiInputSchema: passthrough };
});
vi.mock('src/common/errors.js', () => ({
  Errors: {
    unauthorized: () => Object.assign(new Error('unauthorized'), { code: 401, statusCode: 401 }),
    badRequest: (msg: string) => Object.assign(new Error(msg), { code: 400, statusCode: 400 }),
    notFound: (msg: string) => Object.assign(new Error(msg), { code: 404, statusCode: 404 }),
    forbidden: () => Object.assign(new Error('forbidden'), { code: 403, statusCode: 403 }),
  },
}));

import { rankingRoutes } from '../../../src/modules/ranking/ranking.routes.js';

interface MockUser { id: string; openid: string; sub: string }

async function buildApp(opts: { authed?: boolean } = {}) {
  const app = Fastify();
  app.decorateRequest('user', undefined);
  if (opts.authed) {
    app.addHook('onRequest', async (req) => {
      (req as { user?: MockUser }).user = { id: 'u1', openid: 'oU1', sub: 'u1' };
    });
  }
  await app.register(rankingRoutes);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('ranking routes', () => {
  it('未鉴权 → 401', async () => {
    const app = await buildApp();
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'groupRankingMulti' } });
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

  it('groupRankingMulti → 透传 input', async () => {
    mockRankingService.groupRankingMulti.mockResolvedValue({ ranking: [] });
    const app = await buildApp({ authed: true });
    const r = await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'groupRankingMulti', payload: { groupIds: ['g1'] } },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().data).toEqual({ ranking: [] });
    expect(mockRankingService.groupRankingMulti).toHaveBeenCalledWith('u1', { groupIds: ['g1'] });
    await app.close();
  });
});
