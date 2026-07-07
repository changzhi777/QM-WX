/**
 * family module business logic（V0.1.34，pic 2776 家庭方向）
 *
 * Actions：
 * - createFamily：创建家庭（owner）+ 自动加入；一人一家庭（已有则 conflict）
 * - joinFamily：按 inviteCode 加入家庭（member）
 * - myFamily：家庭详情 + 成员列表（含本月跑量）
 * - leaveFamily：离开家庭（owner 不可离开，需先解散/转让）
 * - familyRanking：成员跑量榜（本周/本月）
 * - inviteInfo：邀请码（前端分享给家人）
 *
 * 一人一家庭：FamilyMember.userId @@unique 强制
 * 跑量榜：Checkin aggregate（date "YYYY-MM-DD" 在周期范围；复用 goal cnDateRange 范式）
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../../infra/prisma.js';
import { Errors } from '../../common/errors.js';
import type {
  CreateFamilyInput,
  JoinFamilyInput,
  FamilyRankingInput,
  TransferOwnerInput,
} from './family.schema.js';

/** CN 时区本月范围 [start, end) "YYYY-MM-DD" */
function cnMonthRange(): { start: string; end: string } {
  const cn = new Date(Date.now() + 8 * 3600 * 1000);
  const y = cn.getUTCFullYear();
  const m = cn.getUTCMonth();
  const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const end =
    m + 1 > 11 ? `${y + 1}-01-01` : `${y}-${String(m + 2).padStart(2, '0')}-01`;
  return { start, end };
}

/** CN 时区本周范围（周一为周首）[start, end) "YYYY-MM-DD" */
function cnWeekRange(): { start: string; end: string } {
  const cn = new Date(Date.now() + 8 * 3600 * 1000);
  const day = cn.getUTCDay(); // 0=周日, 1=周一...
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(cn.getTime() + mondayOffset * 86400 * 1000);
  const nextMonday = new Date(monday.getTime() + 7 * 86400 * 1000);
  return {
    start: monday.toISOString().slice(0, 10),
    end: nextMonday.toISOString().slice(0, 10),
  };
}

export const familyService = {
  /** 创建家庭（owner 自动加入；一人一家庭） */
  async createFamily(userId: string, input: CreateFamilyInput) {
    const existing = await prisma.familyMember.findUnique({ where: { userId } });
    if (existing) throw Errors.conflict('已属于一个家庭，请先退出');

    // 8 位邀请码（hex，@unique 兜底；极小概率重复时报错让用户重试）
    const inviteCode = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();

    const family = await prisma.$transaction(async (tx) => {
      const f = await tx.family.create({
        data: { name: input.name, ownerId: userId, inviteCode },
      });
      await tx.familyMember.create({
        data: { familyId: f.id, userId, role: 'owner' },
      });
      return f;
    });

    return { id: family.id, name: family.name, inviteCode };
  },

  /** 加入家庭（按 inviteCode） */
  async joinFamily(userId: string, input: JoinFamilyInput) {
    const existing = await prisma.familyMember.findUnique({ where: { userId } });
    if (existing) throw Errors.conflict('已属于一个家庭，请先退出');

    const family = await prisma.family.findUnique({
      where: { inviteCode: input.inviteCode },
    });
    if (!family) throw Errors.notFound('家庭邀请码无效');

    await prisma.familyMember.create({
      data: { familyId: family.id, userId, role: 'member' },
    });
    return { id: family.id, name: family.name };
  },

  /** 我的家庭（详情 + 成员列表含本月跑量） */
  async myFamily(userId: string) {
    const member = await prisma.familyMember.findUnique({
      where: { userId },
      include: {
        family: {
          include: {
            members: {
              include: { user: { select: { id: true, nickname: true, avatarUrl: true } } },
            },
          },
        },
      },
    });
    if (!member) return { family: null }; // 未加入家庭

    // 优化：1 次 groupBy 替代 N 次 aggregate（N+1 规避，范式同 favorite.list 批量关联）
    const memberIds = member.family.members.map((m) => m.userId);
    const range = cnMonthRange();
    const grouped = await prisma.checkin.groupBy({
      by: ['userId'],
      where: { userId: { in: memberIds }, date: { gte: range.start, lt: range.end } },
      _sum: { distance: true },
    });
    const distMap = new Map(grouped.map((g) => [g.userId, g._sum.distance ?? 0]));
    const members = member.family.members.map((m) => ({
      userId: m.userId,
      nickname: m.user.nickname,
      avatarUrl: m.user.avatarUrl,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
      monthDistance: Math.round((distMap.get(m.userId) ?? 0) * 10) / 10,
    }));

    return {
      family: {
        id: member.family.id,
        name: member.family.name,
        inviteCode: member.family.inviteCode,
        ownerId: member.family.ownerId,
        createdAt: member.family.createdAt.toISOString(),
        memberCount: member.family.members.length,
        isOwner: member.family.ownerId === userId,
        members,
      },
    };
  },

  /** 离开家庭（owner 不可离开，需先解散/转让） */
  async leaveFamily(userId: string) {
    const member = await prisma.familyMember.findUnique({ where: { userId } });
    if (!member) throw Errors.notFound('未加入家庭');
    if (member.role === 'owner') {
      throw Errors.badRequest('家长不能直接离开，需先解散家庭或转让家长身份');
    }
    await prisma.familyMember.delete({ where: { id: member.id } });
    return { ok: true };
  },

  /** 家庭成员跑量榜（本周/本月，按距离降序） */
  async familyRanking(userId: string, input: FamilyRankingInput) {
    const member = await prisma.familyMember.findUnique({ where: { userId } });
    if (!member) throw Errors.notFound('未加入家庭');

    const members = await prisma.familyMember.findMany({
      where: { familyId: member.familyId },
      include: { user: { select: { id: true, nickname: true, avatarUrl: true } } },
    });

    const range = input.period === 'week' ? cnWeekRange() : cnMonthRange();
    const memberIds = members.map((m) => m.userId);
    // 优化：1 次 groupBy 替代 N 次 aggregate（N+1 规避）
    const grouped = await prisma.checkin.groupBy({
      by: ['userId'],
      where: { userId: { in: memberIds }, date: { gte: range.start, lt: range.end } },
      _sum: { distance: true },
    });
    const distMap = new Map(grouped.map((g) => [g.userId, g._sum.distance ?? 0]));
    const ranking = members
      .map((m) => ({
        userId: m.userId,
        nickname: m.user.nickname,
        avatarUrl: m.user.avatarUrl,
        distance: Math.round((distMap.get(m.userId) ?? 0) * 10) / 10,
      }))
      .sort((a, b) => b.distance - a.distance);

    return { period: input.period, start: range.start, end: range.end, ranking };
  },

  /** 邀请信息（前端分享给家人） */
  async inviteInfo(userId: string) {
    const member = await prisma.familyMember.findUnique({
      where: { userId },
      include: { family: true },
    });
    if (!member) throw Errors.notFound('未加入家庭');
    return {
      name: member.family.name,
      inviteCode: member.family.inviteCode,
    };
  },

  /**
   * V0.1.39 转让家长（owner → member，newOwner → owner）
   *
   * 校验：当前 owner + newOwner 同家庭 + 非自己
   * 事务：旧 owner role=member + 新 owner role=owner + Family.ownerId 更新
   */
  async transferOwner(userId: string, input: TransferOwnerInput) {
    const member = await prisma.familyMember.findUnique({ where: { userId } });
    if (!member) throw Errors.notFound('未加入家庭');
    if (member.role !== 'owner') throw Errors.forbidden('仅家长可转让');

    const newOwner = await prisma.familyMember.findUnique({
      where: { userId: input.newOwnerId },
    });
    if (!newOwner || newOwner.familyId !== member.familyId) {
      throw Errors.badRequest('目标用户不是家庭成员');
    }
    if (newOwner.userId === userId) throw Errors.badRequest('不能转让给自己');

    await prisma.$transaction(async (tx) => {
      await tx.familyMember.update({ where: { userId }, data: { role: 'member' } });
      await tx.familyMember.update({
        where: { userId: input.newOwnerId },
        data: { role: 'owner' },
      });
      await tx.family.update({
        where: { id: member.familyId },
        data: { ownerId: input.newOwnerId },
      });
    });
    return { ok: true };
  },

  /** V0.1.39 解散家庭（owner 删 Family，级联成员/家庭目标）*/
  async dissolveFamily(userId: string) {
    const member = await prisma.familyMember.findUnique({ where: { userId } });
    if (!member) throw Errors.notFound('未加入家庭');
    if (member.role !== 'owner') throw Errors.forbidden('仅家长可解散');

    await prisma.family.delete({ where: { id: member.familyId } });
    // 级联：FamilyMember + Goal.familyId（onDelete Cascade）自动删
    return { ok: true };
  },

  /**
   * V0.1.39 家庭成就（全家累计跑量里程碑，动态生成零建表）
   *
   * 复用 stats.myCertificates 范式（MILESTONES 常量 + Checkin aggregate）
   * 全家成员 userIds → aggregate sum distance → 里程碑 achieved/progress
   */
  async familyAchievements(userId: string) {
    const member = await prisma.familyMember.findUnique({ where: { userId } });
    if (!member) return { totalDistance: 0, achievements: [] };

    const members = await prisma.familyMember.findMany({
      where: { familyId: member.familyId },
      select: { userId: true },
    });
    const memberIds = members.map((m) => m.userId);

    const agg = await prisma.checkin.aggregate({
      _sum: { distance: true },
      where: { userId: { in: memberIds } },
    });
    const total = agg._sum.distance ?? 0;

    const MILESTONES = [100, 500, 1000, 2000, 5000];
    const achievements = MILESTONES.map((km) => ({
      km,
      achieved: total >= km,
      progress: Math.min(100, Math.round((total / km) * 100)),
    }));

    return {
      totalDistance: Math.round(total * 10) / 10,
      achievements,
    };
  },
};
