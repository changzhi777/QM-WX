/**
 * stats.service 单测 — 跑者数据汇总（myRunnerStats）
 *
 * 覆盖：
 * - 年/总跑量/打卡/月跑量 聚合正确（Promise.all 3 aggregate）
 * - 平均配速计算（durationSec / distanceKm → mm:ss/km）
 * - Cache.wrap 命中（第二次同参数不查 DB）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('src/infra/prisma.js', () => ({
  prisma: {
    checkin: { aggregate: vi.fn() },
  },
}));

const _redisMockState = vi.hoisted(() => ({
  cacheStore: new Map<string, string>(),
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn(), scan: vi.fn() },
}));
vi.mock('src/infra/redis.js', () => ({ redis: _redisMockState.redis }));
vi.mock('src/config/env.js', () => ({ env: { NODE_ENV: 'test' } }));

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
import { statsService } from 'src/modules/stats/stats.service.js';

const mockedPrisma = vi.mocked(prisma);

beforeEach(() => {
  vi.clearAllMocks();
  _redisMockState.cacheStore.clear();
  setupMockRedis();
});

describe('statsService.myRunnerStats', () => {
  it('聚合年/月/总跑量 + 打卡次数 + 平均配速', async () => {
    // Promise.all 顺序：yearAgg → monthAgg → totalAgg
    mockedPrisma.checkin.aggregate
      .mockResolvedValueOnce({ _sum: { distance: 200, durationSec: 60000 }, _count: 40 } as never)
      .mockResolvedValueOnce({ _sum: { distance: 50 }, _count: 10 } as never)
      .mockResolvedValueOnce({ _sum: { distance: 100, durationSec: 30000 }, _count: 214 } as never);

    const r = await statsService.myRunnerStats('u1', { year: 2026, month: 6 });

    expect(r.year).toBe(2026);
    expect(r.month).toBe(6);
    expect(r.yearDistance).toBe(200);
    expect(r.yearCheckins).toBe(40);
    expect(r.monthDistance).toBe(50);
    expect(r.totalDistance).toBe(100);
    expect(r.totalCheckins).toBe(214);
    // avgPace = round(30000 / 100) = 300 sec/km → 5:00
    expect(r.avgPace).toBe('5:00');
  });

  it('无数据时返回 0 + avgPace null', async () => {
    mockedPrisma.checkin.aggregate.mockResolvedValue({
      _sum: { distance: null, durationSec: null },
      _count: 0,
    } as never);

    const r = await statsService.myRunnerStats('u1', {});
    expect(r.totalDistance).toBe(0);
    expect(r.totalCheckins).toBe(0);
    expect(r.avgPace).toBeNull();
  });

  it('第二次同参数命中缓存（aggregate 不再调）', async () => {
    mockedPrisma.checkin.aggregate.mockResolvedValue({
      _sum: { distance: 0, durationSec: 0 },
      _count: 0,
    } as never);

    await statsService.myRunnerStats('u1', { year: 2026, month: 6 });
    await statsService.myRunnerStats('u1', { year: 2026, month: 6 });

    // 只第一次查 3 次（Promise.all），第二次命中缓存 0 次
    expect(mockedPrisma.checkin.aggregate).toHaveBeenCalledTimes(3);
  });
});
