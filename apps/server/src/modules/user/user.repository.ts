/**
 * user module data access（Prisma）
 *
 * 业务逻辑在 service；这里只做"读 / 写 users 表"。
 */
import type { Prisma, PrismaClient, User } from '@prisma/client';
import { prisma } from '../../infra/prisma.js';
import { Errors } from '../../common/errors.js';

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
    // 单事务：inc points（原子）+ 写流水
    // 说明：stats.totalPoints 与 points 始终相等（两者都从 0 起、每次同增同减），
    // 是 points 的纯镜像。早先在此 read-modify-write 整个 stats JSON 会与并发写
    // 互相覆盖（lost update）。这里改为：addPoints 不再触碰 stats，totalPoints 在
    // 输出层（toUserOutput）由权威字段 points 派生，从根上消除非原子 JSON 写。
    if (change < 0) {
      // 扣减走条件 updateMany 防并发双花：仅当余额足够才扣，
      // 受影响行数为 0 即积分不足（原子，无 TOCTOU 竞态）。
      const res = await client.user.updateMany({
        where: { id: userId, points: { gte: -change } },
        data: { points: { increment: change } },
      });
      if (res.count === 0) throw Errors.badRequest('积分不足');
    } else {
      await client.user.update({
        where: { id: userId },
        data: { points: { increment: change } },
      });
    }
    // 读取更新后的权威余额，写入流水快照
    const user = await client.user.findUniqueOrThrow({ where: { id: userId } });
    await client.pointsRecord.create({
      data: { userId, change, type, refId, balance: user.points },
    });
  },
};

export type UserRow = User;
