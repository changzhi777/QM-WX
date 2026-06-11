/**
 * content module Zod schemas
 *
 * 5 类内容（赛事/酒店/景区/餐饮/乡村振兴）走同一套表 + action 路由
 */
import { z } from 'zod';

export const CONTENT_TYPES = ['marathon', 'hotel', 'scenic', 'food', 'rural'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const ContentListInputSchema = z.object({
  type: z.enum(CONTENT_TYPES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type ContentListInput = z.infer<typeof ContentListInputSchema>;

export const ContentDetailInputSchema = z.object({
  id: z.string().min(1),
});
export type ContentDetailInput = z.infer<typeof ContentDetailInputSchema>;

export const ContentEnrollInputSchema = z.object({
  id: z.string().min(1),
  formData: z.object({
    name: z.string().min(1).max(32),
    phone: z.string().regex(/^1[3-9]\d{9}$/),
    remark: z.string().max(200).optional(),
  }),
});
export type ContentEnrollInput = z.infer<typeof ContentEnrollInputSchema>;

export const ContentActionBodySchema = z.object({
  action: z.enum(['list', 'detail', 'enroll']),
  payload: z.unknown().optional(),
});
