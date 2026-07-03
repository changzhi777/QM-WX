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

/** 年度报告（V0.1.27，参考图 2768/2771 — 年跑量 + 月度分布 + 最长单次 + 活跃天数） */
export const MyAnnualReportQuerySchema = z.object({
  year: z.number().int().min(2000).max(2100).optional(),
});
export type MyAnnualReportQuery = z.infer<typeof MyAnnualReportQuerySchema>;

/** 我的证书（V0.1.28，动态生成 — 里程碑 + 赛事，不建表） */
export const MyCertificatesQuerySchema = z.object({}).optional();
export type MyCertificatesQuery = z.infer<typeof MyCertificatesQuerySchema>;

export const StatsActionBodySchema = z.object({
  action: z.enum(['myRunnerStats', 'myAnnualReport', 'myCertificates']),
  payload: z.unknown().optional(),
});
