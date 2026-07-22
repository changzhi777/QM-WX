/**
 * content routes 冒烟测试
 *
 * 7 个 action：list / detail / enroll + myEnrollments / submitRaceResult / getRaceLeaderboard / getMyRaceResult（V0.2.73 补 4）
 * - list 公开（不需登录）
 * - detail 公开
 * - enroll 需登录
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const mockService = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  enroll: vi.fn(),
  myEnrollments: vi.fn(),
  submitRaceResult: vi.fn(),
  getRaceLeaderboard: vi.fn(),
  getMyRaceResult: vi.fn(),
}));

vi.mock('src/modules/content/content.service.js', () => ({
  contentService: mockService,
}));

import { contentRoutes } from '../../../src/modules/content/content.routes.js';
import { BusinessError } from '../../../src/common/errors.js';

async function buildApp(opts: { authed?: boolean } = {}) {
  const app = Fastify();
  if (opts.authed) {
    app.decorateRequest('user', undefined);
    app.addHook('onRequest', async (req) => {
      (req as { user?: { id: string } }).user = { id: 'u1' };
    });
  }
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof BusinessError) {
      return reply.status(err.statusCode).send({ code: err.code, msg: err.message });
    }
    return reply.status(500).send({ code: 500, msg: 'unhandled' });
  });
  await app.register(contentRoutes, { prefix: '/api/content' });
  return app;
}

describe('POST /api/content', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('action=list：公开（不需登录）', async () => {
    mockService.list.mockResolvedValue({ list: [], total: 0 });
    const app = await buildApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/content',
      payload: { action: 'list' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockService.list).toHaveBeenCalled();
  });

  it('action=detail', async () => {
    mockService.detail.mockResolvedValue({ content: { id: 'c1' } });
    const app = await buildApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/content',
      payload: { action: 'detail', payload: { id: 'c1' } },
    });
    expect(res.statusCode).toBe(200);
    expect(mockService.detail).toHaveBeenCalledWith('c1');
  });

  it('action=enroll 缺 user → 401', async () => {
    const app = await buildApp(); // 未 authed
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/content',
      payload: { action: 'enroll', payload: { contentId: 'c1' } },
    });
    expect(res.statusCode).toBe(401);
  });

  it('action=enroll 正常', async () => {
    mockService.enroll.mockResolvedValue({ ok: true });
    const app = await buildApp({ authed: true });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/content',
      payload: {
        action: 'enroll',
        payload: { id: 'c1', formData: { name: '张三', phone: '13800000000' } },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(mockService.enroll).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ id: 'c1' }),
    );
  });

  // ===== V0.2.73 补 4 action（真实 schema + 合法 payload）=====
  it('myEnrollments → 透传 input（需登录）', async () => {
    mockService.myEnrollments.mockResolvedValue({ list: [], total: 0 });
    const app = await buildApp({ authed: true });
    await app.ready();
    await app.inject({ method: 'POST', url: '/api/content', payload: { action: 'myEnrollments', payload: { page: 1, pageSize: 20 } } });
    expect(mockService.myEnrollments).toHaveBeenCalledWith('u1', expect.objectContaining({ page: 1, pageSize: 20 }));
    await app.close();
  });

  it('submitRaceResult → 透传 input（需登录）', async () => {
    mockService.submitRaceResult.mockResolvedValue({ ok: true });
    const app = await buildApp({ authed: true });
    await app.ready();
    await app.inject({ method: 'POST', url: '/api/content', payload: { action: 'submitRaceResult', payload: { enrollmentId: 'e1', finishTimeSec: 7200 } } });
    expect(mockService.submitRaceResult).toHaveBeenCalledWith('u1', expect.objectContaining({ enrollmentId: 'e1', finishTimeSec: 7200 }));
    await app.close();
  });

  it('getRaceLeaderboard → 取 contentId/limit（公开，无 requireLogin）', async () => {
    mockService.getRaceLeaderboard.mockResolvedValue({ leaderboard: [] });
    const app = await buildApp();
    await app.ready();
    await app.inject({ method: 'POST', url: '/api/content', payload: { action: 'getRaceLeaderboard', payload: { contentId: 'c1', limit: 10 } } });
    expect(mockService.getRaceLeaderboard).toHaveBeenCalledWith('c1', 10);
    await app.close();
  });

  it('getMyRaceResult → 取 contentId（需登录）', async () => {
    mockService.getMyRaceResult.mockResolvedValue({ result: null });
    const app = await buildApp({ authed: true });
    await app.ready();
    await app.inject({ method: 'POST', url: '/api/content', payload: { action: 'getMyRaceResult', payload: { contentId: 'c1' } } });
    expect(mockService.getMyRaceResult).toHaveBeenCalledWith('u1', 'c1');
    await app.close();
  });

  it('unknown action → 400', async () => {
    const app = await buildApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/content',
      payload: { action: 'wat' },
    });
    expect(res.statusCode).toBe(400);
  });
});
