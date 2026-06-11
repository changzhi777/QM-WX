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

vi.mock('../../src/infra/prisma.js', () => {
  const txMock = {
    checkin: { create: vi.fn() },
    pointsRecord: { create: vi.fn() },
    user: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
  };
  return {
    prisma: {
      checkin: { findFirst: vi.fn(), findMany: vi.fn() },
      group: { findUnique: vi.fn() },
      groupMember: { findUnique: vi.fn(), count: vi.fn() },
      appConfig: { findMany: vi.fn(), findUnique: vi.fn() },
      user: { findUnique: vi.fn() },
      $transaction: vi.fn((fn) => fn(txMock)),
      _tx: txMock,
    },
  };
});

import { prisma } from '../../src/infra/prisma.js';
import { sportService } from '../../src/modules/sport/sport.service.js';

const mockedPrisma = vi.mocked(prisma);
const tx = (prisma as unknown as { _tx: unknown })._tx as {
  checkin: { create: ReturnType<typeof vi.fn> };
  pointsRecord: { create: ReturnType<typeof vi.fn> };
  user: { findUniqueOrThrow: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedPrisma.appConfig.findMany.mockResolvedValue([]);
  // 默认 appConfig 内存默认值：perKm=1, dailyMaxKm=50, dailyMaxCheckins=1
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
});
