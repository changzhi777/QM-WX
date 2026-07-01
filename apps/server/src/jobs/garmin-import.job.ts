/**
 * jobs/garmin-import.job.ts — BullMQ job（佳明活动导入榜单）
 *
 * 触发：device.importToCheckin 入队（用户勾选活动 → 异步导入）
 * 行为：写 Checkin（dataSource=garmin）+ 更新 RawActivity.status=imported
 * 幂等：RawActivity.status=imported 跳过 + Checkin.garminActivityId 唯一约束兜底
 * 缓存：完成后清 ranking + stats + sport.groupRanking
 *
 * 与 scripts/import-garmin.ts 的区别：CLI 脚本做一次性全量；本 job 处理用户实时勾选（≤50/次）
 */
import { prisma } from '../infra/prisma.js';
import { Cache } from '../infra/cache.js';
import { logger } from '../common/logger.js';
import { ACTIVITY_TYPE_MAP as TYPE_MAP, calcPace } from '../modules/device/device.schema.js';

export interface GarminImportJobData {
  userId: string;
  activityIds: string[];
}

export async function processGarminImport(
  data: GarminImportJobData,
): Promise<{
  userId: string;
  results: Array<{ id: string; ok: boolean; reason?: string }>;
  ok: number;
  fail: number;
}> {
  const { userId, activityIds } = data;
  const results: Array<{ id: string; ok: boolean; reason?: string }> = [];

  for (const activityId of activityIds) {
    const r = await prisma.rawActivity.findFirst({
      where: { id: activityId, userId, vendor: 'garmin' },
    });
    if (!r) {
      results.push({ id: activityId, ok: false, reason: 'not_found' });
      continue;
    }
    if (r.status === 'imported') {
      results.push({ id: activityId, ok: false, reason: 'already_imported' });
      continue;
    }
    const distKm = (r.distanceMeters ?? 0) / 1000;
    if (distKm <= 0 || !r.durationSec || r.durationSec <= 0) {
      // 无效数据直接标 ignored
      await prisma.rawActivity.update({
        where: { id: r.id },
        data: { status: 'ignored' },
      });
      results.push({ id: activityId, ok: false, reason: 'invalid_data' });
      continue;
    }
    try {
      await prisma.$transaction(async (tx) => {
        const sportType = TYPE_MAP[r.type] ?? 'other';
        const date = r.startTime.toISOString().slice(0, 10);
        const checkin = await tx.checkin.create({
          data: {
            userId: r.userId,
            distance: distKm,
            durationSec: r.durationSec,
            pace: calcPace(r.durationSec, distKm),
            heartRate: r.avgHr,
            cadence: r.cadence,
            points: 0,
            date,
            dataSource: 'garmin',
            garminActivityId: r.id,
            sportType,
          },
        });
        await tx.rawActivity.update({
          where: { id: r.id },
          data: {
            status: 'imported',
            importedAt: new Date(),
            importCheckinId: checkin.id,
          },
        });
      });
      results.push({ id: activityId, ok: true });
    } catch (e) {
      results.push({ id: activityId, ok: false, reason: (e as Error).message });
    }
  }

  // 失效榜单 + 汇总 + sport 旧榜缓存
  await Cache.delByPattern('ranking:*');
  await Cache.delByPattern('stats:*');
  await Cache.delByPattern('sport:groupRanking:*');

  logger.info(
    { userId, total: activityIds.length, ok: results.filter((r) => r.ok).length },
    'garmin-import job done',
  );

  return {
    userId,
    results,
    ok: results.filter((r) => r.ok).length,
    fail: results.filter((r) => !r.ok).length,
  };
}
