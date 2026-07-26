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
import { notifyStrengthDone, notifyGoalAchieved, notifyPlanCompleted } from '../notification/notification.service.js';
import { goalService } from '../goal/goal.service.js';
import { trainingService } from '../training/training.service.js';
import { Errors } from '../../common/errors.js';

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

/** 记录一组（动作/次数/重量/组序；实时累加 session.totalVolume + V0.2.143 完结度 RPE + 备注）*/
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
    rpe?: number; // 完结度 1-10
    note?: string; // 本组备注
    postHr?: number; // V0.2.148 组间心率 bpm
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
      // V0.2.143 力量训练记录 V0.3 增量：完结度 RPE + 本组备注
      rpe: input.rpe,
      note: input.note,
      // V0.2.148 组间心率
      postHr: input.postHr,
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
  // V0.2.129 力量计划完成检测（strength 计划 sessionCount 跨 targetSessions 阈值）
  try {
    const justCompleted = await trainingService.detectAndMarkPlanCompleted(userId);
    for (const plan of justCompleted) {
      await notifyPlanCompleted(userId, plan);
    }
  } catch {
    /* 计划检测/通知失败不影响训练保存结果 */
  }
  return updated;
}

/**
 * 训练历史列表（分页 + 组数 count + V0.2.136 exerciseName 过滤）
 *
 * - exerciseName 过滤通过 sets 表的 some 关系实现（Prisma 自动 JOIN）；YAGNI 不预聚合
 * - 仍按 createdAt desc 排序
 */
export async function listSessions(
  userId: string,
  input: { page?: number; pageSize?: number; exerciseName?: string } = {},
) {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 20;
  const where: Record<string, unknown> = { userId };
  if (input.exerciseName) {
    where.sets = { some: { exerciseName: input.exerciseName } };
  }
  const [list, total] = await Promise.all([
    prisma.strengthSession.findMany({
      where,
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
    prisma.strengthSession.count({ where }),
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

/** 动作库列表（预设 + 用户自定义，category/search 过滤）*/
export async function listExercises(
  userId: string,
  input: { category?: string; search?: string } = {},
) {
  // V0.2.132 合并：全局预设（userId=null）+ 用户自定义（userId=userId）；OR 条件
  const where: Record<string, unknown> = {
    OR: [{ userId: null }, { userId }],
  };
  if (input.category) where.category = input.category;
  if (input.search) where.name = { contains: input.search };
  return prisma.exercise.findMany({
    where,
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
}

/**
 * V0.2.132 用户添加自定义动作
 *
 * - 同用户不能重名（@@unique[userId, name]）
 * - userId 强制是当前用户（前端不可改）
 * - 重复添加 → conflict
 */
export async function addUserExercise(
  userId: string,
  input: { name: string; category: string; muscleGroup?: string },
) {
  const exists = await prisma.exercise.findFirst({
    where: { userId, name: input.name },
  });
  if (exists) throw new Error('动作名已存在');
  const ex = await prisma.exercise.create({
    data: {
      userId,
      name: input.name,
      category: input.category,
      muscleGroup: input.muscleGroup ?? null,
      isCustom: true,
    },
  });
  return { id: ex.id, name: ex.name, category: ex.category };
}

/** V0.2.132 列出我的自定义动作（仅 userId=自己，不含全局预设） */
export async function listUserExercises(userId: string) {
  return prisma.exercise.findMany({
    where: { userId },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
}

/** V0.2.132 删除我的自定义动作（鉴权：仅 userId=自己 可删） */
export async function removeUserExercise(userId: string, id: string) {
  const ex = await prisma.exercise.findUnique({ where: { id } });
  if (!ex || ex.userId !== userId) throw new Error('无权删除或动作不存在');
  await prisma.exercise.delete({ where: { id } });
  return { ok: true };
}

/**
 * V0.2.134 切换收藏动作（有则取消，无则添加；返新状态）
 *
 * 存储：User.favoriteExerciseIds String[]（Postgres 数组，单列；has array 运算符 O(1) 包含查询）
 * 设计：toggle 而非 add/remove 双方法，UX 友好（前端 1 按钮 + 1 接口）；幂等
 */
export async function toggleFavoriteExercise(userId: string, exerciseId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { favoriteExerciseIds: true },
  });
  if (!user) throw new Error('用户不存在');
  const current = user.favoriteExerciseIds ?? [];
  const isFavorited = current.includes(exerciseId);
  const next = isFavorited
    ? current.filter((id) => id !== exerciseId)
    : [...current, exerciseId];
  await prisma.user.update({
    where: { id: userId },
    data: { favoriteExerciseIds: next },
  });
  return { favorited: !isFavorited, count: next.length };
}

/**
 * V0.2.134 列出我的收藏动作（关联 Exercise 表拿详情）
 *
 * 只返仍存在的动作（已被管理员删除的自动过滤）
 */
export async function listFavoriteExercises(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { favoriteExerciseIds: true },
  });
  const ids = user?.favoriteExerciseIds ?? [];
  if (ids.length === 0) return { list: [] };
  // 包含全局预设 + 用户自定义
  const exercises = await prisma.exercise.findMany({
    where: { id: { in: ids }, OR: [{ userId: null }, { userId }] },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
  return { list: exercises };
}

/**
 * V0.2.126 动作统计：个人最佳 PB + 容量分布（详情页增强）
 *
 * - PB: 每个动作最大重量（weight）；并列时取 reps 多的；返 achievedAt + setCount
 * - Distribution: 每个动作累计容量 + setCount + percent（按 totalVolume 降序）
 * - 趋势复用 myVolume（30 天），不在此处返避免重复
 */
export async function getExerciseStats(userId: string) {
  const sets = await prisma.strengthSet.findMany({
    where: { session: { userId } },
    select: { exerciseName: true, reps: true, weight: true, createdAt: true, sessionId: true },
    orderBy: { createdAt: 'asc' },
  });

  // PB: Map<exerciseName, { maxWeight, maxReps, achievedAt, setCount }>
  const pbMap = new Map<string, { exerciseName: string; maxWeight: number; maxReps: number; achievedAt: Date; setCount: number }>();
  // Distribution: Map<exerciseName, { totalVolume, setCount }>
  const distMap = new Map<string, { exerciseName: string; totalVolume: number; setCount: number }>();

  for (const s of sets) {
    const volume = s.reps * s.weight;

    // PB 累加
    const cur = pbMap.get(s.exerciseName);
    if (!cur) {
      pbMap.set(s.exerciseName, {
        exerciseName: s.exerciseName,
        maxWeight: s.weight,
        maxReps: s.reps,
        achievedAt: s.createdAt,
        setCount: 1,
      });
    } else {
      cur.setCount += 1;
      if (s.weight > cur.maxWeight || (s.weight === cur.maxWeight && s.reps > cur.maxReps)) {
        cur.maxWeight = s.weight;
        cur.maxReps = s.reps;
        cur.achievedAt = s.createdAt;
      }
    }

    // Distribution 累加
    const d = distMap.get(s.exerciseName);
    if (!d) {
      distMap.set(s.exerciseName, { exerciseName: s.exerciseName, totalVolume: volume, setCount: 1 });
    } else {
      d.totalVolume += volume;
      d.setCount += 1;
    }
  }

  const pbs = Array.from(pbMap.values())
    .sort((a, b) => b.maxWeight - a.maxWeight)
    .map((p) => ({ ...p, achievedAt: p.achievedAt.toISOString() }));

  const totalVolumeAll = Array.from(distMap.values()).reduce((s, d) => s + d.totalVolume, 0);
  const distribution = Array.from(distMap.values())
    .sort((a, b) => b.totalVolume - a.totalVolume)
    .map((d) => ({
      ...d,
      totalVolume: Math.round(d.totalVolume * 10) / 10,
      percent: totalVolumeAll > 0 ? Math.round((d.totalVolume / totalVolumeAll) * 1000) / 10 : 0,
    }));

  return {
    pbs,
    distribution,
    totalExercises: pbMap.size,
    totalSets: sets.length,
  };
}

/**
 * V0.2.142 下组训练重量建议
 *
 * 算法：取最近 3 场该动作的 maxWeight（按 session 聚合，同 V0.2.135 getExerciseTrend 思路）
 *  - 3 场都相同 → 建议 +2.5kg（线性渐进，标准健身「double progression」原则）
 *  - 2/3 相同 → 建议上次 maxWeight（维持）
 *  - 1/3 相同 或 找不到历史 → 建议上次 maxWeight（兜底）
 *
 * reps 建议：3-5 rep 范围（增肌目标）；初学者 8-12 rep
 *
 * 范式：1 SQL 查询 → 内存聚合（KISS；YAGNI 不预聚合）
 */
export async function suggestNextWeight(
  userId: string,
  input: { exerciseName: string; targetReps?: number },
) {
  const targetReps = input.targetReps ?? 8;
  const sets = await prisma.strengthSet.findMany({
    where: { exerciseName: input.exerciseName, session: { userId } },
    orderBy: { session: { createdAt: 'desc' } },
    include: { session: { select: { createdAt: true } } },
    take: 50, // 足够 3-5 场（按 10-15 set/场估）
  });
  if (sets.length === 0) {
    return { hasHistory: false, suggestedWeight: null, suggestedReps: targetReps, basis: 'no_history' as const };
  }

  // 按 session 分组（仅保留最近 3 场）
  const bySession = new Map<string, { date: string; maxWeight: number; totalReps: number; setCount: number }>();
  for (const s of sets) {
    if (bySession.size >= 3 && !bySession.has(s.sessionId)) break;
    const cur = bySession.get(s.sessionId);
    const date = s.session.createdAt.toISOString();
    if (!cur) {
      bySession.set(s.sessionId, { date, maxWeight: s.weight, totalReps: s.reps, setCount: 1 });
    } else {
      cur.setCount += 1;
      cur.totalReps += s.reps;
      if (s.weight > cur.maxWeight) cur.maxWeight = s.weight;
    }
  }
  const sessions = Array.from(bySession.values()); // 倒序（最新在前）
  if (sessions.length === 0) {
    return { hasHistory: false, suggestedWeight: null, suggestedReps: targetReps, basis: 'no_history' as const };
  }

  const lastMax = sessions[0].maxWeight;
  // 渐进算法：3 场都相同 → +2.5kg；否则维持
  let suggested = lastMax;
  let basis: 'progression' | 'maintain' | 'first_session' = 'maintain';
  if (sessions.length >= 3) {
    const w0 = sessions[0].maxWeight;
    const w1 = sessions[1].maxWeight;
    const w2 = sessions[2].maxWeight;
    if (w0 === w1 && w1 === w2) {
      suggested = w0 + 2.5;
      basis = 'progression';
    } else {
      basis = 'maintain';
    }
  } else if (sessions.length === 1) {
    basis = 'first_session';
  } else {
    basis = 'maintain';
  }

  return {
    hasHistory: true,
    suggestedWeight: Math.round(suggested * 10) / 10, // 1 位小数（kg）
    suggestedReps: targetReps,
    basis,
    lastMaxWeight: lastMax,
    lastSessionDate: sessions[0].date,
    recentSessions: sessions.length,
  };
}

/**
 * V0.2.135 单一动作的趋势（按 session 聚合）
 *
 * - 输入：userId + exerciseName + 可选 days（默认 90）
 * - 聚合：按 session 维度（一 session 一点），返 { date, maxWeight, totalVolume, setCount, avgReps }
 * - 用于详情页「动作趋势」折线图（weight × reps × volume 时间序列）
 */
export async function getExerciseTrend(userId: string, input: { exerciseName: string; days?: number }) {
  const days = input.days ?? 90;
  const since = new Date(Date.now() - days * 86_400_000);

  const sets = await prisma.strengthSet.findMany({
    where: {
      exerciseName: input.exerciseName,
      session: { userId, createdAt: { gte: since } },
    },
    orderBy: { session: { createdAt: 'asc' } },
    include: { session: { select: { createdAt: true, dateStr: true } } },
  });

  // 按 session 聚合（sessionId 为 group key）
  const bySession = new Map<string, { date: string; dateStr: string; maxWeight: number; totalVolume: number; setCount: number; totalReps: number }>();
  for (const s of sets) {
    const cur = bySession.get(s.sessionId);
    if (!cur) {
      bySession.set(s.sessionId, {
        date: s.session.createdAt.toISOString(),
        dateStr: s.session.dateStr,
        maxWeight: s.weight,
        totalVolume: s.reps * s.weight,
        setCount: 1,
        totalReps: s.reps,
      });
    } else {
      cur.setCount += 1;
      cur.totalVolume += s.reps * s.weight;
      cur.totalReps += s.reps;
      if (s.weight > cur.maxWeight) cur.maxWeight = s.weight;
    }
  }

  const points = Array.from(bySession.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => ({
      date: p.date,
      dateStr: p.dateStr,
      maxWeight: p.maxWeight,
      totalVolume: Math.round(p.totalVolume * 10) / 10,
      setCount: p.setCount,
      avgReps: Math.round((p.totalReps / p.setCount) * 10) / 10,
    }));

  return {
    exerciseName: input.exerciseName,
    days,
    points,
    totalSessions: points.length,
    maxWeightAllTime: points.reduce((m, p) => Math.max(m, p.maxWeight), 0),
  };
}

/**
 * V0.2.144 单次训练会话报告（汇总：总容量/总组数/总次数/平均RPE/动作分布）
 *
 * - 返回完整报告：metrics 汇总 + 按动作聚合 + RPE 分布
 * - 用于前端详情页"训练报告"+ Canvas 海报分享
 * - 鉴权：仅 session 拥有者可查看（与 sessionDetail 一致）
 */
export async function getSessionReport(userId: string, sessionId: string) {
  const session = await prisma.strengthSession.findUnique({
    where: { id: sessionId },
    include: {
      sets: { orderBy: { order: 'asc' } },
    },
  });
  if (!session || session.userId !== userId) throw Errors.notFound('训练不存在或无权访问');

  const sets = session.sets;
  // 总指标
  const totalSets = sets.length;
  const totalReps = sets.reduce((s, x) => s + x.reps, 0);
  const totalVolume = sets.reduce((s, x) => s + x.reps * x.weight, 0);
  const rpeValues = sets.map((x) => x.rpe).filter((r): r is number => r != null);
  const avgRpe = rpeValues.length > 0
    ? Math.round((rpeValues.reduce((s, x) => s + x, 0) / rpeValues.length) * 10) / 10
    : null;

  // 按动作聚合
  const byExercise = new Map<string, { exerciseName: string; sets: number; reps: number; volume: number; maxWeight: number; avgRpe: number | null; rpeCount: number }>();
  for (const s of sets) {
    const cur = byExercise.get(s.exerciseName);
    if (!cur) {
      byExercise.set(s.exerciseName, {
        exerciseName: s.exerciseName,
        sets: 1,
        reps: s.reps,
        volume: s.reps * s.weight,
        maxWeight: s.weight,
        avgRpe: s.rpe ?? null,
        rpeCount: s.rpe ? 1 : 0,
      });
    } else {
      cur.sets += 1;
      cur.reps += s.reps;
      cur.volume += s.reps * s.weight;
      if (s.weight > cur.maxWeight) cur.maxWeight = s.weight;
      if (s.rpe != null) {
        cur.avgRpe = ((cur.avgRpe ?? 0) * cur.rpeCount + s.rpe) / (cur.rpeCount + 1);
        cur.rpeCount += 1;
      }
    }
  }
  const exercises = Array.from(byExercise.values())
    .map((e) => ({ ...e, volume: Math.round(e.volume * 10) / 10, avgRpe: e.avgRpe != null ? Math.round(e.avgRpe * 10) / 10 : null }))
    .sort((a, b) => b.volume - a.volume);

  // RPE 分布（1-10）
  const rpeDist = new Array<number>(10).fill(0);
  for (const r of rpeValues) {
    if (r >= 1 && r <= 10) rpeDist[r - 1] += 1;
  }

  return {
    sessionId: session.id,
    dateStr: session.dateStr,
    durationSec: session.durationSec,
    durationText: session.durationSec >= 3600
      ? `${Math.floor(session.durationSec / 3600)}小时${Math.floor((session.durationSec % 3600) / 60)}分`
      : session.durationSec > 0 ? `${Math.floor(session.durationSec / 60)} 分钟` : '0 分钟',
    notes: session.notes,
    totalSets,
    totalReps,
    totalVolume: Math.round(totalVolume * 10) / 10,
    avgRpe,
    rpeCompletion: sets.length > 0 ? Math.round((rpeValues.length / sets.length) * 100) : 0, // RPE 填写率
    exercises,
    rpeDist,
  };
}

/**
 * V0.2.147 力量训练总览仪表盘（strength 主页顶部 section）
 *
 * 返：总指标（sessions/totalVolume/totalSets/totalReps/avgRpe）+ 按动作类目分布 + 按日容量趋势
 * 用于 strength 主页 section（V0.2.147 新增）；前端用 1 个 API 拉全，避免 N+1
 *
 * 范式：1 SQL（findMany 拿全 sets + 内存聚合）→ 返回简洁报告
 */
export async function getStrengthOverview(userId: string, input: { days?: number } = {}) {
  const days = input.days ?? 30;
  const since = new Date(Date.now() - days * 86_400_000);

  const sets = await prisma.strengthSet.findMany({
    where: { session: { userId, createdAt: { gte: since } } },
    select: {
      exerciseName: true,
      reps: true,
      weight: true,
      rpe: true,
      sessionId: true,
      session: { select: { dateStr: true, createdAt: true } },
    },
  });

  // 总指标
  const totalSets = sets.length;
  const totalReps = sets.reduce((s, x) => s + x.reps, 0);
  const totalVolume = sets.reduce((s, x) => s + x.reps * x.weight, 0);
  const rpeValues = sets.map((x) => x.rpe).filter((r): r is number => r != null);
  const avgRpe = rpeValues.length > 0
    ? Math.round((rpeValues.reduce((s, x) => s + x, 0) / rpeValues.length) * 10) / 10
    : null;

  // session 数（去重）
  const uniqueSessions = new Set(sets.map((s) => s.sessionId));
  const totalSessions = uniqueSessions.size;

  // 按动作聚合（用于 byExercise 数组）
  const byExercise = new Map<string, { exerciseName: string; volume: number; sets: number; reps: number; maxWeight: number }>();
  for (const s of sets) {
    const cur = byExercise.get(s.exerciseName);
    if (!cur) {
      byExercise.set(s.exerciseName, { exerciseName: s.exerciseName, volume: s.reps * s.weight, sets: 1, reps: s.reps, maxWeight: s.weight });
    } else {
      cur.volume += s.reps * s.weight;
      cur.sets += 1;
      cur.reps += s.reps;
      if (s.weight > cur.maxWeight) cur.maxWeight = s.weight;
    }
  }
  const topExercises = Array.from(byExercise.values())
    .map((e) => ({ ...e, volume: Math.round(e.volume * 10) / 10 }))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 5);

  // 按日容量趋势（V0.2.127 myVolume 风格）
  const byDate = new Map<string, { volume: number; sessions: number }>();
  for (const s of sets) {
    const cur = byDate.get(s.session.dateStr) ?? { volume: 0, sessions: 0 };
    cur.volume += s.reps * s.weight;
    if (!cur.sessions) {
      // 用 Set 去重 sessionId
    }
    byDate.set(s.session.dateStr, cur);
  }
  // 重新计算 sessions（去重 sessionId per day）
  const sessionsByDate = new Map<string, Set<string>>();
  for (const s of sets) {
    if (!sessionsByDate.has(s.session.dateStr)) sessionsByDate.set(s.session.dateStr, new Set());
    sessionsByDate.get(s.session.dateStr)!.add(s.sessionId);
  }
  for (const [d, vol] of byDate.entries()) {
    vol.sessions = sessionsByDate.get(d)?.size ?? 0;
  }
  const dailyTrend = Array.from(byDate.entries())
    .map(([date, v]) => ({ date, volume: Math.round(v.volume * 10) / 10, sessions: v.sessions }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    days,
    totalSessions,
    totalSets,
    totalReps,
    totalVolume: Math.round(totalVolume * 10) / 10,
    avgRpe,
    topExercises,
    dailyTrend,
  };
}

/**
 * V0.2.148 力量训练完成度评分（多维度：RPE + postHr + note + 动作多样性）
 *
 * 算法：加权平均 4 项（各 25%）
 *  - RPE 覆盖率：含 rpe 的 set / 总 set
 *  - postHr 覆盖率：含 postHr 的 set / 总 set
 *  - note 覆盖率：含 note 的 set / 总 set
 *  - 动作多样性：unique exerciseName / 总 set（鼓励每组不同动作，少重复）
 *  - 加分：若 avgRpe >= 7，再 +5（高质量记录）
 *
 * 返回 score 0-100 + 各因子明细
 */
export async function getCompletionScore(userId: string, sessionId: string) {
  const session = await prisma.strengthSession.findUnique({
    where: { id: sessionId },
    include: { sets: { select: { exerciseName: true, reps: true, weight: true, rpe: true, postHr: true, note: true } } },
  });
  if (!session || session.userId !== userId) throw Errors.notFound('训练不存在或无权访问');

  const sets = session.sets;
  const total = sets.length;
  if (total === 0) {
    return { score: 0, factors: { rpeCoverage: 0, postHrCoverage: 0, noteCoverage: 0, exerciseDiversity: 0 }, totalSets: 0 };
  }

  const rpeCount = sets.filter((s) => s.rpe != null).length;
  const postHrCount = sets.filter((s) => s.postHr != null).length;
  const noteCount = sets.filter((s) => s.note != null && s.note !== '').length;
  const uniqueExercises = new Set(sets.map((s) => s.exerciseName)).size;

  const rpeCoverage = Math.round((rpeCount / total) * 100);
  const postHrCoverage = Math.round((postHrCount / total) * 100);
  const noteCoverage = Math.round((noteCount / total) * 100);
  const exerciseDiversity = Math.round((uniqueExercises / total) * 100);

  const baseScore = (rpeCoverage + postHrCoverage + noteCoverage + exerciseDiversity) / 4;

  // 高质量记录加分
  const rpeValues = sets.map((s) => s.rpe).filter((r): r is number => r != null);
  const avgRpe = rpeValues.length > 0
    ? rpeValues.reduce((s, x) => s + x, 0) / rpeValues.length
    : 0;
  const bonus = avgRpe >= 7 ? 5 : 0;
  const score = Math.min(100, Math.round(baseScore + bonus));

  return {
    score,
    factors: { rpeCoverage, postHrCoverage, noteCoverage, exerciseDiversity },
    bonus,
    avgRpe: Math.round(avgRpe * 10) / 10,
    totalSets: total,
  };
}
