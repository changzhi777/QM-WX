/**
 * training module Zod schemas（V0.1.25，参考图 2775）
 *
 * 锻炼/训练中心：训练计划模板 + 跑步记录聚合
 * V0.2.128 加 kind=running|strength 力量训练计划
 */
import { z } from 'zod';

/** V0.2.128 myPlans 过滤：按 kind 分段展示（running/strength；不传返全部） */
export const MyPlansQuerySchema = z.object({
  kind: z.enum(['running', 'strength']).optional(),
});
export type MyPlansQuery = z.infer<typeof MyPlansQuerySchema>;

/** 跑步记录查询（limit 控制返回条数，默认 10） */
export const MySportRecordsQuerySchema = z.object({
  limit: z.number().int().min(1).max(50).default(10),
});
export type MySportRecordsQuery = z.infer<typeof MySportRecordsQuerySchema>;

/** 加入训练计划（V0.1.41） */
export const JoinPlanSchema = z.object({
  planId: z.string().min(1),
});
export type JoinPlanInput = z.infer<typeof JoinPlanSchema>;

export const TrainingActionBodySchema = z.object({
  action: z.enum(['myPlans', 'mySportRecords', 'joinPlan', 'myActivePlan', 'leavePlan']),
  payload: z.unknown().optional(),
});
