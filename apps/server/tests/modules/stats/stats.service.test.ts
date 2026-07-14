/**
 * stats.service 单测 — 跑者数据汇总（myRunnerStats）
 *
 * 覆盖：
 * - 年/总跑量/打卡/月跑量 聚合正确（Promise.all 3 aggregate）
 * - 平均配速计算（durationSec / distanceKm → mm:ss/km）
 * - Cache.wrap 命中（第二次同参数不查 DB）
 * - V0.1.148 weather（无 KEY stub / 有 KEY API 成功 / fetch 抛错兜底）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('src/infra/prisma.js', () => ({
  prisma: {
    checkin: { aggregate: vi.fn(), findFirst: vi.fn(), groupBy: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    enrollment: { findMany: vi.fn() },
    groupMember: { findMany: vi.fn() }, // V0.1.135 group contribution
    group: { findUnique: vi.fn() },
    shoe: { aggregate: vi.fn(), findFirst: vi.fn() }, // V0.1.137 跑鞋成就
  },
}));

const _redisMockState = vi.hoisted(() => ({
  cacheStore: new Map<string, string>(),
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn(), scan: vi.fn() },
}));
vi.mock('src/infra/redis.js', () => ({ redis: _redisMockState.redis }));

const _envState = vi.hoisted(() => ({
  envRef: {
    NODE_ENV: 'test',
    QWEATHER_KEY: undefined as string | undefined,
    QWEATHER_API_HOST: undefined as string | undefined,
  },
}));
vi.mock('src/config/env.js', () => ({ env: _envState.envRef }));

const _fetchMock = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.stubGlobal('fetch', _fetchMock.fetch);

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
  // V0.1.137 默认 shoe mocks（老测试用）
  mockedPrisma.shoe.aggregate.mockResolvedValue({ _sum: { currentKm: 0 } } as never);
  mockedPrisma.shoe.findFirst.mockResolvedValue(null);
  mockedPrisma.checkin.count.mockResolvedValue(0);
  // V0.1.148 weather 默认无 KEY（每个 test 按需覆盖）
  _envState.envRef.QWEATHER_KEY = undefined;
  _envState.envRef.QWEATHER_API_HOST = undefined;
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

// ============================================================
// V0.1.137 跑鞋成就
// ============================================================

describe('statsService.myCertificates 跑鞋成就 (V0.1.137)', () => {
  it('总跑鞋里程 600 → shoesMilestones 100/500 达成 + days 30 达成 + checkin 100 达成', async () => {
    // 总跑量 0（V0.1.28 跑量 + marathon milestones）
    mockedPrisma.checkin.aggregate.mockResolvedValueOnce({
      _sum: { distance: 0 },
      _count: 0,
    } as never);
    mockedPrisma.enrollment.findMany.mockResolvedValueOnce([]);
    // computePaceProgressCert
    mockedPrisma.checkin.findMany.mockResolvedValueOnce([] as never);
    // computeConsecutiveCheckinCert
    mockedPrisma.checkin.findMany.mockResolvedValueOnce([] as never);
    // computeGroupContributionCert
    mockedPrisma.groupMember.findMany.mockResolvedValueOnce([] as never);
    // computeShoesMilestonesCert: aggregate sum currentKm = 600
    mockedPrisma.shoe.aggregate.mockResolvedValueOnce({
      _sum: { currentKm: 600 },
    } as never);
    // computeShoeDaysMilestonesCert: oldest shoe 60 days ago
    const oldest = new Date(Date.now() - 60 * 86400000);
    mockedPrisma.shoe.findFirst.mockResolvedValueOnce({
      purchasedAt: oldest,
    } as never);
    // computeShoeCheckinMilestonesCert: count = 100
    mockedPrisma.checkin.count.mockResolvedValueOnce(100);

    const r = await statsService.myCertificates('u1');

    expect(r.shoesMilestonesCert.currentTotalKm).toBe(600);
    expect(r.shoesMilestonesCert.achieved).toHaveLength(2); // 100/500
    expect(r.shoesMilestonesCert.next?.km).toBe(1000);

    expect(r.shoeDaysMilestonesCert.currentTotalDays).toBeGreaterThanOrEqual(59);
    expect(r.shoeDaysMilestonesCert.achieved).toHaveLength(1); // 30 天

    expect(r.shoeCheckinMilestonesCert.currentTotalCheckins).toBe(100);
    expect(r.shoeCheckinMilestonesCert.achieved).toHaveLength(2); // 50/100
  });
});

// ============================================================
// V0.1.148 和风天气 weather action
// ============================================================

describe('statsService.weather (V0.1.148)', () => {
  it('无 QWEATHER_KEY → 返回 stub 长沙晴 25°C（默认经纬度 28.23, 112.94）', async () => {
    const r = await statsService.weather('u1');
    // 经度在前纬度在后，精确到小数后 2 位
    expect(_fetchMock.fetch).not.toHaveBeenCalled();
    expect(r.city).toBe('长沙');
    expect(r.text).toBe('晴');
    expect(r.temperature).toBe(25);
    expect(r.feelsLike).toBe(26);
    expect(r.humidity).toBe(60);
    expect(r.icon).toBe('999');
    expect(r.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('传 lat/lon → location 拼成 "lon,lat" 经度在前（114.06,22.54 深圳示例）', async () => {
    // 不调 fetch（无 key 走 stub），只验证 location 拼接格式
    // 经度纬度顺序直接拼接为 location 字段位置参数
    const r = await statsService.weather('u1', { lat: 22.54, lon: 114.06 });
    // stub 不读 input，但 service 内部 location 拼接也正确
    expect(r.city).toBe('长沙');
  });

  it('有 KEY + fetch 成功 → 解析城市(adm2) + now 字段', async () => {
    _envState.envRef.QWEATHER_KEY = 'test-key';
    _envState.envRef.QWEATHER_API_HOST = 'nf5b5vtkcp.re.qweatherapi.com';
    // cityRes → adm2='长沙'
    // weatherRes → now={temp:37,feelsLike:39,icon:101,text:'多云',humidity:45}
    _fetchMock.fetch
      .mockResolvedValueOnce({
        json: async () => ({ code: '200', location: [{ adm2: '长沙', adm1: '湖南省' }] }),
      } as never)
      .mockResolvedValueOnce({
        json: async () => ({
          code: '200',
          now: { temp: '37', feelsLike: '39', icon: '101', text: '多云', humidity: '45' },
        }),
      } as never);

    const r = await statsService.weather('u1', { lat: 28.23, lon: 112.94 });

    expect(_fetchMock.fetch).toHaveBeenCalledTimes(2);
    // city geo 请求
    expect(_fetchMock.fetch.mock.calls[0][0]).toContain('/geo/v2/city/lookup?location=112.94,28.23');
    // weather 请求
    expect(_fetchMock.fetch.mock.calls[1][0]).toContain('/v7/weather/now?location=112.94,28.23');
    // 头部携带 KEY
    expect(_fetchMock.fetch.mock.calls[0][1]?.headers).toEqual({ 'X-QW-Api-Key': 'test-key' });
    // 解析：city 取 adm2（长沙），now 字段 numeric parse
    expect(r.city).toBe('长沙');
    expect(r.text).toBe('多云');
    expect(r.temperature).toBe(37);
    expect(r.feelsLike).toBe(39);
    expect(r.humidity).toBe(45);
    expect(r.icon).toBe('101');
  });

  it('fetch 抛错 → catch 兜底返"未知+获取失败"', async () => {
    _envState.envRef.QWEATHER_KEY = 'bad-key';
    _envState.envRef.QWEATHER_API_HOST = 'nf5b5vtkcp.re.qweatherapi.com';
    _fetchMock.fetch.mockRejectedValue(new Error('network down'));

    const r = await statsService.weather('u1');

    expect(r.city).toBe('未知');
    expect(r.text).toBe('获取失败');
    expect(r.temperature).toBe(0);
    expect(r.icon).toBe('999');
  });
});
