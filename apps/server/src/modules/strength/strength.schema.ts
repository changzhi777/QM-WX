/** strength module Zod schemas（V0.2.42）*/
import { z } from 'zod';

export const AddSetSchema = z.object({
  sessionId: z.string().min(1),
  exerciseName: z.string().min(1),
  exerciseId: z.string().optional(),
  reps: z.coerce.number().int().positive(),
  weight: z.coerce.number().min(0),
  setIndex: z.coerce.number().int().min(1),
  restSec: z.coerce.number().int().min(0).optional(),
});

export const FinishSessionSchema = z.object({
  sessionId: z.string().min(1),
  durationSec: z.coerce.number().int().min(0).optional(),
  notes: z.string().max(500).optional(),
});

export const SessionDetailSchema = z.object({
  sessionId: z.string().min(1),
});

export const ListSessionsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const MyVolumeSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export const ListExercisesSchema = z.object({
  category: z.string().optional(),
  search: z.string().optional(),
});

/** V0.2.126 动作统计（PB + 容量分布）— 无入参 */
export const GetExerciseStatsSchema = z.object({}).optional();

/** V0.2.132 用户添加自定义动作 */
export const AddUserExerciseSchema = z.object({
  name: z.string().min(1).max(50),
  category: z.string().min(1).max(20), // 胸/背/腿/肩/手臂/核心
  muscleGroup: z.string().max(20).optional(),
});
export type AddUserExerciseInput = z.infer<typeof AddUserExerciseSchema>;

export const RemoveUserExerciseSchema = z.object({
  id: z.string().min(1),
});

/** V0.2.134 切换收藏动作 */
export const ToggleFavoriteExerciseSchema = z.object({
  exerciseId: z.string().min(1),
});

/** V0.2.135 单一动作趋势 */
export const GetExerciseTrendSchema = z.object({
  exerciseName: z.string().min(1),
  days: z.coerce.number().int().min(7).max(365).default(90),
});
