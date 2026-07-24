/**
 * goal module Zod schemas（V0.1.28 跑者向 + V0.1.34 家庭目标 + V0.1.135 自定义里程碑 + V0.2.124 力量训练容量目标）
 */
import { z } from 'zod';

export const GoalTypeEnum = z.enum(['monthly', 'yearly', 'custom']);
export type GoalType = z.infer<typeof GoalTypeEnum>;

/** V0.2.124 目标类型：distance 走 Checkin.aggregate；volume 走 StrengthSession.aggregate */
export const GoalKindEnum = z.enum(['distance', 'volume']);
export type GoalKind = z.infer<typeof GoalKindEnum>;

/** 添加目标（type 决定 periodStart/End 自动算；custom 需手传） */
export const AddGoalInputSchema = z.object({
  type: GoalTypeEnum,
  kind: GoalKindEnum.default('distance'), // V0.2.124 默认距离目标
  targetDistance: z.number().min(1).max(10000).optional(), // V0.2.124 kind=distance 必传
  targetVolume: z.number().min(1).max(10_000_000).optional(), // V0.2.124 kind=volume 必传
  title: z.string().max(50).optional(),
  /** custom 类型必传（ISO）；monthly/yearly 后端自动算 */
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
});
export type AddGoalInput = z.infer<typeof AddGoalInputSchema>;

/** V0.1.34 家庭目标（复用 AddGoalInput 字段 + familyId） */
export const AddFamilyGoalSchema = AddGoalInputSchema.extend({
  familyId: z.string().min(1),
});
export type AddFamilyGoalInput = z.infer<typeof AddFamilyGoalSchema>;

// ===== V0.1.135 自定义里程碑 =====

/** 自定义里程碑单条 */
export const CustomMilestoneSchema = z.object({
  km: z.number().min(1).max(100000),
  title: z.string().min(1).max(50),
  icon: z.string().max(20).optional(),
});
export type CustomMilestone = z.infer<typeof CustomMilestoneSchema>;

/** 添加自定义里程碑 */
export const AddCustomMilestoneInputSchema = CustomMilestoneSchema;
export type AddCustomMilestoneInput = z.infer<typeof AddCustomMilestoneInputSchema>;

/** 删除自定义里程碑 */
export const RemoveCustomMilestoneInputSchema = z.object({
  km: z.number().min(1),
});
export type RemoveCustomMilestoneInput = z.infer<typeof RemoveCustomMilestoneInputSchema>;

/** 里程碑达成查询 */
export const CheckMilestoneAchievementInputSchema = z.object({
  km: z.number().min(1),
});

export const GoalIdInputSchema = z.object({ id: z.string() });

export const GoalActionBodySchema = z.object({
  action: z.enum([
    'list',
    'add',
    'remove',
    'myProgress',
    'addFamilyGoal',
    'myFamilyGoals',
    // V0.1.135 自定义里程碑
    'addCustomMilestone',
    'removeCustomMilestone',
    'listCustomMilestones',
    'checkMilestoneAchievement',
  ]),
  payload: z.unknown().optional(),
});
