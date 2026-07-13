/**
 * ai-coach module Zod schemas（V0.1.139 AI 私教）
 *
 * - ChatInputSchema：对话（message + conversationId?）
 * - GeneratePlanInputSchema：生成训练计划（goal?/weeks?/level?）
 * - AdoptPlanInputSchema：采纳计划（plan 结构）
 * - PlanStructureSchema：结构化训练计划（与 providers/types.ts PlanStructure 对齐 + shared 类型）
 */
import { z } from 'zod';

/** 对话输入 */
export const ChatInputSchema = z.object({
  message: z.string().min(1).max(2000),
  conversationId: z.string().optional(),
});
export type ChatInput = z.infer<typeof ChatInputSchema>;

/** 生成计划输入 */
export const GeneratePlanInputSchema = z.object({
  goal: z.string().max(200).optional(), // 如"完成首个半马"
  weeks: z.number().int().min(1).max(52).optional(), // 计划周数
  level: z.enum(['beginner', 'intermediate', 'challenge', 'extreme']).optional(),
  message: z.string().max(500).optional(), // 自由文本（含目标说明）
});
export type GeneratePlanInput = z.infer<typeof GeneratePlanInputSchema>;

/** 单日训练 */
export const PlanDaySchema = z.object({
  day: z.string(), // 周一~周日 / Day 1~7
  type: z.string(), // easy | interval | long | rest | tempo | cross
  content: z.string(),
  distanceKm: z.number().optional(),
});

/** 结构化训练计划（generatePlan 返回 + adoptPlan 校验） */
export const PlanStructureSchema = z.object({
  title: z.string(),
  level: z.enum(['beginner', 'intermediate', 'challenge', 'extreme']),
  weeks: z.number().int().min(1).max(52),
  goal: z.string(),
  weeklyMileage: z.string(),
  targetKm: z.number().min(0),
  days: z.array(PlanDaySchema).min(1).max(7),
});
export type PlanStructure = z.infer<typeof PlanStructureSchema>;

/** 采纳计划输入（前端把 generatePlan 的结果回传） */
export const AdoptPlanInputSchema = z.object({
  plan: PlanStructureSchema,
});
export type AdoptPlanInput = z.infer<typeof AdoptPlanInputSchema>;

/** 加载历史会话（V0.1.139 完善：重进页面看历史对话）*/
export const HistoryQuerySchema = z.object({
  conversationId: z.string().optional(), // 不传 → 取最近一个会话
  limit: z.number().int().min(1).max(100).optional(),
});
export type HistoryQuery = z.infer<typeof HistoryQuerySchema>;

/** 重新生成最后一条 assistant（V0.1.139 完善）*/
export const RegenerateInputSchema = z.object({
  conversationId: z.string().min(1),
});
export type RegenerateInput = z.infer<typeof RegenerateInputSchema>;

/** 删除整个会话（V0.1.139 完善：多会话管理）*/
export const DeleteConversationInputSchema = z.object({
  conversationId: z.string().min(1),
});
export type DeleteConversationInput = z.infer<typeof DeleteConversationInputSchema>;
