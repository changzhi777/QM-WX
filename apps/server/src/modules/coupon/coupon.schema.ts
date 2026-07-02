/** coupon module Zod schemas（V0.1.23 MVP 领/看，使用下期） */
import { z } from 'zod';

export const ReceiveCouponSchema = z.object({ templateId: z.string().min(1) });
export type ReceiveCouponInput = z.infer<typeof ReceiveCouponSchema>;

export const MyCouponsSchema = z
  .object({ status: z.enum(['unused', 'used', 'expired', 'all']).optional() })
  .optional();
export type MyCouponsInput = z.infer<typeof MyCouponsSchema>;
