/**
 * follow module Zod schemas（V0.1.32，社交向深化 — 关注/粉丝）
 */
import { z } from 'zod';

/** 目标用户 id（关注/取关/查 counts） */
export const UserIdInputSchema = z.object({ userId: z.string().min(1) });
export type UserIdInput = z.infer<typeof UserIdInputSchema>;

/** 分页（关注/粉丝列表） */
export const FollowPageSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
});
export type FollowPageInput = z.infer<typeof FollowPageSchema>;

/** 批量查是否关注（用户列表/详情按钮状态） */
export const IsFollowingInputSchema = z.object({
  userIds: z.array(z.string()).min(1).max(50),
});
export type IsFollowingInput = z.infer<typeof IsFollowingInputSchema>;

export const FollowActionBodySchema = z.object({
  action: z.enum(['follow', 'unfollow', 'isFollowing', 'myFollowing', 'myFollowers', 'myCounts']),
  payload: z.unknown().optional(),
});
