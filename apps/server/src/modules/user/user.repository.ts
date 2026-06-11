/**
 * user module data access（Prisma）
 *
 * 业务逻辑在 service；这里只做"读 / 写 users 表"。
 */
import type { Prisma, PrismaClient, User } from '@prisma/client';
import { prisma } from '../../infra/prisma.js';

/** 提取公共 client，便于事务 */
export const userRepo = {
  /** 按 openid 查（带 lock 用于 refresh / 改资料） */
  findByOpenid(openid: string) {
    return prisma.user.findUnique({ where: { openid } });
  },

  findById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },

  /** 首登建档 / 老用户更新昵称头像（首登积分由 service 走 addPoints 单独加，避免双计） */
  upsertByOpenid(
    openid: string,
    data: { nickname?: string; avatarUrl?: string; unionid?: string },
  ) {
    return prisma.user.upsert({
      where: { openid },
      create: {
        openid,
        unionid: data.unionid,
        nickname: data.nickname,
        avatarUrl: data.avatarUrl,
      },
      update: {
        ...(data.nickname !== undefined && { nickname: data.nickname }),
        ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
        ...(data.unionid !== undefined && { unionid: data.unionid }),
      },
    });
  },

  /** 字段白名单更新（防止前端传任意字段） */
  updateProfile(id: string, data: Prisma.UserUpdateInput) {
    return prisma.user.update({ where: { id }, data });
  },

  /** 加积分（写流水 + 改 users.points + stats.totalPoints 同步） */
  async addPoints(
    client: PrismaClient | Prisma.TransactionClient,
    userId: string,
    change: number,
    type: 'signup_bonus' | 'checkin' | 'order_deduct' | 'member_gift',
    refId?: string,
  ) {
    // 单事务：写流水 + inc points + inc stats.totalPoints
    const user = await client.user.findUniqueOrThrow({ where: { id: userId } });
    const newBalance = user.points + change;
    await client.pointsRecord.create({
      data: { userId, change, type, refId, balance: newBalance },
    });
    await client.user.update({
      where: { id: userId },
      data: {
        points: { increment: change },
        stats: {
          // Prisma JSON 增量更新：用 set 重组
          ...((user.stats as object) ?? {}),
          totalPoints: ((user.stats as { totalPoints?: number })?.totalPoints ?? 0) + change,
        } as Prisma.InputJsonValue,
      },
    });
  },
};

export type UserRow = User;
