/**
 * review module schema — 评价（V0.1.113 电商闭环 + V0.1.137 鞋评复用）
 *
 * Zod 校验：rating 1-5 / content 500 字 / images 最多 9 张
 * V0.1.137：扩 targetType='shoe' 复用本表（productId/orderId → targetType+targetId）
 */
import { z } from 'zod';

/** 评价目标类型（V0.1.137：product|shoe） */
export const ReviewTargetTypeEnum = z.enum(['product', 'shoe']);
export type ReviewTargetType = z.infer<typeof ReviewTargetTypeEnum>;

/** 创建评价（兼容 product 旧调用 + shoe 新调用） */
export const CreateReviewSchema = z.object({
  // V0.1.137：targetType + targetId 统一入口
  targetType: ReviewTargetTypeEnum.default('product'),
  targetId: z.string().min(1),
  // 旧字段保留（product 必传；shoe 可不传）
  productId: z.string().min(1).optional(),
  orderId: z.string().min(1).optional(),
  rating: z.number().int().min(1).max(5),
  content: z.string().max(500).optional(),
  images: z.array(z.string()).max(9).optional(),
});

/** 商品评价列表（兼容旧版：productId 必传 + 分页） */
export const ProductReviewListSchema = z.object({
  productId: z.string().min(1),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(10),
});

/** V0.1.137 通用目标列表（targetType + targetId） */
export const TargetReviewListSchema = z.object({
  targetType: ReviewTargetTypeEnum,
  targetId: z.string().min(1),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(10),
});

/** 我的评价分页 */
export const ReviewPageSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(10),
});

/** 商品评分汇总入参 */
export const ProductIdSchema = z.object({
  productId: z.string().min(1),
});

/** V0.1.137 通用评分汇总 */
export const TargetStatsSchema = z.object({
  targetType: ReviewTargetTypeEnum,
  targetId: z.string().min(1),
});

/** 评价 id */
export const ReviewIdSchema = z.object({
  id: z.string().min(1),
});
