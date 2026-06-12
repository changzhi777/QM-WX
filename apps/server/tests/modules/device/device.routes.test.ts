/**
 * device routes 路由层冒烟测试
 *
 * 覆盖（V2 stub 阶段）：
 * - listBindings / startOAuth / unbind / syncWeRun / submitHeartRate
 *   - 未登录 → 401
 * - 至少 1 个 happy path：listBindings 已登录 → 返回空 list
 * - unknown action → 400
 *
 * 注：device 是 V2 stub 阶段，service 大多抛 notImplemented —
 *     这里只测路由层鉴权 + 分流，service 行为由 service 单测覆盖
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { mockErrors } from '../../helpers/mockErrors.js';

const mockDeviceService = vi.hoisted(() => ({
  listBindings: vi.fn().mockResolvedValue([]),
  startOAuth: vi.fn().mockResolvedValue({ authUrl: 'https://oauth.example' }),
  unbind: vi.fn().mockResolvedValue({ ok: true }),
  syncWeRun: vi.fn().mockResolvedValue({ ok: true, synced: 0 }),
  submitHeartRate: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('src/modules/device/device.service.js', () => ({ deviceService: mockDeviceService }));
vi.mock('src/common/errors.js', () => ({ Errors: mockErrors }));

import { deviceRoutes } from '../../../src/modules/device/device.routes.js';

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
  await app.register(deviceRoutes, { prefix: '/api/device' });
  return app;
}

describe('POST /api/device — V2 stub 路由层', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
    await app.ready();
  });

  it.each([
    'listBindings',
    'startOAuth',
    'unbind',
    'syncWeRun',
    'submitHeartRate',
  ])('action=%s 未登录 → 401', async (action) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/device',
      payload: { action, payload: {} },
    });
    expect(res.statusCode).toBe(401);
  });

  it('listBindings 已登录 → 返回空 list（service 被调）', async () => {
    const authedApp = await buildApp({ authed: true });
    await authedApp.ready();
    const res = await authedApp.inject({
      method: 'POST',
      url: '/api/device',
      payload: { action: 'listBindings', payload: {} },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
    expect(mockDeviceService.listBindings).toHaveBeenCalledWith('u1');
    await authedApp.close();
  });

  it('unknown action → 400', async () => {
    const authedApp = await buildApp({ authed: true });
    await authedApp.ready();
    const res = await authedApp.inject({
      method: 'POST',
      url: '/api/device',
      payload: { action: 'wat' },
    });
    expect(res.statusCode).toBe(400);
    await authedApp.close();
  });
});
