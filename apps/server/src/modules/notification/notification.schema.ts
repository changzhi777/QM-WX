/**
 * notification module Zod schemas（V0.1.31，社交向 — 消息通知）
 *
 * type：like | comment | follow | system | goal_achieved | strength_done | new_post
 * MVP 先用 like / comment（feed 集成触发）；follow / system 预留扩展
 * **V0.2.121** +goal_achieved（sprint.checkin 检测目标完成时触发，自动 realtime 推送）
 * **V0.2.122** +strength_done（strength.finishSession 完成时触发，自动 realtime 推送）
 * **V0.2.125** +new_post（feed.publish fan-out 给作者所有粉丝，自动 realtime 推送）
 */
import { z } from 'zod';

export const NOTIF_TYPES = ['like', 'comment', 'follow', 'system', 'goal_achieved', 'strength_done', 'new_post'] as const;
export type NotifType = (typeof NOTIF_TYPES)[number];

/** 分页 */
export const NotifPageSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
});
export type NotifPageInput = z.infer<typeof NotifPageSchema>;

/** 标记单条已读 */
export const NotifIdInputSchema = z.object({ notificationId: z.string().min(1) });
export type NotifIdInput = z.infer<typeof NotifIdInputSchema>;

/** notify 集成函数入参（feed.like / feed.comment 复用） */
export const NotifyInputSchema = z.object({
  userId: z.string(), // 接收者
  actorId: z.string(), // 触发者
  type: z.enum(NOTIF_TYPES),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
  content: z.string().optional(),
});
export type NotifyInput = z.infer<typeof NotifyInputSchema>;

export const NotificationActionBodySchema = z.object({
  action: z.enum(['list', 'unreadCount', 'markRead', 'markAllRead']),
  payload: z.unknown().optional(),
});
