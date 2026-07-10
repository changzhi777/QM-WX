/**
 * stats routes 路由层测试（V0.1.112 GAP-3.5）
 *
 * 覆盖 3 action + 鉴权 + 未知 action 400
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const mockStatsService = vi.hoisted(() => ({
  myRunnerStats: vi.fn(),
  myAnnualReport: vi.fn(),
  myCertificates: vi.fn(),
}));

vi.mock('src/modules/stats/stats.service.js', () => ({ statsService: mockStatsService }));
vi.mock('src/modules/stats/stats.schema.js', () => {
  const passthrough = { parse: (v: unknown) => v };
  return { MyRunnerStatsQuerySchema: passthrough, MyAnnualReportQuerySchema: passthrough };
});
vi.mock('src/common/errors.js', () => ({
  Errors: {
    unauthorized: () => Object.assign(new Error('unauthorized'), { code: 401, statusCode: 401 }),
    badRequest: (msg: string) => Object.assign(new Error(msg), { code: 400, statusCode: 400 }),
    notFound: (msg: string) => Object.assign(new Error(msg), { code: 404, statusCode: 404 }),
    forbidden: () => Object.assign(new Error('forbidden'), { code: 403, statusCode: 403 }),
  },
}));

import { statsRoutes } from '../../../src/modules/stats/stats.routes.js';

interface MockUser { id: string; openid: string; sub: string }

async function buildApp(opts: { authed?: boolean } = {}) {
  const app = Fastify();
  app.decorateRequest('user', undefined);
  if (opts.authed) {
    app.addHook('onRequest', async (req) => {
      (req as { user?: MockUser }).user = { id: 'u1', openid: 'oU1', sub: 'u1' };
    });
  }
  await app.register(statsRoutes);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('stats routes', () => {
  it('未鉴权 → 401', async () => {
    const app = await buildApp();
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'myRunnerStats' } });
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

  it('myRunnerStats → 透传 input', async () => {
    mockStatsService.myRunnerStats.mockResolvedValue({ totalDistance: 0 });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'myRunnerStats', payload: { year: 2026 } },
    });
    expect(mockStatsService.myRunnerStats).toHaveBeenCalledWith('u1', { year: 2026 });
    await app.close();
  });

  it('myAnnualReport → 透传 input', async () => {
    mockStatsService.myAnnualReport.mockResolvedValue({ year: 2026, totalDistance: 0 });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'myAnnualReport', payload: { year: 2026 } },
    });
    expect(mockStatsService.myAnnualReport).toHaveBeenCalledWith('u1', { year: 2026 });
    await app.close();
  });

  it('myCertificates → 返证书', async () => {
    mockStatsService.myCertificates.mockResolvedValue({ certificates: [] });
    const app = await buildApp({ authed: true });
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'myCertificates' } });
    expect(mockStatsService.myCertificates).toHaveBeenCalledWith('u1');
    await app.close();
  });
});
