/**
 * review module service — 评价（V0.1.113 电商闭环最后一块）
 *
 * 评价闭环：用户对已购商品评价（rating + content + images）+ 评分汇总 + 我的评价
 *
 * 关键校验（create）：
 * 1. 订单存在 + 属于当前用户（防越权）
 * 2. 订单 status ∈ {paid, shipped, done}（已支付才能评）
 * 3. 商品在订单内（OrderItem 存在 productId）
 * 4. 防重：@@unique([userId, productId, orderId]) 兜底 + 提前查友好报错
 *
 * 评分汇总：aggregate avg + groupBy rating 分布（1-5 星各几人）
 */
import { prisma } from '../../infra/prisma.js';
import { Errors } from '../../common/errors.js';

/** 可评价的订单状态（已支付后） */
const REVIEWABLE_ORDER_STATUS = ['paid', 'shipped', 'done'];

export const reviewService = {
  /** 创建评价 */
  async create(
    userId: string,
    input: {
      productId: string;
      orderId: string;
      rating: number;
      content?: string;
      images?: string[];
    },
  ) {
    // 1. 订单存在 + 属于用户 + 已支付
    const order = await prisma.order.findUnique({ where: { id: input.orderId } });
    if (!order) throw Errors.notFound('订单不存在');
    if (order.userId !== userId) throw Errors.forbidden('不是你的订单');
    if (!REVIEWABLE_ORDER_STATUS.includes(order.status)) {
      throw Errors.badRequest('订单未支付，不可评价');
    }

    // 2. 商品在订单内（防评价未购买商品）
    const item = await prisma.orderItem.findFirst({
      where: { orderId: input.orderId, productId: input.productId },
    });
    if (!item) throw Errors.badRequest('该商品不在此订单');

    // 3. 防重（@@unique 兜底；提前查给友好报错）
    const exist = await prisma.review.findUnique({
      where: {
        userId_productId_orderId: {
          userId,
          productId: input.productId,
          orderId: input.orderId,
        },
      },
    });
    if (exist) throw Errors.badRequest('已评价过该商品');

    // 4. 创建
    const review = await prisma.review.create({
      data: {
        userId,
        productId: input.productId,
        orderId: input.orderId,
        rating: input.rating,
        content: input.content ?? null,
        images: input.images ?? [],
      },
    });
    return { id: review.id };
  },

  /** 商品评价列表（含 user 头像/昵称） */
  async listByProduct(
    productId: string,
    input: { page: number; pageSize: number },
  ) {
    const where = { productId };
    const [list, total] = await Promise.all([
      prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: {
          user: { select: { id: true, nickname: true, avatarUrl: true } },
        },
      }),
      prisma.review.count({ where }),
    ]);
    return {
      list: list.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        repliedAt: r.repliedAt?.toISOString() ?? null,
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  },

  /** 商品评分汇总（avg + count + 1-5 星分布） */
  async productStats(productId: string) {
    const [agg, dist] = await Promise.all([
      prisma.review.aggregate({
        where: { productId },
        _avg: { rating: true },
        _count: { rating: true },
      }),
      prisma.review.groupBy({
        by: ['rating'],
        where: { productId },
        _count: { rating: true },
      }),
    ]);
    // 分布：1-5 星各几人（缺的星补 0）
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const d of dist) distribution[d.rating] = d._count.rating;
    return {
      avg: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : 0,
      count: agg._count.rating,
      distribution,
    };
  },

  /** 我的评价（含商品信息） */
  async myReviews(userId: string, input: { page: number; pageSize: number }) {
    const where = { userId };
    const [list, total] = await Promise.all([
      prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: {
          product: { select: { id: true, name: true, images: true } },
        },
      }),
      prisma.review.count({ where }),
    ]);
    return {
      list: list.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        repliedAt: r.repliedAt?.toISOString() ?? null,
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  },

  /** 删除自己的评价 */
  async remove(userId: string, id: string) {
    const review = await prisma.review.findUnique({ where: { id } });
    if (!review) throw Errors.notFound('评价不存在');
    if (review.userId !== userId) throw Errors.forbidden('不是你的评价');
    await prisma.review.delete({ where: { id } });
    return { ok: true };
  },
};
