/**
 * ranking module service — 多维榜单（读模型）
 *
 * 数据来源：Checkin（含 manual + garmin 导入）
 * 聚合方式：按群成员 userId 聚合（不过滤 Checkin.groupId）→ 佳明无 group 打卡也计入
 * 缓存：Cache.wrap 60s（群榜随打卡变化，60s 容忍；导入后 delByPattern 失效）
 *
 * 参考：pic/2772 我的榜单 — 跑步榜/健步榜 + 各跑团子榜
 */
import { prisma } from '../../infra/prisma.js';
import { Cache } from '../../infra/cache.js';
import type { GroupRankingMultiInput, RankingPeriod } from './ranking.schema.js';

const GROUP_RANKING_CACHE_TTL_SEC = 60;

/** 计算 period 起始日期（东八区 YYYY-MM-DD）；all 返回 null */
function periodStartDate(period: RankingPeriod): string | null {
  if (period === 'all') return null;
  const now = new Date();
  const d = new Date(now);
  if (period === 'week') d.setDate(d.getDate() - 7);
  if (period === 'month') d.setMonth(d.getMonth() - 1);
  if (period === 'year') d.setFullYear(d.getFullYear() - 1);
  // 转东八区
  const cn = new Date(d.getTime() + 8 * 3600 * 1000);
  return cn.toISOString().slice(0, 10);
}

export const rankingService = {
  /**
   * 多维群榜单（参考图 2772）
   *
   * - 按 sportType 过滤（run / hike / ride / all）
   * - 按 period 聚合（week / month / year / all）
   * - 按群成员 userId 聚合 Checkin（佳明无 group 打卡也计入）
   * - 返回排名列表 + 我的排名
   */
  async groupRankingMulti(userId: string, input: GroupRankingMultiInput) {
    const { groupId, sportType, period } = input;
    const cacheKey = `ranking:group:${groupId}:${sportType}:${period}`;

    return Cache.wrap(cacheKey, GROUP_RANKING_CACHE_TTL_SEC, async () => {
      // 1. 取群成员（含昵称/头像）
      const members = await prisma.groupMember.findMany({
        where: { groupId },
        select: { userId: true, nickname: true, avatarUrl: true },
      });
      const memberIds = members.map((m) => m.userId);
      const memberMap = new Map(members.map((m) => [m.userId, m]));

      if (memberIds.length === 0) {
        return { groupId, sportType, period, list: [], myRank: null, total: 0 };
      }

      // 2. 按成员 userId 聚合 Checkin（按 sportType + period 过滤）
      const startDate = periodStartDate(period);
      const rows = await prisma.checkin.groupBy({
        by: ['userId'],
        where: {
          userId: { in: memberIds },
          ...(startDate ? { date: { gte: startDate } } : {}),
          ...(sportType !== 'all' ? { sportType } : {}),
        },
        _sum: { distance: true },
        _count: true,
        orderBy: { _sum: { distance: 'desc' } },
        take: 100,
      });

      const list = rows.map((r, i) => {
        const m = memberMap.get(r.userId);
        return {
          rank: i + 1,
          userId: r.userId,
          nickname: m?.nickname ?? '匿名',
          avatarUrl: m?.avatarUrl ?? null,
          distance: r._sum.distance ?? 0,
          checkins: r._count,
        };
      });

      const myRank = list.find((r) => r.userId === userId)?.rank ?? null;

      return { groupId, sportType, period, list, myRank, total: list.length };
    });
  },
};
