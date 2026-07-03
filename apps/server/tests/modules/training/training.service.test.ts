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
    checkin: { findMany: vi.fn() },
    rawActivity: { findMany: vi.fn() },
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

describe('trainingService.myPlans (V0.1.25)', () => {
  it('返回 4 套训练计划（5K/10K/半马/全马）', async () => {
    const r = await trainingService.myPlans();
    expect(r.plans).toHaveLength(4);
    expect(r.plans.map((p) => p.key)).toEqual(['5k', '10k', 'half', 'full']);
    expect(r.plans[0]).toMatchObject({ name: '5公里入门', level: '入门' });
    expect(r.plans[3]).toMatchObject({ name: '全程马拉松 42K', level: '极限' });
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
