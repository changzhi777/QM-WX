/**
 * stats module Zod schemas — 跑者数据汇总（读模型）
 *
 * 参考：pic/2768 我的（跑者版）— 年/总跑量 + 打卡次数 + 平均配速
 * 数据来源：Checkin（含 manual + garmin 导入）
 */
import { z } from 'zod';

export const MyRunnerStatsQuerySchema = z.object({
  year: z.number().int().min(2000).max(2100).optional(),
  month: z.number().int().min(1).max(12).optional(),
});
export type MyRunnerStatsQuery = z.infer<typeof MyRunnerStatsQuerySchema>;

export const StatsActionBodySchema = z.object({
  action: z.enum(['myRunnerStats']),
  payload: z.unknown().optional(),
});
