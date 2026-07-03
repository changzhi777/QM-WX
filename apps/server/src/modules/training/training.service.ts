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
import type { MySportRecordsQuery } from './training.schema.js';

/** 跑步记录缓存 TTL：60s（打卡后短延迟可见，与 sport.myStats 同档） */
const RECORDS_CACHE_TTL_SEC = 60;

/** 训练计划模板（MVP 硬编码；后续若要个性化推荐再建 TrainingPlan 表） */
export interface TrainingPlan {
  key: string;
  name: string;
  weeks: number;
  level: '入门' | '进阶' | '挑战' | '极限';
  goal: string;
  desc: string;
  weeklyMileage: string;
}

export const TRAINING_PLANS: TrainingPlan[] = [
  {
    key: '5k',
    name: '5公里入门',
    weeks: 8,
    level: '入门',
    goal: '完成 5 公里',
    desc: '从跑走结合到连续跑完 5 公里，适合零基础跑者',
    weeklyMileage: '8-15 km/周',
  },
  {
    key: '10k',
    name: '10公里进阶',
    weeks: 10,
    level: '进阶',
    goal: '完赛 10 公里',
    desc: '提升耐力与配速，掌握节奏跑与间歇训练',
    weeklyMileage: '15-25 km/周',
  },
  {
    key: 'half',
    name: '半程马拉松 21K',
    weeks: 12,
    level: '挑战',
    goal: '完赛半马 21.0975 km',
    desc: '系统训练长距离，挑战半马完赛',
    weeklyMileage: '25-40 km/周',
  },
  {
    key: 'full',
    name: '全程马拉松 42K',
    weeks: 16,
    level: '极限',
    goal: '完赛全马 42.195 km',
    desc: '科学备战全马，含 LSD + tempo + recovery',
    weeklyMileage: '40-60 km/周',
  },
];

export const trainingService = {
  /**
   * 我的训练计划（4 套模板）
   *
   * MVP：硬编码常量，所有用户一致；后续可按用户能力 + 历史跑量个性化推荐
   */
  async myPlans() {
    return { plans: TRAINING_PLANS };
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

/** 保留 2 位小数 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
