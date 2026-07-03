/**
 * feed module business logic（V0.1.30，社交向 — 运动动态）
 *
 * Actions：
 * - list：动态流（分页，含作者 + 当前用户是否点赞 liked）
 * - myFeeds：我的动态
 * - publish：发布动态（可关联 checkinId + 跑量）
 * - like / unlike：点赞/取消（事务维护 likeCount + unique 防重）
 * - comment：评论（事务维护 commentCount）
 *
 * $transaction 用回调形式（测试 mock 友好，复用 createPrismaMock）
 */
import { prisma } from '../../infra/prisma.js';
import { Errors } from '../../common/errors.js';
import { notify } from '../notification/notification.service.js';
import type { PublishFeedInput } from './feed.schema.js';

export const feedService = {
  /** 动态流（分页，含作者 + 当前用户是否点赞） */
  async list(userId: string, page: number, pageSize: number) {
    const [feeds, total] = await Promise.all([
      prisma.feed.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { id: true, nickname: true, avatarUrl: true } },
          likes: { where: { userId }, select: { id: true } },
        },
      }),
      prisma.feed.count(),
    ]);
    return {
      list: feeds.map((f) => ({
        id: f.id,
        content: f.content,
        images: f.images,
        distanceKm: f.distanceKm,
        likeCount: f.likeCount,
        commentCount: f.commentCount,
        createdAt: f.createdAt.toISOString(),
        user: f.user,
        liked: f.likes.length > 0,
      })),
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    };
  },

  /** 我的动态 */
  async myFeeds(userId: string, page: number, pageSize: number) {
    const [feeds, total] = await Promise.all([
      prisma.feed.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { id: true, nickname: true, avatarUrl: true } },
          likes: { where: { userId }, select: { id: true } },
        },
      }),
      prisma.feed.count({ where: { userId } }),
    ]);
    return {
      list: feeds.map((f) => ({
        id: f.id,
        content: f.content,
        images: f.images,
        distanceKm: f.distanceKm,
        likeCount: f.likeCount,
        commentCount: f.commentCount,
        createdAt: f.createdAt.toISOString(),
        user: f.user,
        liked: f.likes.length > 0,
      })),
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    };
  },

  /** 发布动态 */
  async publish(userId: string, input: PublishFeedInput) {
    const feed = await prisma.feed.create({
      data: {
        userId,
        content: input.content,
        images: input.images,
        checkinId: input.checkinId,
        distanceKm: input.distanceKm,
      },
    });
    return { id: feed.id };
  },

  /** 点赞（幂等，已点赞不重复加 count） */
  async like(userId: string, feedId: string) {
    const feed = await prisma.feed.findUnique({ where: { id: feedId } });
    if (!feed) throw Errors.notFound('动态不存在');

    const existing = await prisma.feedLike.findUnique({
      where: { feedId_userId: { feedId, userId } },
    });
    if (!existing) {
      await prisma.$transaction(async (tx) => {
        await tx.feedLike.create({ data: { feedId, userId } });
        await tx.feed.update({
          where: { id: feedId },
          data: { likeCount: { increment: 1 } },
        });
      });
      // 通知动态作者（自己赞自己跳过；通知失败不阻塞点赞主链路）
      try {
        await notify({
          userId: feed.userId,
          actorId: userId,
          type: 'like',
          targetType: 'feed',
          targetId: feedId,
        });
      } catch {
        /* 通知写库失败不影响点赞结果 */
      }
    }
    return { ok: true, liked: true };
  },

  /** 取消点赞（幂等） */
  async unlike(userId: string, feedId: string) {
    const existing = await prisma.feedLike.findUnique({
      where: { feedId_userId: { feedId, userId } },
    });
    if (existing) {
      await prisma.$transaction(async (tx) => {
        await tx.feedLike.delete({ where: { id: existing.id } });
        await tx.feed.update({
          where: { id: feedId },
          data: { likeCount: { decrement: 1 } },
        });
      });
    }
    return { ok: true, liked: false };
  },

  /** 评论 */
  async comment(userId: string, feedId: string, content: string) {
    const feed = await prisma.feed.findUnique({ where: { id: feedId } });
    if (!feed) throw Errors.notFound('动态不存在');

    const comment = await prisma.$transaction(async (tx) => {
      const c = await tx.feedComment.create({ data: { feedId, userId, content } });
      await tx.feed.update({
        where: { id: feedId },
        data: { commentCount: { increment: 1 } },
      });
      return c;
    });
    // 通知动态作者（自己评论自己跳过；通知失败不阻塞评论主链路）
    try {
      await notify({
        userId: feed.userId,
        actorId: userId,
        type: 'comment',
        targetType: 'feed',
        targetId: feedId,
        content: content.length > 50 ? content.slice(0, 50) + '…' : content,
      });
    } catch {
      /* 通知写库失败不影响评论结果 */
    }
    return { id: comment.id };
  },
};
