/**
 * strength service — 力量训练记录（V0.2.42，训记式）
 *
 * 训练日志：startSession（创建空训练）→ addSet（组/次/重 + 实时累加 volume）
 *   → finishSession（设时长 + 备注）
 * 查询：listSessions（历史）/ sessionDetail（单次所有组）/ myVolume（容量趋势）
 * 动作库：listExercises（预设 + 自定义）
 *
 * 容量 volume = Σ reps × weight（kg·次），实时累加（addSet 时 session.totalVolume increment）
 */
import { prisma } from '../../infra/prisma.js';
import { notifyStrengthDone, notifyGoalAchieved } from '../notification/notification.service.js';
import { goalService } from '../goal/goal.service.js';

/** CN 时区日期 YYYY-MM-DD（dateStr 按日聚合用）*/
function cnDate(d = new Date()): string {
  return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 开始训练（创建空 session，前端管自动计时）*/
export async function startSession(userId: string) {
  const now = new Date();
  return prisma.strengthSession.create({
    data: { userId, date: now, dateStr: cnDate(now) },
  });
}

/** 记录一组（动作/次数/重量/组序；实时累加 session.totalVolume）*/
export async function addSet(
  userId: string,
  input: {
    sessionId: string;
    exerciseName: string;
    exerciseId?: string;
    reps: number;
    weight: number;
    setIndex: number;
    restSec?: number;
  },
) {
  const session = await prisma.strengthSession.findUnique({ where: { id: input.sessionId } });
  if (!session || session.userId !== userId) {
    throw new Error('训练不存在或无权访问');
  }
  // order = 当前 session 最大 order + 1
  const lastSet = await prisma.strengthSet.findFirst({
    where: { sessionId: input.sessionId },
    orderBy: { order: 'desc' },
  });
  const order = (lastSet?.order ?? 0) + 1;
  const set = await prisma.strengthSet.create({
    data: {
      sessionId: input.sessionId,
      order,
      exerciseName: input.exerciseName,
      exerciseId: input.exerciseId,
      reps: input.reps,
      weight: input.weight,
      setIndex: input.setIndex,
      restSec: input.restSec,
    },
  });
  // 实时累加 volume
  await prisma.strengthSession.update({
    where: { id: input.sessionId },
    data: { totalVolume: { increment: input.reps * input.weight } },
  });
  return set;
}

/** 完成训练（设时长/备注，返完整 session + sets）*/
export async function finishSession(
  userId: string,
  input: { sessionId: string; durationSec?: number; notes?: string },
) {
  const session = await prisma.strengthSession.findUnique({ where: { id: input.sessionId } });
  if (!session || session.userId !== userId) {
    throw new Error('训练不存在或无权访问');
  }
  const updated = await prisma.strengthSession.update({
    where: { id: input.sessionId },
    data: {
      durationSec: input.durationSec ?? 0,
      notes: input.notes,
    },
    include: { sets: { orderBy: { order: 'asc' } } },
  });
  // V0.2.122 训练完成 realtime 通知（自触发，try/catch 静默不阻塞主返回）
  try {
    await notifyStrengthDone(userId, {
      id: updated.id,
      totalVolume: updated.totalVolume,
      setCount: updated.sets.length,
    });
  } catch {
    /* 通知失败不影响训练保存结果 */
  }
  // V0.2.124 力量训练容量目标达成检测（复用 V0.2.121 范式，聚合 StrengthSession.totalVolume）
  try {
    const todayDateStr = updated.dateStr;
    const justAchieved = await goalService.detectAndMarkStrengthJustAchieved(userId, updated.totalVolume, todayDateStr);
    for (const goal of justAchieved) {
      await notifyGoalAchieved(userId, { id: goal.id, title: goal.title, kind: 'volume', target: goal.targetVolume });
    }
  } catch {
    /* 目标检测/通知失败不影响训练保存结果 */
  }
  return updated;
}

/** 训练历史列表（分页 + 组数 count）*/
export async function listSessions(
  userId: string,
  input: { page?: number; pageSize?: number } = {},
) {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 20;
  const [list, total] = await Promise.all([
    prisma.strengthSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        dateStr: true,
        durationSec: true,
        totalVolume: true,
        notes: true,
        createdAt: true,
        _count: { select: { sets: true } },
      },
    }),
    prisma.strengthSession.count({ where: { userId } }),
  ]);
  return { list, total, page, pageSize };
}

/** 单次训练详情（所有组明细）*/
export async function sessionDetail(userId: string, sessionId: string) {
  const session = await prisma.strengthSession.findUnique({
    where: { id: sessionId },
    include: { sets: { orderBy: { order: 'asc' } } },
  });
  if (!session || session.userId !== userId) {
    throw new Error('训练不存在或无权访问');
  }
  return session;
}

/** 容量统计（最近 N 天，按日聚合 volume/duration/次数，趋势图用）*/
export async function myVolume(userId: string, input: { days?: number } = {}) {
  const days = input.days ?? 30;
  const since = new Date(Date.now() - days * 86_400_000);
  const sessions = await prisma.strengthSession.findMany({
    where: { userId, createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
    select: { dateStr: true, totalVolume: true, durationSec: true },
  });
  const byDate = new Map<string, { volume: number; duration: number; count: number }>();
  for (const s of sessions) {
    const cur = byDate.get(s.dateStr) ?? { volume: 0, duration: 0, count: 0 };
    cur.volume += s.totalVolume;
    cur.duration += s.durationSec;
    cur.count += 1;
    byDate.set(s.dateStr, cur);
  }
  return {
    days,
    trend: Array.from(byDate.entries()).map(([date, v]) => ({ date, ...v })),
    totalVolume: sessions.reduce((s, x) => s + x.totalVolume, 0),
    totalSessions: sessions.length,
  };
}

/** 动作库列表（预设 + 自定义，category/search 过滤）*/
export async function listExercises(input: { category?: string; search?: string } = {}) {
  const where: Record<string, unknown> = {};
  if (input.category) where.category = input.category;
  if (input.search) where.name = { contains: input.search };
  return prisma.exercise.findMany({ where, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
}
