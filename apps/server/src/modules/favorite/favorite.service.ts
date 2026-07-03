/**
 * favorite module business logic（V0.1.29，社交向 — Content/Product 收藏）
 *
 * Actions：
 * - list：我的收藏（含 Content/Product 详情，避免 N+1：findMany + Map 关联）
 * - add：收藏（upsert 幂等，防重复）
 * - remove：取消收藏（deleteMany，不存在也返 ok）
 * - isFavorited：批量检查红心状态（详情页/列表页用）
 *
 * 单一数据源：targetType 用 FAVORITE_TYPES 枚举（content | product）
 */
import { prisma } from '../../infra/prisma.js';
import type {
  FavoriteTargetInput,
  ListFavoriteQuery,
  IsFavoritedInput,
} from './favorite.schema.js';

export const favoriteService = {
  /**
   * 我的收藏列表（含 Content/Product 详情）
   *
   * 性能：避免 N+1，先查 favorites，再批量查 Content/Product（findMany + Map 关联）
   */
  async list(userId: string, input: ListFavoriteQuery) {
    const where = {
      userId,
      ...(input.targetType ? { targetType: input.targetType } : {}),
    };
    const favorites = await prisma.favorite.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // 批量关联详情（避免 N+1）
    const contentIds = favorites.filter((f) => f.targetType === 'content').map((f) => f.targetId);
    const productIds = favorites.filter((f) => f.targetType === 'product').map((f) => f.targetId);

    const [contents, products] = await Promise.all([
      contentIds.length === 0
        ? []
        : prisma.content.findMany({
            where: { id: { in: contentIds } },
            select: {
              id: true,
              title: true,
              cover: true,
              summary: true,
              type: true,
              location: true,
              date: true,
            },
          }),
      productIds.length === 0
        ? []
        : prisma.product.findMany({
            where: { id: { in: productIds } },
            select: {
              id: true,
              name: true,
              price: true,
              images: true,
              category: true,
              status: true,
            },
          }),
    ]);

    const contentMap = new Map(contents.map((c) => [c.id, c]));
    const productMap = new Map(products.map((p) => [p.id, p]));

    return {
      favorites: favorites.map((f) => ({
        id: f.id,
        targetType: f.targetType,
        targetId: f.targetId,
        createdAt: f.createdAt.toISOString(),
        // 目标已删除则 detail=null（前端据此隐藏或提示）
        detail:
          f.targetType === 'content'
            ? contentMap.get(f.targetId) ?? null
            : productMap.get(f.targetId) ?? null,
      })),
    };
  },

  /** 收藏（upsert 幂等，重复收藏不报错） */
  async add(userId: string, input: FavoriteTargetInput) {
    await prisma.favorite.upsert({
      where: {
        userId_targetType_targetId: {
          userId,
          targetType: input.targetType,
          targetId: input.targetId,
        },
      },
      create: {
        userId,
        targetType: input.targetType,
        targetId: input.targetId,
      },
      update: {},
    });
    return { ok: true };
  },

  /** 取消收藏（deleteMany，不存在也返 ok） */
  async remove(userId: string, input: FavoriteTargetInput) {
    await prisma.favorite.deleteMany({
      where: {
        userId,
        targetType: input.targetType,
        targetId: input.targetId,
      },
    });
    return { ok: true };
  },

  /** 批量检查是否已收藏（详情页/列表页红心状态） */
  async isFavorited(userId: string, input: IsFavoritedInput) {
    const rows = await prisma.favorite.findMany({
      where: {
        userId,
        OR: input.items.map((i) => ({
          targetType: i.targetType,
          targetId: i.targetId,
        })),
      },
      select: { targetType: true, targetId: true },
    });
    const set = new Set(rows.map((r) => `${r.targetType}:${r.targetId}`));
    return {
      results: input.items.map((i) => ({
        ...i,
        favorited: set.has(`${i.targetType}:${i.targetId}`),
      })),
    };
  },
};
