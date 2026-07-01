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

// ===== 佳明数据查询（B-2，2026-07-01）=====
// 数据来源：佳明账户导出包；查询 action 挂 device 模块，复用 RawActivity + 3 新表

/** 日期范围公共字段（ISO 字符串） */
const dateRange = {
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
};

/** 我的活动（RawActivity，vendor=garmin） */
export const MyActivitiesQuerySchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  type: z.string().optional(), // running | cycling | hiking | ...
  ...dateRange,
});
export type MyActivitiesQuery = z.infer<typeof MyActivitiesQuerySchema>;

/** 我的睡眠 */
export const MySleepQuerySchema = z.object(dateRange);
export type MySleepQuery = z.infer<typeof MySleepQuerySchema>;

/** 我的指标（需指定 metricType） */
export const MyMetricsQuerySchema = z.object({
  metricType: z.string(),
  ...dateRange,
});
export type MyMetricsQuery = z.infer<typeof MyMetricsQuerySchema>;

/** 我的健身年龄 */
export const MyFitnessAgeQuerySchema = z.object(dateRange);
export type MyFitnessAgeQuery = z.infer<typeof MyFitnessAgeQuerySchema>;

// ===== 佳明数据处理（导入榜单，2026-07-01）=====

/** RawActivity.type → Checkin.sportType 映射（导入榜单/数据处理共用，单点维护） */
export const ACTIVITY_TYPE_MAP: Record<string, string> = {
  running: 'run',
  walking: 'hike',
  cycling: 'ride',
};

/** 配速：durationSec / distanceKm → mm:ss/km（导入榜单/数据处理共用） */
export function calcPace(durationSec: number | null, distanceKm: number | null): string | null {
  if (!durationSec || !distanceKm || distanceKm <= 0) return null;
  const secPerKm = Math.round(durationSec / distanceKm);
  const m = Math.floor(secPerKm / 60);
  const s = secPerKm % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 待处理 / 已处理活动查询（分页） */
export const ActivityPageQuerySchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});
export type ActivityPageQuery = z.infer<typeof ActivityPageQuerySchema>;

/** 忽略一条活动 */
export const IgnoreActivityInputSchema = z.object({ activityId: z.string() });
export type IgnoreActivityInput = z.infer<typeof IgnoreActivityInputSchema>;

/** 批量导入榜单（最多 50 条/次） */
export const ImportToCheckinInputSchema = z.object({
  activityIds: z.array(z.string()).min(1).max(50),
});
export type ImportToCheckinInput = z.infer<typeof ImportToCheckinInputSchema>;

export const DeviceActionBodySchema = z.object({
  action: z.enum([
    'listBindings',
    'startOAuth',
    'unbind',
    'syncWeRun',
    'submitHeartRate',
    'myActivities',
    'mySleep',
    'myMetrics',
    'myFitnessAge',
    'myPending',
    'myProcessed',
    'ignoreActivity',
    'importToCheckin',
  ]),
  payload: z.unknown().optional(),
});
