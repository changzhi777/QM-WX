/**
 * follow module business logic（V0.1.32，社交向深化 — 关注/粉丝）
 *
 * Actions：
 * - follow：关注（upsert 幂等 + 通知 type=follow，复用 notify 集成函数）
 * - unfollow：取关（deleteMany 幂等）
 * - isFollowing：批量查关注状态（用户列表/详情按钮）
 * - myFollowing：我关注的人（分页，含 user）
 * - myFollowers：我的粉丝（分页，含 user）
 * - myCounts：关注数 + 粉丝数 + isFollowing + isSelf + user 信息（用户主页一次拿全）
 *
 * 设计：
 * - follow 触发 notify(type=follow)，复用 V0.1.31 集成函数（自己关注自己已在前置校验拦截）
 * - myCounts 返回 user info（用户主页一次拿全，避免多次请求）
 * - 索引复用：[followerId] 查关注列表 / [followeeId] 查粉丝列表
 */
import { prisma } from '../../infra/prisma.js';
import { Errors } from '../../common/errors.js';
import { notify } from '../notification/notification.service.js';
import type { UserIdInput, FollowPageInput, IsFollowingInput } from './follow.schema.js';

export const followService = {
  /** 关注（upsert 幂等 + 通知被关注者） */
  async follow(followerId: string, input: UserIdInput) {
    if (followerId === input.userId) throw Errors.badRequest('不能关注自己');
    const target = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true },
    });
    if (!target) throw Errors.notFound('用户不存在');

    await prisma.follow.upsert({
      where: { followerId_followeeId: { followerId, followeeId: input.userId } },
      create: { followerId, followeeId: input.userId },
      update: {},
    });
    // 通知被关注者（复用 notify 集成函数；通知失败不阻塞关注主链路）
    try {
      await notify({ userId: input.userId, actorId: followerId, type: 'follow' });
    } catch {
      /* 通知写库失败不影响关注结果 */
    }
    return { ok: true, following: true };
  },

  /** 取关（deleteMany 幂等，不存在也 ok） */
  async unfollow(followerId: string, input: UserIdInput) {
    await prisma.follow.deleteMany({
      where: { followerId, followeeId: input.userId },
    });
    return { ok: true, following: false };
  },

  /** 批量查是否关注（用户列表/详情按钮状态） */
  async isFollowing(followerId: string, input: IsFollowingInput) {
    const rows = await prisma.follow.findMany({
      where: { followerId, followeeId: { in: input.userIds } },
      select: { followeeId: true },
    });
    const set = new Set(rows.map((r) => r.followeeId));
    return {
      results: input.userIds.map((id) => ({ userId: id, following: set.has(id) })),
    };
  },

  /** 我关注的人（分页，含 user） */
  async myFollowing(followerId: string, input: FollowPageInput) {
    const [rows, total] = await Promise.all([
      prisma.follow.findMany({
        where: { followerId },
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: { followee: { select: { id: true, nickname: true, avatarUrl: true } } },
      }),
      prisma.follow.count({ where: { followerId } }),
    ]);
    return {
      list: rows.map((r) => ({
        userId: r.followeeId,
        createdAt: r.createdAt.toISOString(),
        user: r.followee,
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
      hasMore: input.page * input.pageSize < total,
    };
  },

  /** 我的粉丝（分页，含 user） */
  async myFollowers(followeeId: string, input: FollowPageInput) {
    const [rows, total] = await Promise.all([
      prisma.follow.findMany({
        where: { followeeId },
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: { follower: { select: { id: true, nickname: true, avatarUrl: true } } },
      }),
      prisma.follow.count({ where: { followeeId } }),
    ]);
    return {
      list: rows.map((r) => ({
        userId: r.followerId,
        createdAt: r.createdAt.toISOString(),
        user: r.follower,
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
      hasMore: input.page * input.pageSize < total,
    };
  },

  /**
   * 关注数 + 粉丝数 + isFollowing + isSelf + user（用户主页一次拿全）
   *
   * 可查任意 userId（不限于自己）；viewerId 是当前登录者（用于算 isFollowing + isSelf）
   */
  async myCounts(userId: string, viewerId: string) {
    const [user, followingCount, followerCount, existing] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, nickname: true, avatarUrl: true },
      }),
      prisma.follow.count({ where: { followerId: userId } }),
      prisma.follow.count({ where: { followeeId: userId } }),
      viewerId && viewerId !== userId
        ? prisma.follow.findUnique({
            where: { followerId_followeeId: { followerId: viewerId, followeeId: userId } },
          })
        : null,
    ]);
    if (!user) throw Errors.notFound('用户不存在');
    return {
      user,
      followingCount,
      followerCount,
      isFollowing: !!existing,
      isSelf: viewerId === userId,
    };
  },
};
