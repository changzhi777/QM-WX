/**
 * points.service 单测（V0.1.22 B-核心）
 * - signin：今日已签抛错 / 首签 continuousDays=1 +10 / 连续 7 天奖励 +50
 * - myTasks：签到 + 订单完成状态
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// V0.2.6 mock Redis（awardShare 限频 incr/expire）
const _redisMockState = vi.hoisted(() => ({
  cacheStore: new Map<string, string>(),
  redis: { incr: vi.fn(), expire: vi.fn() },
}));
vi.mock('src/infra/redis.js', () => ({ redis: _redisMockState.redis }));

vi.mock('src/infra/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    pointsRecord: { findMany: vi.fn(), create: vi.fn() },
    signinRecord: { findUnique: vi.fn(), create: vi.fn() },
    order: { count: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from 'src/infra/prisma.js';
import { pointsService } from 'src/modules/points/points.service.js';

const mockedPrisma = vi.mocked(prisma);

beforeEach(() => {
  vi.clearAllMocks();
  _redisMockState.cacheStore.clear();
  // V0.2.6 incr/expire（限频计数，用 cacheStore 存数字字符串）
  _redisMockState.redis.incr.mockImplementation(async (k: string) => {
    const n = Number(_redisMockState.cacheStore.get(k) ?? '0') + 1;
    _redisMockState.cacheStore.set(k, String(n));
    return n;
  });
  _redisMockState.redis.expire.mockImplementation(async () => 1);
});

describe('pointsService.signin', () => {
  it('今日已签抛错', async () => {
    mockedPrisma.signinRecord.findUnique.mockResolvedValueOnce({ id: 's1', continuousDays: 3 } as never);
    await expect(pointsService.signin('u1')).rejects.toThrow('今日已签到');
  });

  it('首签（无昨日）→ continuousDays=1，+10', async () => {
    mockedPrisma.signinRecord.findUnique
      .mockResolvedValueOnce(null as never) // today
      .mockResolvedValueOnce(null as never); // 昨日
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        user: { findUnique: vi.fn().mockResolvedValue({ points: 100 }), update: vi.fn() },
        signinRecord: { create: vi.fn() },
        pointsRecord: { create: vi.fn() },
      }),
    );

    const r = await pointsService.signin('u1');
    expect(r.continuousDays).toBe(1);
    expect(r.pointsAwarded).toBe(10);
    expect(r.newBalance).toBe(110);
    expect(r.bonus).toBe(false);
  });

  it('连续第 7 天 → +50 奖励', async () => {
    mockedPrisma.signinRecord.findUnique
      .mockResolvedValueOnce(null as never) // today
      .mockResolvedValueOnce({ continuousDays: 6 } as never); // 昨日 6
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        user: { findUnique: vi.fn().mockResolvedValue({ points: 200 }), update: vi.fn() },
        signinRecord: { create: vi.fn() },
        pointsRecord: { create: vi.fn() },
      }),
    );

    const r = await pointsService.signin('u1');
    expect(r.continuousDays).toBe(7);
    expect(r.pointsAwarded).toBe(60); // 10 + 50
    expect(r.bonus).toBe(true);
  });
});

describe('pointsService.myTasks', () => {
  it('签到完成 + 订单完成 → tasks done', async () => {
    mockedPrisma.signinRecord.findUnique.mockResolvedValue({ id: 's1' } as never);
    mockedPrisma.order.count.mockResolvedValue(2 as never);

    const r = await pointsService.myTasks('u1');
    const signinTask = r.tasks.find((t) => t.key === 'signin');
    const purchaseTask = r.tasks.find((t) => t.key === 'purchase');
    expect(signinTask?.done).toBe(true);
    expect(purchaseTask?.done).toBe(true);
  });

  it('未签 + 无订单 → tasks 未完成', async () => {
    mockedPrisma.signinRecord.findUnique.mockResolvedValue(null as never);
    mockedPrisma.order.count.mockResolvedValue(0 as never);

    const r = await pointsService.myTasks('u1');
    const signinTask = r.tasks.find((t) => t.key === 'signin');
    expect(signinTask?.done).toBe(false);
  });
});

/** 今日 CN YYYY-MM-DD（与 points.service todayCN 一致算法）*/
function todayCN(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

describe('pointsService.awardShare（V0.2.6 分享得积分日限3）', () => {
  it('当日首次 → awarded true，走 addPoints 事务', async () => {
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        user: { update: vi.fn(), findUniqueOrThrow: vi.fn().mockResolvedValue({ points: 5 }) },
        pointsRecord: { create: vi.fn() },
      }),
    );

    const r = await pointsService.awardShare('u1');
    expect(r.awarded).toBe(true);
    expect(r.todayCount).toBe(1);
    expect(r.quota).toBe(3);
    expect(mockedPrisma.$transaction).toHaveBeenCalled();
  });

  it('当日第4次 → awarded false（超日限3，不发积分）', async () => {
    // 预置已分享 3 次（awardShare 直接 redis.incr，key 无 qmwx:cache 前缀）
    _redisMockState.cacheStore.set(`share:pt:u1:${todayCN()}`, '3');

    const r = await pointsService.awardShare('u1');
    expect(r.awarded).toBe(false);
    expect(r.todayCount).toBe(4);
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });
});
