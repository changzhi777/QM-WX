/**
 * follow module 单测（V0.1.32，社交向深化 — 关注/粉丝）
 *
 * 覆盖：follow（正常 + 不能关注自己 + notFound + 通知）/ unfollow（幂等）
 *      / isFollowing（批量）/ myFollowing / myFollowers / myCounts（含 isFollowing + isSelf）
 *
 * 设计：mock notify（隔离 + 断言集成调用，同 feed.test.ts 范式）
 *      vi.hoisted 包裹 createPrismaMock（避免 hoisting 引用错）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockErrors } from '../../helpers/mockErrors.js';

const mocks = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const helpers = require('../../helpers/mockPrisma.ts') as typeof import('../../helpers/mockPrisma.js');
  return helpers.createPrismaMock({
    models: ['user', 'follow'],
    txModels: [],
  });
});
vi.mock('src/infra/prisma.js', () => ({ prisma: mocks.prisma }));
vi.mock('src/common/errors.js', () => ({ Errors: mockErrors }));
vi.mock('src/modules/notification/notification.service.js', () => ({ notify: vi.fn() }));

import { followService } from 'src/modules/follow/follow.service.js';
import { notify } from 'src/modules/notification/notification.service.js';

beforeEach(() => vi.clearAllMocks());

describe('followService.follow (V0.1.32)', () => {
  it('关注 → upsert + 通知被关注者', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: 'u2' } as never);
    mocks.prisma.follow.upsert.mockResolvedValue({} as never);

    const r = await followService.follow('u1', { userId: 'u2' });

    expect(r.following).toBe(true);
    expect(mocks.prisma.follow.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { followerId_followeeId: { followerId: 'u1', followeeId: 'u2' } },
        create: { followerId: 'u1', followeeId: 'u2' },
      }),
    );
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u2', actorId: 'u1', type: 'follow' }),
    );
  });

  it('不能关注自己 → badRequest', async () => {
    await expect(followService.follow('u1', { userId: 'u1' })).rejects.toThrow();
    expect(mocks.prisma.follow.upsert).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('目标用户不存在 → notFound', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    await expect(followService.follow('u1', { userId: 'uX' })).rejects.toThrow();
    expect(mocks.prisma.follow.upsert).not.toHaveBeenCalled();
  });
});

describe('followService.unfollow (V0.1.32)', () => {
  it('取关 → deleteMany（幂等）', async () => {
    mocks.prisma.follow.deleteMany.mockResolvedValue({ count: 1 } as never);
    const r = await followService.unfollow('u1', { userId: 'u2' });
    expect(r.following).toBe(false);
    expect(mocks.prisma.follow.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { followerId: 'u1', followeeId: 'u2' } }),
    );
  });
});

describe('followService.isFollowing (V0.1.32)', () => {
  it('批量查关注状态（Set 拼装）', async () => {
    mocks.prisma.follow.findMany.mockResolvedValue([
      { followeeId: 'u2' },
      { followeeId: 'u4' },
    ] as never);
    const r = await followService.isFollowing('u1', { userIds: ['u2', 'u3', 'u4'] });
    expect(r.results).toEqual([
      { userId: 'u2', following: true },
      { userId: 'u3', following: false },
      { userId: 'u4', following: true },
    ]);
  });
});

describe('followService.myFollowing (V0.1.32)', () => {
  it('我关注的人（分页 + 含 user）', async () => {
    mocks.prisma.follow.findMany.mockResolvedValue([
      { followeeId: 'u2', createdAt: new Date('2026-07-03T00:00:00Z'), followee: { id: 'u2', nickname: '张三', avatarUrl: null } },
    ] as never);
    mocks.prisma.follow.count.mockResolvedValue(1 as never);

    const r = await followService.myFollowing('u1', { page: 1, pageSize: 20 });

    expect(r.list).toHaveLength(1);
    expect(r.list[0].user.nickname).toBe('张三');
    expect(r.hasMore).toBe(false);
  });
});

describe('followService.myFollowers (V0.1.32)', () => {
  it('我的粉丝（分页 + 含 user）', async () => {
    mocks.prisma.follow.findMany.mockResolvedValue([
      { followerId: 'u3', createdAt: new Date('2026-07-03T00:00:00Z'), follower: { id: 'u3', nickname: '粉丝A', avatarUrl: null } },
    ] as never);
    mocks.prisma.follow.count.mockResolvedValue(1 as never);

    const r = await followService.myFollowers('u2', { page: 1, pageSize: 20 });

    expect(r.list).toHaveLength(1);
    expect(r.list[0].user.nickname).toBe('粉丝A');
  });
});

describe('followService.myCounts (V0.1.32)', () => {
  it('返 counts + isFollowing + isSelf + user（看别人）', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'u2', nickname: '张三', avatarUrl: null,
    } as never);
    mocks.prisma.follow.count.mockResolvedValue(5 as never); // followingCount
    // followerCount 第二次 count 调用
    mocks.prisma.follow.findUnique.mockResolvedValue({ id: 'f1' } as never); // existing → isFollowing

    const r = await followService.myCounts('u2', 'u1');

    expect(r.user.nickname).toBe('张三');
    expect(r.followingCount).toBe(5);
    expect(r.isFollowing).toBe(true);
    expect(r.isSelf).toBe(false);
  });

  it('看自己 → isSelf=true 不查 existing', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'u1', nickname: '我', avatarUrl: null,
    } as never);
    mocks.prisma.follow.count.mockResolvedValue(3 as never);
    mocks.prisma.follow.findUnique.mockResolvedValue(null as never);

    const r = await followService.myCounts('u1', 'u1');

    expect(r.isSelf).toBe(true);
    expect(r.isFollowing).toBe(false); // 自己看自己，不算"已关注"
    // viewerId === userId 时不应查 existing
    expect(mocks.prisma.follow.findUnique).not.toHaveBeenCalled();
  });

  it('用户不存在 → notFound', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    await expect(followService.myCounts('uX', 'u1')).rejects.toThrow();
  });
});
