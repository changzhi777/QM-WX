/**
 * training module business logic（V0.1.25，参考图 2775）
 *
 * 锻炼/训练中心：
 * - myPlans：4 套训练计划模板（5K/10K/半马/全马，硬编码常量 — MVP 不建表）
 * - mySportRecords：聚合 Checkin(run) + RawActivity(running) → 跑步记录统一列表
 *
 * 赛事助手：复用 content.list(type=marathon)，前端直调，不在此 module（DRY）
 */
import { prisma } from '../../infra/prisma.js';
import { Cache } from '../../infra/cache.js';
import { calcPace } from '../device/device.schema.js';
import { Errors } from '../../common/errors.js';
import type { MySportRecordsQuery, JoinPlanInput } from './training.schema.js';

/** 跑步记录缓存 TTL：60s（打卡后短延迟可见，与 sport.myStats 同档） */
const RECORDS_CACHE_TTL_SEC = 60;

// V0.1.41：训练计划模板已迁移到 DB（TrainingPlan 表），seed 见 prisma/seed.ts SEED_TRAINING_PLANS
// 原 TRAINING_PLANS 硬编码常量已删（运行时改读 DB，DRY 单一数据源）

export const trainingService = {
  /**
   * 我的训练计划（V0.1.41：改读 DB active 计划，替原硬编码常量）
   *
   * admin 通过 upsertTrainingPlan 维护；status=archived 不返
   */
  async myPlans() {
    const plans = await prisma.trainingPlan.findMany({
      where: { status: 'active' },
      orderBy: [{ weeks: 'asc' }, { createdAt: 'desc' }],
    });
    return {
      plans: plans.map((p) => ({
        id: p.id,
        key: p.key,
        name: p.name,
        weeks: p.weeks,
        level: p.level, // 英文 key（beginner/...），前端直接作 class
        goal: p.goal,
        desc: p.desc,
        weeklyMileage: p.weeklyMileage,
        targetKm: p.targetKm,
      })),
    };
  },

  /**
   * 加入训练计划（V0.1.41）
   *
   * UserPlanEnrollment.userId @unique → upsert 自动替换旧计划（1 人 1 活跃计划）
   * 切换计划时 joinedAt 重置（进度从新计划加入日重新计）
   */
  async joinPlan(userId: string, input: JoinPlanInput) {
    const plan = await prisma.trainingPlan.findUnique({ where: { id: input.planId } });
    if (!plan) throw Errors.notFound('计划不存在');
    if (plan.status !== 'active') throw Errors.badRequest('计划已下架');

    const enrollment = await prisma.userPlanEnrollment.upsert({
      where: { userId },
      create: { userId, planId: plan.id },
      update: { planId: plan.id, joinedAt: new Date() },
    });
    return {
      id: enrollment.id,
      planId: plan.id,
      planName: plan.name,
      joinedAt: enrollment.joinedAt.toISOString(),
    };
  },

  /**
   * 我的当前计划 + 进度（V0.1.41）
   *
   * 进度：calcPlanProgress（Checkin run aggregate 自 joinedAt 起 → / targetKm）
   * 无加入记录返 { plan: null }，前端隐藏进度卡
   */
  async myActivePlan(userId: string) {
    const enrollment = await prisma.userPlanEnrollment.findUnique({
      where: { userId },
      include: { plan: true },
    });
    if (!enrollment) return { plan: null };

    const { plan } = enrollment;
    const progress = await calcPlanProgress(userId, enrollment.joinedAt, plan.targetKm);
    return {
      plan: {
        id: plan.id,
        key: plan.key,
        name: plan.name,
        weeks: plan.weeks,
        level: plan.level,
        goal: plan.goal,
        desc: plan.desc,
        weeklyMileage: plan.weeklyMileage,
        targetKm: plan.targetKm,
      },
      joinedAt: enrollment.joinedAt.toISOString(),
      daysJoined: Math.max(0, Math.floor((Date.now() - enrollment.joinedAt.getTime()) / 86_400_000)),
      ...progress,
    };
  },

  /**
   * 离开训练计划（V0.1.41，deleteMany 幂等 — 不存在也 ok）
   */
  async leavePlan(userId: string) {
    await prisma.userPlanEnrollment.deleteMany({ where: { userId } });
    return { ok: true };
  },

  /**
   * 我的跑步记录（Checkin run + RawActivity running 聚合，去重）
   *
   * 数据源：
   * - Checkin(sportType=run) — 手动打卡 + 佳明导入的打卡
   * - RawActivity(vendor=garmin, type=running, status=imported) — 佳明原始活动（更详细）
   *
   * 去重：佳明活动导入后会生成 Checkin（importCheckinId 关联），同一运动只保留 RawActivity
   *
   * 缓存：Cache.wrap + 60s TTL（打卡后 60s 内可能仍旧态，可接受；与 sport.myStats 同档）
   */
  async mySportRecords(userId: string, input: MySportRecordsQuery) {
    const key = `training:records:${userId}:${input.limit}`;
    return Cache.wrap(key, RECORDS_CACHE_TTL_SEC, async () => {
      const [checkins, rawActivities] = await Promise.all([
        prisma.checkin.findMany({
          where: { userId, sportType: 'run' },
          orderBy: { createdAt: 'desc' },
          take: input.limit * 2, // 多取用于去重后补齐
        }),
        prisma.rawActivity.findMany({
          where: { userId, vendor: 'garmin', type: 'running', status: 'imported' },
          orderBy: { startTime: 'desc' },
          take: input.limit * 2,
        }),
      ]);

      // 去重：已导入佳明的 Checkin（importCheckinId 命中）不重复计，只保留 RawActivity
      const importedCheckinIds = new Set(
        rawActivities.map((r) => r.importCheckinId).filter((id): id is string => id !== null),
      );
      const manualCheckins = checkins.filter((c) => !importedCheckinIds.has(c.id));

      type Rec = {
        id: string;
        source: 'manual' | 'garmin';
        date: string;
        distanceKm: number;
        durationMin: number;
        pace: string | null;
      };

      const records: Rec[] = [
        ...rawActivities.map((r) => ({
          id: r.id,
          source: 'garmin' as const,
          date: r.startTime.toISOString(),
          distanceKm: round2((r.distanceMeters ?? 0) / 1000),
          durationMin: Math.round((r.durationSec ?? 0) / 60),
          pace: calcPace(r.durationSec, r.distanceMeters ? r.distanceMeters / 1000 : null),
        })),
        ...manualCheckins.map((c) => ({
          id: c.id,
          source: (c.dataSource === 'garmin' ? 'garmin' : 'manual') as 'manual' | 'garmin',
          date: c.createdAt.toISOString(),
          distanceKm: round2(c.distance),
          durationMin: Math.round((c.durationSec ?? 0) / 60),
          pace: c.pace,
        })),
      ];

      // 按时间 desc + 取 limit
      records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const top = records.slice(0, input.limit);

      const totalDistance = top.reduce((s, r) => s + r.distanceKm, 0);
      const totalRuns = top.length;

      return {
        records: top.map((r) => ({
          ...r,
          date: r.date.slice(0, 16).replace('T', ' '),
        })),
        summary: {
          totalRuns,
          totalDistanceKm: round2(totalDistance),
          avgDistanceKm: totalRuns > 0 ? round2(totalDistance / totalRuns) : 0,
        },
      };
    });
  },
};

/**
 * 训练计划进度（V0.1.41）
 *
 * 自 joinedAt 起 Checkin(run) 累计跑量 / plan.targetKm → percent + completed
 * 不复用 goal.calcGoalProgress（goal 固定周期 periodStart-End；plan 从 joinedAt 动态起算，KISS 不耦合）
 */
async function calcPlanProgress(userId: string, joinedAt: Date, targetKm: number) {
  const agg = await prisma.checkin.aggregate({
    where: { userId, sportType: 'run', createdAt: { gte: joinedAt } },
    _sum: { distance: true },
  });
  const currentDistance = round2(agg._sum.distance ?? 0);
  const percent = targetKm > 0 ? Math.min(100, Math.round((currentDistance / targetKm) * 100)) : 0;
  return { currentDistance, targetKm, percent, completed: currentDistance >= targetKm };
}

/** 保留 2 位小数 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
