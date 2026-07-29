/**
 * admin.globalSearch 跨表全局搜索（V0.3.5）
 *
 * 输入：query（关键词）+ limit（每表上限，默认 5）
 * 输出：5 表结果合并（user/feed/feedComment/interpretRecord/strengthSession）
 * 失败隔离：任一 prisma 查询失败返空数组（V0.3.1 cron pull 范式）
 */
import { prisma } from '../../infra/prisma.js';
import { logger } from '../../common/logger.js';

export interface GlobalSearchResult {
  users: { id: string; nickname: string | null; phone: string | null; openid: string }[];
  feeds: { id: string; userId: string; content: string; createdAt: Date }[];
  feedComments: { id: string; feedId: string; content: string; createdAt: Date }[];
  interpretRecords: { id: string; userId: string; type: string; result: string; createdAt: Date }[];
  strengthSessions: { id: string; userId: string; dateStr: string; createdAt: Date }[];
}

export async function globalSearch(
  query: string,
  limit: number = 5,
  options: { types?: string[]; startDate?: Date; endDate?: Date } = {},
): Promise<GlobalSearchResult> {
  if (!query || query.length < 1) {
    return { users: [], feeds: [], feedComments: [], interpretRecords: [], strengthSessions: [] };
  }
  // V0.3.34 A4：type 过滤（空 = 全选）+ 时间范围过滤
  const { types = [], startDate, endDate } = options;
  const wantUser = types.length === 0 || types.includes('user');
  const wantFeed = types.length === 0 || types.includes('feed');
  const wantComment = types.length === 0 || types.includes('comment');
  const wantInterpret = types.length === 0 || types.includes('interpret');
  const wantStrength = types.length === 0 || types.includes('strength');
  const dateFilter = startDate || endDate ? { gte: startDate, lte: endDate } : undefined;

  const results = await Promise.allSettled([
    // 1. user 表：nickname/phone/openid LIKE（无 createdAt 过滤 — 用户表无时间索引）
    wantUser
      ? prisma.user.findMany({
          where: {
            OR: [
              { nickname: { contains: query, mode: 'insensitive' } },
              { phone: { contains: query } },
              { openid: { contains: query } },
            ],
          },
          select: { id: true, nickname: true, phone: true, openid: true },
          take: limit,
        })
      : Promise.resolve([]),
    // 2. feed 表：content LIKE
    wantFeed
      ? prisma.feed.findMany({
          where: {
            content: { contains: query },
            ...(dateFilter ? { createdAt: dateFilter } : {}),
          },
          select: { id: true, userId: true, content: true, createdAt: true },
          take: limit,
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]),
    // 3. feedComment 表：content LIKE
    wantComment
      ? prisma.feedComment.findMany({
          where: {
            content: { contains: query },
            ...(dateFilter ? { createdAt: dateFilter } : {}),
          },
          select: { id: true, feedId: true, content: true, createdAt: true },
          take: limit,
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]),
    // 4. interpretRecord 表：result LIKE
    wantInterpret
      ? prisma.interpretRecord.findMany({
          where: {
            result: { contains: query },
            ...(dateFilter ? { createdAt: dateFilter } : {}),
          },
          select: { id: true, userId: true, type: true, result: true, createdAt: true },
          take: limit,
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]),
    // 5. strengthSession 表：notes LIKE
    wantStrength
      ? prisma.strengthSession.findMany({
          where: {
            notes: { contains: query },
            ...(dateFilter ? { createdAt: dateFilter } : {}),
          },
          select: { id: true, userId: true, dateStr: true, createdAt: true },
          take: limit,
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]),
  ]);

  // 失败隔离（V0.3.1 范式）
  const val = <T>(i: number, fallback: T): T => {
    const r = results[i];
    return r.status === 'fulfilled' ? (r.value as T) : fallback;
  };

  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      logger.error({ err: (r.reason as Error).message, idx: i }, 'admin.globalSearch query failed');
    }
  });

  return {
    users: val(0, []),
    feeds: val(1, []),
    feedComments: val(2, []),
    interpretRecords: val(3, []),
    strengthSessions: val(4, []),
  };
}