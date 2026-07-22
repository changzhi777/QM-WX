/**
 * feed module business logic（V0.1.30 社交向；V0.1.31 +notify；V0.1.36 +topic/video/sort/hotTopics）
 *
 * V0.1.36 增强（2771 社交深化）：
 * - list 加 sort（latest/hot）+ topic 过滤（红心广场 + 话题页）
 * - publish 接受 topic + videoUrl（外部视频链接）
 * - hotTopics：热门话题列表（groupBy topic 按 feed 数量 desc，红心广场发现用）
 *
 * $transaction 用回调形式（测试 mock 友好，复用 createPrismaMock）
 */
import { prisma } from '../../infra/prisma.js';
import { Errors } from '../../common/errors.js';
import { notify } from '../notification/notification.service.js';
import type { PublishFeedInput, FeedPageInput } from './feed.schema.js';

export const feedService = {
  /**
   * 动态流（分页，含作者 + liked）
   *
   * V0.1.36：sort=hot 按 likeCount desc（红心广场）；topic 过滤（话题页）
   */
  async list(userId: string, input: FeedPageInput) {
    const { page, pageSize, sort, topic, userId: authorId } = input;
    const where = { ...(topic ? { topic } : {}), ...(authorId ? { userId: authorId } : {}) };
    const orderBy = sort === 'hot' ? { likeCount: 'desc' as const } : { createdAt: 'desc' as const };
    const [feeds, total] = await Promise.all([
      prisma.feed.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { id: true, nickname: true, avatarUrl: true } },
          likes: { where: { userId }, select: { id: true } },
          shoe: { select: { id: true, brand: true, model: true, nickname: true, currentKm: true } }, // V0.1.136
        },
      }),
      prisma.feed.count({ where }),
    ]);
    return {
      list: feeds.map((f) => ({
        id: f.id,
        content: f.content,
        images: f.images,
        distanceKm: f.distanceKm,
        topic: f.topic,
        videoUrl: f.videoUrl,
        shoe: f.shoe ? { id: f.shoe.id, brand: f.shoe.brand, model: f.shoe.model, nickname: f.shoe.nickname, currentKm: f.shoe.currentKm } : null, // V0.1.136
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

  /** 我的动态（V0.1.36 map 加 topic/videoUrl）*/
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
          shoe: { select: { id: true, brand: true, model: true, nickname: true, currentKm: true } }, // V0.1.136
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
        topic: f.topic,
        videoUrl: f.videoUrl,
        shoe: f.shoe ? { id: f.shoe.id, brand: f.shoe.brand, model: f.shoe.model, nickname: f.shoe.nickname, currentKm: f.shoe.currentKm } : null, // V0.1.136
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

  /** 发布动态（V0.1.36 +topic +videoUrl + V0.1.136 +shoeId） */
  async publish(userId: string, input: PublishFeedInput) {
    // V0.1.136 校验 shoeId 归属（不属则忽略）
    let shoeId: string | null = null;
    if (input.shoeId) {
      const shoe = await prisma.shoe.findFirst({
        where: { id: input.shoeId, userId },
        select: { id: true },
      });
      shoeId = shoe?.id ?? null;
    }

    const feed = await prisma.feed.create({
      data: {
        userId,
        content: input.content,
        images: input.images,
        checkinId: input.checkinId,
        distanceKm: input.distanceKm,
        topic: input.topic,
        videoUrl: input.videoUrl,
        shoeId,
      },
    });
    return { id: feed.id };
  },

  /**
   * V0.1.136 feed.shoesForPicker
   *
   * 取用户 active 跑鞋列表（前端发动态时跑鞋 picker 用）
   * 复用 shoes.service.list 接口（直接调）
   */
  async shoesForPicker(userId: string) {
    const shoes = await prisma.shoe.findMany({
      where: { userId, status: 'active' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, brand: true, model: true, nickname: true, currentKm: true },
    });
    return { shoes };
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

  /**
   * 评论列表（V0.2.72 feed 详情用）
   */
  async listComments(userId: string, feedId: string, page = 1, pageSize = 50) {
    void userId;
    const [rows, total] = await Promise.all([
      prisma.feedComment.findMany({
        where: { feedId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { id: true, nickname: true, avatarUrl: true } } },
      }),
      prisma.feedComment.count({ where: { feedId } }),
    ]);
    return {
      list: rows.map((c) => ({
        id: c.id,
        content: c.content,
        createdAt: c.createdAt.toISOString(),
        user: c.user,
      })),
      total,
    };
  },

  /**
   * V0.1.36 热门话题（红心广场发现用）
   *
   * groupBy topic（not null）按 feed 数量 desc，take 10
   */
  async hotTopics() {
    const topics = await prisma.feed.groupBy({
      by: ['topic'],
      where: { topic: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { topic: 'desc' } },
      take: 10,
    });
    return {
      topics: topics
        .filter((t) => t.topic) // 排除 null（TS 收窄 + 防御）
        .map((t) => ({ topic: t.topic as string, count: t._count._all })),
    };
  },
};
