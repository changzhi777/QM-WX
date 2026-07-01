/**
 * device.service 佳明数据查询单测（B-2，2026-07-01）
 *
 * 与 device.service.test.ts（V2 stub）分离 — 这里测 garmin 查询 4 方法：
 *  - 返回结构 + 分页 + 从 raw 取展示字段
 *  - Cache.wrap 命中（第二次不查 DB）
 *  - DateTime 进缓存转 ISO（类型一致）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('src/infra/prisma.js', () => ({
  prisma: {
    rawActivity: { findMany: vi.fn(), count: vi.fn() },
    garminSleep: { findMany: vi.fn(), count: vi.fn() },
    garminFitnessAge: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
    garminMetric: { findMany: vi.fn(), count: vi.fn() },
  },
}));

// Mock Redis — Cache.wrap 走 redis.get/set（vi.hoisted 避免 clearAllMocks 清 impl）
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

describe('deviceService.myActivities (garmin)', () => {
  it('返回活动列表 + 分页 + 从 raw 取 name/calories/locationName', async () => {
    mockedPrisma.rawActivity.findMany.mockResolvedValue([
      {
        id: 'a1', type: 'running', startTime: new Date('2024-01-01T00:00:00Z'),
        durationSec: 1800, distanceMeters: 8000, avgHr: 150, maxHr: 170, cadence: 180,
        raw: { name: '长沙跑步', calories: 500, locationName: '长沙' },
      },
    ] as never);
    mockedPrisma.rawActivity.count.mockResolvedValue(1 as never);

    const r = await deviceService.myActivities('u1', { page: 1, pageSize: 20 });

    expect(r.total).toBe(1);
    expect(r.page).toBe(1);
    expect(r.hasMore).toBe(false);
    expect(r.list[0]).toMatchObject({
      id: 'a1', type: 'running', name: '长沙跑步', calories: 500, locationName: '长沙',
      distanceMeters: 8000,
    });
    expect(r.list[0].startTime).toBe('2024-01-01T00:00:00.000Z'); // ISO 序列化
  });

  it('第二次调用命中缓存（findMany 只查一次）', async () => {
    mockedPrisma.rawActivity.findMany.mockResolvedValue([] as never);
    mockedPrisma.rawActivity.count.mockResolvedValue(0 as never);

    await deviceService.myActivities('u1', { page: 1, pageSize: 20 });
    await deviceService.myActivities('u1', { page: 1, pageSize: 20 });

    expect(mockedPrisma.rawActivity.findMany).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.rawActivity.count).toHaveBeenCalledTimes(1);
  });

  it('不同分页参数走不同 cache key（各查一次 DB）', async () => {
    mockedPrisma.rawActivity.findMany.mockResolvedValue([] as never);
    mockedPrisma.rawActivity.count.mockResolvedValue(0 as never);

    await deviceService.myActivities('u1', { page: 1, pageSize: 20 });
    await deviceService.myActivities('u1', { page: 2, pageSize: 20 });

    expect(mockedPrisma.rawActivity.findMany).toHaveBeenCalledTimes(2);
  });
});

describe('deviceService.mySleep (garmin)', () => {
  it('返回睡眠列表（calendarDate 转 ISO）', async () => {
    mockedPrisma.garminSleep.findMany.mockResolvedValue([
      {
        id: 's1', calendarDate: new Date('2024-01-01T00:00:00Z'), deepSleepSeconds: 3600,
        sleepStartGMT: null, sleepEndGMT: null, ingestedAt: new Date('2024-01-02T00:00:00Z'),
        raw: {},
      },
    ] as never);
    mockedPrisma.garminSleep.count.mockResolvedValue(1 as never);

    const r = await deviceService.mySleep('u1', {});
    expect(r.total).toBe(1);
    expect(r.list[0].calendarDate).toBe('2024-01-01T00:00:00.000Z');
  });
});

describe('deviceService.myMetrics (garmin)', () => {
  it('按 metricType 返回指标', async () => {
    mockedPrisma.garminMetric.findMany.mockResolvedValue([
      {
        id: 'm1', metricType: 'training_readiness', calendarDate: new Date('2024-01-01T00:00:00Z'),
        value: 80, level: 'HIGH', raw: {}, ingestedAt: new Date('2024-01-02T00:00:00Z'),
      },
    ] as never);
    mockedPrisma.garminMetric.count.mockResolvedValue(1 as never);

    const r = await deviceService.myMetrics('u1', { metricType: 'training_readiness' });
    expect(r.total).toBe(1);
    expect(r.list[0].value).toBe(80);
    expect(r.list[0].level).toBe('HIGH');
  });
});

describe('deviceService.myFitnessAge (garmin)', () => {
  it('返回健身年龄列表 + latest', async () => {
    const row = {
      id: 'f1', asOfDate: new Date('2024-01-01T00:00:00Z'), bmi: 22, rhr: 55,
      vo2Max: 48, currentBioAge: 30, raw: {}, ingestedAt: new Date('2024-01-02T00:00:00Z'),
    };
    mockedPrisma.garminFitnessAge.findMany.mockResolvedValue([row] as never);
    mockedPrisma.garminFitnessAge.count.mockResolvedValue(1 as never);
    mockedPrisma.garminFitnessAge.findFirst.mockResolvedValue(row as never);

    const r = await deviceService.myFitnessAge('u1', {});
    expect(r.total).toBe(1);
    expect(r.latest).not.toBeNull();
    expect(r.latest?.currentBioAge).toBe(30);
    expect(r.list[0].asOfDate).toBe('2024-01-01T00:00:00.000Z');
  });
});
