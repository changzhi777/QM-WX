/**
 * stats routes 路由层测试（V0.1.112 GAP-3.5）
 *
 * 覆盖 10 action 全分流 + 鉴权 + 未知 action 400（V0.2.73 补 6：healthScore/dailyReport/dailyReportList/weatherAir/weatherAnalysis/userProfile）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const mockStatsService = vi.hoisted(() => ({
  myRunnerStats: vi.fn(),
  myAnnualReport: vi.fn(),
  myCertificates: vi.fn(),
  weather: vi.fn(), // V0.1.148
  healthScore: vi.fn(),
  dailyReport: vi.fn(),
  dailyReportList: vi.fn(),
  weatherAir: vi.fn(),
  weatherAnalysis: vi.fn(),
  userProfile: vi.fn(),
}));

vi.mock('src/modules/stats/stats.service.js', () => ({ statsService: mockStatsService }));
vi.mock('src/modules/stats/stats.schema.js', () => {
  const passthrough = { parse: (v: unknown) => v };
  return {
    MyRunnerStatsQuerySchema: passthrough,
    MyAnnualReportQuerySchema: passthrough,
    HealthScoreQuerySchema: passthrough,
    DailyReportQuerySchema: passthrough,
    DailyReportListQuerySchema: passthrough,
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

  it('weather (V0.1.148) → 透传 lat/lon', async () => {
    mockStatsService.weather.mockResolvedValue({ city: '长沙', temperature: 37 });
    const app = await buildApp({ authed: true });
    const r = await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'weather', payload: { lat: 28.23, lon: 112.94 } },
    });
    expect(mockStatsService.weather).toHaveBeenCalledWith('u1', { lat: 28.23, lon: 112.94 });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.city).toBe('长沙');
    await app.close();
  });

  it('healthScore → 透传 input', async () => {
    mockStatsService.healthScore.mockResolvedValue({ score: 85 });
    const app = await buildApp({ authed: true });
    await app.inject({ method: 'POST', url: '/', payload: { action: 'healthScore', payload: { days: 30 } } });
    expect(mockStatsService.healthScore).toHaveBeenCalledWith('u1', { days: 30 });
    await app.close();
  });

  it('dailyReport → 透传 input', async () => {
    mockStatsService.dailyReport.mockResolvedValue({ advice: 'AI建议' });
    const app = await buildApp({ authed: true });
    await app.inject({ method: 'POST', url: '/', payload: { action: 'dailyReport', payload: { date: '2026-07-23' } } });
    expect(mockStatsService.dailyReport).toHaveBeenCalledWith('u1', { date: '2026-07-23' });
    await app.close();
  });

  it('dailyReportList → 透传 input', async () => {
    mockStatsService.dailyReportList.mockResolvedValue({ list: [] });
    const app = await buildApp({ authed: true });
    await app.inject({ method: 'POST', url: '/', payload: { action: 'dailyReportList', payload: { page: 1, pageSize: 20 } } });
    expect(mockStatsService.dailyReportList).toHaveBeenCalledWith('u1', { page: 1, pageSize: 20 });
    await app.close();
  });

  it('weatherAir → cast payload（不走 schema）', async () => {
    mockStatsService.weatherAir.mockResolvedValue({ aqi: 80 });
    const app = await buildApp({ authed: true });
    await app.inject({ method: 'POST', url: '/', payload: { action: 'weatherAir', payload: { lat: 28.23, lon: 112.94 } } });
    expect(mockStatsService.weatherAir).toHaveBeenCalledWith('u1', { lat: 28.23, lon: 112.94 });
    await app.close();
  });

  it('weatherAnalysis → 无参（仅 userId）', async () => {
    mockStatsService.weatherAnalysis.mockResolvedValue({ correlations: [] });
    const app = await buildApp({ authed: true });
    await app.inject({ method: 'POST', url: '/', payload: { action: 'weatherAnalysis' } });
    expect(mockStatsService.weatherAnalysis).toHaveBeenCalledWith('u1');
    await app.close();
  });

  it('userProfile → 无参（仅 userId）', async () => {
    mockStatsService.userProfile.mockResolvedValue({ level: 'intermediate' });
    const app = await buildApp({ authed: true });
    await app.inject({ method: 'POST', url: '/', payload: { action: 'userProfile' } });
    expect(mockStatsService.userProfile).toHaveBeenCalledWith('u1');
    await app.close();
  });
});
