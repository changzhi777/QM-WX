/**
 * jobs/device-poll-pull.job.ts — 设备数据主动拉取 worker（V0.2.153 实施真实数据源）
 *
 * 触发:BullMQ repeatable(每 24 小时)+ 启动预热一次
 * 目的:替代 Mosquitto broker — cron 主动从已有数据源回流到 DeviceDailyActivity 表
 *
 * 当前数据源(V0.2.153):WeRunRecord 表最近 7 天（已有数据，V0.2.113 syncWeRun 落库）
 *   - step / distanceM → DeviceDailyActivity.step / distanceM
 *   - caloriesKcal → DeviceDailyActivity.caloriesKcal
 *   - 每天聚合（userId+vendor='wechat'+date=YYYY-MM-DD）→ upsert
 *
 * V0.3.1 数据源扩展（待主人拍板）：
 *   - 路径 B:Terra HTTPS API（需签约）
 *   - 路径 D:cron 调 Garmin/华为 OAuth API（多 vendor 聚合）
 *
 * 详见 V0.2.153 commit + memory mosquitto-5x-debug-root-cause.md
 */
import { prisma } from '../infra/prisma.js';
import { logger } from '../common/logger.js';

export interface DevicePollPullJobData {}

export interface DevicePollPullResult {
  activeUserCount: number;
  pulledDaysCount: number;
  upsertedCount: number;
  skippedDaysCount: number;
}

/** WeRunRecord 单天聚合（按 userId + date 维度） */
async function aggregateWeRunForDay(
  userId: string,
  date: string,
): Promise<{ step: number } | null> {
  // WeRunRecord 同一用户同日多条（来自多次 syncWeRun），累加 step
  // 注意：WeRunRecord schema 只有 step 字段（V0.1.43 wx.getWeRunData 仅步数），distance/calorie 默认 0
  const records = await prisma.weRunRecord.findMany({
    where: { userId, date },
    select: { step: true },
  });
  if (records.length === 0) return null;
  const step = records.reduce((s, r) => s + r.step, 0);
  return { step };
}

export async function processDevicePollPull(): Promise<DevicePollPullResult> {
  const now = new Date();
  const since = new Date(now.getTime() - 7 * 86_400_000);

  // 1. 清点最近 7 天活跃用户（V0.2.113 weRunRecord 维度）
  const activeUsers = await prisma.user.findMany({
    where: { weRunRecords: { some: { createdAt: { gte: since } } } },
    select: { id: true },
    take: 1000,
  });

  let pulledDaysCount = 0;
  let upsertedCount = 0;
  let skippedDaysCount = 0;

  // 2. 对每个用户拉最近 7 天 WeRunRecord（按天聚合 → upsert DeviceDailyActivity）
  for (const u of activeUsers) {
    try {
      // 拉最近 7 天有数据的日期（distinct date）
      const dates = await prisma.weRunRecord.findMany({
        where: { userId: u.id, createdAt: { gte: since } },
        select: { date: true },
        distinct: ['date'],
        orderBy: { date: 'desc' },
      });

      for (const { date } of dates) {
        pulledDaysCount++;
        const agg = await aggregateWeRunForDay(u.id, date);
        if (!agg) {
          skippedDaysCount++;
          continue;
        }

        // upsert DeviceDailyActivity by [userId, vendor='wechat', date]
        // WeRunRecord 只有 step；distanceM/caloriesKcal 默认 0（V0.3.1 接入其他 vendor 数据源后补全）
        const existing = await prisma.deviceDailyActivity.findFirst({
          where: { userId: u.id, vendor: 'wechat', date },
        });
        if (existing) {
          await prisma.deviceDailyActivity.update({
            where: { id: existing.id },
            data: {
              step: agg.step,
              source: 'api',
            },
          });
        } else {
          await prisma.deviceDailyActivity.create({
            data: {
              userId: u.id,
              vendor: 'wechat',
              date,
              step: agg.step,
              source: 'api',
            },
          });
        }
        upsertedCount++;
      }
    } catch (e) {
      logger.error(
        { err: (e as Error).message, userId: u.id },
        'device-poll-pull user processing failed',
      );
    }
  }

  const result: DevicePollPullResult = {
    activeUserCount: activeUsers.length,
    pulledDaysCount,
    upsertedCount,
    skippedDaysCount,
  };

  if (upsertedCount > 0) {
    logger.info(result, 'device-poll-pull backfilled DeviceDailyActivity from WeRunRecord');
  }
  return result;
}