/**
 * follow routes 路由层测试（V0.1.112 GAP-3.5）
 *
 * 覆盖 6 action + 鉴权 + 未知 action 400
 * 注意：myCounts 参数顺序为 (payload.userId, meId)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const mockFollowService = vi.hoisted(() => ({
  follow: vi.fn(),
  unfollow: vi.fn(),
  isFollowing: vi.fn(),
  myFollowing: vi.fn(),
  myFollowers: vi.fn(),
  myCounts: vi.fn(),
}));

vi.mock('src/modules/follow/follow.service.js', () => ({ followService: mockFollowService }));
vi.mock('src/modules/follow/follow.schema.js', () => {
  const passthrough = { parse: (v: unknown) => v };
  return {
    UserIdInputSchema: passthrough,
    FollowPageSchema: passthrough,
    IsFollowingInputSchema: passthrough,
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

import { followRoutes } from '../../../src/modules/follow/follow.routes.js';

interface MockUser { id: string; openid: string; sub: string }

async function buildApp(opts: { authed?: boolean } = {}) {
  const app = Fastify();
  app.decorateRequest('user', undefined);
  if (opts.authed) {
    app.addHook('onRequest', async (req) => {
      (req as { user?: MockUser }).user = { id: 'u1', openid: 'oU1', sub: 'u1' };
    });
  }
  await app.register(followRoutes);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('follow routes', () => {
  it('未鉴权 → 401', async () => {
    const app = await buildApp();
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'follow' } });
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

  it('follow → 透传 userId input', async () => {
    mockFollowService.follow.mockResolvedValue({ ok: true, following: true });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'follow', payload: { userId: 'u2' } },
    });
    expect(mockFollowService.follow).toHaveBeenCalledWith('u1', { userId: 'u2' });
    await app.close();
  });

  it('unfollow → 透传 userId input', async () => {
    mockFollowService.unfollow.mockResolvedValue({ ok: true });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'unfollow', payload: { userId: 'u2' } },
    });
    expect(mockFollowService.unfollow).toHaveBeenCalledWith('u1', { userId: 'u2' });
    await app.close();
  });

  it('isFollowing → 透传批量 input', async () => {
    mockFollowService.isFollowing.mockResolvedValue({ results: [] });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'isFollowing', payload: { userIds: ['u2', 'u3'] } },
    });
    expect(mockFollowService.isFollowing).toHaveBeenCalledWith('u1', { userIds: ['u2', 'u3'] });
    await app.close();
  });

  it('myFollowing → 透传分页 input', async () => {
    mockFollowService.myFollowing.mockResolvedValue({ list: [] });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'myFollowing', payload: { page: 1, pageSize: 10 } },
    });
    expect(mockFollowService.myFollowing).toHaveBeenCalledWith('u1', { page: 1, pageSize: 10 });
    await app.close();
  });

  it('myFollowers → 透传分页 input', async () => {
    mockFollowService.myFollowers.mockResolvedValue({ list: [] });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'myFollowers', payload: { page: 1 } },
    });
    expect(mockFollowService.myFollowers).toHaveBeenCalledWith('u1', { page: 1 });
    await app.close();
  });

  it('myCounts → 参数顺序 (targetUserId, meId)', async () => {
    mockFollowService.myCounts.mockResolvedValue({ followingCount: 0 });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'myCounts', payload: { userId: 'u2' } },
    });
    // myCounts(被查 userId, viewerId)
    expect(mockFollowService.myCounts).toHaveBeenCalledWith('u2', 'u1');
    await app.close();
  });
});
