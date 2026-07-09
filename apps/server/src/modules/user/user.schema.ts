/**
 * user module Zod schemas
 *
 * 前后端共用类型从 @qm-wx/shared 推；这里只放端点级入参。
 */
import { z } from 'zod';
import { MEMBER_LEVELS } from '@qm-wx/shared';

// ===== 入参 =====

export const LoginInputSchema = z.object({
  code: z.string().min(1).describe('wx.login() 返回的 code'),
  nickname: z.string().max(32).optional(),
  avatarUrl: z.string().url().optional(),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const UpdateProfileInputSchema = z.object({
  nickname: z.string().max(32).optional(),
  avatarFileID: z.string().optional().describe('云存储 fileID，前端先上传再传'),
  profile: z
    .object({
      name: z.string().max(32).optional(),
      phone: z.string().regex(/^1[3-9]\d{9}$/).optional(),
      gender: z.enum(['male', 'female', 'unknown']).optional(),
      birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      region: z.string().max(64).optional(),
      height: z.number().int().min(50).max(250).optional(),
      weight: z.number().min(10).max(300).optional(),
    })
    .optional(),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileInputSchema>;

export const BindAppsInputSchema = z.object({
  boundApps: z.object({
    garmin: z.boolean().optional(),
    huawei: z.boolean().optional(),
    apple: z.boolean().optional(),
  }),
});
export type BindAppsInput = z.infer<typeof BindAppsInputSchema>;

// ===== 路由 body =====

export const ActionBodySchema = z.object({
  action: z.enum(['login', 'updateProfile', 'bindApps', 'me', 'completeOnboarding']),
  payload: z.unknown().optional(),
});
export type ActionBody = z.infer<typeof ActionBodySchema>;

// ===== 出参 =====

export const UserOutputSchema = z.object({
  id: z.string(),
  openid: z.string(),
  nickname: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  phone: z.string().nullable(),
  memberLevel: z.enum(MEMBER_LEVELS),
  memberExpireAt: z.string().nullable(),
  points: z.number().int(),
  certified: z.boolean(),
  gender: z.string().nullable(),
  birthday: z.string().nullable(),
  region: z.string().nullable(),
  height: z.number().nullable(),
  weight: z.number().nullable(),
  stats: z.object({
    totalDistance: z.number(),
    totalCheckins: z.number().int(),
    totalPoints: z.number().int(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
  onboardingDone: z.boolean(),
});

export const LoginOutputSchema = z.object({
  user: UserOutputSchema,
  accessToken: z.string(),
  refreshToken: z.string(),
  config: z.object({
    featureFlags: z.record(z.boolean()),
    memberLevels: z.record(z.unknown()),
    pointsRules: z.record(z.number()),
  }),
});
export type LoginOutput = z.infer<typeof LoginOutputSchema>;
