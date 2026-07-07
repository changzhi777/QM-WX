/**
 * goal module business logic（V0.1.28 跑者向；V0.1.34 +家庭目标 familyId）
 *
 * Actions：
 * - list：我的个人目标（含进度，familyId=null）
 * - add：创建个人目标
 * - remove：删除目标
 * - myProgress：当前 active 个人目标进度
 * - addFamilyGoal（V0.1.34）：创建家庭目标（familyId，进度按家庭成员算）
 * - myFamilyGoals（V0.1.34）：家庭目标列表（含进度）
 *
 * 进度计算：Checkin aggregate（date "YYYY-MM-DD" 在 periodStart-End 范围）
 * V0.1.34：calcGoalProgress 扩 userIds（个人=[me]，家庭=成员列表）
 */
import { prisma } from '../../infra/prisma.js';
import { Errors } from '../../common/errors.js';
import type { AddGoalInput, AddFamilyGoalInput } from './goal.schema.js';

/** Checkin.date 是 "YYYY-MM-DD"（东八区），按周期算字符串范围 */
function cnDateRange(start: Date, end: Date): { gte: string; lt: string } {
  const cn = (d: Date) => new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  return { gte: cn(start), lt: cn(end) };
}

/** 按 type 算周期（东八区 0 点） */
function computePeriod(
  type: 'monthly' | 'yearly' | 'custom',
  input: AddGoalInput,
): { start: Date; end: Date } {
  const now = new Date();
  if (type === 'monthly') {
    return {
      start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 8 * 3600 * 1000),
      end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - 8 * 3600 * 1000),
    };
  }
  if (type === 'yearly') {
    return {
      start: new Date(Date.UTC(now.getUTCFullYear(), 0, 1) - 8 * 3600 * 1000),
      end: new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1) - 8 * 3600 * 1000),
    };
  }
  // custom
  if (!input.periodStart || !input.periodEnd) {
    throw Errors.badRequest('custom 类型需提供 periodStart/End');
  }
  return { start: new Date(input.periodStart), end: new Date(input.periodEnd) };
}

/**
 * 计算单个目标进度（DB 查 Checkin aggregate）
 *
 * V0.1.34：userIds 参数 — 个人目标 [userId]；家庭目标 家庭成员 userIds 列表
 */
async function calcGoalProgress(
  userIds: string[],
  g: {
    id: string;
    type: string;
    title: string | null;
    targetDistance: number;
    periodStart: Date;
    periodEnd: Date;
    familyId: string | null;
    status: string;
  },
) {
  const range = cnDateRange(g.periodStart, g.periodEnd);
  const agg = await prisma.checkin.aggregate({
    _sum: { distance: true },
    where: { userId: { in: userIds }, date: range },
  });
  const current = agg._sum.distance ?? 0;
  return {
    id: g.id,
    type: g.type,
    title: g.title,
    targetDistance: g.targetDistance,
    currentDistance: Math.round(current * 10) / 10,
    percent: g.targetDistance > 0 ? Math.min(100, Math.round((current / g.targetDistance) * 100)) : 0,
    status: g.status,
    familyId: g.familyId,
    periodStart: g.periodStart.toISOString(),
    periodEnd: g.periodEnd.toISOString(),
    completed: current >= g.targetDistance,
  };
}

export const goalService = {
  /** 我的个人目标列表（含进度，active 在前；仅 familyId=null 的个人目标） */
  async list(userId: string) {
    const goals = await prisma.goal.findMany({
      where: { userId, familyId: null },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    return { goals: await Promise.all(goals.map((g) => calcGoalProgress([userId], g))) };
  },

  /** 添加个人目标 */
  async add(userId: string, input: AddGoalInput) {
    const { start, end } = computePeriod(input.type, input);
    if (end <= start) throw Errors.badRequest('周期结束必须晚于开始');
    const goal = await prisma.goal.create({
      data: {
        userId,
        type: input.type,
        title: input.title,
        targetDistance: input.targetDistance,
        periodStart: start,
        periodEnd: end,
      },
    });
    return { id: goal.id };
  },

  /** 删除目标（硬删；个人/家庭目标通用） */
  async remove(userId: string, id: string) {
    const existing = await prisma.goal.findFirst({ where: { id, userId } });
    if (!existing) throw Errors.notFound('goal not found');
    await prisma.goal.delete({ where: { id } });
    return { ok: true };
  },

  /** 当前 active 个人目标进度（首页/mine 红点用；仅 familyId=null） */
  async myProgress(userId: string) {
    const goals = await prisma.goal.findMany({
      where: { userId, status: 'active', familyId: null },
      orderBy: { createdAt: 'desc' },
    });
    return { goals: await Promise.all(goals.map((g) => calcGoalProgress([userId], g))) };
  },

  /**
   * V0.1.34 创建家庭目标
   *
   * userId = 创建者（归属记录）；familyId = 家庭组；进度按家庭成员算
   * 鉴权：必须是该家庭成员
   */
  async addFamilyGoal(userId: string, input: AddFamilyGoalInput) {
    const member = await prisma.familyMember.findUnique({ where: { userId } });
    if (!member) throw Errors.notFound('未加入家庭');
    if (member.familyId !== input.familyId) throw Errors.forbidden('无权操作此家庭');

    const { start, end } = computePeriod(input.type, input);
    if (end <= start) throw Errors.badRequest('周期结束必须晚于开始');
    const goal = await prisma.goal.create({
      data: {
        userId,
        familyId: input.familyId,
        type: input.type,
        title: input.title,
        targetDistance: input.targetDistance,
        periodStart: start,
        periodEnd: end,
      },
    });
    return { id: goal.id };
  },

  /** V0.1.34 家庭目标列表（含进度，按家庭成员聚合） */
  async myFamilyGoals(userId: string) {
    const member = await prisma.familyMember.findUnique({ where: { userId } });
    if (!member) return { goals: [] }; // 无家庭

    const [goals, allMembers] = await Promise.all([
      prisma.goal.findMany({
        where: { familyId: member.familyId },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      }),
      prisma.familyMember.findMany({
        where: { familyId: member.familyId },
        select: { userId: true },
      }),
    ]);
    const memberIds = allMembers.map((m) => m.userId);
    return { goals: await Promise.all(goals.map((g) => calcGoalProgress(memberIds, g))) };
  },
};
