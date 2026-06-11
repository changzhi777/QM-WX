/**
 * wallet module Zod schemas
 */
import { z } from 'zod';

export const GetWalletInputSchema = z.object({}).optional();
export type GetWalletInput = z.infer<typeof GetWalletInputSchema>;

export const TransactionsInputSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type TransactionsInput = z.infer<typeof TransactionsInputSchema>;

/**
 * 充值（mock / 接入微信支付后改实现）
 * Phase 4：接 cloudPay.unifiedOrder
 */
export const RechargeInputSchema = z.object({
  amount: z.number().positive().max(10000), // 单次最多 1 万
  /** ⚠️ 前端可传但服务端忽略 */
  payChannel: z.string().optional(),
});
export type RechargeInput = z.infer<typeof RechargeInputSchema>;

export const WalletActionBodySchema = z.object({
  action: z.enum(['get', 'transactions', 'recharge']),
  payload: z.unknown().optional(),
});
