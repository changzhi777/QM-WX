/**
 * family module Zod schemas（V0.1.34，pic 2776 家庭方向）
 *
 * 家庭空间：createFamily / joinFamily / myFamily / leaveFamily / familyRanking / inviteInfo
 */
import { z } from 'zod';

export const CreateFamilySchema = z.object({
  name: z.string().min(1, '家庭名不能为空').max(30),
});
export type CreateFamilyInput = z.infer<typeof CreateFamilySchema>;

export const JoinFamilySchema = z.object({
  inviteCode: z.string().min(1).max(32),
});
export type JoinFamilyInput = z.infer<typeof JoinFamilySchema>;

export const FamilyRankingSchema = z.object({
  period: z.enum(['week', 'month']).default('month'),
});
export type FamilyRankingInput = z.infer<typeof FamilyRankingSchema>;

/** V0.1.39 转让家长（owner 把家长转给某成员）*/
export const TransferOwnerSchema = z.object({ newOwnerId: z.string().min(1) });
export type TransferOwnerInput = z.infer<typeof TransferOwnerSchema>;

export const FamilyActionBodySchema = z.object({
  action: z.enum([
    'createFamily',
    'joinFamily',
    'myFamily',
    'leaveFamily',
    'familyRanking',
    'inviteInfo',
    'transferOwner',
    'dissolveFamily',
    'familyAchievements',
  ]),
  payload: z.unknown().optional(),
});
