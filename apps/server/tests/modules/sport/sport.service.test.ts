/**
 * sport.service 单元测试
 *
 * 重点：防作弊（来自 01 审查 P1-1/P1-2 + 02 §5.3）
 *  - distance ∈ [0.5, 50]
 *  - 传 points 字段被忽略
 *  - 同日同 user 限 1 次
 *  - 积分 = floor(distance × perKm)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('src/infra/prisma.js', () => {
  // 事务内复用顶级 mock
  const userMethods = { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() };
  const pointsRecordMethods = { create: vi.fn() };
  const checkinMethods = { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() };
  const groupMemberMethods = { findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), delete: vi.fn() };
  const groupMethods = { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() };
  const txMock = {
    checkin: checkinMethods,
    group: groupMethods,
    groupMember: groupMemberMethods,
    user: userMethods,
    pointsRecord: pointsRecordMethods,
  };
  return {
    prisma: {
      checkin: checkinMethods,
      group: groupMethods,
      groupMember: groupMemberMethods,
      appConfig: { findMany: vi.fn(), findUnique: vi.fn() },
      user: userMethods,
      pointsRecord: pointsRecordMethods,
      $transaction: vi.fn((fn) => fn(txMock)),
      _tx: txMock,
    },
  };
});

// Mock Redis — Cache.wrap / Cache.del 需要 redis.get/set/del
// 用 vi.hoisted + setupMockRedis 避免 vi.clearAllMocks 清掉 mock 实现
const _redisMockState = vi.hoisted(() => ({
  cacheStore: new Map<string, string>(),
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn(), scan: vi.fn() },
}));

vi.mock('src/infra/redis.js', () => ({ redis: _redisMockState.redis }));

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
  redis.scan.mockImplementation(async (_cursor: string, ...args: unknown[]) => {
    const matchIdx = args.indexOf('MATCH');
    const pattern = (args[matchIdx + 1] as string) ?? '*';
    const regex = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    const matched = Array.from(cacheStore.keys()).filter((k) => regex.test(k));
    return ['0', matched] as [string, string[]];
  });
}

import { prisma } from 'src/infra/prisma.js';
import { sportService } from 'src/modules/sport/sport.service.js';

const mockedPrisma = vi.mocked(prisma);
const tx = (prisma as unknown as { _tx: unknown })._tx as {
  checkin: { create: ReturnType<typeof vi.fn> };
  pointsRecord: { create: ReturnType<typeof vi.fn> };
  user: { findUniqueOrThrow: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  _redisMockState.cacheStore.clear();
  setupMockRedis();
  mockedPrisma.appConfig.findMany.mockResolvedValue([]);
  // 默认 appConfig 内存默认值：perKm=1, dailyMaxKm=50, dailyMaxCheckins=1
  // V0.1.18: 默认 user 不被封禁（checkin 黑名单检查需要）
  mockedPrisma.user.findUnique.mockResolvedValue({
    id: 'u1', openid: 'o1', nickname: 'tester', points: 0, isBanned: false,
  } as never);
});

describe('sportService.checkin', () => {
  const USER_ID = 'u1';

  it('正常打卡：distance=5 → +5 积分 + 写 checkin + 写流水', async () => {
    mockedPrisma.checkin.findFirst.mockResolvedValue(null); // 今日未打卡
    tx.user.findUniqueOrThrow.mockResolvedValue({
      id: USER_ID,
      points: 100,
      stats: { totalDistance: 10, totalCheckins: 3, totalPoints: 50 },
    });

    const result = await sportService.checkin(USER_ID, { distance: 5 });

    expect(result.points).toBe(5);
    expect(tx.checkin.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: USER_ID,
          distance: 5,
          points: 5,
        }),
      }),
    );
    expect(tx.pointsRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: USER_ID,
          change: 5,
          type: 'checkin',
        }),
      }),
    );
  });

  it('⚠️ 距离越界（distance=-1） → 抛错', async () => {
    await expect(
      sportService.checkin(USER_ID, { distance: -1 } as never),
    ).rejects.toThrow();
    expect(tx.checkin.create).not.toHaveBeenCalled();
  });

  it('⚠️ 距离越界（distance=999） → 抛错', async () => {
    await expect(
      sportService.checkin(USER_ID, { distance: 999 } as never),
    ).rejects.toThrow();
  });

  it('⚠️ 传 points 字段被忽略（不加分）', async () => {
    mockedPrisma.checkin.findFirst.mockResolvedValue(null);
    tx.user.findUniqueOrThrow.mockResolvedValue({
      id: USER_ID,
      points: 0,
      stats: { totalDistance: 0, totalCheckins: 0, totalPoints: 0 },
    });

    // 前端传 points: 9999 试图作弊
    const result = await sportService.checkin(USER_ID, {
      distance: 3,
      points: 9999, // 忽略！
    } as never);

    // 实际分 = floor(3 × 1) = 3
    expect(result.points).toBe(3);
  });

  it('⚠️ 同日重复打卡 → 抛错', async () => {
    mockedPrisma.checkin.findFirst.mockResolvedValue({
      id: 'c1',
      userId: USER_ID,
      date: '2026-06-11',
      // ...
    } as never);

    await expect(
      sportService.checkin(USER_ID, { distance: 5 }),
    ).rejects.toThrow('今日已打卡');
    expect(tx.checkin.create).not.toHaveBeenCalled();
  });

  it('⚠️ 不在群中打卡（groupId 错） → 403', async () => {
    mockedPrisma.checkin.findFirst.mockResolvedValue(null);
    mockedPrisma.groupMember.findUnique.mockResolvedValue(null);

    await expect(
      sportService.checkin(USER_ID, { distance: 5, groupId: 'g-fake' }),
    ).rejects.toThrow('你不在该群中');
  });
});

describe('sportService.myStats', () => {
  it('聚合 distance + count + avgPace', async () => {
    mockedPrisma.checkin.findMany.mockResolvedValue([
      { distance: 5, durationSec: 1800 }, // 5km 30min, pace 6:00
      { distance: 3, durationSec: 1200 }, // 3km 20min, pace 6:40
      { distance: 10, durationSec: null }, // 无 duration 不计入 pace
    ] as never);

    const result = await sportService.myStats('u1', { period: 'week' });

    expect(result.totalDistance).toBe(18);
    expect(result.count).toBe(3);
    // avg = (1800+1200) / (5+3) = 375 sec/km = 6:15
    expect(result.avgPace).toBe(375);
  });

  it('period=all 也工作（since=1970）', async () => {
    mockedPrisma.checkin.findMany.mockResolvedValue([] as never);
    const result = await sportService.myStats('u1', { period: 'all' });
    expect(result.count).toBe(0);
    expect(result.avgPace).toBeNull();
  });
});

describe('sportService.groupRanking', () => {
  const GROUP_ID = 'g1';
  const USER_ID = 'u1';

  it('非群成员 → 403', async () => {
    mockedPrisma.groupMember.findUnique.mockResolvedValue(null);
    await expect(
      sportService.groupRanking(USER_ID, { groupId: GROUP_ID, period: 'week' }),
    ).rejects.toThrow('你不在该群中');
  });

  it('聚合 2 成员 → 按 distance 排序 + 冠军 + top5', async () => {
    mockedPrisma.groupMember.findUnique.mockResolvedValue({
      groupId: GROUP_ID,
      userId: USER_ID,
      role: 'member',
    });
    mockedPrisma.checkin.findMany.mockResolvedValue([
      { userId: 'u-a', distance: 10, points: 10, user: { id: 'u-a', nickname: 'Alice', avatarUrl: null } },
      { userId: 'u-b', distance: 5, points: 5, user: { id: 'u-b', nickname: 'Bob', avatarUrl: null } },
      { userId: 'u-a', distance: 3, points: 3, user: { id: 'u-a', nickname: 'Alice', avatarUrl: null } },
    ] as never);

    const result = await sportService.groupRanking(USER_ID, { groupId: GROUP_ID, period: 'week' });
    expect(result.groupId).toBe(GROUP_ID);
    expect(result.members[0].userId).toBe('u-a'); // 距离最多 = 第一
    expect(result.members[0].rank).toBe(1);
    expect(result.members[0].distance).toBe(13);
    expect(result.champion?.nickname).toBe('Alice');
    expect(result.totals.memberCount).toBe(2);
  });
});

describe('sportService.createGroup', () => {
  it('free 用户已加 2 群 → 拒建', async () => {
    mockedPrisma.appConfig.findMany.mockResolvedValue([]); // 走内存默认
    mockedPrisma.user.findUnique.mockResolvedValue({ id: 'u1', memberLevel: 'free' } as never);
    mockedPrisma.groupMember.count.mockResolvedValue(2);

    await expect(
      sportService.createGroup('u1', { name: '新群' }, '昵称'),
    ).rejects.toThrow('升级会员');
  });

  it('free 用户 < 2 群 → 可建', async () => {
    mockedPrisma.appConfig.findMany.mockResolvedValue([]);
    mockedPrisma.user.findUnique.mockResolvedValue({ id: 'u1', memberLevel: 'free' } as never);
    mockedPrisma.groupMember.count.mockResolvedValue(1);
    mockedPrisma.group.create.mockResolvedValue({ id: 'g1', name: '新群', memberCount: 1, createdAt: new Date() } as never);
    mockedPrisma.groupMember.create.mockResolvedValue({} as never);

    const result = await sportService.createGroup('u1', { name: '新群' }, '昵称');
    expect(result.role).toBe('owner');
    expect(result.name).toBe('新群');
  });
});

// ===== V0.1.5 增：Cache.wrap 接入 today 行为 =====
// 锁时间到 2026-06-15：todayCN() 用系统时钟，否则 key 包含真实日期导致缓存 miss
const FROZEN_DATE = new Date('2026-06-15T12:00:00Z');
describe('sportService.today（带缓存）', () => {
  const USER_ID = 'u1';

  beforeEach(() => {
    _redisMockState.cacheStore.clear();
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_DATE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('首次调用 → miss → 走 sportRepo + 回填缓存', async () => {
    mockedPrisma.checkin.findFirst.mockResolvedValue({
      id: 'c1',
      userId: USER_ID,
      groupId: null,
      date: '2026-06-15',
      distance: 5,
      durationSec: 1800,
      pace: 6,
      heartRate: null,
      cadence: null,
      points: 5,
      createdAt: new Date('2026-06-15T08:00:00Z'),
    } as never);

    const result = await sportService.today(USER_ID);

    expect(result.done).toBe(true);
    expect(result.checkin?.distance).toBe(5);
    expect(mockedPrisma.checkin.findFirst).toHaveBeenCalledTimes(1);
    // 缓存已回填（key 含 userId + date）
    expect(_redisMockState.cacheStore.size).toBeGreaterThanOrEqual(1);
    const cached = _redisMockState.cacheStore.get('qmwx:cache:sport:today:u1:2026-06-15');
    expect(cached).toBeDefined();
    expect(JSON.parse(cached!)).toMatchObject({ done: true, checkin: { distance: 5 } });
  });

  it('二次调用 → 命中缓存 → 不再调 sportRepo', async () => {
    // 预热缓存（模拟上次调用的产物）
    _redisMockState.cacheStore.set(
      'qmwx:cache:sport:today:u1:2026-06-15',
      JSON.stringify({ date: '2026-06-15', done: true, checkin: { distance: 5, durationSec: 1800, pace: 6, points: 5, createdAt: '2026-06-15T08:00:00.000Z' } }),
    );

    const result = await sportService.today(USER_ID);

    expect(result.done).toBe(true);
    expect(result.checkin?.distance).toBe(5);
    // 命中：sportRepo 一次都没调
    expect(mockedPrisma.checkin.findFirst).not.toHaveBeenCalled();
  });

  it('今日未打卡 → done=false + checkin=null', async () => {
    mockedPrisma.checkin.findFirst.mockResolvedValue(null);
    const result = await sportService.today(USER_ID);
    expect(result.done).toBe(false);
    expect(result.checkin).toBeNull();
  });
});

describe('sportService.checkin → 写后精准失效今日缓存', () => {
  const USER_ID = 'u1';

  beforeEach(() => {
    _redisMockState.cacheStore.clear();
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_DATE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('打卡成功 → 删 sport:today:{userId}:{date} 缓存（不等 TTL）', async () => {
    // 预热：模拟用户 1 分钟前看过 today（done=false）
    const todayKey = 'qmwx:cache:sport:today:u1:2026-06-15';
    _redisMockState.cacheStore.set(todayKey, JSON.stringify({ date: '2026-06-15', done: false, checkin: null }));

    mockedPrisma.checkin.findFirst.mockResolvedValue(null); // 今日未打卡
    tx.user.findUniqueOrThrow.mockResolvedValue({ id: USER_ID, points: 100, stats: {} });

    await sportService.checkin(USER_ID, { distance: 5 });

    // 缓存已被精准失效
    expect(_redisMockState.cacheStore.has(todayKey)).toBe(false);
  });

  it('打卡失败（已打卡） → 缓存不动', async () => {
    const todayKey = 'qmwx:cache:sport:today:u1:2026-06-15';
    _redisMockState.cacheStore.set(todayKey, JSON.stringify({ date: '2026-06-15', done: true, checkin: {} }));

    mockedPrisma.checkin.findFirst.mockResolvedValue({ id: 'c1' } as never); // 今日已打卡

    await expect(
      sportService.checkin(USER_ID, { distance: 5 }),
    ).rejects.toThrow('今日已打卡');

    // 缓存未动（事务回滚 → 不该失效缓存）
    expect(_redisMockState.cacheStore.has(todayKey)).toBe(true);
  });
});

// ===== V0.1.11 增：myStats / groupRanking 缓存行为 + checkin 写后失效 =====
describe('sportService.myStats（带缓存，V0.1.11）', () => {
  it('首次调用：miss → 查 DB + 回填缓存', async () => {
    mockedPrisma.checkin.findMany.mockResolvedValue([] as never);

    await sportService.myStats('u1', { period: 'week' });

    expect(mockedPrisma.checkin.findMany).toHaveBeenCalledTimes(1);
    expect(_redisMockState.cacheStore.has('qmwx:cache:sport:myStats:u1:week')).toBe(true);
  });

  it('二次同参：命中缓存 → 不再调 DB', async () => {
    _redisMockState.cacheStore.set(
      'qmwx:cache:sport:myStats:u1:week',
      JSON.stringify({ totalDistance: 99, count: 9, avgPace: 360, period: 'week' }),
    );

    const result = await sportService.myStats('u1', { period: 'week' });

    expect(result.totalDistance).toBe(99);
    expect(mockedPrisma.checkin.findMany).not.toHaveBeenCalled();
  });

  it('不同 period → 不同 cache key（不串扰）', async () => {
    mockedPrisma.checkin.findMany.mockResolvedValue([] as never);

    await sportService.myStats('u1', { period: 'week' });
    await sportService.myStats('u1', { period: 'month' });

    expect(_redisMockState.cacheStore.has('qmwx:cache:sport:myStats:u1:week')).toBe(true);
    expect(_redisMockState.cacheStore.has('qmwx:cache:sport:myStats:u1:month')).toBe(true);
  });
});

describe('sportService.groupRanking（带缓存，V0.1.11）', () => {
  const GROUP_ID = 'g1';

  it('首次调用：miss → 查 DB + 回填缓存', async () => {
    mockedPrisma.groupMember.findUnique.mockResolvedValue({
      groupId: GROUP_ID, userId: 'u1', role: 'member',
    });
    mockedPrisma.checkin.findMany.mockResolvedValue([] as never);

    await sportService.groupRanking('u1', { groupId: GROUP_ID, period: 'week' });

    expect(mockedPrisma.checkin.findMany).toHaveBeenCalledTimes(1);
    expect(_redisMockState.cacheStore.has('qmwx:cache:sport:groupRanking:g1:week')).toBe(true);
  });

  it('不同用户查同群同 period → 命中群维度缓存（N 人共享）', async () => {
    _redisMockState.cacheStore.set(
      'qmwx:cache:sport:groupRanking:g1:week',
      JSON.stringify({
        groupId: 'g1', period: 'week',
        members: [{ userId: 'x', nickname: '缓存冠军', rank: 1, distance: 10, count: 1, points: 10, avatarUrl: null }],
        champion: { userId: 'x', nickname: '缓存冠军', rank: 1, distance: 10, count: 1, points: 10, avatarUrl: null },
        totals: { memberCount: 1, totalDistance: 10 },
      }),
    );
    mockedPrisma.groupMember.findUnique.mockResolvedValue({
      groupId: GROUP_ID, userId: 'u2', role: 'member',
    });

    const result = await sportService.groupRanking('u2', { groupId: GROUP_ID, period: 'week' });

    expect(result.champion?.nickname).toBe('缓存冠军');
    // 命中群维度缓存：DB 一次都没调
    expect(mockedPrisma.checkin.findMany).not.toHaveBeenCalled();
  });

  it('不同 group/period → 不同 cache key（不串扰）', async () => {
    mockedPrisma.groupMember.findUnique.mockResolvedValue({
      groupId: GROUP_ID, userId: 'u1', role: 'member',
    });
    mockedPrisma.checkin.findMany.mockResolvedValue([] as never);

    await sportService.groupRanking('u1', { groupId: 'g1', period: 'week' });
    await sportService.groupRanking('u1', { groupId: 'g1', period: 'month' });
    await sportService.groupRanking('u1', { groupId: 'g2', period: 'week' });

    expect(_redisMockState.cacheStore.has('qmwx:cache:sport:groupRanking:g1:week')).toBe(true);
    expect(_redisMockState.cacheStore.has('qmwx:cache:sport:groupRanking:g1:month')).toBe(true);
    expect(_redisMockState.cacheStore.has('qmwx:cache:sport:groupRanking:g2:week')).toBe(true);
  });
});

describe('sportService.checkin → 写后失效 myStats/groupRanking（V0.1.11）', () => {
  beforeEach(() => {
    _redisMockState.cacheStore.clear();
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_DATE);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('打卡成功（无 groupId）→ 失效该用户 myStats 全 period，不动 groupRanking', async () => {
    _redisMockState.cacheStore.set('qmwx:cache:sport:myStats:u1:week', '{}');
    _redisMockState.cacheStore.set('qmwx:cache:sport:myStats:u1:month', '{}');
    _redisMockState.cacheStore.set('qmwx:cache:sport:myStats:u2:week', '{}'); // 其他用户保持
    _redisMockState.cacheStore.set('qmwx:cache:sport:groupRanking:g1:week', '{}'); // 无 groupId 不动群榜

    mockedPrisma.checkin.findFirst.mockResolvedValue(null);
    tx.user.findUniqueOrThrow.mockResolvedValue({ id: 'u1', points: 0, stats: {} });

    await sportService.checkin('u1', { distance: 5 });

    expect(_redisMockState.cacheStore.has('qmwx:cache:sport:myStats:u1:week')).toBe(false);
    expect(_redisMockState.cacheStore.has('qmwx:cache:sport:myStats:u1:month')).toBe(false);
    expect(_redisMockState.cacheStore.has('qmwx:cache:sport:myStats:u2:week')).toBe(true);
    expect(_redisMockState.cacheStore.has('qmwx:cache:sport:groupRanking:g1:week')).toBe(true);
  });

  it('打卡成功（带 groupId）→ 同时失效该群 groupRanking + weeklyReport aggregate', async () => {
    _redisMockState.cacheStore.set('qmwx:cache:sport:groupRanking:g1:week', '{}');
    _redisMockState.cacheStore.set('qmwx:cache:sport:groupRanking:g1:month', '{}');
    _redisMockState.cacheStore.set('qmwx:cache:sport:groupRanking:g2:week', '{}'); // 其他群保持
    _redisMockState.cacheStore.set('qmwx:cache:weeklyReport:aggregate:g1:2026-W25', '{}');
    _redisMockState.cacheStore.set('qmwx:cache:weeklyReport:aggregate:g2:2026-W25', '{}'); // 其他群保持

    mockedPrisma.checkin.findFirst.mockResolvedValue(null);
    mockedPrisma.groupMember.findUnique.mockResolvedValue({ groupId: 'g1', userId: 'u1', role: 'member' });
    tx.user.findUniqueOrThrow.mockResolvedValue({ id: 'u1', points: 0, stats: {} });

    await sportService.checkin('u1', { distance: 5, groupId: 'g1' });

    // groupRanking 失效
    expect(_redisMockState.cacheStore.has('qmwx:cache:sport:groupRanking:g1:week')).toBe(false);
    expect(_redisMockState.cacheStore.has('qmwx:cache:sport:groupRanking:g1:month')).toBe(false);
    expect(_redisMockState.cacheStore.has('qmwx:cache:sport:groupRanking:g2:week')).toBe(true);
    // weeklyReport aggregate 也失效（同一次 checkin，V0.1.12）
    expect(_redisMockState.cacheStore.has('qmwx:cache:weeklyReport:aggregate:g1:2026-W25')).toBe(false);
    expect(_redisMockState.cacheStore.has('qmwx:cache:weeklyReport:aggregate:g2:2026-W25')).toBe(true);
  });
});
