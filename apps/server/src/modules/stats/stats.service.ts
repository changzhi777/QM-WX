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
import type { MyRunnerStatsQuery } from './stats.schema.js';

const RUNNER_STATS_CACHE_TTL_SEC = 120;

/** 平均配速：totalDurationSec / totalDistanceKm → mm:ss/km */
function calcAvgPace(totalDurationSec: number, totalDistanceKm: number): string | null {
  if (!totalDistanceKm || totalDistanceKm <= 0 || !totalDurationSec) return null;
  const secPerKm = Math.round(totalDurationSec / totalDistanceKm);
  const m = Math.floor(secPerKm / 60);
  const s = secPerKm % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

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
};
