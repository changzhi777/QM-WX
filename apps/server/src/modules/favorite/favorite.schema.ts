/**
 * favorite module Zod schemas（V0.1.29，社交向 — Content/Product 收藏）
 */
import { z } from 'zod';

export const FAVORITE_TYPES = ['content', 'product'] as const;
export type FavoriteType = (typeof FAVORITE_TYPES)[number];

/** 收藏/取消收藏入参 */
export const FavoriteTargetInputSchema = z.object({
  targetType: z.enum(FAVORITE_TYPES),
  targetId: z.string().min(1),
});
export type FavoriteTargetInput = z.infer<typeof FavoriteTargetInputSchema>;

/** 列表查询（可选按 targetType 过滤） */
export const ListFavoriteQuerySchema = z.object({
  targetType: z.enum(FAVORITE_TYPES).optional(),
});
export type ListFavoriteQuery = z.infer<typeof ListFavoriteQuerySchema>;

/** 批量检查是否已收藏（详情页/列表页红心状态用） */
export const IsFavoritedInputSchema = z.object({
  items: z
    .array(
      z.object({
        targetType: z.enum(FAVORITE_TYPES),
        targetId: z.string(),
      }),
    )
    .min(1)
    .max(50),
});
export type IsFavoritedInput = z.infer<typeof IsFavoritedInputSchema>;

export const FavoriteActionBodySchema = z.object({
  action: z.enum(['list', 'add', 'remove', 'isFavorited']),
  payload: z.unknown().optional(),
});
