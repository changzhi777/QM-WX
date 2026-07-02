/**
 * points.service 单测（V0.1.22 B-核心）
 * - signin：今日已签抛错 / 首签 continuousDays=1 +10 / 连续 7 天奖励 +50
 * - myTasks：签到 + 订单完成状态
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

beforeEach(() => vi.clearAllMocks());

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
