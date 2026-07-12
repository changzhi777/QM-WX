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
    checkin: { aggregate: vi.fn(), findFirst: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
    enrollment: { findMany: vi.fn() },
    groupMember: { findMany: vi.fn() }, // V0.1.135 group contribution
    group: { findUnique: vi.fn() },
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

describe('statsService.myAnnualReport (V0.1.27)', () => {
  it('年汇总 + 月度分布（groupBy 切月）+ 最长单次 + 活跃天数', async () => {
    // Promise.all 顺序：yearAgg(aggregate) → longestRun(findFirst) → daily(groupBy)
    mockedPrisma.checkin.aggregate.mockResolvedValueOnce({
      _sum: { distance: 55, durationSec: 18000 },
      _count: 6,
    } as never);
    mockedPrisma.checkin.findFirst.mockResolvedValueOnce({
      distance: 30,
      date: '2026-03-15',
    } as never);
    mockedPrisma.checkin.groupBy.mockResolvedValueOnce([
      { date: '2026-01-05', _sum: { distance: 10 }, _count: 2 },
      { date: '2026-02-10', _sum: { distance: 15 }, _count: 3 },
      { date: '2026-03-15', _sum: { distance: 30 }, _count: 1 },
    ] as never);

    const r = await statsService.myAnnualReport('u1', { year: 2026 });

    expect(r.year).toBe(2026);
    expect(r.yearDistance).toBe(55);
    expect(r.yearCheckins).toBe(6);
    expect(r.longestRun).toEqual({ distance: 30, date: '2026-03-15' });
    expect(r.activeDays).toBe(3); // daily 长度
    // 月度聚合（按 date 切片月份）
    expect(r.monthly).toHaveLength(12);
    expect(r.monthly[0]).toEqual({ month: 1, distance: 10, count: 2 });
    expect(r.monthly[1]).toEqual({ month: 2, distance: 15, count: 3 });
    expect(r.monthly[2]).toEqual({ month: 3, distance: 30, count: 1 });
    expect(r.monthly[3]).toEqual({ month: 4, distance: 0, count: 0 });
  });

  it('无数据 → longestRun null + monthly 全 0 + activeDays 0', async () => {
    mockedPrisma.checkin.aggregate.mockResolvedValueOnce({
      _sum: { distance: null, durationSec: null },
      _count: 0,
    } as never);
    mockedPrisma.checkin.findFirst.mockResolvedValueOnce(null);
    mockedPrisma.checkin.groupBy.mockResolvedValueOnce([]);

    const r = await statsService.myAnnualReport('u1', { year: 2026 });

    expect(r.yearDistance).toBe(0);
    expect(r.yearCheckins).toBe(0);
    expect(r.longestRun).toBeNull();
    expect(r.activeDays).toBe(0);
    expect(r.monthly).toHaveLength(12);
    expect(r.monthly.every((m) => m.distance === 0 && m.count === 0)).toBe(true);
  });

  it('默认 year = 今年（不传 year）', async () => {
    mockedPrisma.checkin.aggregate.mockResolvedValueOnce({
      _sum: { distance: 0, durationSec: 0 },
      _count: 0,
    } as never);
    mockedPrisma.checkin.findFirst.mockResolvedValueOnce(null);
    mockedPrisma.checkin.groupBy.mockResolvedValueOnce([]);

    const r = await statsService.myAnnualReport('u1', {});
    expect(r.year).toBe(new Date().getFullYear());
  });
});

describe('statsService.myCertificates (V0.1.28)', () => {
  it('里程碑证书（达标的）+ 赛事证书 + 下一里程碑', async () => {
    // 总跑量 600 → 达 100/500，未达 1000
    mockedPrisma.checkin.aggregate.mockResolvedValueOnce({
      _sum: { distance: 600 },
      _count: 80,
    } as never);
    mockedPrisma.enrollment.findMany.mockResolvedValueOnce([
      {
        id: 'e1',
        contentId: 'c1',
        status: 'confirmed',
        content: { title: '长沙马拉松', date: '2026-10-01', location: '长沙', cover: null },
      },
    ] as never);
    // V0.1.135 多种证书需要：checkin.findMany + groupMember.findMany
    mockedPrisma.checkin.findMany.mockResolvedValue([] as never);
    mockedPrisma.groupMember.findMany.mockResolvedValue([] as never);

    const r = await statsService.myCertificates('u1');

    expect(r.totalDistance).toBe(600);
    expect(r.totalCheckins).toBe(80);
    expect(r.milestones).toHaveLength(2); // 100 + 500
    expect(r.milestones.map((m) => m.km)).toEqual([100, 500]);
    expect(r.marathons).toHaveLength(1);
    expect(r.marathons[0].title).toBe('长沙马拉松');
    expect(r.marathons[0].status).toBe('confirmed');
    expect(r.nextMilestone?.km).toBe(1000); // 下一里程碑
  });

  it('总跑量 0 → 无里程碑证书 + nextMilestone=100', async () => {
    mockedPrisma.checkin.aggregate.mockResolvedValueOnce({
      _sum: { distance: null },
      _count: 0,
    } as never);
    mockedPrisma.enrollment.findMany.mockResolvedValueOnce([]);
    mockedPrisma.checkin.findMany.mockResolvedValue([] as never);
    mockedPrisma.groupMember.findMany.mockResolvedValue([] as never);

    const r = await statsService.myCertificates('u1');

    expect(r.milestones).toHaveLength(0);
    expect(r.marathons).toHaveLength(0);
    expect(r.nextMilestone?.km).toBe(100);
  });

  it('总跑量 ≥ 3000 → 全部里程碑达成 + nextMilestone null', async () => {
    mockedPrisma.checkin.aggregate.mockResolvedValueOnce({
      _sum: { distance: 3500 },
      _count: 500,
    } as never);
    mockedPrisma.enrollment.findMany.mockResolvedValueOnce([]);
    mockedPrisma.checkin.findMany.mockResolvedValue([] as never);
    mockedPrisma.groupMember.findMany.mockResolvedValue([] as never);

    const r = await statsService.myCertificates('u1');

    expect(r.milestones).toHaveLength(4); // 100/500/1000/3000 全达
    expect(r.nextMilestone).toBeNull();
  });
});

// ============================================================
// V0.1.135 多种证书 helper
// ============================================================

describe('statsService.myCertificates 多种证书 (V0.1.135)', () => {
  it('总跑量 600 + 配速进步达成 + 连续 7 天 + 群内前 3 → 返 5 段', async () => {
    // 总跑量 600
    mockedPrisma.checkin.aggregate.mockResolvedValueOnce({
      _sum: { distance: 600 },
      _count: 80,
    } as never);
    mockedPrisma.enrollment.findMany.mockResolvedValueOnce([]);

    // computePaceProgressCert: 10 次有配速 checkin，最近 5 比前 5 快 10%
    const recent5 = Array.from({ length: 5 }, () => ({ distance: 10, durationSec: 3000 })); // pace 300
    const baseline5 = Array.from({ length: 5 }, () => ({ distance: 10, durationSec: 3500 })); // pace 350
    mockedPrisma.checkin.findMany.mockResolvedValueOnce([...recent5, ...baseline5] as never);

    // computeConsecutiveCheckinCert: 7 天连续 (2026-07-01 ~ 2026-07-07)
    mockedPrisma.checkin.findMany.mockResolvedValueOnce(
      [1, 2, 3, 4, 5, 6, 7].map((d) => ({ date: `2026-07-0${d}` })) as never,
    );

    // computeGroupContributionCert: 1 个 group + 用户 rank 1
    mockedPrisma.groupMember.findMany.mockResolvedValueOnce([{ groupId: 'g1' }] as never);
    mockedPrisma.group.findUnique.mockResolvedValueOnce({ name: '晨跑群' } as never);
    mockedPrisma.groupMember.findMany.mockResolvedValueOnce([{ userId: 'u1' }, { userId: 'u2' }] as never);
    mockedPrisma.checkin.groupBy.mockResolvedValueOnce([
      { userId: 'u1', _sum: { distance: 100 } },
      { userId: 'u2', _sum: { distance: 50 } },
    ] as never);

    const r = await statsService.myCertificates('u1');

    expect(r.totalDistance).toBe(600);
    expect(r.milestones).toHaveLength(2); // 100/500 达成
    expect(r.paceProgressCert.achieved).toBe(true);
    expect(r.paceProgressCert.improvementPct).toBeGreaterThan(10);
    expect(r.consecutiveCheckinCert.longestStreak).toBe(7);
    expect(r.consecutiveCheckinCert.achieved).toHaveLength(1); // 7 天达成
    expect(r.groupContributionCert.achieved).toBe(true);
    expect(r.groupContributionCert.topRanks).toHaveLength(1);
  });
});
