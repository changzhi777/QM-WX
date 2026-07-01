/**
 * ranking.service 单测 — 多维群榜单（groupRankingMulti）
 *
 * 覆盖：
 * - 按群成员 userId 聚合 Checkin（佳明无 group 打卡也计入）
 * - 排名 + 昵称/头像 + myRank
 * - 空群返回空列表
 * - Cache.wrap 命中
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('src/infra/prisma.js', () => ({
  prisma: {
    groupMember: { findMany: vi.fn() },
    checkin: { groupBy: vi.fn() },
  },
}));

const _redisMockState = vi.hoisted(() => ({
  cacheStore: new Map<string, string>(),
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn(), scan: vi.fn() },
}));
vi.mock('src/infra/redis.js', () => ({ redis: _redisMockState.redis }));
vi.mock('src/config/env.js', () => ({ env: { NODE_ENV: 'test' } }));

function setupMockRedis() {
  const { cacheStore, redis } = _redisMockState;
  redis.get.mockImplementation(async (k: string) => cacheStore.get(k) ?? null);
  redis.set.mockImplementation(async (k: string, v: string) => {
    cacheStore.set(k, v);
    return 'OK';
  });
  redis.del.mockImplementation(async (k: string) => {
    const had = cacheStore.has(k);
    cacheStore.delete(k);
    return had ? 1 : 0;
  });
}

import { prisma } from 'src/infra/prisma.js';
import { rankingService } from 'src/modules/ranking/ranking.service.js';

const mockedPrisma = vi.mocked(prisma);

beforeEach(() => {
  vi.clearAllMocks();
  _redisMockState.cacheStore.clear();
  setupMockRedis();
});

describe('rankingService.groupRankingMulti', () => {
  it('按成员 userId 聚合 + 排名 + myRank', async () => {
    mockedPrisma.groupMember.findMany.mockResolvedValue([
      { userId: 'u1', nickname: '张三', avatarUrl: 'a.png' },
      { userId: 'u2', nickname: '李四', avatarUrl: null },
    ] as never);
    // groupBy orderBy distance desc → 已排序
    mockedPrisma.checkin.groupBy.mockResolvedValue([
      { userId: 'u1', _sum: { distance: 100 }, _count: 20 },
      { userId: 'u2', _sum: { distance: 50 }, _count: 10 },
    ] as never);

    const r = await rankingService.groupRankingMulti('u1', {
      groupId: 'g1',
      sportType: 'all',
      period: 'week',
    });

    expect(r.list).toHaveLength(2);
    expect(r.list[0]).toMatchObject({ rank: 1, userId: 'u1', nickname: '张三', distance: 100, checkins: 20 });
    expect(r.list[1]).toMatchObject({ rank: 2, userId: 'u2', nickname: '李四', distance: 50 });
    expect(r.myRank).toBe(1);
    expect(r.total).toBe(2);
  });

  it('空群返回空列表 + myRank null', async () => {
    mockedPrisma.groupMember.findMany.mockResolvedValue([] as never);

    const r = await rankingService.groupRankingMulti('u1', {
      groupId: 'g1',
      sportType: 'all',
      period: 'week',
    });

    expect(r.list).toHaveLength(0);
    expect(r.myRank).toBeNull();
    expect(r.total).toBe(0);
  });

  it('第二次同参数命中缓存（groupBy 不再调）', async () => {
    mockedPrisma.groupMember.findMany.mockResolvedValue([
      { userId: 'u1', nickname: '张三', avatarUrl: null },
    ] as never);
    mockedPrisma.checkin.groupBy.mockResolvedValue([
      { userId: 'u1', _sum: { distance: 10 }, _count: 1 },
    ] as never);

    await rankingService.groupRankingMulti('u1', { groupId: 'g1', sportType: 'all', period: 'week' });
    await rankingService.groupRankingMulti('u1', { groupId: 'g1', sportType: 'all', period: 'week' });

    expect(mockedPrisma.checkin.groupBy).toHaveBeenCalledTimes(1);
  });

  it('sportType 过滤传给 groupBy（run 维度）', async () => {
    mockedPrisma.groupMember.findMany.mockResolvedValue([
      { userId: 'u1', nickname: '张三', avatarUrl: null },
    ] as never);
    mockedPrisma.checkin.groupBy.mockResolvedValue([
      { userId: 'u1', _sum: { distance: 80 }, _count: 15 },
    ] as never);

    await rankingService.groupRankingMulti('u1', {
      groupId: 'g1',
      sportType: 'run',
      period: 'month',
    });

    const arg = mockedPrisma.checkin.groupBy.mock.calls[0][0] as { where: { sportType?: string } };
    expect(arg.where.sportType).toBe('run');
  });
});
