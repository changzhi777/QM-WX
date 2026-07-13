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
      targetType?: 'product' | 'shoe';
      targetId?: string;
      productId?: string;
      orderId?: string;
      rating: number;
      content?: string;
      images?: string[];
    },
  ) {
    const targetType = input.targetType ?? 'product';

    if (targetType === 'product') {
      // ===== 商品评价（V0.1.113 原 5 步校验）=====
      const productId = input.productId ?? input.targetId;
      const orderId = input.orderId;
      if (!productId) throw Errors.badRequest('productId required');
      if (!orderId) throw Errors.badRequest('orderId required');

      // 1. 订单存在 + 属于用户 + 已支付
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (!order) throw Errors.notFound('订单不存在');
      if (order.userId !== userId) throw Errors.forbidden('不是你的订单');
      if (!REVIEWABLE_ORDER_STATUS.includes(order.status)) {
        throw Errors.badRequest('订单未支付，不可评价');
      }

      // 2. 商品在订单内
      const item = await prisma.orderItem.findFirst({
        where: { orderId, productId },
      });
      if (!item) throw Errors.badRequest('该商品不在此订单');

      // 3. 防重
      const exist = await prisma.review.findUnique({
        where: { userId_productId_orderId: { userId, productId, orderId } },
      });
      if (exist) throw Errors.badRequest('已评价过该商品');

      // 4. 创建
      const review = await prisma.review.create({
        data: {
          userId,
          productId,
          orderId,
          rating: input.rating,
          content: input.content ?? null,
          images: input.images ?? [],
        },
      });
      return { id: review.id };
    }

    // ===== 鞋评（V0.1.137，复用 Review 表 + 合成 productId/orderId）=====
    const shoeId = input.targetId ?? input.productId;
    if (!shoeId) throw Errors.badRequest('targetId required');

    // 1. 跑鞋存在 + 属于用户
    const shoe = await prisma.shoe.findFirst({ where: { id: shoeId, userId } });
    if (!shoe) throw Errors.notFound('跑鞋不存在或不属于你');

    // 2. 合成 productId/orderId（绕过 @@unique 三元组约束）
    const syntheticId = `shoe:${shoeId}`;
    const exist = await prisma.review.findUnique({
      where: { userId_productId_orderId: { userId, productId: syntheticId, orderId: syntheticId } },
    });
    if (exist) throw Errors.badRequest('已评价过该跑鞋');

    // 3. 创建（content 字段存 [shoe-review] tag 前缀，admin 可识别）
    const taggedContent = `[shoe-review] ${input.content ?? ''}`.trim();
    const review = await prisma.review.create({
      data: {
        userId,
        productId: syntheticId,
        orderId: syntheticId,
        rating: input.rating,
        content: taggedContent,
        images: input.images ?? [],
      },
    });
    return { id: review.id, reviewType: 'shoe' };
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

  /** 商品评分汇总（avg + count + 1-5 星分布，V0.1.137 兼容鞋评 syntheticId） */
  async productStats(productId: string) {
    return this.targetStats(productId);
  },

  /**
   * V0.1.137 通用评分汇总
   * - product: productId 直接传
   * - shoe: shoeId 直接传（service 内合成 syntheticId）
   */
  async targetStats(targetId: string, targetType: 'product' | 'shoe' = 'product') {
    const syntheticId = targetType === 'shoe' ? `shoe:${targetId}` : targetId;
    const [agg, dist] = await Promise.all([
      prisma.review.aggregate({
        where: { productId: syntheticId },
        _avg: { rating: true },
        _count: { rating: true },
      }),
      prisma.review.groupBy({
        by: ['rating'],
        where: { productId: syntheticId },
        _count: { rating: true },
      }),
    ]);
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const d of dist) distribution[d.rating] = d._count.rating;
    return {
      avg: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : 0,
      count: agg._count.rating,
      distribution,
    };
  },

  /** V0.1.137 通用目标列表（鞋评/商品评） */
  async listByTarget(
    targetId: string,
    targetType: 'product' | 'shoe',
    input: { page: number; pageSize: number },
  ) {
    const syntheticId = targetType === 'shoe' ? `shoe:${targetId}` : targetId;
    const [list, total] = await Promise.all([
      prisma.review.findMany({
        where: { productId: syntheticId },
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: { user: { select: { id: true, nickname: true, avatarUrl: true } } },
      }),
      prisma.review.count({ where: { productId: syntheticId } }),
    ]);
    return {
      list: list.map((r) => ({
        ...r,
        // V0.1.137 剥除 [shoe-review] 前缀
        content: r.content?.startsWith('[shoe-review] ')
          ? r.content.slice('[shoe-review] '.length)
          : r.content,
        createdAt: r.createdAt.toISOString(),
        repliedAt: r.repliedAt?.toISOString() ?? null,
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
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
