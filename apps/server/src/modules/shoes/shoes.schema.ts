/**
 * shoes module Zod schemas（V0.1.26，跑者向 — 跑鞋管理）
 *
 * 跑鞋里程管理：CRUD + 退役 + 统计
 */
import { z } from 'zod';

/** 添加跑鞋入参 */
export const AddShoeInputSchema = z.object({
  brand: z.string().min(1).max(50),
  model: z.string().min(1).max(100),
  nickname: z.string().max(50).optional(),
  thresholdKm: z.number().min(100).max(2000).default(800), // 更换阈值（防受伤）
  purchasedAt: z.string().datetime().optional(),
  note: z.string().max(500).optional(),
});
export type AddShoeInput = z.infer<typeof AddShoeInputSchema>;

/** 更新跑鞋（id 必传） */
export const UpdateShoeInputSchema = AddShoeInputSchema.extend({
  id: z.string(),
});
export type UpdateShoeInput = z.infer<typeof UpdateShoeInputSchema>;

export const ShoeIdInputSchema = z.object({ id: z.string() });

export const ShoesActionBodySchema = z.object({
  action: z.enum(['list', 'add', 'update', 'retire', 'myStats']),
  payload: z.unknown().optional(),
});
