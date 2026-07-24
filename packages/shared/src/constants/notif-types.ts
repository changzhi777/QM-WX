/**
 * 通知类型枚举（V0.2.131 shared 化 + 8 值齐）
 *
 * - like / comment / follow：社交向（V0.1.31）
 * - system：系统消息（V0.1.31 预留）
 * - goal_achieved：目标达成（V0.2.121 — distance + volume 共用，kind 区分 unit）
 * - strength_done：力量训练完成（V0.2.122）
 * - new_post：feed 粉丝推送（V0.2.125）
 * - plan_completed：训练计划完成（V0.2.129）
 *
 * 服务端 Zod 用 `z.enum(NOTIF_TYPES)` 校验输入；前端 toast 文案按此 enum switch。
 * Prisma Notification.type 是 String，8 个值皆可写入（schema 弱约束）。
 */
export const NOTIF_TYPES = [
  'like',
  'comment',
  'follow',
  'system',
  'goal_achieved',
  'strength_done',
  'new_post',
  'plan_completed',
] as const;
export type NotifType = (typeof NOTIF_TYPES)[number];

/** 中文显示文案（前端 toast / 通知列表展示） */
export const NOTIF_TYPE_LABEL: Record<NotifType, string> = {
  like: '赞了你的动态',
  comment: '评论了你的动态',
  follow: '关注了你',
  system: '系统消息',
  goal_achieved: '🎯 目标已达成',
  strength_done: '💪 训练完成',
  new_post: '关注的人发布了新动态',
  plan_completed: '🎉 训练计划已全部完成',
};
