/**
 * content module Zod schemas
 *
 * 5 类内容（赛事/酒店/景区/餐饮/乡村振兴）走同一套表 + action 路由
 * V0.1.134 加赛事成绩 3 action
 */
import { z } from 'zod';

export const CONTENT_TYPES = ['marathon', 'hotel', 'scenic', 'food', 'rural'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const ContentListInputSchema = z.object({
  type: z.enum(CONTENT_TYPES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type ContentListInput = z.infer<typeof ContentListInputSchema>;

export const ContentDetailInputSchema = z.object({
  id: z.string().min(1),
});
export type ContentDetailInput = z.infer<typeof ContentDetailInputSchema>;

export const ContentEnrollInputSchema = z.object({
  id: z.string().min(1),
  formData: z.object({
    name: z.string().min(1).max(32),
    phone: z.string().regex(/^1[3-9]\d{9}$/),
    remark: z.string().max(200).optional(),
  }),
});
export type ContentEnrollInput = z.infer<typeof ContentEnrollInputSchema>;

export const ContentMyEnrollmentsSchema = z.object({
  type: z.enum(CONTENT_TYPES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type ContentMyEnrollmentsInput = z.infer<typeof ContentMyEnrollmentsSchema>;

// ===== V0.1.134 赛事成绩 =====

/** 用户自报成绩 */
export const SubmitRaceResultInputSchema = z.object({
  enrollmentId: z.string().min(1),
  finishTimeSec: z.number().int().min(1),
  finisherPhotoUrl: z.string().url().optional(),
});
export type SubmitRaceResultInput = z.infer<typeof SubmitRaceResultInputSchema>;

/** 排行榜查询 */
export const GetRaceLeaderboardInputSchema = z.object({
  contentId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type GetRaceLeaderboardInput = z.infer<typeof GetRaceLeaderboardInputSchema>;

/** 我的成绩查询 */
export const GetMyRaceResultInputSchema = z.object({
  contentId: z.string().min(1),
});
export type GetMyRaceResultInput = z.infer<typeof GetMyRaceResultInputSchema>;

/** 排行榜行 */
export const RaceLeaderboardItemSchema = z.object({
  rank: z.number().int().min(1),
  userId: z.string(),
  nickname: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  finishTimeSec: z.number(),
  paceSecPerKm: z.number(),
  finisherPhotoUrl: z.string().nullable(),
});
export type RaceLeaderboardItem = z.infer<typeof RaceLeaderboardItemSchema>;

/** 完整成绩（含 user 信息冗余可省） */
export const RaceResultSchema = z.object({
  id: z.string(),
  enrollmentId: z.string(),
  contentId: z.string(),
  finishTimeSec: z.number().nullable(),
  paceSecPerKm: z.number().nullable(),
  rank: z.number().nullable(),
  bibNumber: z.string().nullable(),
  finisherPhotoUrl: z.string().nullable(),
  source: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RaceResult = z.infer<typeof RaceResultSchema>;

export const ContentActionBodySchema = z.object({
  action: z.enum([
    'list',
    'detail',
    'enroll',
    'myEnrollments',
    // V0.1.134 赛事成绩
    'submitRaceResult',
    'getRaceLeaderboard',
    'getMyRaceResult',
  ]),
  payload: z.unknown().optional(),
});
