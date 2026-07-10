/**
 * distribution module Zod schemas（V0.1.24 分销中心）
 */
import { z } from 'zod';

export const PageInputSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type PageInput = z.infer<typeof PageInputSchema>;

export const TeamInputSchema = PageInputSchema.extend({
  level: z.coerce.number().int().pipe(z.union([z.literal(1), z.literal(2)])).optional(),
});
export type TeamInput = z.infer<typeof TeamInputSchema>;

export const DistributionActionBodySchema = z.object({
  action: z.enum([
    'mySummary',
    'myOrders',
    'myTeam',
    'myCommissionLogs',
    'myLevel',
    'inviteInfo',
    'withdrawRequest', // V0.1.105 GAP-6 提现申请
    'myWithdrawals', // V0.1.105 我的提现记录
  ]),
  payload: z.unknown().optional(),
});

// ===== V0.1.105 GAP-6 提现申请 =====
export const WithdrawalRequestInputSchema = z.object({
  amount: z.number().min(10, '最低提现金额 10 元'), // 最低 10 元
});
export type WithdrawalRequestInput = z.infer<typeof WithdrawalRequestInputSchema>;
