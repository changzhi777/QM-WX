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
    checkin: { aggregate: vi.fn(), findMany: vi.fn() },
    familyMember: { findUnique: vi.fn(), findMany: vi.fn() }, // V0.1.34 家庭目标
    user: { findUnique: vi.fn(), update: vi.fn() }, // V0.1.135 自定义里程碑
  },
}));
vi.mock('src/common/errors.js', () => ({ Errors: mockErrors }));

// V0.2.3 Cache.wrap 120s：mock Redis（同 stats.service.test.ts 范式）
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
  redis.scan.mockImplementation(async () => ['0', []] as [string, string[]]);
}

import { prisma } from 'src/infra/prisma.js';
import { goalService } from 'src/modules/goal/goal.service.js';

const mockedPrisma = vi.mocked(prisma);

beforeEach(() => {
  vi.clearAllMocks();
  _redisMockState.cacheStore.clear();
  setupMockRedis();
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

describe('goalService.addFamilyGoal (V0.1.34 家庭目标)', () => {
  it('创建家庭目标（familyId 落库）', async () => {
    mockedPrisma.familyMember.findUnique.mockResolvedValue({ familyId: 'f1' } as never);
    mockedPrisma.goal.create.mockResolvedValue({ id: 'g3' } as never);

    const r = await goalService.addFamilyGoal('u1', {
      type: 'monthly',
      targetDistance: 200,
      familyId: 'f1',
    });

    expect(r.id).toBe('g3');
    expect(mockedPrisma.goal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'u1', familyId: 'f1', targetDistance: 200 }),
      }),
    );
  });

  it('未加入家庭 → notFound', async () => {
    mockedPrisma.familyMember.findUnique.mockResolvedValue(null);
    await expect(
      goalService.addFamilyGoal('u1', { type: 'monthly', targetDistance: 100, familyId: 'f1' }),
    ).rejects.toThrow();
  });

  it('familyId 不属于自己家庭 → forbidden', async () => {
    mockedPrisma.familyMember.findUnique.mockResolvedValue({ familyId: 'f1' } as never);
    await expect(
      goalService.addFamilyGoal('u1', { type: 'monthly', targetDistance: 100, familyId: 'fX' }),
    ).rejects.toThrow();
  });
});

describe('goalService.myFamilyGoals (V0.1.34)', () => {
  it('返家庭目标（按家庭成员聚合进度，where userId in members）', async () => {
    mockedPrisma.familyMember.findUnique.mockResolvedValue({ familyId: 'f1' } as never);
    mockedPrisma.goal.findMany.mockResolvedValue([
      {
        id: 'g3',
        type: 'monthly',
        title: '全家100km',
        targetDistance: 100,
        periodStart: new Date('2026-07-01T00:00:00Z'),
        periodEnd: new Date('2026-08-01T00:00:00Z'),
        familyId: 'f1',
        status: 'active',
        createdAt: new Date(),
      },
    ] as never);
    mockedPrisma.familyMember.findMany.mockResolvedValue([
      { userId: 'u1' },
      { userId: 'u2' },
    ] as never);
    mockedPrisma.checkin.aggregate.mockResolvedValue({ _sum: { distance: 80 } } as never);

    const r = await goalService.myFamilyGoals('u1');

    expect(r.goals).toHaveLength(1);
    expect(r.goals[0].currentDistance).toBe(80);
    expect(r.goals[0].familyId).toBe('f1');
    // 进度按家庭成员 userIds 聚合
    const call = mockedPrisma.checkin.aggregate.mock.calls[0][0] as {
      where: { userId: { in: string[] } };
    };
    expect(call.where.userId.in).toEqual(['u1', 'u2']);
  });

  it('无家庭 → 空 goals', async () => {
    mockedPrisma.familyMember.findUnique.mockResolvedValue(null);
    const r = await goalService.myFamilyGoals('u1');
    expect(r.goals).toEqual([]);
  });
});

// ============================================================
// V0.1.135 自定义里程碑
// ============================================================

describe('goalService.addCustomMilestone (V0.1.135)', () => {
  it('添加自定义里程碑（含 achievement 查询）', async () => {
    // 第一次调用：addCustomMilestone 入口 findUnique → 空
    mockedPrisma.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      customMilestones: [],
    } as never);
    mockedPrisma.user.update.mockResolvedValue({} as never);
    // 第二次调用：checkMilestoneAchievement 入口 findUnique → 新增的 km: 10
    mockedPrisma.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      customMilestones: [{ km: 10, title: '10 km 入门' }],
    } as never);
    mockedPrisma.checkin.aggregate.mockResolvedValue({ _sum: { distance: 50 } } as never);
    mockedPrisma.checkin.findMany.mockResolvedValue([] as never);

    const r = await goalService.addCustomMilestone('u1', { km: 10, title: '10 km 入门' });
    expect(r.milestone.km).toBe(10);
    expect(r.milestone.title).toBe('10 km 入门');
    expect(r.achievement.achieved).toBe(true); // 50 >= 10
    expect(r.achievement.currentKm).toBe(50);
  });

  it('重复 km → conflict', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      customMilestones: [{ km: 10, title: '已存在' }],
    } as never);

    await expect(
      goalService.addCustomMilestone('u1', { km: 10, title: '重复' }),
    ).rejects.toThrow();
  });

  it('超过 20 个 → badRequest', async () => {
    const existing = Array.from({ length: 20 }, (_, i) => ({ km: i + 1, title: `m${i}` }));
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      customMilestones: existing,
    } as never);

    await expect(
      goalService.addCustomMilestone('u1', { km: 100, title: '超额' }),
    ).rejects.toThrow();
  });
});

describe('goalService.checkMilestoneAchievement (V0.1.135)', () => {
  it('已达成 → achieved=true + achievedAt', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      customMilestones: [{ km: 100, title: '百公里入门' }],
    } as never);
    mockedPrisma.checkin.aggregate.mockResolvedValue({ _sum: { distance: 250 } } as never);
    mockedPrisma.checkin.findMany.mockResolvedValue([
      { distance: 60, date: '2026-07-01' },
      { distance: 50, date: '2026-07-02' }, // 累计 110 ≥ 100，最早达成日期
      { distance: 140, date: '2026-07-03' },
    ] as never);

    const r = await goalService.checkMilestoneAchievement('u1', 100);
    expect(r.achieved).toBe(true);
    expect(r.currentKm).toBe(250);
    expect(r.achievedAt).toBe('2026-07-02');
  });

  it('未达成 → achieved=false', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      customMilestones: [{ km: 100, title: '百公里' }],
    } as never);
    mockedPrisma.checkin.aggregate.mockResolvedValue({ _sum: { distance: 50 } } as never);

    const r = await goalService.checkMilestoneAchievement('u1', 100);
    expect(r.achieved).toBe(false);
    expect(r.achievedAt).toBeNull();
  });
});

// ============================================================
// V0.2.3 缓存命中（Cache.wrap 120s）
// ============================================================

describe('goalService 缓存（V0.2.3）', () => {
  it('list 第二次同 user → 命中缓存（不再调 prisma.goal.findMany）', async () => {
    mockedPrisma.goal.findMany.mockResolvedValue([] as never);
    mockedPrisma.checkin.aggregate.mockResolvedValue({ _sum: { distance: 0 } } as never);

    const r1 = await goalService.list('u1');
    expect(r1.goals).toEqual([]);
    expect(mockedPrisma.goal.findMany).toHaveBeenCalledTimes(1);

    // 第二次：缓存命中
    await goalService.list('u1');
    expect(mockedPrisma.goal.findMany).toHaveBeenCalledTimes(1);
    expect(_redisMockState.cacheStore.has('qmwx:cache:goal:list:u1')).toBe(true);
  });

  it('myProgress 第二次同 user → 命中缓存', async () => {
    mockedPrisma.goal.findMany.mockResolvedValue([] as never);
    mockedPrisma.checkin.aggregate.mockResolvedValue({ _sum: { distance: 0 } } as never);

    await goalService.myProgress('u1');
    expect(mockedPrisma.goal.findMany).toHaveBeenCalledTimes(1);

    // 第二次：缓存命中
    await goalService.myProgress('u1');
    expect(mockedPrisma.goal.findMany).toHaveBeenCalledTimes(1);
    expect(_redisMockState.cacheStore.has('qmwx:cache:goal:myProgress:u1')).toBe(true);
  });
});
