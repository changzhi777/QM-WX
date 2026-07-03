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
      };
    });
  },
};
