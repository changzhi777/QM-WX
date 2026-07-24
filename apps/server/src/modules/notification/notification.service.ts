/**
 * notification module business logic（V0.1.31，社交向 — 消息通知）
 *
 * Actions：
 * - list：我的通知（分页，含 actor 头像/昵称，前端展示用）
 * - unreadCount：未读数（mine 红点 / 首页徽标用，轻量 count）
 * - markRead：标记单条已读（点通知时调）
 * - markAllRead：全部已读（按钮）
 *
 * 集成函数 notify（feed.like / feed.comment 复用，DRY）：
 * - 自己触发自己跳过（userId === actorId，自己赞自己的动态不发）
 * - 调用方应 try/catch 包裹：通知写库失败不应阻塞主业务（点赞/评论已成功）
 */
import { prisma } from '../../infra/prisma.js';
import { Errors } from '../../common/errors.js';
import { publishToUser } from '../../infra/realtime.js';
import type { NotifPageInput, NotifIdInput, NotifyInput } from './notification.schema.js';

export const notificationService = {
  /** 我的通知列表（分页，含 actor） */
  async list(userId: string, input: NotifPageInput) {
    const [rows, total] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: {
          actor: { select: { id: true, nickname: true, avatarUrl: true } },
        },
      }),
      prisma.notification.count({ where: { userId } }),
    ]);
    return {
      list: rows.map((n) => ({
        id: n.id,
        type: n.type,
        targetType: n.targetType,
        targetId: n.targetId,
        content: n.content,
        isRead: n.isRead,
        createdAt: n.createdAt.toISOString(),
        actor: n.actor,
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
      hasMore: input.page * input.pageSize < total,
    };
  },

  /** 未读数（红点用，轻量） */
  async unreadCount(userId: string) {
    const count = await prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { count };
  },

  /** 标记单条已读（鉴权：仅接收者可操作自己的通知） */
  async markRead(userId: string, input: NotifIdInput) {
    const n = await prisma.notification.findUnique({ where: { id: input.notificationId } });
    if (!n) throw Errors.notFound('通知不存在');
    if (n.userId !== userId) throw Errors.forbidden('无权操作他人通知');
    if (!n.isRead) {
      await prisma.notification.update({
        where: { id: input.notificationId },
        data: { isRead: true },
      });
    }
    return { ok: true };
  },

  /** 全部已读（updateMany，幂等） */
  async markAllRead(userId: string) {
    const r = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { ok: true, updated: r.count };
  },
};

/**
 * 发通知集成函数（被 feed.like / feed.comment / follow.follow 复用，DRY）
 *
 * 设计：
 * - 自己触发自己跳过（自己赞自己 / 自己评论自己 → 不发通知）
 * - **V0.2.119** 写库后顺手通过 realtime 推一条 `notification` 事件给接收方，覆盖 feed/follow/goal 全部触发点
 * - 不在这里 try/catch：调用方决定容错策略（feed 集成时 try/catch 吞错，避免通知失败拖累点赞/评论主链路）
 * - realtime 推送失败不影响 DB 写入（内部 try/catch 静默）
 *
 * 扩展点：后续 goal_complete / 系统公告 都可复用此函数
 */
export async function notify(input: NotifyInput) {
  if (input.userId === input.actorId) return; // 自己触发自己，跳过
  await prisma.notification.create({ data: input });
  // V0.2.119 realtime 推送：单点集成 feed.like / comment / follow 全部实时通知
  try {
    await publishToUser(input.userId, 'notification', {
      type: input.type,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      content: input.content ?? null,
      actorId: input.actorId,
    });
  } catch {
    /* realtime 推送失败静默，DB 已是权威源，下次轮询仍可见 */
  }
}

/**
 * 目标达成通知（V0.2.121 — sport.checkin 触发）
 *
 * 与 `notify()` 区别：自己触发自己（user 是自己的 actor），不跳过；专用 type='goal_achieved'
 *
 * @param userId - 接收者（也是达成者）
 * @param goal - { id, title, targetDistance } 目标信息
 */
export async function notifyGoalAchieved(
  userId: string,
  goal: { id: string; title: string | null; targetDistance: number },
) {
  const titleSuffix = goal.title ? `「${goal.title}」` : '';
  const content = `🎯 目标${titleSuffix}已达成！${goal.targetDistance}km`;
  await prisma.notification.create({
    data: {
      userId,
      actorId: userId, // 自己是触发者
      type: 'goal_achieved',
      targetType: 'goal',
      targetId: goal.id,
      content,
    },
  });
  // V0.2.119 realtime 推送（复用通道）
  try {
    await publishToUser(userId, 'notification', {
      type: 'goal_achieved',
      targetType: 'goal',
      targetId: goal.id,
      content,
      actorId: userId,
    });
  } catch {
    /* realtime 推送失败静默 */
  }
}
