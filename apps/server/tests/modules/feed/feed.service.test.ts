/**
 * feed module 单测（V0.1.30，社交向 — 动态/点赞/评论；V0.1.31 +notify 集成）
 *
 * 覆盖：list（含 liked）/ publish / like（幂等+事务+notFound+通知作者）/ comment（事务+通知作者）
 *
 * 设计：
 * - 用 createPrismaMock（含 tx，$transaction 回调友好）
 * - mock 掉 notify（feed 集成 notification，单元测试隔离 + 断言集成调用）
 * - vi.hoisted 包裹 createPrismaMock（避免 hoisting 引用错误）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockErrors } from '../../helpers/mockErrors.js';

// vi.hoisted 让 createPrismaMock 在 vi.mock 工厂执行前就绪（避免 hoisting 引用错误）
const mocks = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const helpers = require('../../helpers/mockPrisma.ts') as typeof import('../../helpers/mockPrisma.js');
  return helpers.createPrismaMock({
    models: ['feed', 'feedLike', 'feedComment', 'shoe'], // V0.1.136 +shoe
    txModels: ['feed', 'feedLike', 'feedComment'],
  });
});
vi.mock('src/infra/prisma.js', () => ({ prisma: mocks.prisma }));
vi.mock('src/common/errors.js', () => ({ Errors: mockErrors }));
// V0.1.31：mock 掉 notify，让 feed 测试不依赖 notification 真实 prisma；同时可断言集成调用
vi.mock('src/modules/notification/notification.service.js', () => ({ notify: vi.fn() }));

import { feedService } from 'src/modules/feed/feed.service.js';
import { notify } from 'src/modules/notification/notification.service.js';

beforeEach(() => vi.clearAllMocks());

describe('feedService.list (V0.1.30)', () => {
  it('返动态流 + 作者 + liked=false（未点赞）', async () => {
    mocks.prisma.feed.findMany.mockResolvedValue([
      {
        id: 'f1',
        content: '今天跑了 10km',
        images: [],
        distanceKm: 10,
        likeCount: 5,
        commentCount: 2,
        createdAt: new Date('2026-07-01T00:00:00Z'),
        user: { id: 'u2', nickname: '张三', avatarUrl: null },
        likes: [], // 当前用户未点赞
      },
    ] as never);
    mocks.prisma.feed.count.mockResolvedValue(1 as never);

    const r = await feedService.list('u1', { page: 1, pageSize: 20 });

    expect(r.list).toHaveLength(1);
    expect(r.list[0].content).toBe('今天跑了 10km');
    expect(r.list[0].distanceKm).toBe(10);
    expect(r.list[0].liked).toBe(false);
    expect(r.list[0].user.nickname).toBe('张三');
    expect(r.hasMore).toBe(false);
  });

  it('已点赞 → liked=true', async () => {
    mocks.prisma.feed.findMany.mockResolvedValue([
      {
        id: 'f1', content: 'test', images: [], distanceKm: null,
        likeCount: 1, commentCount: 0, createdAt: new Date(),
        user: { id: 'u2', nickname: 'B', avatarUrl: null },
        likes: [{ id: 'l1' }], // 已点赞
      },
    ] as never);
    mocks.prisma.feed.count.mockResolvedValue(1 as never);

    const r = await feedService.list('u1', { page: 1, pageSize: 20 });
    expect(r.list[0].liked).toBe(true);
  });
});

describe('feedService.publish (V0.1.30 + V0.1.36 topic/video)', () => {
  it('创建动态', async () => {
    mocks.prisma.feed.create.mockResolvedValue({ id: 'f1' } as never);
    const r = await feedService.publish('u1', { content: 'hi', images: [] });
    expect(r.id).toBe('f1');
    expect(mocks.prisma.feed.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'u1', content: 'hi' }) }),
    );
  });

  it('V0.1.36 +topic +videoUrl', async () => {
    mocks.prisma.feed.create.mockResolvedValue({ id: 'f2' } as never);
    await feedService.publish('u1', {
      content: '马拉松完赛',
      images: [],
      topic: '马拉松',
      videoUrl: 'https://example.com/run.mp4',
    });
    expect(mocks.prisma.feed.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          topic: '马拉松',
          videoUrl: 'https://example.com/run.mp4',
        }),
      }),
    );
  });
});

describe('feedService.like (V0.1.30 + V0.1.31 notify)', () => {
  it('点赞 → likeCount+1（事务内 create + update）+ 通知作者', async () => {
    mocks.prisma.feed.findUnique.mockResolvedValue({ id: 'f1', userId: 'u2' } as never);
    mocks.prisma.feedLike.findUnique.mockResolvedValue(null); // 未点赞

    const r = await feedService.like('u1', 'f1');

    expect(r.liked).toBe(true);
    expect(mocks.tx.feedLike.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { feedId: 'f1', userId: 'u1' } }),
    );
    expect(mocks.tx.feed.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'f1' }, data: { likeCount: { increment: 1 } } }),
    );
    // V0.1.31：通知动态作者（u2 接收，u1 触发）
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u2', actorId: 'u1', type: 'like', targetId: 'f1' }),
    );
  });

  it('已点赞 → 幂等（不重复加 count，不发通知）', async () => {
    mocks.prisma.feed.findUnique.mockResolvedValue({ id: 'f1', userId: 'u2' } as never);
    mocks.prisma.feedLike.findUnique.mockResolvedValue({ id: 'l1' }); // 已点赞

    const r = await feedService.like('u1', 'f1');

    expect(r.liked).toBe(true);
    expect(mocks.tx.feedLike.create).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('动态不存在 → notFound（不调 notify）', async () => {
    mocks.prisma.feed.findUnique.mockResolvedValue(null);
    await expect(feedService.like('u1', 'f1')).rejects.toThrow();
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('feedService.unlike (V0.1.30)', () => {
  it('已点赞 → 取消 + likeCount-1（事务）', async () => {
    mocks.prisma.feedLike.findUnique.mockResolvedValue({ id: 'l1' });
    const r = await feedService.unlike('u1', 'f1');
    expect(r.liked).toBe(false);
    expect(mocks.tx.feedLike.delete).toHaveBeenCalledWith({ where: { id: 'l1' } });
    expect(mocks.tx.feed.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { likeCount: { decrement: 1 } } }),
    );
  });

  it('未点赞 → 幂等', async () => {
    mocks.prisma.feedLike.findUnique.mockResolvedValue(null);
    const r = await feedService.unlike('u1', 'f1');
    expect(r.liked).toBe(false);
    expect(mocks.tx.feedLike.delete).not.toHaveBeenCalled();
  });
});

describe('feedService.comment (V0.1.30 + V0.1.31 notify)', () => {
  it('评论 → commentCount+1（事务）+ 通知作者', async () => {
    mocks.prisma.feed.findUnique.mockResolvedValue({ id: 'f1', userId: 'u2' } as never);
    mocks.tx.feedComment.create.mockResolvedValue({ id: 'c1' } as never);

    const r = await feedService.comment('u1', 'f1', '不错');

    expect(r.id).toBe('c1');
    expect(mocks.tx.feedComment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { feedId: 'f1', userId: 'u1', content: '不错' } }),
    );
    expect(mocks.tx.feed.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { commentCount: { increment: 1 } } }),
    );
    // V0.1.31：通知动态作者（u2 接收，含评论摘要）
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u2', actorId: 'u1', type: 'comment', content: '不错' }),
    );
  });

  it('动态不存在 → notFound', async () => {
    mocks.prisma.feed.findUnique.mockResolvedValue(null);
    await expect(feedService.comment('u1', 'f1', 'x')).rejects.toThrow();
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('feedService.hotTopics (V0.1.36 红心广场)', () => {
  it('返热门话题（groupBy topic desc，过滤 null）', async () => {
    mocks.prisma.feed.groupBy.mockResolvedValue([
      { topic: '马拉松', _count: { _all: 5 } },
      { topic: '晨跑', _count: { _all: 3 } },
      { topic: null, _count: { _all: 10 } }, // null 应被过滤
    ] as never);

    const r = await feedService.hotTopics();

    expect(r.topics).toHaveLength(2); // null 过滤
    expect(r.topics[0]).toEqual({ topic: '马拉松', count: 5 });
    expect(r.topics[1]).toEqual({ topic: '晨跑', count: 3 });
  });
});

describe('feedService.list V0.1.36 sort/topic', () => {
  it('sort=hot → orderBy likeCount desc', async () => {
    mocks.prisma.feed.findMany.mockResolvedValue([] as never);
    mocks.prisma.feed.count.mockResolvedValue(0 as never);
    await feedService.list('u1', { page: 1, pageSize: 20, sort: 'hot' });
    expect(mocks.prisma.feed.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { likeCount: 'desc' } }),
    );
  });

  it('topic 过滤 → where topic', async () => {
    mocks.prisma.feed.findMany.mockResolvedValue([] as never);
    mocks.prisma.feed.count.mockResolvedValue(0 as never);
    await feedService.list('u1', { page: 1, pageSize: 20, topic: '马拉松' });
    expect(mocks.prisma.feed.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { topic: '马拉松' } }),
    );
  });
});

// V0.1.116 userId 过滤（用户主页动态 tab）
describe('feedService.list V0.1.116 userId 过滤', () => {
  it('传 userId → where 含 userId', async () => {
    mocks.prisma.feed.findMany.mockResolvedValue([] as never);
    mocks.prisma.feed.count.mockResolvedValue(0 as never);
    await feedService.list('u1', { page: 1, pageSize: 20, userId: 'u2' });
    expect(mocks.prisma.feed.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'u2' }) }),
    );
  });
});

// ============================================================
// V0.1.136 关联跑鞋
// ============================================================

describe('feedService.publish 含 shoeId (V0.1.136)', () => {
  it('shoeId 属于 user → 写库', async () => {
    mocks.prisma.shoe.findFirst.mockResolvedValue({ id: 's1' } as never);
    mocks.prisma.feed.create.mockResolvedValue({ id: 'f1' } as never);

    const r = await feedService.publish('u1', {
      content: '今天跑了 10 km',
      images: [],
      shoeId: 's1',
    });
    expect(r.id).toBe('f1');
    expect(mocks.prisma.feed.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ shoeId: 's1' }),
      }),
    );
  });

  it('shoeId 不属于 user → 忽略（写 null）', async () => {
    mocks.prisma.shoe.findFirst.mockResolvedValue(null);
    mocks.prisma.feed.create.mockResolvedValue({ id: 'f1' } as never);

    await feedService.publish('u1', { content: 'x', images: [], shoeId: 's99' });
    expect(mocks.prisma.feed.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ shoeId: null }),
      }),
    );
  });
});

describe('feedService.shoesForPicker (V0.1.136)', () => {
  it('返用户 active 跑鞋列表', async () => {
    mocks.prisma.shoe.findMany.mockResolvedValue([
      { id: 's1', brand: 'Nike', model: 'Vaporfly', nickname: '战靴一号', currentKm: 600 },
      { id: 's2', brand: '必迈', model: '路征', nickname: null, currentKm: 300 },
    ] as never);

    const r = await feedService.shoesForPicker('u1');
    expect(r.shoes).toHaveLength(2);
    expect(r.shoes[0].brand).toBe('Nike');
  });
});

describe('feedService.list 含 shoe (V0.1.136)', () => {
  it('返回 list 项含 shoe 信息', async () => {
    mocks.prisma.feed.findMany.mockResolvedValue([
      {
        id: 'f1',
        content: 'x',
        images: [],
        distanceKm: null,
        topic: null,
        videoUrl: null,
        shoeId: 's1',
        likeCount: 0,
        commentCount: 0,
        createdAt: new Date('2026-07-01'),
        user: { id: 'u1', nickname: '张三', avatarUrl: null },
        likes: [],
        shoe: { id: 's1', brand: 'Nike', model: 'Vaporfly', nickname: '战靴', currentKm: 600 },
      },
    ] as never);
    mocks.prisma.feed.count.mockResolvedValue(1);

    const r = await feedService.list('u1', { page: 1, pageSize: 20, sort: 'latest', topic: undefined, userId: undefined });
    expect(r.list[0].shoe?.brand).toBe('Nike');
    expect(r.list[0].shoe?.currentKm).toBe(600);
  });
});

// ============================================================
// V0.2.72 listComments（评论列表 + user include + total）
// ============================================================
describe('feedService.listComments (V0.2.72)', () => {
  it('happy: 返评论列表 + total + user include', async () => {
    mocks.prisma.feedComment.findMany.mockResolvedValue([
      { id: 'c1', content: '不错', createdAt: new Date('2026-07-01T00:00:00Z'), user: { id: 'u2', nickname: '张三', avatarUrl: null } },
    ] as never);
    mocks.prisma.feedComment.count.mockResolvedValue(1 as never);

    const r = await feedService.listComments('u1', 'f1');
    expect(r.total).toBe(1);
    expect(r.list).toHaveLength(1);
    expect(r.list[0].content).toBe('不错');
    expect(r.list[0].user?.nickname).toBe('张三');
  });

  it('空评论 → list [] + total 0', async () => {
    mocks.prisma.feedComment.findMany.mockResolvedValue([] as never);
    mocks.prisma.feedComment.count.mockResolvedValue(0 as never);

    const r = await feedService.listComments('u1', 'f_empty');
    expect(r.total).toBe(0);
    expect(r.list).toEqual([]);
  });
});

// ============================================================
// V0.2.73 myFeeds 补测（用户主页动态 tab — 分页 + liked + shoe + hasMore）
// ============================================================
describe('feedService.myFeeds (V0.2.73 补测)', () => {
  it('happy: 返当前用户动态 + liked 判断 + shoe + hasMore=true', async () => {
    mocks.prisma.feed.findMany.mockResolvedValue([
      {
        id: 'f1', content: '我的动态', images: [], distanceKm: 5,
        topic: '晨跑', videoUrl: null,
        likeCount: 3, commentCount: 1, createdAt: new Date('2026-07-01'),
        user: { id: 'u1', nickname: '我', avatarUrl: null },
        likes: [{ id: 'l1' }], // 自己点过赞 → liked=true
        shoe: { id: 's1', brand: 'Nike', model: 'Vaporfly', nickname: '战靴', currentKm: 600 },
      },
    ] as never);
    mocks.prisma.feed.count.mockResolvedValue(15 as never);

    const r = await feedService.myFeeds('u1', 1, 10);

    expect(r.total).toBe(15);
    expect(r.list).toHaveLength(1);
    expect(r.list[0].content).toBe('我的动态');
    expect(r.list[0].liked).toBe(true);
    expect(r.list[0].shoe?.brand).toBe('Nike');
    expect(r.hasMore).toBe(true); // 1*10 < 15
    // where 锁当前用户 + 分页 skip/take
    expect(mocks.prisma.feed.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' }, skip: 0, take: 10 }),
    );
  });

  it('分页 page=2 pageSize=10 → skip=10 + hasMore=false（total=15 边界）', async () => {
    mocks.prisma.feed.findMany.mockResolvedValue([] as never);
    mocks.prisma.feed.count.mockResolvedValue(15 as never);

    const r = await feedService.myFeeds('u1', 2, 10);

    expect(mocks.prisma.feed.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    expect(r.hasMore).toBe(false); // 2*10=20 >= 15
    expect(r.page).toBe(2);
    expect(r.pageSize).toBe(10);
  });
});
