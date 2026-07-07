/**
 * training module Zod schemas（V0.1.25，参考图 2775）
 *
 * 锻炼/训练中心：训练计划模板（硬编码）+ 跑步记录聚合
 */
import { z } from 'zod';

/** 训练计划查询（无入参，返 active 计划列表） */
export const MyPlansQuerySchema = z.object({}).optional();
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
