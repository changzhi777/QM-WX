/**
 * feed module Zod schemas（V0.1.30，社交向 — 运动动态）
 */
import { z } from 'zod';

/** 发布动态 */
export const PublishFeedInputSchema = z.object({
  content: z.string().min(1, '内容不能为空').max(500),
  images: z.array(z.string()).max(9).default([]),
  checkinId: z.string().optional(),
  distanceKm: z.number().min(0).max(200).optional(),
});
export type PublishFeedInput = z.infer<typeof PublishFeedInputSchema>;

/** 分页 */
export const FeedPageSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
});

/** 动态 id */
export const FeedIdInputSchema = z.object({ feedId: z.string() });

/** 评论 */
export const CommentInputSchema = z.object({
  feedId: z.string(),
  content: z.string().min(1).max(200),
});

export const FeedActionBodySchema = z.object({
  action: z.enum(['list', 'myFeeds', 'publish', 'like', 'unlike', 'comment']),
  payload: z.unknown().optional(),
});
