/**
 * stats module service — 跑者数据汇总（读模型）
 *
 * 数据来源：Checkin（含手动 manual + 佳明 garmin 导入）
 * 缓存：Cache.wrap 120s（汇总低频变化，失效靠 delByPattern）
 *
 * 参考：pic/2768 我的（跑者版）— 年跑量 / 总跑量 / 打卡次数 / 月跑量 / 平均配速
 */
import { prisma } from '../../infra/prisma.js';
import { Cache } from '../../infra/cache.js';
import type { MyRunnerStatsQuery, MyAnnualReportQuery } from './stats.schema.js';

const RUNNER_STATS_CACHE_TTL_SEC = 120;

/** 平均配速：totalDurationSec / totalDistanceKm → mm:ss/km */
function calcAvgPace(totalDurationSec: number, totalDistanceKm: number): string | null {
  if (!totalDistanceKm || totalDistanceKm <= 0 || !totalDurationSec) return null;
  const secPerKm = Math.round(totalDurationSec / totalDistanceKm);
  const m = Math.floor(secPerKm / 60);
  const s = secPerKm % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 跑量里程碑证书（V0.1.28，总跑量达标 → 动态生成） */
const MILESTONE_CERTS = [
  { km: 100, title: '初露锋芒', desc: '累计跑量突破 100 km' },
  { km: 500, title: '坚持不懈', desc: '累计跑量突破 500 km' },
  { km: 1000, title: '千里之行', desc: '累计跑量突破 1000 km' },
  { km: 3000, title: '马拉松健将', desc: '累计跑量突破 3000 km' },
] as const;

/** V0.1.135 连续打卡证书配置 */
const CONSECUTIVE_CERTS = [
  { days: 7, title: '周连击', desc: '连续打卡 7 天' },
  { days: 30, title: '月度坚持', desc: '连续打卡 30 天' },
  { days: 100, title: '百日筑基', desc: '连续打卡 100 天' },
] as const;

export const statsService = {
  /**
   * 跑者数据中心汇总（参考图 2768）
   *
   * 返回字段：
   * - yearDistance / yearCheckins：指定年（默认今年）
   * - monthDistance：指定月（默认本月）
   * - totalDistance / totalCheckins：全部历史
   * - avgPace：全部历史平均配速
   */
  async myRunnerStats(userId: string, input: MyRunnerStatsQuery) {
    const now = new Date();
    const year = input.year ?? now.getFullYear();
    const month = input.month ?? now.getMonth() + 1;
    const cacheKey = `stats:runner:${userId}:${year}:${month}`;

    return Cache.wrap(cacheKey, RUNNER_STATS_CACHE_TTL_SEC, async () => {
      const yearStart = `${year}-01-01`;
      const yearEnd = `${year + 1}-01-01`;
      const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
      const monthEnd =
        month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;

      const [yearAgg, monthAgg, totalAgg] = await Promise.all([
        prisma.checkin.aggregate({
          _sum: { distance: true, durationSec: true },
          _count: true,
          where: { userId, date: { gte: yearStart, lt: yearEnd } },
        }),
        prisma.checkin.aggregate({
          _sum: { distance: true },
          _count: true,
          where: { userId, date: { gte: monthStart, lt: monthEnd } },
        }),
        prisma.checkin.aggregate({
          _sum: { distance: true, durationSec: true },
          _count: true,
          where: { userId },
        }),
      ]);

      return {
        year,
        month,
        yearDistance: yearAgg._sum.distance ?? 0,
        yearCheckins: yearAgg._count,
        monthDistance: monthAgg._sum.distance ?? 0,
        monthCheckins: monthAgg._count,
        totalDistance: totalAgg._sum.distance ?? 0,
        totalCheckins: totalAgg._count,
        avgPace: calcAvgPace(totalAgg._sum.durationSec ?? 0, totalAgg._sum.distance ?? 0),
      };
    });
  },

  /**
   * 年度报告（V0.1.27，参考图 2768/2771 — 可分享战报）
   *
   * 返回：年汇总（yearDistance/Checkins/avgPace）+ 月度分布（12 个月）+ 最长单次 + 活跃天数
   * 数据来源：Checkin（manual + garmin 导入）
   * 缓存：Cache.wrap 120s（年度数据低频变化）
   *
   * 性能：用单次 groupBy(by date) 拿全年每日数据，前端 reduce 成月度（避免 12 次 aggregate）
   */
  async myAnnualReport(userId: string, input: MyAnnualReportQuery) {
    const now = new Date();
    const year = input.year ?? now.getFullYear();
    const cacheKey = `stats:annual:${userId}:${year}`;

    return Cache.wrap(cacheKey, RUNNER_STATS_CACHE_TTL_SEC, async () => {
      const yearStart = `${year}-01-01`;
      const yearEnd = `${year + 1}-01-01`;

      const [yearAgg, longestRun, daily] = await Promise.all([
        prisma.checkin.aggregate({
          _sum: { distance: true, durationSec: true },
          _count: true,
          where: { userId, date: { gte: yearStart, lt: yearEnd } },
        }),
        prisma.checkin.findFirst({
          where: { userId, date: { gte: yearStart, lt: yearEnd } },
          orderBy: { distance: 'desc' },
          select: { distance: true, date: true },
        }),
        prisma.checkin.groupBy({
          by: ['date'],
          _sum: { distance: true },
          _count: true,
          where: { userId, date: { gte: yearStart, lt: yearEnd } },
        }),
      ]);

      // 月度聚合（按 date 字符串切片月份，避免 12 次查询）
      const round1 = (n: number) => Math.round(n * 10) / 10;
      const monthly = Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        distance: 0,
        count: 0,
      }));
      for (const d of daily) {
        const m = Number(d.date.slice(5, 7)); // "YYYY-MM-DD" → MM
        if (m >= 1 && m <= 12) {
          monthly[m - 1].distance += d._sum.distance ?? 0;
          monthly[m - 1].count += d._count;
        }
      }

      return {
        year,
        yearDistance: round1(yearAgg._sum.distance ?? 0),
        yearCheckins: yearAgg._count,
        yearDurationSec: yearAgg._sum.durationSec ?? 0,
        avgPace: calcAvgPace(yearAgg._sum.durationSec ?? 0, yearAgg._sum.distance ?? 0),
        monthly: monthly.map((m) => ({ ...m, distance: round1(m.distance) })),
        longestRun: longestRun ? { distance: round1(longestRun.distance), date: longestRun.date } : null,
        activeDays: daily.length,
      };
    });
  },

  /**
   * 我的证书（V0.1.28，动态生成 — 不建表）
   *
   * 两类：
   * - 里程碑证书：总跑量达标 100/500/1000/3000 km（基于 Checkin aggregate）
   * - 赛事证书：已报名的马拉松（Enrollment type=marathon + Content）
   *
   * 缓存：Cache.wrap 120s
   */
  async myCertificates(userId: string) {
    const cacheKey = `stats:certs:${userId}`;
    return Cache.wrap(cacheKey, RUNNER_STATS_CACHE_TTL_SEC, async () => {
      const [totalAgg, enrollments] = await Promise.all([
        prisma.checkin.aggregate({
          _sum: { distance: true },
          _count: true,
          where: { userId },
        }),
        prisma.enrollment.findMany({
          where: { userId, type: 'marathon', status: { in: ['submitted', 'confirmed'] } },
          include: {
            content: { select: { title: true, date: true, location: true, cover: true } },
          },
        }),
      ]);

      const totalDistance = totalAgg._sum.distance ?? 0;
      const round1 = (n: number) => Math.round(n * 10) / 10;

      // 里程碑证书（达标的）
      const milestones = MILESTONE_CERTS.filter((m) => totalDistance >= m.km).map((m) => ({
        ...m,
        type: 'milestone' as const,
        currentKm: round1(totalDistance),
      }));

      // 赛事证书（已报名马拉松）
      const marathons = enrollments
        .filter((e) => e.content)
        .map((e) => ({
          type: 'marathon' as const,
          enrollmentId: e.id,
          contentId: e.contentId,
          title: e.content.title,
          date: e.content.date,
          location: e.content.location,
          cover: e.content.cover,
          status: e.status,
        }));

      return {
        totalDistance: round1(totalDistance),
        totalCheckins: totalAgg._count,
        milestones,
        marathons,
        nextMilestone: MILESTONE_CERTS.find((m) => totalDistance < m.km) ?? null,
        // V0.1.135 多种证书
        paceProgressCert: await computePaceProgressCert(userId),
        consecutiveCheckinCert: await computeConsecutiveCheckinCert(userId),
        groupContributionCert: await computeGroupContributionCert(userId),
      };
    });
  },
};

// ============================================================
// V0.1.135 多种证书 helper（动态生成，沿用 MILESTONE_CERTS 范式）
// ============================================================

/**
 * 配速进步证书：最近 5 次跑均快于历史均值 10%
 *
 * 算法：取用户最近 10 次有配速的 Checkin → 后 5 次平均 vs 前 5 次平均
 * 简化：MVP 不区分训练强度，按距离+时间算 pace (sec/km)
 */
async function computePaceProgressCert(userId: string) {
  const checkins = await prisma.checkin.findMany({
    where: { userId, distance: { gt: 0 }, durationSec: { gt: 0 } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { distance: true, durationSec: true },
  });
  if (checkins.length < 10) {
    return { type: 'pace_progress' as const, achieved: false, reason: 'need_10_runs' };
  }

  // 前 5 次（基线）vs 后 5 次（最新） — 数组按 desc，所以 [0..4]=最新5次, [5..9]=之前5次
  const recent5 = checkins.slice(0, 5);
  const baseline5 = checkins.slice(5, 10);

  const pace = (c: { distance: number; durationSec: number | null }) =>
    c.distance > 0 && c.durationSec ? c.durationSec / c.distance : Infinity;

  const recentAvg = recent5.reduce((s, c) => s + pace(c), 0) / 5;
  const baselineAvg = baseline5.reduce((s, c) => s + pace(c), 0) / 5;

  // 提速 10% → recent pace < baseline * 0.9
  const achieved = recentAvg < baselineAvg * 0.9;

  return {
    type: 'pace_progress' as const,
    title: '配速进步',
    desc: '最近 5 次跑进历史均值 10%',
    achieved,
    currentPace: Math.round(recentAvg),
    baselinePace: Math.round(baselineAvg),
    improvementPct: baselineAvg > 0 ? Math.round((1 - recentAvg / baselineAvg) * 100) : 0,
  };
}

/**
 * 连续打卡证书：当前/历史最长连续打卡天数
 *
 * 算法：按 date asc 找最长 streak（跨日期连续）
 */
async function computeConsecutiveCheckinCert(userId: string) {
  const checkins = await prisma.checkin.findMany({
    where: { userId },
    orderBy: { date: 'asc' },
    select: { date: true },
  });
  if (checkins.length === 0) {
    return {
      type: 'consecutive_checkin' as const,
      currentStreak: 0,
      longestStreak: 0,
      achieved: [] as Array<typeof CONSECUTIVE_CERTS[number]>,
    };
  }

  // 去重 date
  const uniqueDates = Array.from(new Set(checkins.map((c) => c.date))).sort();

  // 计算当前 streak（从最后一天往前数）
  let currentStreak = 1;
  for (let i = uniqueDates.length - 1; i > 0; i--) {
    const d1 = new Date(uniqueDates[i]);
    const d2 = new Date(uniqueDates[i - 1]);
    const diffDays = Math.round((d1.getTime() - d2.getTime()) / 86400000);
    if (diffDays === 1) currentStreak++;
    else break;
  }

  // 计算最长 streak（遍历整个序列）
  let longestStreak = 1;
  let cur = 1;
  for (let i = 1; i < uniqueDates.length; i++) {
    const d1 = new Date(uniqueDates[i - 1]);
    const d2 = new Date(uniqueDates[i]);
    const diffDays = Math.round((d2.getTime() - d1.getTime()) / 86400000);
    if (diffDays === 1) cur++;
    else cur = 1;
    longestStreak = Math.max(longestStreak, cur);
  }

  // 达成的证书
  const achieved = CONSECUTIVE_CERTS.filter((c) => longestStreak >= c.days);

  return {
    type: 'consecutive_checkin' as const,
    title: '连续打卡',
    currentStreak,
    longestStreak,
    achieved,
  };
}

/**
 * 群内贡献证书：用户在跑群本月跑量前 3
 */
async function computeGroupContributionCert(userId: string) {
  const memberOf = await prisma.groupMember.findMany({
    where: { userId },
    select: { groupId: true },
  });
  if (memberOf.length === 0) {
    return { type: 'group_contribution' as const, achieved: false, topRanks: [] };
  }

  const groupIds = memberOf.map((m) => m.groupId);

  // 本月 CN 时区范围
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 8 * 3600 * 1000)
    .toISOString().slice(0, 10);
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - 8 * 3600 * 1000)
    .toISOString().slice(0, 10);

  const topRanks: Array<{ groupId: string; groupName: string; rank: number }> = [];

  // 对每个 group 聚合本月跑量 → 找用户排名
  for (const groupId of groupIds) {
    const group = await prisma.group.findUnique({ where: { id: groupId }, select: { name: true } });
    if (!group) continue;

    const memberIds = await prisma.groupMember.findMany({
      where: { groupId },
      select: { userId: true },
    });
    const uIds = memberIds.map((m) => m.userId);

    const monthAgg = await prisma.checkin.groupBy({
      by: ['userId'],
      where: {
        userId: { in: uIds },
        date: { gte: monthStart, lt: monthEnd },
      },
      _sum: { distance: true },
      orderBy: { _sum: { distance: 'desc' } },
    });

    const idx = monthAgg.findIndex((r) => r.userId === userId);
    if (idx >= 0 && idx < 3) {
      topRanks.push({ groupId, groupName: group.name, rank: idx + 1 });
    }
  }

  return {
    type: 'group_contribution' as const,
    title: '群内前 3',
    desc: '本月跑量在跑群内前 3 名',
    achieved: topRanks.length > 0,
    topRanks,
  };
}
