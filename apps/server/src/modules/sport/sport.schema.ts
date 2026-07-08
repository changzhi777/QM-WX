/**
 * sport module Zod schemas
 */
import { z } from 'zod';

// ===== checkin =====
export const CheckinInputSchema = z
  .object({
    distance: z
      .number()
      .min(0.5, '距离至少 0.5 km')
      .max(50, '距离最多 50 km（防作弊）'),
    durationSec: z.number().int().min(60).max(60 * 60 * 10).optional(),
    pace: z
      .string()
      .regex(/^\d{1,2}:\d{2}$/, '配速格式 mm:ss')
      .optional(),
    heartRate: z.number().int().min(30).max(220).optional(),
    cadence: z.number().int().min(0).max(300).optional(),
    groupId: z.string().optional(),
    /** 关联跑鞋（V0.1.26，打卡时选 → 跑鞋自动累计里程） */
    shoeId: z.string().optional(),
    /** ⚠️ 前端可以传，但服务端忽略；防作弊 */
    points: z.number().int().optional(),
  })
  .strict();
export type CheckinInput = z.infer<typeof CheckinInputSchema>;
export type CheckinOutput = z.output<typeof CheckinInputSchema>;

// ===== myStats =====
export const MyStatsInputSchema = z.object({
  period: z.enum(['week', 'month', 'year', 'all']).default('month'),
});
export type MyStatsInput = z.infer<typeof MyStatsInputSchema>;
export type MyStatsOutput = z.output<typeof MyStatsInputSchema>;

// ===== 群管理 =====
export const CreateGroupInputSchema = z.object({
  name: z.string().min(1).max(32),
});
export type CreateGroupInput = z.infer<typeof CreateGroupInputSchema>;

export const JoinGroupInputSchema = z.object({
  groupId: z.string().min(1),
  opengid: z.string().optional(),
});
export type JoinGroupInput = z.infer<typeof JoinGroupInputSchema>;

export const QuitGroupInputSchema = z.object({
  groupId: z.string().min(1),
});
export type QuitGroupInput = z.infer<typeof QuitGroupInputSchema>;

export const GroupRankingInputSchema = z.object({
  groupId: z.string().min(1),
  period: z.enum(['week', 'month', 'year', 'all']).default('week'),
});
export type GroupRankingInput = z.infer<typeof GroupRankingInputSchema>;
export type GroupRankingOutput = z.output<typeof GroupRankingInputSchema>;

// ===== V0.1.42 跑群深化（群详情/成员/公告）=====
export const GroupDetailQuerySchema = z.object({ groupId: z.string().min(1) });
export type GroupDetailQuery = z.infer<typeof GroupDetailQuerySchema>;

export const GroupMembersQuerySchema = z.object({ groupId: z.string().min(1) });
export type GroupMembersQuery = z.infer<typeof GroupMembersQuerySchema>;

export const AnnounceGroupSchema = z.object({
  groupId: z.string().min(1),
  announce: z.string().max(500).optional(),
});
export type AnnounceGroupInput = z.infer<typeof AnnounceGroupSchema>;

// ===== action body =====
export const SportActionBodySchema = z.object({
  action: z.enum([
    'checkin',
    'myStats',
    'createGroup',
    'joinGroup',
    'quitGroup',
    'groupRanking',
    'myGroups',
    'today',
    'groupDetail', // V0.1.42
    'groupMembers', // V0.1.42
    'announceGroup', // V0.1.42
  ]),
  payload: z.unknown().optional(),
});
