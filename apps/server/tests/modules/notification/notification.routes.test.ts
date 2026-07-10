/**
 * notification routes 路由层测试（V0.1.112 GAP-3.5）
 *
 * 覆盖 4 action + 鉴权 + 未知 action 400
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const mockNotificationService = vi.hoisted(() => ({
  list: vi.fn(),
  unreadCount: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
}));

vi.mock('src/modules/notification/notification.service.js', () => ({
  notificationService: mockNotificationService,
}));
vi.mock('src/modules/notification/notification.schema.js', () => {
  const passthrough = { parse: (v: unknown) => v };
  return { NotifPageSchema: passthrough, NotifIdInputSchema: passthrough };
});
vi.mock('src/common/errors.js', () => ({
  Errors: {
    unauthorized: () => Object.assign(new Error('unauthorized'), { code: 401, statusCode: 401 }),
    badRequest: (msg: string) => Object.assign(new Error(msg), { code: 400, statusCode: 400 }),
    notFound: (msg: string) => Object.assign(new Error(msg), { code: 404, statusCode: 404 }),
    forbidden: () => Object.assign(new Error('forbidden'), { code: 403, statusCode: 403 }),
  },
}));

import { notificationRoutes } from '../../../src/modules/notification/notification.routes.js';

interface MockUser { id: string; openid: string; sub: string }

async function buildApp(opts: { authed?: boolean } = {}) {
  const app = Fastify();
  app.decorateRequest('user', undefined);
  if (opts.authed) {
    app.addHook('onRequest', async (req) => {
      (req as { user?: MockUser }).user = { id: 'u1', openid: 'oU1', sub: 'u1' };
    });
  }
  await app.register(notificationRoutes);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('notification routes', () => {
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

  it('list → 透传 input', async () => {
    mockNotificationService.list.mockResolvedValue({ list: [], total: 0 });
    const app = await buildApp({ authed: true });
    const r = await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'list', payload: { page: 1, pageSize: 10 } },
    });
    expect(r.json().data).toEqual({ list: [], total: 0 });
    expect(mockNotificationService.list).toHaveBeenCalledWith('u1', { page: 1, pageSize: 10 });
    await app.close();
  });

  it('unreadCount → 返未读数', async () => {
    mockNotificationService.unreadCount.mockResolvedValue(5);
    const app = await buildApp({ authed: true });
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'unreadCount' } });
    expect(mockNotificationService.unreadCount).toHaveBeenCalledWith('u1');
    await app.close();
  });

  it('markRead → 透传 input', async () => {
    mockNotificationService.markRead.mockResolvedValue({ ok: true });
    const app = await buildApp({ authed: true });
    const r = await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'markRead', payload: { notificationId: 'n1' } },
    });
    expect(mockNotificationService.markRead).toHaveBeenCalledWith('u1', { notificationId: 'n1' });
    await app.close();
  });

  it('markAllRead → 返 ok', async () => {
    mockNotificationService.markAllRead.mockResolvedValue({ ok: true, updated: 3 });
    const app = await buildApp({ authed: true });
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'markAllRead' } });
    expect(mockNotificationService.markAllRead).toHaveBeenCalledWith('u1');
    await app.close();
  });
});
