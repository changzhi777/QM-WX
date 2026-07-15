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
    type: 'signup_bonus' | 'checkin' | 'order_deduct' | 'member_gift' | 'share' | 'invite' | 'invited' | 'admin_adjust' | 'redeem_member',
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
      // V0.2.7 仅"赚取"类 type（signup/checkin/share/invite/invited）累计 totalPointsEarned；
      // order_deduct 退分 / 兑换 / admin 调整不累计（避免订单流转刷成长值）
      const ACCUMULATE_TYPES = new Set(['signup_bonus', 'checkin', 'share', 'invite', 'invited']);
      const acc =
        change > 0 && ACCUMULATE_TYPES.has(type) ? { totalPointsEarned: { increment: change } } : {};
      await client.user.update({
        where: { id: userId },
        data: { points: { increment: change }, ...acc },
      });
    }
    // 读取更新后的权威余额，写入流水快照
    const user = await client.user.findUniqueOrThrow({ where: { id: userId } });
    await client.pointsRecord.create({
      data: { userId, change, type, refId, balance: user.points },
    });
  },

  /** 续期会员时长（V0.2.6 邀请裂变）：memberExpireAt = max(now, expire) + days。
   *  memberLevel 仅 free→member（不覆盖已付费的 monthly/quarterly/yearly）。
   *  capDays（V0.2.7 邀请封顶）：仅邀请场景传值，校验 invitedBonusDays+days ≤ capDays 并累加；
   *  被邀人体验/兑换/admin 赠送不传 capDays（不占邀请配额）。 */
  async extendMember(
    client: PrismaClient | Prisma.TransactionClient,
    userId: string,
    days: number,
    capDays?: number,
  ) {
    const now = new Date();
    const u = await client.user.findUnique({
      where: { id: userId },
      select: { memberLevel: true, memberExpireAt: true, invitedBonusDays: true },
    });
    const base = u?.memberExpireAt && u.memberExpireAt > now ? u.memberExpireAt : now;
    const expire = new Date(base.getTime() + days * 86_400_000);
    const data: { memberLevel?: 'member'; memberExpireAt: Date } =
      u?.memberLevel === 'free'
        ? { memberLevel: 'member', memberExpireAt: expire }
        : { memberExpireAt: expire };
    if (capDays) {
      const cur = u?.invitedBonusDays ?? 0;
      if (cur + days > capDays) {
        throw Errors.badRequest(`邀请奖励时长已达上限（${capDays} 天）`);
      }
      await client.user.update({
        where: { id: userId },
        data: { ...data, invitedBonusDays: { increment: days } },
      });
    } else {
      await client.user.update({ where: { id: userId }, data });
    }
    return expire;
  },
};

export type UserRow = User;
