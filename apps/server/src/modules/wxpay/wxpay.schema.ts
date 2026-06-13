/**
 * wxpay module — Zod schemas
 *
 * 关注：
 * - Notify 回调入参：微信发送的是加密 resource，本 schema 校验解密后的字段
 * - UnifiedOrder 入参：内部 service 用，结构严格
 */
import { z } from 'zod';

/** 统一下单调用的 input（内部 service 用） */
export const UnifiedOrderInputSchema = z.object({
  /** 商户订单号（青沐侧唯一 — 用 Order.id） */
  outTradeNo: z.string().min(1).max(32),
  /** 订单描述（前端拼好） */
  description: z.string().min(1).max(127),
  /** 订单总金额（**分** — 整数，避免浮点） */
  totalFen: z.number().int().positive().max(100_000_000),
  /** 付款用户 openid */
  openid: z.string().min(1).max(32),
  /** 订单过期时间（秒） */
  timeExpireSec: z.number().int().min(60).max(86400).optional(), // 默认 30 分钟（service 内部）
});
export type UnifiedOrderInput = z.infer<typeof UnifiedOrderInputSchema>;

/** 统一下单响应 */
export const UnifiedOrderRespSchema = z.object({
  prepayId: z.string(),
  nonceStr: z.string(),
  timestamp: z.string(),
  sign: z.string(),
  packageStr: z.string(), // prepay_id=xxx
});
export type UnifiedOrderResp = z.infer<typeof UnifiedOrderRespSchema>;

/** Notify 回调解密后的 resource（V3 协议） */
export const WxpayNotifyDecryptedSchema = z.object({
  appid: z.string(),
  mchid: z.string(),
  out_trade_no: z.string(),
  transaction_id: z.string(),
  trade_type: z.string().optional(),
  trade_state: z.string(), // SUCCESS / REFUND / NOTPAY / CLOSED / REVERSED
  trade_state_desc: z.string().optional(),
  amount: z.object({
    total: z.number().int(), // 分
    currency: z.string(),
    payer_total: z.number().int().optional(),
  }),
  payer: z.object({ openid: z.string() }).optional(),
  success_time: z.string().optional(),
});
export type WxpayNotifyDecrypted = z.infer<typeof WxpayNotifyDecryptedSchema>;

/** 退款请求 input（内部 service 用） */
export const RefundInputSchema = z.object({
  /** 商户订单号（青沐侧唯一 — 用 Order.id） */
  outTradeNo: z.string().min(1).max(32),
  /** 商户退款单号（青沐侧唯一 — 生成 cuid 或 ref-{orderId}） */
  outRefundNo: z.string().min(1).max(64),
  /** 原订单总金额（**分** — 整数，避免浮点） */
  totalFen: z.number().int().positive().max(100_000_000),
  /** 退款金额（**分** — 整数） */
  refundFen: z.number().int().positive().max(100_000_000),
  /** 退款原因（可选） */
  reason: z.string().max(80).optional(),
  /** 退款结果通知 URL（可选 — 暂不订阅，简化 MVP） */
  notifyUrl: z.string().url().optional(),
});
export type RefundInput = z.infer<typeof RefundInputSchema>;

/** 退款响应 */
export const RefundRespSchema = z.object({
  /** 微信退款单号 */
  refundId: z.string(),
  outRefundNo: z.string(),
  outTradeNo: z.string(),
  transactionId: z.string(),
  channel: z.string().optional(),
  userReceivedAccount: z.string().optional(),
  successTime: z.string().optional(),
  createTime: z.string().optional(),
  /** SUCCESS / PROCESSING / ABNORMAL / CLOSED */
  status: z.string(),
  amount: z.object({
    refund: z.number().int(),
    total: z.number().int(),
    payerTotal: z.number().int().optional(),
    settlementTotal: z.number().int().optional(),
  }),
});
export type RefundResp = z.infer<typeof RefundRespSchema>;
