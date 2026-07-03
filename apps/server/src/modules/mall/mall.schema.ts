/**
 * mall module Zod schemas
 */
import { z } from 'zod';

export const ListCategoriesInputSchema = z.object({
  /** 是否包含每个分类的商品数量 */
  includeCount: z.boolean().default(false),
});
export type ListCategoriesInput = z.infer<typeof ListCategoriesInputSchema>;

export const ListProductsInputSchema = z.object({
  category: z.string().optional(),
  brand: z.string().optional(),
  keyword: z.string().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListProductsInput = z.infer<typeof ListProductsInputSchema>;

export const ProductDetailInputSchema = z.object({
  id: z.string().min(1),
});
export type ProductDetailInput = z.infer<typeof ProductDetailInputSchema>;

// ===== 订单 =====

export const CreateOrderInputSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        qty: z.number().int().min(1).max(99),
      }),
    )
    .min(1)
    .max(20),
  address: z
    .object({
      name: z.string().min(1).max(32),
      phone: z.string().regex(/^1[3-9]\d{9}$/),
      detail: z.string().min(1).max(200),
    })
    .optional(),
  pointsUsed: z.number().int().min(0).default(0),
  // V0.1.24 分销：邀请码（推广来源，有效则落 sourceUserId + DistrOrder）
  inviteCode: z.string().min(4).max(16).optional(),
});
export type CreateOrderInput = z.infer<typeof CreateOrderInputSchema>;

export const MyOrdersInputSchema = z.object({
  status: z.enum(['pending_pay', 'paid', 'shipped', 'done', 'cancelled']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type MyOrdersInput = z.infer<typeof MyOrdersInputSchema>;

export const CancelOrderInputSchema = z.object({
  orderId: z.string().min(1),
});
export type CancelOrderInput = z.infer<typeof CancelOrderInputSchema>;

export const MallActionBodySchema = z.object({
  action: z.enum(['listProducts', 'productDetail', 'createOrder', 'myOrders', 'cancelOrder']),
  payload: z.unknown().optional(),
});
