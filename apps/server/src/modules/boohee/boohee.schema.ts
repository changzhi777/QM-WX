/**
 * boohee module schema — V0.3.35 薄荷食物数据 API
 *
 * Zod 输入校验（routes 层 parseOrBadRequest）。
 */
import { z } from 'zod';

/** 2.1 食物搜索 */
export const SearchSchema = z.object({
  keyword: z.string().trim().min(1, 'keyword 必填').max(30, 'keyword 最长 30 字符'),
  page: z.number().int().min(1).default(1),
  per_page: z.number().int().min(1).max(50).default(20),
  sort: z.enum(['calorie_asc', 'calorie_desc']).optional(),
});
export type SearchInput = z.infer<typeof SearchSchema>;

/** 2.2 食物详情 */
export const DetailSchema = z.object({
  code: z.string().trim().min(1, 'code 必填'),
});
export type DetailInput = z.infer<typeof DetailSchema>;

/** 2.4 分类食物列表 */
export const CategoryFoodsSchema = z.object({
  category_id: z.union([z.string(), z.number()]).transform(String),
  page: z.number().int().min(1).default(1),
  per_page: z.number().int().min(1).max(50).default(20),
});
export type CategoryFoodsInput = z.infer<typeof CategoryFoodsSchema>;

/** 2.6 批量营养信息 */
export const BatchNutritionSchema = z.object({
  codes: z.array(z.string().min(1)).min(1, 'codes 至少 1 个').max(50, 'codes 最多 50 个'),
});
export type BatchNutritionInput = z.infer<typeof BatchNutritionSchema>;

/** 2.7 食物排行榜 */
export const RankingSchema = z.object({
  type: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(10),
});
export type RankingInput = z.infer<typeof RankingSchema>;
