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
    models: ['feed', 'feedLike', 'feedComment'],
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

    const r = await feedService.list('u1', 1, 20);

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

    const r = await feedService.list('u1', 1, 20);
    expect(r.list[0].liked).toBe(true);
  });
});

describe('feedService.publish (V0.1.30)', () => {
  it('创建动态', async () => {
    mocks.prisma.feed.create.mockResolvedValue({ id: 'f1' } as never);
    const r = await feedService.publish('u1', { content: 'hi', images: [] });
    expect(r.id).toBe('f1');
    expect(mocks.prisma.feed.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'u1', content: 'hi' }) }),
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
