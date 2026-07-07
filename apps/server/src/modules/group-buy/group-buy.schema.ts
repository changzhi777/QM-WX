/**
 * group-buy module Zod schemas（V0.1.37，2764 电商团购 — 简化 MVP）
 */
import { z } from 'zod';

export const GroupBuyIdSchema = z.object({ id: z.string().min(1) });
export type GroupBuyIdInput = z.infer<typeof GroupBuyIdSchema>;

export const GroupBuyPageSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
});
export type GroupBuyPageInput = z.infer<typeof GroupBuyPageSchema>;

export const GroupBuyActionSchema = z.object({
  action: z.enum(['list', 'detail', 'join', 'myJoined']),
  payload: z.unknown().optional(),
});
