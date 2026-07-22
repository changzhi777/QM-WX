/**
 * training service 单测（V0.1.25，参考图 2775）
 *
 * 覆盖：
 * - myPlans：返 4 套训练计划模板
 * - mySportRecords：聚合佳明 + 手动打卡 + 去重 + 汇总
 * - Cache.wrap 命中
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('src/infra/prisma.js', () => ({
  prisma: {
    checkin: { findMany: vi.fn(), aggregate: vi.fn() },
    rawActivity: { findMany: vi.fn() },
    trainingPlan: { findMany: vi.fn(), findUnique: vi.fn() },
    userPlanEnrollment: { upsert: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn() },
  },
}));

const _redisMockState = vi.hoisted(() => ({
  cacheStore: new Map<string, string>(),
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn(), scan: vi.fn() },
}));
vi.mock('src/infra/redis.js', () => ({ redis: _redisMockState.redis }));
vi.mock('src/config/env.js', () => ({
  env: { WX_APPID: 'test', WX_NOTIFY_URL: 'http://localhost', NODE_ENV: 'test' },
}));

function setupMockRedis() {
  const { cacheStore, redis } = _redisMockState;
  redis.get.mockImplementation(async (k: string) => cacheStore.get(k) ?? null);
  redis.set.mockImplementation(async (k: string, v: string) => {
    cacheStore.set(k, v);
    return 'OK';
  });
}

import { prisma } from 'src/infra/prisma.js';
import { trainingService } from 'src/modules/training/training.service.js';

const mockedPrisma = vi.mocked(prisma);

beforeEach(() => {
  vi.clearAllMocks();
  _redisMockState.cacheStore.clear();
  setupMockRedis();
});

describe('trainingService.myPlans (V0.1.41 改读 DB)', () => {
  it('返回 DB active 计划列表（按 weeks 升序）', async () => {
    mockedPrisma.trainingPlan.findMany.mockResolvedValue([
      { id: 'p1', key: '5k', name: '5公里入门', weeks: 8, level: 'beginner', goal: '完成 5 公里', desc: '...', weeklyMileage: '8-15 km/周', targetKm: 80 },
      { id: 'p2', key: 'full', name: '全程马拉松 42K', weeks: 16, level: 'extreme', goal: '完赛全马', desc: '...', weeklyMileage: '40-60 km/周', targetKm: 800 },
    ] as never);

    const r = await trainingService.myPlans();
    expect(r.plans).toHaveLength(2);
    expect(r.plans[0]).toMatchObject({ key: '5k', level: 'beginner' });
    expect(r.plans[1]).toMatchObject({ key: 'full', level: 'extreme' });
    expect(mockedPrisma.trainingPlan.findMany).toHaveBeenCalledWith({
      where: { status: 'active' },
      orderBy: [{ weeks: 'asc' }, { createdAt: 'desc' }],
    });
  });
});

describe('trainingService 计划加入/进度/离开 (V0.1.41)', () => {
  it('joinPlan：计划存在 + active → upsert enrollment（1人1活跃，切换=替换）', async () => {
    mockedPrisma.trainingPlan.findUnique.mockResolvedValue({
      id: 'p1', key: '5k', name: '5公里入门', status: 'active', targetKm: 80,
    } as never);
    mockedPrisma.userPlanEnrollment.upsert.mockResolvedValue({
      id: 'e1', planId: 'p1', joinedAt: new Date('2026-07-01'),
    } as never);

    const r = await trainingService.joinPlan('u1', { planId: 'p1' });
    expect(r.planId).toBe('p1');
    expect(r.planName).toBe('5公里入门');
    expect(mockedPrisma.userPlanEnrollment.upsert).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      create: { userId: 'u1', planId: 'p1' },
      update: { planId: 'p1', joinedAt: expect.any(Date) },
    });
  });

  it('joinPlan：计划不存在 → notFound', async () => {
    mockedPrisma.trainingPlan.findUnique.mockResolvedValue(null);
    await expect(trainingService.joinPlan('u1', { planId: 'x' })).rejects.toThrow('计划不存在');
  });

  it('joinPlan：计划 archived → badRequest 已下架', async () => {
    mockedPrisma.trainingPlan.findUnique.mockResolvedValue({ id: 'p1', status: 'archived' } as never);
    await expect(trainingService.joinPlan('u1', { planId: 'p1' })).rejects.toThrow('已下架');
  });

  it('myActivePlan：无加入记录 → plan:null', async () => {
    mockedPrisma.userPlanEnrollment.findUnique.mockResolvedValue(null);
    const r = await trainingService.myActivePlan('u1');
    expect(r.plan).toBeNull();
  });

  it('myActivePlan：含进度（joinedAt 起 Checkin run 累计 / targetKm）', async () => {
    const joinedAt = new Date('2026-07-01');
    mockedPrisma.userPlanEnrollment.findUnique.mockResolvedValue({
      userId: 'u1', joinedAt,
      plan: { id: 'p1', key: '5k', name: '5公里入门', weeks: 8, level: 'beginner', goal: 'g', desc: 'd', weeklyMileage: 'w', targetKm: 80 },
    } as never);
    mockedPrisma.checkin.aggregate.mockResolvedValue({ _sum: { distance: 40 } } as never);

    const r = await trainingService.myActivePlan('u1');
    expect(r.plan).toMatchObject({ key: '5k', targetKm: 80 });
    expect(r.currentDistance).toBe(40);
    expect(r.percent).toBe(50); // 40/80
    expect(r.completed).toBe(false);
    expect(mockedPrisma.checkin.aggregate).toHaveBeenCalledWith({
      where: { userId: 'u1', sportType: 'run', createdAt: { gte: joinedAt } },
      _sum: { distance: true },
    });
  });

  it('leavePlan：deleteMany 幂等（不存在也 ok）', async () => {
    mockedPrisma.userPlanEnrollment.deleteMany.mockResolvedValue({ count: 0 } as never);
    const r = await trainingService.leavePlan('u1');
    expect(r.ok).toBe(true);
    expect(mockedPrisma.userPlanEnrollment.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });
});

describe('trainingService.mySportRecords (V0.1.25)', () => {
  it('聚合佳明 + 手动打卡，去重 importCheckinId，按时间 desc + 汇总', async () => {
    // 佳明活动（已导入，含 importCheckinId=c1）
    mockedPrisma.rawActivity.findMany.mockResolvedValue([
      {
        id: 'r1',
        startTime: new Date('2026-07-03T08:00:00Z'),
        distanceMeters: 10000,
        durationSec: 3600,
        importCheckinId: 'c1',
      },
    ] as never);
    // Checkin：c1（佳明导入，应去重）+ c2（手动，保留）
    mockedPrisma.checkin.findMany.mockResolvedValue([
      {
        id: 'c1',
        createdAt: new Date('2026-07-03T08:00:00Z'),
        distance: 10,
        durationSec: 3600,
        pace: '6:00',
        dataSource: 'garmin',
      },
      {
        id: 'c2',
        createdAt: new Date('2026-07-02T08:00:00Z'),
        distance: 5,
        durationSec: 1800,
        pace: '6:00',
        dataSource: 'manual',
      },
    ] as never);

    const r = await trainingService.mySportRecords('u1', { limit: 10 });

    // c1 被去重，只剩 r1 + c2
    expect(r.records).toHaveLength(2);
    expect(r.records[0].id).toBe('r1'); // 最新在前（7/3 > 7/2）
    expect(r.records[1].id).toBe('c2');
    expect(r.records[0].source).toBe('garmin');
    expect(r.records[1].source).toBe('manual');
    expect(r.records[0].distanceKm).toBe(10);
    expect(r.summary.totalRuns).toBe(2);
    expect(r.summary.totalDistanceKm).toBe(15); // 10 + 5
    expect(r.summary.avgDistanceKm).toBe(7.5); // 15/2
  });

  it('无记录 → 空列表 + 汇总为 0', async () => {
    mockedPrisma.rawActivity.findMany.mockResolvedValue([]);
    mockedPrisma.checkin.findMany.mockResolvedValue([]);

    const r = await trainingService.mySportRecords('u1', { limit: 10 });

    expect(r.records).toHaveLength(0);
    expect(r.summary.totalRuns).toBe(0);
    expect(r.summary.totalDistanceKm).toBe(0);
    expect(r.summary.avgDistanceKm).toBe(0);
  });

  it('第二次命中缓存（findMany 只查一次）', async () => {
    mockedPrisma.rawActivity.findMany.mockResolvedValue([]);
    mockedPrisma.checkin.findMany.mockResolvedValue([]);

    await trainingService.mySportRecords('u1', { limit: 10 });
    await trainingService.mySportRecords('u1', { limit: 10 });

    expect(mockedPrisma.rawActivity.findMany).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.checkin.findMany).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// V0.2.3 缓存命中（Cache.wrap 120s）
// ============================================================

describe('trainingService 缓存（V0.2.3）', () => {
  it('myPlans 第二次 → 命中缓存（不再调 prisma.trainingPlan.findMany）', async () => {
    mockedPrisma.trainingPlan.findMany.mockResolvedValue([] as never);

    await trainingService.myPlans();
    expect(mockedPrisma.trainingPlan.findMany).toHaveBeenCalledTimes(1);

    // 第二次：缓存命中
    await trainingService.myPlans();
    expect(mockedPrisma.trainingPlan.findMany).toHaveBeenCalledTimes(1);
    expect(_redisMockState.cacheStore.has('qmwx:cache:training:myPlans')).toBe(true);
  });

  it('myActivePlan 第二次同 user → 命中缓存', async () => {
    // 无加入记录返 plan: null
    mockedPrisma.userPlanEnrollment.findUnique.mockResolvedValue(null);

    await trainingService.myActivePlan('u1');
    expect(mockedPrisma.userPlanEnrollment.findUnique).toHaveBeenCalledTimes(1);

    // 第二次：缓存命中
    await trainingService.myActivePlan('u1');
    expect(mockedPrisma.userPlanEnrollment.findUnique).toHaveBeenCalledTimes(1);
    expect(_redisMockState.cacheStore.has('qmwx:cache:training:myActivePlan:u1')).toBe(true);
  });
});

// ============================================================
// V0.2.78 compute* 显式测（V0.2.3 Cache 范式的 compute 内部纯函数，绕过 Cache 直接调确保 funcs 覆盖）
// ============================================================
describe('trainingService.computeMyPlans (V0.2.78 补测)', () => {
  it('返 active 计划列表 + map 字段', async () => {
    mockedPrisma.trainingPlan.findMany.mockResolvedValue([
      { id: 'p1', key: '5k', name: '5公里入门', weeks: 8, level: 'beginner', goal: '完成5公里', desc: 'd', weeklyMileage: 20, targetKm: 60 },
    ] as never);
    const r = await trainingService.computeMyPlans();
    expect(r.plans).toHaveLength(1);
    expect(r.plans[0].key).toBe('5k');
    expect(r.plans[0].level).toBe('beginner');
    expect(r.plans[0].targetKm).toBe(60);
  });
});

describe('trainingService.computeMyActivePlan (V0.2.78 补测)', () => {
  it('无加入记录 → { plan: null }', async () => {
    mockedPrisma.userPlanEnrollment.findUnique.mockResolvedValue(null);
    const r = await trainingService.computeMyActivePlan('u1');
    expect(r.plan).toBeNull();
  });

  it('有加入 + 进度 → plan + daysJoined + progress', async () => {
    const joinedAt = new Date('2026-07-01');
    mockedPrisma.userPlanEnrollment.findUnique.mockResolvedValue({
      userId: 'u1', joinedAt,
      plan: { id: 'p1', key: '10k', name: '10公里', weeks: 12, level: 'intermediate', goal: 'g', desc: 'd', weeklyMileage: 30, targetKm: 120 },
    } as never);
    mockedPrisma.checkin.aggregate.mockResolvedValue({ _sum: { distance: 60 } } as never);

    const r = await trainingService.computeMyActivePlan('u1');
    expect(r.plan).toMatchObject({ key: '10k', targetKm: 120 });
    expect(r.currentDistance).toBe(60);
    expect(r.percent).toBe(50); // 60/120
    expect(typeof r.daysJoined).toBe('number');
  });
});
