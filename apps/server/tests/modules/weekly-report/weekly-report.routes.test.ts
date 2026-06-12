/**
 * weekly-report routes 冒烟测试
 *
 * 3 个 action：currentWeek / myReport / trigger
 * - trigger 必传 groupId，缺则 400
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const mockService = vi.hoisted(() => ({
  currentWeek: vi.fn(),
  myReport: vi.fn(),
  trigger: vi.fn(),
}));

vi.mock('src/modules/weekly-report/weekly-report.service.js', () => ({
  weeklyReportService: mockService,
}));

import { weeklyReportRoutes } from '../../../src/modules/weekly-report/weekly-report.routes.js';
import { BusinessError } from '../../../src/common/errors.js';

async function buildApp() {
  const app = Fastify();
  app.decorateRequest('user', undefined);
  app.addHook('onRequest', async (req) => {
    (req as { user?: { id: string } }).user = { id: 'u1' };
  });
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof BusinessError) {
      return reply.status(err.statusCode).send({ code: err.code, msg: err.message });
    }
    return reply.status(500).send({ code: 500, msg: 'unhandled' });
  });
  await app.register(weeklyReportRoutes, { prefix: '/api/weekly-report' });
  return app;
}

describe('POST /api/weekly-report', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
    await app.ready();
  });

  it('action=currentWeek 调 service.currentWeek', async () => {
    mockService.currentWeek.mockResolvedValue([{ groupId: 'g1' }]);
    const res = await app.inject({
      method: 'POST',
      url: '/api/weekly-report',
      payload: { action: 'currentWeek' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.reports).toEqual([{ groupId: 'g1' }]);
    expect(mockService.currentWeek).toHaveBeenCalledWith('u1', undefined);
  });

  it('action=currentWeek 传 groupId', async () => {
    mockService.currentWeek.mockResolvedValue([]);
    const res = await app.inject({
      method: 'POST',
      url: '/api/weekly-report',
      payload: { action: 'currentWeek', payload: { groupId: 'g1' } },
    });
    expect(res.statusCode).toBe(200);
    expect(mockService.currentWeek).toHaveBeenCalledWith('u1', 'g1');
  });

  it('action=myReport 调 service.myReport', async () => {
    mockService.myReport.mockResolvedValue({ reports: [] });
    const res = await app.inject({
      method: 'POST',
      url: '/api/weekly-report',
      payload: { action: 'myReport' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockService.myReport).toHaveBeenCalledWith('u1', undefined);
  });

  it('action=trigger 缺 groupId → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/weekly-report',
      payload: { action: 'trigger' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().msg).toBe('groupId required');
  });

  it('action=trigger 正常', async () => {
    mockService.trigger.mockResolvedValue({ reportId: 'r1' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/weekly-report',
      payload: { action: 'trigger', payload: { groupId: 'g1', period: '2026-W25' } },
    });
    expect(res.statusCode).toBe(200);
    expect(mockService.trigger).toHaveBeenCalledWith('u1', 'g1', '2026-W25');
  });

  it('unknown action → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/weekly-report',
      payload: { action: 'wat' },
    });
    expect(res.statusCode).toBe(400);
  });
});
