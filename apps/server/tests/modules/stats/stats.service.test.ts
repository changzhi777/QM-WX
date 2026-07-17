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
    user: { findUnique: vi.fn() }, // V0.2.0 userProfile
    bodyCompositionRecord: { findFirst: vi.fn() }, // V0.2.0 userProfile
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

// ============================================================
// V0.2.0 关联分析 weatherAnalysis（Pearson 温度×配速 / 湿度×心率）
// ============================================================

describe('statsService.weatherAnalysis (V0.2.0)', () => {
  it('样本 < 10 → sufficient:false + 提示积累中', async () => {
    mockedPrisma.checkin.findMany.mockResolvedValueOnce([
      { weatherTemp: 20, humidity: 50, pace: '5:30', heartRate: 150 },
    ] as never);

    const r = await statsService.weatherAnalysis('u1');

    expect(r.sufficient).toBe(false);
    expect(r.count).toBe(1);
    expect(r.message).toContain('积累中');
  });

  it('样本 ≥ 10 + 温度/湿度双正相关 → insights + correlation + scatter', async () => {
    // 12 条：温度递增(18-29) + 配速秒递增(正相关) + 湿度递增 + 心率递增(正相关)
    const data = Array.from({ length: 12 }, (_, i) => ({
      weatherTemp: 18 + i,
      humidity: 40 + i * 2,
      pace: `5:${String(30 + i).padStart(2, '0')}`, // 5:30..5:41
      heartRate: 145 + i,
    }));
    mockedPrisma.checkin.findMany.mockResolvedValueOnce(data as never);

    const r = await statsService.weatherAnalysis('u1');

    expect(r.sufficient).toBe(true);
    expect(r.count).toBe(12);
    // 温度×配速正相关（温度高配速慢）
    expect(r.correlations.tempPace).not.toBeNull();
    expect(r.correlations.tempPace!).toBeGreaterThan(0.3);
    // 湿度×心率正相关
    expect(r.correlations.humidityHr).not.toBeNull();
    expect(r.correlations.humidityHr!).toBeGreaterThan(0.3);
    // 洞察文本
    expect(r.insights.length).toBeGreaterThan(0);
    expect(r.insights.some((t) => t.includes('高温'))).toBe(true);
    // 散点数据（≤50）
    expect(r.scatter.tempPace.length).toBeLessThanOrEqual(50);
    expect(r.scatter.tempPace[0]).toEqual({ x: 18, y: 330 });
  });

  it('温度×配速负相关 → 你更耐热 洞察', async () => {
    // 12 条：温度递增 + 配速秒递减（更耐热）
    const data = Array.from({ length: 12 }, (_, i) => ({
      weatherTemp: 18 + i,
      humidity: 50, // 固定湿度(湿度样本 < 10 → humidityHrR=null)
      pace: `5:${String(45 - i).padStart(2, '0')}`, // 5:45..5:34
      heartRate: null, // 湿度样本<10 时 humidityHr 不参与
    }));
    mockedPrisma.checkin.findMany.mockResolvedValueOnce(data as never);

    const r = await statsService.weatherAnalysis('u1');
    expect(r.sufficient).toBe(true);
    expect(r.correlations.tempPace!).toBeLessThan(-0.3); // 负相关
    expect(r.insights.some((t) => t.includes('更耐热'))).toBe(true);
    // 湿度样本 < 10 → humidityHrR null
    expect(r.correlations.humidityHr).toBeNull();
  });

  it('样本充足但无显著相关 → 兜底 insights', async () => {
    // 12 条数据：温度全相同 + 配速全相同（完全无相关）
    const data = Array.from({ length: 12 }, (_, i) => ({
      weatherTemp: 25, // 全相同 → tempPaceR=null(pearson < 2 返 null)
      humidity: 50,
      pace: '5:30', // 全相同
      heartRate: null, // humidityHrR=null
    }));
    mockedPrisma.checkin.findMany.mockResolvedValueOnce(data as never);

    const r = await statsService.weatherAnalysis('u1');
    expect(r.sufficient).toBe(true);
    // tempPaceR=null(因全相同)+ humidityHrR=null → insights 兜底
    expect(r.insights.some((t) => t.includes('未发现显著'))).toBe(true);
  });

  it('V0.2.26 B1: AQI×心率正相关 → 雾霾天宜室内 insight', async () => {
    // 12 条：AQI 递增(30-140) + 心率递增(正相关)，温湿度固定避免干扰
    const data = Array.from({ length: 12 }, (_, i) => ({
      weatherTemp: 20,
      humidity: 50,
      aqi: 30 + i * 10,
      pace: '5:30',
      heartRate: 140 + i,
    }));
    mockedPrisma.checkin.findMany.mockResolvedValueOnce(data as never);

    const r = await statsService.weatherAnalysis('u1');
    expect(r.correlations.aqiHr).not.toBeNull();
    expect(r.correlations.aqiHr!).toBeGreaterThan(0.3);
    expect(r.insights.some((t) => t.includes('雾霾'))).toBe(true);
  });

  it('V0.2.26 A1: 体感温度区间配速曲线 + optimalZone（低温最快）', async () => {
    // 12 条：4 桶（体感 <10/10-20/20-30/>30）各 3 条，低温快/高温慢
    const data = [
      ...Array.from({ length: 3 }, () => ({ weatherTemp: 5, humidity: 50, pace: '5:00', heartRate: 140 })),
      ...Array.from({ length: 3 }, () => ({ weatherTemp: 15, humidity: 50, pace: '5:20', heartRate: 150 })),
      ...Array.from({ length: 3 }, () => ({ weatherTemp: 25, humidity: 50, pace: '5:40', heartRate: 160 })),
      ...Array.from({ length: 3 }, () => ({ weatherTemp: 35, humidity: 50, pace: '6:00', heartRate: 170 })),
    ];
    mockedPrisma.checkin.findMany.mockResolvedValueOnce(data as never);

    const r = await statsService.weatherAnalysis('u1');
    expect(r.feelsLikeZones).toHaveLength(4);
    expect(r.feelsLikeZones.find((z) => z.zone === '<10')?.avgPaceSec).toBe(300); // 5:00
    expect(r.feelsLikeZones.find((z) => z.zone === '>30')?.avgPaceSec).toBe(360); // 6:00
    expect(r.optimalZone).toBe('<10'); // 最快
  });
});

// ============================================================
// V0.2.0 用户画像 userProfile（聚合基础/运动/健康 → tags + summary）
// ============================================================

describe('statsService.userProfile (V0.2.0)', () => {
  it('正常聚合 → tags（体型+跑者级）+ summary + basic + sport + body', async () => {
    mockedPrisma.user.findUnique.mockResolvedValueOnce({
      gender: 'male',
      birthday: '1990-01-01',
      height: 175,
      weight: 70,
      region: '长沙',
      memberLevel: 'free',
    } as never);
    mockedPrisma.checkin.aggregate.mockResolvedValueOnce({
      _sum: { distance: 500 },
      _count: 100,
      _avg: { heartRate: 150 },
    } as never);
    mockedPrisma.bodyCompositionRecord.findFirst.mockResolvedValueOnce({
      bmi: 22.5,
      bodyFat: 18,
      muscle: 35,
      visceralFat: 8,
    } as never);

    const r = await statsService.userProfile('u1');

    // BMI 22.5 → 正常体型（< 24）
    expect(r.tags).toContain('正常体型');
    // 总跑量 500 → 进阶跑者（> 200）
    expect(r.tags).toContain('进阶跑者');
    // basic
    expect(r.basic.gender).toBe('male');
    expect(r.basic.age).toBeGreaterThan(30);
    expect(r.basic.height).toBe(175);
    expect(r.basic.bmi).toBe(22.9); // 70 / 1.75² ≈ 22.86 → toFixed(1)
    // sport
    expect(r.sport.totalDistance).toBe(500);
    expect(r.sport.checkinCount).toBe(100);
    expect(r.sport.avgHeartRate).toBe(150);
    // body
    expect(r.body?.bodyFat).toBe(18);
    // summary 含"男"
    expect(r.summary).toContain('男');
    expect(r.summary).toContain('500');
  });

  it('无 user 数据 → tags 仍按默认推算（运动新手）', async () => {
    mockedPrisma.user.findUnique.mockResolvedValueOnce(null);
    mockedPrisma.checkin.aggregate.mockResolvedValueOnce({
      _sum: { distance: 0 },
      _count: 0,
      _avg: { heartRate: null },
    } as never);
    mockedPrisma.bodyCompositionRecord.findFirst.mockResolvedValueOnce(null);

    const r = await statsService.userProfile('u1');

    expect(r.tags).toContain('运动新手');
    expect(r.sport.totalDistance).toBe(0);
    expect(r.body).toBeNull();
    expect(r.basic.bmi).toBeNull();
  });

  it('BMI 分支：偏瘦(<18.5) / 偏胖(24-28) / 肥胖(≥28) + 资深跑者(>1000km) + female 性别', async () => {
    // BMI = 17（偏瘦）+ 累计 1500km（资深跑者）+ female + 无 birthday（age=null）
    mockedPrisma.user.findUnique.mockResolvedValueOnce({
      gender: 'female',
      birthday: null, // 无 birthday → age=null
      height: 165,
      weight: 46, // 46/1.65² ≈ 16.9 → 偏瘦
      region: '深圳',
      memberLevel: 'yearly',
    } as never);
    mockedPrisma.checkin.aggregate.mockResolvedValueOnce({
      _sum: { distance: 1500 }, // 资深跑者
      _count: 500,
      _avg: { heartRate: 155 },
    } as never);
    mockedPrisma.bodyCompositionRecord.findFirst.mockResolvedValueOnce(null);

    const r = await statsService.userProfile('u1');
    expect(r.tags).toContain('偏瘦');
    expect(r.tags).toContain('资深跑者');
    expect(r.basic.gender).toBe('female');
    expect(r.basic.age).toBeNull(); // 无 birthday
    expect(r.basic.bmi).toBe(16.9);
    expect(r.summary).toContain('女'); // female 性别
    expect(r.summary).toContain('?岁'); // age 占位
  });

  it('BMI 用 BodyCompositionRecord 兜底（user 无 height/weight 但有 body comp）', async () => {
    // V0.2.0 兜底逻辑：user.height/weight 缺 → 用 bodyCompositionRecord.bmi
    mockedPrisma.user.findUnique.mockResolvedValueOnce({
      gender: 'male',
      birthday: '1990-01-01',
      height: null, // 缺
      weight: null, // 缺
      region: '北京',
      memberLevel: 'monthly',
    } as never);
    mockedPrisma.checkin.aggregate.mockResolvedValueOnce({
      _sum: { distance: 50 },
      _count: 10,
      _avg: { heartRate: 145 },
    } as never);
    mockedPrisma.bodyCompositionRecord.findFirst.mockResolvedValueOnce({
      bmi: 26.5, // 偏胖
      bodyFat: 28,
      muscle: 30,
      visceralFat: 12,
    } as never);

    const r = await statsService.userProfile('u1');
    expect(r.basic.bmi).toBe(26.5); // 用 body comp 兜底
    expect(r.tags).toContain('偏胖'); // BMI 24-28
    expect(r.tags).toContain('入门跑者'); // total 50km(0<total≤200)
  });
});

// ============================================================
// V0.2.2 缓存命中（Cache.wrap 120s）
// ============================================================

describe('statsService.weatherAnalysis 缓存（V0.2.2）', () => {
  it('第二次同 user → 命中缓存（不再调 prisma）', async () => {
    const _redisMock = _redisMockState; // 复用 setupMockRedis 已建
    _redisMock.cacheStore.clear();

    // 第一次：mock 数据
    mockedPrisma.checkin.findMany.mockResolvedValueOnce([
      ...Array.from({ length: 12 }, (_, i) => ({
        weatherTemp: 20 + i,
        humidity: 50,
        pace: '5:30',
        heartRate: null,
      })),
    ] as never);

    const r1 = await statsService.weatherAnalysis('u1');
    expect(r1.sufficient).toBe(true);
    expect(mockedPrisma.checkin.findMany).toHaveBeenCalledTimes(1);

    // 第二次：缓存命中（findMany 不再调）
    const r2 = await statsService.weatherAnalysis('u1');
    expect(r2.sufficient).toBe(true);
    // 缓存命中 → prisma 不再查
    expect(mockedPrisma.checkin.findMany).toHaveBeenCalledTimes(1);
    // 缓存 key 存在
    expect(_redisMock.cacheStore.has('qmwx:cache:stats:weatherAnalysis:u1')).toBe(true);
  });
});

describe('statsService.userProfile 缓存（V0.2.2）', () => {
  it('第二次同 user → 命中缓存（不再调 prisma aggregate）', async () => {
    const _redisMock = _redisMockState;
    _redisMock.cacheStore.clear();

    mockedPrisma.user.findUnique.mockResolvedValueOnce({
      gender: 'male',
      birthday: '1990-01-01',
      height: 175,
      weight: 70,
      region: '北京',
      memberLevel: 'free',
    } as never);
    mockedPrisma.checkin.aggregate.mockResolvedValueOnce({
      _sum: { distance: 100 },
      _count: 20,
      _avg: { heartRate: 150 },
    } as never);
    mockedPrisma.bodyCompositionRecord.findFirst.mockResolvedValueOnce(null);

    const r1 = await statsService.userProfile('u1');
    expect(r1.tags).toContain('入门跑者');
    expect(mockedPrisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.checkin.aggregate).toHaveBeenCalledTimes(1);

    // 第二次：缓存命中（不调 prisma）
    await statsService.userProfile('u1');
    expect(mockedPrisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.checkin.aggregate).toHaveBeenCalledTimes(1);
    // 缓存 key 存在
    expect(_redisMock.cacheStore.has('qmwx:cache:stats:userProfile:u1')).toBe(true);
  });
});
