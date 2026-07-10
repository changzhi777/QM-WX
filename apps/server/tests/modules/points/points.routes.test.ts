/**
 * points routes 路由层测试（V0.1.112 GAP-3.5）
 *
 * 覆盖 3 action + 鉴权 + 未知 action 400
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const mockPointsService = vi.hoisted(() => ({
  myBalance: vi.fn(),
  signin: vi.fn(),
  myTasks: vi.fn(),
}));

vi.mock('src/modules/points/points.service.js', () => ({ pointsService: mockPointsService }));
vi.mock('src/common/errors.js', () => ({
  Errors: {
    unauthorized: () => Object.assign(new Error('unauthorized'), { code: 401, statusCode: 401 }),
    badRequest: (msg: string) => Object.assign(new Error(msg), { code: 400, statusCode: 400 }),
    notFound: (msg: string) => Object.assign(new Error(msg), { code: 404, statusCode: 404 }),
    forbidden: () => Object.assign(new Error('forbidden'), { code: 403, statusCode: 403 }),
  },
}));

import { pointsRoutes } from '../../../src/modules/points/points.routes.js';

interface MockUser { id: string; openid: string; sub: string }

async function buildApp(opts: { authed?: boolean } = {}) {
  const app = Fastify();
  app.decorateRequest('user', undefined);
  if (opts.authed) {
    app.addHook('onRequest', async (req) => {
      (req as { user?: MockUser }).user = { id: 'u1', openid: 'oU1', sub: 'u1' };
    });
  }
  await app.register(pointsRoutes);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('points routes', () => {
  it('未鉴权 → 401', async () => {
    const app = await buildApp();
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'myBalance' } });
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

  it('myBalance → 返余额', async () => {
    mockPointsService.myBalance.mockResolvedValue({ balance: 100 });
    const app = await buildApp({ authed: true });
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'myBalance' } });
    expect(r.statusCode).toBe(200);
    expect(r.json().data).toEqual({ balance: 100 });
    expect(mockPointsService.myBalance).toHaveBeenCalledWith('u1');
    await app.close();
  });

  it('signin → 返签到结果', async () => {
    mockPointsService.signin.mockResolvedValue({ ok: true, pointsAwarded: 10 });
    const app = await buildApp({ authed: true });
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'signin' } });
    expect(r.json().data).toEqual({ ok: true, pointsAwarded: 10 });
    await app.close();
  });

  it('myTasks → 返任务列表', async () => {
    mockPointsService.myTasks.mockResolvedValue({ tasks: [] });
    const app = await buildApp({ authed: true });
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'myTasks' } });
    expect(r.json().data).toEqual({ tasks: [] });
    await app.close();
  });
});
