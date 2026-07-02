/** cart module Zod schemas（购物车，V0.1.22 B-核心） */
import { z } from 'zod';

export const CartAddInputSchema = z.object({
  productId: z.string().min(1),
  qty: z.number().int().min(1).default(1),
});
export type CartAddInput = z.infer<typeof CartAddInputSchema>;

export const CartRemoveInputSchema = z.object({ productId: z.string().min(1) });

export const CartUpdateQtyInputSchema = z.object({
  productId: z.string().min(1),
  qty: z.number().int().min(0), // 0 则移除
});
export type CartUpdateQtyInput = z.infer<typeof CartUpdateQtyInputSchema>;
