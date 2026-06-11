/**
 * ludong module Zod schemas
 *
 * 来源：reviews/running-group-stats/08 律动平台对接
 * Phase 7+ 实现
 *
 * 双向：
 * - 出站（A：出站到律动）：sync_outbox 队列 + 定时投递
 * - 入站（B：律动 → 我方）：HTTP 触发 /webhook/ludong
 */
import { z } from 'zod';

export const OUTBOX_EVENT_TYPES = [
  'user.upsert',
  'checkin.batch',
  'order.sync',
  'points.sync',
] as const;
export type OutboxEventType = (typeof OUTBOX_EVENT_TYPES)[number];

export const ListOutboxInputSchema = z.object({
  status: z.enum(['pending', 'done', 'dead']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListOutboxInput = z.infer<typeof ListOutboxInputSchema];

export const BindLudongInputSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/),
  smsCode: z.string().regex(/^\d{6}$/),
});
export type BindLudongInput = z.infer<typeof BindLudongInputSchema>;

/** 律动 webhook 入站（HTTP 触发独立路由，非 /api/ludong） */
export const LudongWebhookBodySchema = z.object({
  eventId: z.string().min(1),
  type: z.enum(['recipe', 'content', 'product', 'banner']),
  data: z.record(z.unknown()),
});
export type LudongWebhookBody = z.infer<typeof LudongWebhookBodySchema>;

export const LudongActionBodySchema = z.object({
  action: z.enum(['listOutbox', 'bindAccount', 'bindingStatus', 'flushOutbox']),
  payload: z.unknown().optional(),
});
