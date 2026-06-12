/**
 * content routes 冒烟测试
 *
 * 3 个 action：list / detail / enroll
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
