/**
 * review module schema — 评价（V0.1.113 电商闭环）
 *
 * Zod 校验：rating 1-5 / content 500 字 / images 最多 9 张
 */
import { z } from 'zod';

/** 创建评价（需 productId + orderId + rating） */
export const CreateReviewSchema = z.object({
  productId: z.string().min(1),
  orderId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  content: z.string().max(500).optional(),
  images: z.array(z.string()).max(9).optional(),
});

/** 商品评价列表（productId 必传 + 分页） */
export const ProductReviewListSchema = z.object({
  productId: z.string().min(1),
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

/** 评价 id */
export const ReviewIdSchema = z.object({
  id: z.string().min(1),
});
