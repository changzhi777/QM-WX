/**
 * feed routes 路由层测试（V0.1.112 GAP-3.5）
 *
 * 覆盖 9 action + 鉴权 + 未知 action 400（V0.2.73 +listComments +shoesForPicker）
 * 注意：myFeeds 解构 page/pageSize 单独传；comment 取 input.feedId/input.content
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const mockFeedService = vi.hoisted(() => ({
  list: vi.fn(),
  hotTopics: vi.fn(),
  myFeeds: vi.fn(),
  publish: vi.fn(),
  like: vi.fn(),
  unlike: vi.fn(),
  comment: vi.fn(),
  listComments: vi.fn(),
  shoesForPicker: vi.fn(),
}));

vi.mock('src/modules/feed/feed.service.js', () => ({ feedService: mockFeedService }));
vi.mock('src/modules/feed/feed.schema.js', () => {
  const passthrough = { parse: (v: unknown) => v };
  return {
    PublishFeedInputSchema: passthrough,
    FeedPageSchema: passthrough,
    CommentInputSchema: passthrough,
    FeedIdInputSchema: passthrough,
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

import { feedRoutes } from '../../../src/modules/feed/feed.routes.js';

interface MockUser { id: string; openid: string; sub: string }

async function buildApp(opts: { authed?: boolean } = {}) {
  const app = Fastify();
  app.decorateRequest('user', undefined);
  if (opts.authed) {
    app.addHook('onRequest', async (req) => {
      (req as { user?: MockUser }).user = { id: 'u1', openid: 'oU1', sub: 'u1' };
    });
  }
  await app.register(feedRoutes);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('feed routes', () => {
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

  it('list → 透传分页 input', async () => {
    mockFeedService.list.mockResolvedValue({ list: [] });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'list', payload: { sort: 'hot', topic: '跑步' } },
    });
    expect(mockFeedService.list).toHaveBeenCalledWith('u1', { sort: 'hot', topic: '跑步' });
    await app.close();
  });

  it('hotTopics → 无参调用', async () => {
    mockFeedService.hotTopics.mockResolvedValue({ topics: [] });
    const app = await buildApp({ authed: true });
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'hotTopics' } });
    expect(r.json().data).toEqual({ topics: [] });
    expect(mockFeedService.hotTopics).toHaveBeenCalledWith();
    await app.close();
  });

  it('myFeeds → 解构 page/pageSize 单独传', async () => {
    mockFeedService.myFeeds.mockResolvedValue({ list: [] });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'myFeeds', payload: { page: 2, pageSize: 10 } },
    });
    expect(mockFeedService.myFeeds).toHaveBeenCalledWith('u1', 2, 10);
    await app.close();
  });

  it('publish → 透传 input', async () => {
    mockFeedService.publish.mockResolvedValue({ id: 'fd1' });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'publish', payload: { content: '今天跑了5公里', topic: '跑步' } },
    });
    expect(mockFeedService.publish).toHaveBeenCalledWith('u1', { content: '今天跑了5公里', topic: '跑步' });
    await app.close();
  });

  it('like → 取 feedId 传 service', async () => {
    mockFeedService.like.mockResolvedValue({ ok: true, liked: true });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'like', payload: { feedId: 'fd1' } },
    });
    expect(mockFeedService.like).toHaveBeenCalledWith('u1', 'fd1');
    await app.close();
  });

  it('unlike → 取 feedId 传 service', async () => {
    mockFeedService.unlike.mockResolvedValue({ ok: true });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'unlike', payload: { feedId: 'fd1' } },
    });
    expect(mockFeedService.unlike).toHaveBeenCalledWith('u1', 'fd1');
    await app.close();
  });

  it('comment → 取 input.feedId/input.content', async () => {
    mockFeedService.comment.mockResolvedValue({ id: 'c1' });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'comment', payload: { feedId: 'fd1', content: '加油' } },
    });
    expect(mockFeedService.comment).toHaveBeenCalledWith('u1', 'fd1', '加油');
    await app.close();
  });

  it('listComments → 取 feedId + page + pageSize 传 service', async () => {
    mockFeedService.listComments.mockResolvedValue({ list: [], total: 0 });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'listComments', payload: { feedId: 'fd1', page: 2, pageSize: 10 } },
    });
    expect(mockFeedService.listComments).toHaveBeenCalledWith('u1', 'fd1', 2, 10);
    await app.close();
  });

  it('shoesForPicker → 无参调用（仅 userId）', async () => {
    mockFeedService.shoesForPicker.mockResolvedValue({ shoes: [] });
    const app = await buildApp({ authed: true });
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'shoesForPicker' } });
    expect(r.json().data).toEqual({ shoes: [] });
    expect(mockFeedService.shoesForPicker).toHaveBeenCalledWith('u1');
    await app.close();
  });
});
