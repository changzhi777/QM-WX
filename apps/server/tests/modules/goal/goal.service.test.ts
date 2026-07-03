/**
 * goal module 单测（V0.1.28，跑者向 — 目标 + 进度跟踪）
 *
 * 覆盖：list（含进度）/ add（type 自动算周期）/ remove / 边界（custom 缺周期 / 不存在）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockErrors } from '../../helpers/mockErrors.js';

vi.mock('src/infra/prisma.js', () => ({
  prisma: {
    goal: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
    checkin: { aggregate: vi.fn() },
  },
}));
vi.mock('src/common/errors.js', () => ({ Errors: mockErrors }));

import { prisma } from 'src/infra/prisma.js';
import { goalService } from 'src/modules/goal/goal.service.js';

const mockedPrisma = vi.mocked(prisma);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('goalService.list (V0.1.28)', () => {
  it('返目标列表 + 进度（aggregate 算 currentDistance + percent）', async () => {
    mockedPrisma.goal.findMany.mockResolvedValue([
      {
        id: 'g1',
        type: 'monthly',
        title: '夏季百公里',
        targetDistance: 100,
        periodStart: new Date('2026-07-01T00:00:00Z'),
        periodEnd: new Date('2026-08-01T00:00:00Z'),
        status: 'active',
        createdAt: new Date(),
      },
    ] as never);
    mockedPrisma.checkin.aggregate.mockResolvedValue({ _sum: { distance: 60 } } as never);

    const r = await goalService.list('u1');

    expect(r.goals).toHaveLength(1);
    expect(r.goals[0].currentDistance).toBe(60);
    expect(r.goals[0].percent).toBe(60); // 60/100
    expect(r.goals[0].completed).toBe(false);
    expect(r.goals[0].title).toBe('夏季百公里');
  });

  it('当前距离 ≥ 目标 → completed=true, percent 封顶 100', async () => {
    mockedPrisma.goal.findMany.mockResolvedValue([
      {
        id: 'g1',
        type: 'monthly',
        title: null,
        targetDistance: 50,
        periodStart: new Date('2026-07-01T00:00:00Z'),
        periodEnd: new Date('2026-08-01T00:00:00Z'),
        status: 'active',
        createdAt: new Date(),
      },
    ] as never);
    mockedPrisma.checkin.aggregate.mockResolvedValue({ _sum: { distance: 75 } } as never);

    const r = await goalService.list('u1');
    expect(r.goals[0].completed).toBe(true);
    expect(r.goals[0].percent).toBe(100); // min(100, round(75/50*100)=150)
  });
});

describe('goalService.add (V0.1.28)', () => {
  it('monthly 类型 → 自动算周期 + create', async () => {
    mockedPrisma.goal.create.mockResolvedValue({ id: 'g1' } as never);

    const r = await goalService.add('u1', { type: 'monthly', targetDistance: 100 });

    expect(mockedPrisma.goal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u1',
          type: 'monthly',
          targetDistance: 100,
        }),
      }),
    );
    expect(r.id).toBe('g1');
  });

  it('yearly 类型 → 自动算年度周期', async () => {
    mockedPrisma.goal.create.mockResolvedValue({ id: 'g2' } as never);
    const r = await goalService.add('u1', { type: 'yearly', targetDistance: 1000 });
    expect(r.id).toBe('g2');
    // 验证 periodStart/End 是 Date 实例
    const call = mockedPrisma.goal.create.mock.calls[0][0] as { data: { periodStart: unknown; periodEnd: unknown } };
    expect(call.data.periodStart).toBeInstanceOf(Date);
    expect(call.data.periodEnd).toBeInstanceOf(Date);
  });

  it('custom 无 periodStart/End → badRequest', async () => {
    await expect(
      goalService.add('u1', { type: 'custom', targetDistance: 50 }),
    ).rejects.toThrow();
  });
});

describe('goalService.remove (V0.1.28)', () => {
  it('存在 → 删除 → ok', async () => {
    mockedPrisma.goal.findFirst.mockResolvedValue({ id: 'g1' } as never);
    mockedPrisma.goal.delete.mockResolvedValue({} as never);

    const r = await goalService.remove('u1', 'g1');

    expect(mockedPrisma.goal.delete).toHaveBeenCalledWith({ where: { id: 'g1' } });
    expect(r).toEqual({ ok: true });
  });

  it('不存在 → notFound', async () => {
    mockedPrisma.goal.findFirst.mockResolvedValue(null);
    await expect(goalService.remove('u1', 'g1')).rejects.toThrow();
  });
});

describe('goalService.myProgress (V0.1.28)', () => {
  it('仅返 active 目标（archived 不含）', async () => {
    mockedPrisma.goal.findMany.mockResolvedValue([
      {
        id: 'g1',
        type: 'monthly',
        title: null,
        targetDistance: 100,
        periodStart: new Date('2026-07-01T00:00:00Z'),
        periodEnd: new Date('2026-08-01T00:00:00Z'),
        status: 'active',
        createdAt: new Date(),
      },
    ] as never);
    mockedPrisma.checkin.aggregate.mockResolvedValue({ _sum: { distance: 30 } } as never);

    const r = await goalService.myProgress('u1');
    expect(r.goals).toHaveLength(1);
    expect(r.goals[0].percent).toBe(30);
  });
});
