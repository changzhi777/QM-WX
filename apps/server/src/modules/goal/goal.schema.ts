/**
 * goal module Zod schemas（V0.1.28，跑者向 — 跑步目标 + 进度跟踪）
 */
import { z } from 'zod';

export const GoalTypeEnum = z.enum(['monthly', 'yearly', 'custom']);
export type GoalType = z.infer<typeof GoalTypeEnum>;

/** 添加目标（type 决定 periodStart/End 自动算；custom 需手传） */
export const AddGoalInputSchema = z.object({
  type: GoalTypeEnum,
  targetDistance: z.number().min(1).max(10000),
  title: z.string().max(50).optional(),
  /** custom 类型必传（ISO）；monthly/yearly 后端自动算 */
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
});
export type AddGoalInput = z.infer<typeof AddGoalInputSchema>;

/** V0.1.34 家庭目标（复用 AddGoalInput + familyId） */
export const AddFamilyGoalSchema = AddGoalInputSchema.extend({
  familyId: z.string().min(1),
});
export type AddFamilyGoalInput = z.infer<typeof AddFamilyGoalSchema>;

export const GoalIdInputSchema = z.object({ id: z.string() });

export const GoalActionBodySchema = z.object({
  action: z.enum(['list', 'add', 'remove', 'myProgress', 'addFamilyGoal', 'myFamilyGoals']),
  payload: z.unknown().optional(),
});
