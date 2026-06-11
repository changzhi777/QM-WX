/**
 * device module Zod schemas
 *
 * 来源：reviews/running-group-stats/06 设备集成
 * Phase 6 实现
 */
import { z } from 'zod';

export const DEVICE_VENDORS = ['werun', 'garmin', 'huawei', 'xiaomi', 'honor', 'coros', 'zepp'] as const;
export type DeviceVendor = (typeof DEVICE_VENDORS)[number];

export const ListBindingsInputSchema = z.object({}).optional();
export type ListBindingsInput = z.infer<typeof ListBindingsInputSchema>;

export const StartOAuthInputSchema = z.object({
  vendor: z.enum(DEVICE_VENDORS),
});
export type StartOAuthInput = z.infer<typeof StartOAuthInputSchema>;

export const UnbindInputSchema = z.object({
  vendor: z.enum(DEVICE_VENDORS),
});
export type UnbindInput = z.infer<typeof UnbindInputSchema>;

/** 同步微信运动（前端传 cloudID 解密后的步数列表） */
export const SyncWeRunInputSchema = z.object({
  stepList: z.array(
    z.object({
      timestamp: z.number().int(),
      step: z.number().int().min(0),
    }),
  ),
});
export type SyncWeRunInput = z.infer<typeof SyncWeRunInputSchema>;

export const DeviceActionBodySchema = z.object({
  action: z.enum(['listBindings', 'startOAuth', 'unbind', 'syncWeRun', 'submitHeartRate']),
  payload: z.unknown().optional(),
});
