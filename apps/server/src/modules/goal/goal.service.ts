/**
 * goal module business logic（V0.1.28，跑者向 — 跑步目标 + 进度跟踪）
 *
 * Actions：
 * - list：我的目标列表（含进度 currentDistance + percent + completed）
 * - add：创建目标（type 自动算周期；custom 需 periodStart/End）
 * - remove：删除目标
 * - myProgress：当前 active 目标进度（首页/mine 用）
 *
 * 进度计算：Checkin aggregate（date "YYYY-MM-DD" 在 periodStart-End 范围）
 */
import { prisma } from '../../infra/prisma.js';
import { Errors } from '../../common/errors.js';
import type { AddGoalInput } from './goal.schema.js';

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

/** 计算单个目标进度（DB 查 Checkin aggregate） */
async function calcGoalProgress(
  userId: string,
  g: {
    id: string;
    type: string;
    title: string | null;
    targetDistance: number;
    periodStart: Date;
    periodEnd: Date;
    status: string;
  },
) {
  const range = cnDateRange(g.periodStart, g.periodEnd);
  const agg = await prisma.checkin.aggregate({
    _sum: { distance: true },
    where: { userId, date: range },
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
    periodStart: g.periodStart.toISOString(),
    periodEnd: g.periodEnd.toISOString(),
    completed: current >= g.targetDistance,
  };
}

export const goalService = {
  /** 我的目标列表（含进度，active 在前） */
  async list(userId: string) {
    const goals = await prisma.goal.findMany({
      where: { userId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    return { goals: await Promise.all(goals.map((g) => calcGoalProgress(userId, g))) };
  },

  /** 添加目标 */
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

  /** 删除目标（硬删） */
  async remove(userId: string, id: string) {
    const existing = await prisma.goal.findFirst({ where: { id, userId } });
    if (!existing) throw Errors.notFound('goal not found');
    await prisma.goal.delete({ where: { id } });
    return { ok: true };
  },

  /** 当前 active 目标进度（首页/mine 红点用） */
  async myProgress(userId: string) {
    const goals = await prisma.goal.findMany({
      where: { userId, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });
    return { goals: await Promise.all(goals.map((g) => calcGoalProgress(userId, g))) };
  },
};
