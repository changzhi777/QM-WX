/**
 * ludong routes 路由层冒烟测试
 *
 * V2 stub 阶段。ludong 4 action：
 * - listOutbox / flushOutbox / bindAccount / bindingStatus
 * - 全部需登录（action 内或顶部 if (!req.user)）
 *
 * 注意：ludong webhook 是独立路由（/webhook/ludong），不在 POST /api/ludong 内
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { mockErrors } from '../../helpers/mockErrors.js';

const mockLudongService = vi.hoisted(() => ({
  listOutbox: vi.fn().mockResolvedValue({ list: [], total: 0 }),
  flushOutbox: vi.fn().mockResolvedValue({ flushed: 0 }),
  bindAccount: vi.fn().mockResolvedValue({ ok: true }),
  bindingStatus: vi.fn().mockResolvedValue({ bound: false }),
}));

vi.mock('src/modules/ludong/ludong.service.js', () => ({ ludongService: mockLudongService }));
vi.mock('src/common/errors.js', () => ({ Errors: mockErrors }));

import { ludongRoutes } from '../../../src/modules/ludong/ludong.routes.js';

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
  await app.register(ludongRoutes, { prefix: '/api/ludong' });
  return app;
}

describe('POST /api/ludong — V2 stub 路由层', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
    await app.ready();
  });

  it.each(['listOutbox', 'flushOutbox', 'bindAccount', 'bindingStatus'])(
    'action=%s 未登录 → 401',
    async (action) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ludong',
        payload: { action, payload: {} },
      });
      expect(res.statusCode).toBe(401);
    },
  );

  it('listOutbox 已登录 → 返回空', async () => {
    const authedApp = await buildApp({ authed: true });
    await authedApp.ready();
    const res = await authedApp.inject({
      method: 'POST',
      url: '/api/ludong',
      payload: { action: 'listOutbox', payload: {} },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ list: [], total: 0 });
    await authedApp.close();
  });

  it('unknown action → 400', async () => {
    const authedApp = await buildApp({ authed: true });
    await authedApp.ready();
    const res = await authedApp.inject({
      method: 'POST',
      url: '/api/ludong',
      payload: { action: 'wat' },
    });
    expect(res.statusCode).toBe(400);
    await authedApp.close();
  });
});
