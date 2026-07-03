/**
 * device.myTodayHealth 单测（V0.1.25，参考图 2774）
 *
 * 覆盖：
 * - 聚合 4 类数据（睡眠/健身年龄/训练指标/今日活动）→ 一次返回
 * - 无数据 → 各字段 null + unavailable 占位数组
 * - Cache.wrap 命中（第二次不查 DB）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('src/infra/prisma.js', () => ({
  prisma: {
    garminSleep: { findFirst: vi.fn() },
    garminFitnessAge: { findFirst: vi.fn() },
    garminMetric: { findMany: vi.fn() },
    rawActivity: { findMany: vi.fn() },
  },
}));

// Mock Redis — Cache.wrap 走 redis.get/set
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
  redis.del.mockImplementation(async (k: string) => {
    const had = cacheStore.has(k);
    cacheStore.delete(k);
    return had ? 1 : 0;
  });
}

import { prisma } from 'src/infra/prisma.js';
import { deviceService } from 'src/modules/device/device.service.js';

const mockedPrisma = vi.mocked(prisma);

beforeEach(() => {
  vi.clearAllMocks();
  _redisMockState.cacheStore.clear();
  setupMockRedis();
});

describe('deviceService.myTodayHealth (V0.1.25)', () => {
  it('聚合睡眠/健身年龄/训练指标/今日活动 → 一次返回', async () => {
    mockedPrisma.garminSleep.findFirst.mockResolvedValue({
      calendarDate: new Date('2026-07-03T00:00:00Z'),
      deepSleepSeconds: 3600,
      lightSleepSeconds: 14400,
      remSleepSeconds: 5400,
      sleepScores: { overall: { value: 85 } },
    } as never);
    mockedPrisma.garminFitnessAge.findFirst.mockResolvedValue({
      chronologicalAge: 35,
      currentBioAge: 30,
      vo2Max: 48,
      rhr: 55,
      bmi: 22,
      asOfDate: new Date('2026-07-03T00:00:00Z'),
    } as never);
    mockedPrisma.garminMetric.findMany.mockResolvedValue([
      { metricType: 'training_readiness', value: 80, calendarDate: new Date('2026-07-03T00:00:00Z') },
      { metricType: 'endurance_score', value: 60, calendarDate: new Date('2026-07-02T00:00:00Z') },
    ] as never);
    mockedPrisma.rawActivity.findMany.mockResolvedValue([
      { distanceMeters: 5000, durationSec: 1800, raw: { calories: 300 } },
      { distanceMeters: 3000, durationSec: 1200, raw: { calories: 180 } },
    ] as never);

    const r = await deviceService.myTodayHealth('u1');

    // 睡眠：3600+14400+5400 = 23400 秒 = 6.5 小时
    expect(r.sleep).not.toBeNull();
    expect(r.sleep?.durationHours).toBe(6.5);
    expect(r.sleep?.deepHours).toBe(1);
    expect(r.sleep?.score).toBe(85);
    // 健身年龄
    expect(r.fitnessAge?.currentBioAge).toBe(30);
    expect(r.fitnessAge?.vo2Max).toBe(48);
    expect(r.fitnessAge?.rhr).toBe(55);
    // 训练指标（按 metricType 取 latest）
    expect(r.metrics.trainingReadiness).toBe(80);
    expect(r.metrics.enduranceScore).toBe(60);
    expect(r.metrics.hillScore).toBeNull(); // 未提供
    // 今日活动汇总
    expect(r.todayActivity).not.toBeNull();
    expect(r.todayActivity?.count).toBe(2);
    expect(r.todayActivity?.totalDistanceKm).toBe(8); // (5000+3000)/1000
    expect(r.todayActivity?.totalCalories).toBe(480); // 300+180
    // 无数据源占位
    expect(r.unavailable).toEqual(['steps', 'spo2', 'bloodPressure', 'weight', 'bloodGlucose']);
  });

  it('无任何数据 → sleep/fitnessAge/todayActivity 为 null，metrics 全 null', async () => {
    mockedPrisma.garminSleep.findFirst.mockResolvedValue(null);
    mockedPrisma.garminFitnessAge.findFirst.mockResolvedValue(null);
    mockedPrisma.garminMetric.findMany.mockResolvedValue([]);
    mockedPrisma.rawActivity.findMany.mockResolvedValue([]);

    const r = await deviceService.myTodayHealth('u1');

    expect(r.sleep).toBeNull();
    expect(r.fitnessAge).toBeNull();
    expect(r.metrics).toEqual({ trainingReadiness: null, enduranceScore: null, hillScore: null });
    expect(r.todayActivity).toBeNull();
  });

  it('第二次调用命中缓存（findFirst 不再查 DB）', async () => {
    mockedPrisma.garminSleep.findFirst.mockResolvedValue(null);
    mockedPrisma.garminFitnessAge.findFirst.mockResolvedValue(null);
    mockedPrisma.garminMetric.findMany.mockResolvedValue([]);
    mockedPrisma.rawActivity.findMany.mockResolvedValue([]);

    await deviceService.myTodayHealth('u1');
    await deviceService.myTodayHealth('u1');

    expect(mockedPrisma.garminSleep.findFirst).toHaveBeenCalledTimes(1);
  });
});
