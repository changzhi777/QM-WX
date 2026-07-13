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

/** V0.1.133 单字段原子更新阈值 */
export const UpdateThresholdInputSchema = z.object({
  id: z.string(),
  thresholdKm: z.number().min(100).max(2000),
});
export type UpdateThresholdInput = z.infer<typeof UpdateThresholdInputSchema>;

/** V0.1.133 跑鞋详情（含聚合） */
export const ShoeDetailSchema = z.object({
  id: z.string(),
  brand: z.string(),
  model: z.string(),
  nickname: z.string().nullable(),
  currentKm: z.number(),
  thresholdKm: z.number(),
  status: z.enum(['active', 'retired']),
  purchasedAt: z.string().nullable(),
  note: z.string().nullable(),
  healthRatio: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  totalCheckins: z.number(),
  latestCheckinAt: z.string().nullable(),
  daysSincePurchase: z.number().nullable(),
});
export type ShoeDetail = z.infer<typeof ShoeDetailSchema>;

/** V0.1.133 里程曲线单点 */
export const MileagePointSchema = z.object({
  period: z.string(), // weekly: "2026-W28" / monthly: "2026-07"
  distanceKm: z.number(),
  checkinCount: z.number(),
});
export type MileagePoint = z.infer<typeof MileagePointSchema>;

/** V0.1.133 里程曲线（周+月双粒度一次性返） */
export const MileageHistorySchema = z.object({
  weekly: z.array(MileagePointSchema),
  monthly: z.array(MileagePointSchema),
  totalKm: z.number(),
  totalCheckins: z.number(),
});
export type MileageHistory = z.infer<typeof MileageHistorySchema>;

export const ShoeIdInputSchema = z.object({ id: z.string() });

export const ShoesActionBodySchema = z.object({
  action: z.enum([
    'list',
    'add',
    'update',
    'retire',
    'myStats',
    // V0.1.133
    'getDetail',
    'getMileageHistory',
    'updateThreshold',
    // V0.1.137
    'compareShoes',
  ]),
  payload: z.unknown().optional(),
});

/** V0.1.137 跑鞋对比（2 双） */
export const CompareShoesInputSchema = z.object({
  ids: z.array(z.string().min(1)).length(2),
});
export type CompareShoesInput = z.infer<typeof CompareShoesInputSchema>;
