/**
 * jobs/device-poll-cleanup.job.ts — 设备每日活动数据清理 worker
 *
 * 触发:BullMQ repeatable(每 24 小时)+ 启动预热一次
 * 行为:删除 DeviceDailyActivity 表 createdAt < now - 90 days 记录
 * 目的:
 *   1. GDPR 合规（用户数据 90 天自动清理）
 *   2. 避免表无限增长（每活跃用户每天 1 条，10 万用户 10 年 = 36 亿条）
 *   3. Mosquitto debug 5 次失败的替代方案 — 不依赖 broker 接 device data，
 *      而是 cron 维护 DeviceDailyActivity 表健康（V0.2.143 recordDeviceDailyActivity 写路径独立可用）
 *
 * 详见 V0.2.151 commit + memory mosquitto-5x-debug-root-cause.md
 */
import { prisma } from '../infra/prisma.js';
import { logger } from '../common/logger.js';

export interface DevicePollCleanupJobData {}

/** 90 天阈值（GDPR 数据保留期 + V0.2.151 决策） */
const RETENTION_DAYS = 90;

export async function processDevicePollCleanup(): Promise<{
  cutoff: Date;
  deletedCount: number;
}> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
  const result = await prisma.deviceDailyActivity.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  if (result.count > 0) {
    logger.info(
      { cutoff: cutoff.toISOString(), deletedCount: result.count, retentionDays: RETENTION_DAYS },
      'device-poll cleanup deleted old DeviceDailyActivity',
    );
  }
  return { cutoff, deletedCount: result.count };
}