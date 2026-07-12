/**
 * feed module Zod schemas（V0.1.30 社交向 — 运动动态 + V0.1.36 话题视频 + V0.1.136 关联跑鞋）
 */
import { z } from 'zod';

/** 发布动态 */
export const PublishFeedInputSchema = z.object({
  content: z.string().min(1, '内容不能为空').max(500),
  images: z.array(z.string()).max(9).default([]),
  checkinId: z.string().optional(),
  distanceKm: z.number().min(0).max(200).optional(),
  topic: z.string().max(30).optional(), // V0.1.36 话题
  videoUrl: z.string().url().optional(), // V0.1.36 外部视频链接（mp4 URL）
  shoeId: z.string().optional(), // V0.1.136 关联跑鞋
});
export type PublishFeedInput = z.infer<typeof PublishFeedInputSchema>;

/** 分页 + 排序 + 话题过滤（V0.1.36）+ 用户过滤（V0.1.116） */
export const FeedPageSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
  sort: z.enum(['latest', 'hot']).default('latest'), // hot=按 likeCount desc（红心广场）
  topic: z.string().optional(), // 话题过滤（话题页用）
  userId: z.string().optional(), // V0.1.116 用户主页动态过滤
});
export type FeedPageInput = z.infer<typeof FeedPageSchema>;

/** 动态 id */
export const FeedIdInputSchema = z.object({ feedId: z.string() });

/** 评论 */
export const CommentInputSchema = z.object({
  feedId: z.string(),
  content: z.string().min(1).max(200),
});

/** V0.1.136 跑鞋 picker 用 */
export const FeedShoeItemSchema = z.object({
  id: z.string(),
  brand: z.string(),
  model: z.string(),
  nickname: z.string().nullable(),
  currentKm: z.number(),
});

export const FeedActionBodySchema = z.object({
  action: z.enum(['list', 'myFeeds', 'publish', 'like', 'unlike', 'comment', 'hotTopics', 'shoesForPicker']), // V0.1.136
  payload: z.unknown().optional(),
});
