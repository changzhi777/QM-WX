/**
 * 佳明活动批量导入打卡（Checkin）脚本 — 一次性全量导入
 *
 * 流程：
 * 1. 查 RawActivity（vendor=garmin）待导入活动
 * 2. 筛选有效（distanceMeters>0 && durationSec>0）
 * 3. 映射 sportType（running→run / walking→hike / cycling→ride / 其它→other）
 * 4. 批量 500/事务：写 Checkin（dataSource=garmin, garminActivityId=raw.id）
 *    + 更新 RawActivity.status=imported / importedAt / importCheckinId（1-1 双向引用）
 * 5. 无效数据标 ignored（移出 pending，避免分页死循环）
 *
 * 分页策略（关键 — 修复 skip+status 缩小集合漏处理 bug）：
 * - 真导入用 while + take（status 变化驱动游标 — 导入后 status=imported 自动移出 pending）
 * - dry-run 用 skip 分页（不改 status，skip 在稳定集合上可靠）
 *
 * 用法：
 *   pnpm garmin-import                     # 导入全部 garmin pending
 *   pnpm garmin-import -- --dry-run        # 只统计不写
 *   pnpm garmin-import -- --user <userId>  # 指定用户
 *   pnpm garmin-import -- --reimport       # 含已 imported（重导前先清 Checkin）
 */
import { prisma } from '../src/infra/prisma.js';
import { logger } from '../src/common/logger.js';
import { ACTIVITY_TYPE_MAP as TYPE_MAP, calcPace } from '../src/modules/device/device.schema.js';

interface RawRow {
  id: string;
  userId: string;
  type: string;
  startTime: Date;
  durationSec: number | null;
  distanceMeters: number | null;
  avgHr: number | null;
  cadence: number | null;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const reimport = args.includes('--reimport');
  const userArgIdx = args.indexOf('--user');
  const userId = userArgIdx >= 0 ? args[userArgIdx + 1] : undefined;

  const where = {
    vendor: 'garmin' as const,
    ...(userId ? { userId } : {}),
    ...(!reimport ? { status: 'pending' as const } : {}),
  };
  const total = await prisma.rawActivity.count({ where });
  logger.info({ total, dryRun, reimport, userId }, '佳明活动导入开始');

  const BATCH = 500;
  let processed = 0;
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  async function processRow(r: RawRow) {
    processed++;
    const distKm = (r.distanceMeters ?? 0) / 1000;
    if (distKm <= 0 || !r.durationSec || r.durationSec <= 0) {
      // 无效数据：真导入标 ignored（移出 pending，避免死循环）；dry-run 仅统计
      if (!dryRun) {
        await prisma.rawActivity.update({ where: { id: r.id }, data: { status: 'ignored' } });
      }
      skipped++;
      return;
    }
    if (dryRun) {
      imported++;
      return;
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
          data: { status: 'imported', importedAt: new Date(), importCheckinId: checkin.id },
        });
      });
      imported++;
    } catch (e) {
      failed++;
      logger.error({ id: r.id, err: (e as Error).message }, '导入失败');
    }
  }

  if (dryRun) {
    // dry-run：skip 分页（不改 status，skip 在稳定集合上可靠）
    for (let skip = 0; skip < total; skip += BATCH) {
      const rows = (await prisma.rawActivity.findMany({
        where,
        skip,
        take: BATCH,
        orderBy: { startTime: 'asc' },
      })) as RawRow[];
      for (const r of rows) await processRow(r);
      logger.info({ skip, processed, imported, skipped, failed }, '批次完成');
    }
  } else {
    // 真导入：while + take（status 变化驱动游标，避免 skip 在缩小集合上漏处理）
    let batch = 0;
    while (true) {
      const rows = (await prisma.rawActivity.findMany({
        where,
        take: BATCH,
        orderBy: { startTime: 'asc' },
      })) as RawRow[];
      if (rows.length === 0) break;
      batch++;
      for (const r of rows) await processRow(r);
      logger.info({ batch, processed, imported, skipped, failed }, '批次完成');
    }
  }

  logger.info({ total, processed, imported, skipped, failed, dryRun }, '佳明活动导入完成');
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    logger.error({ err: e }, '导入脚本异常');
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
