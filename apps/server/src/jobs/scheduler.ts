/**
 * jobs/scheduler.ts — cron 调度
 *
 * 当前：每周日 20:00（北京时间）触发全量周报生成
 *
 * ⚠️ BullMQ 自带 repeatable jobs，但用 setInterval + 内存判断更简单
 *    且 prod / dev 行为可独立控制
 */
import { weeklyReportQueue } from './queue.js';
import { logger } from '../common/logger.js';

/** 当前时间是否为"周日 20:00 ±1 分钟"（cron tick = 60s） */
function isWeeklyReportTick(now = new Date()): boolean {
  // 北京时间：UTC+8
  const cn = new Date(now.getTime() + 8 * 3600 * 1000);
  const dow = cn.getUTCDay(); // 0=Sun
  const hour = cn.getUTCHours();
  const minute = cn.getUTCMinutes();
  return dow === 0 && hour === 20 && minute < 2;
}

let lastTickDate = '';

export async function runWeeklyReportScheduler(prod: boolean) {
  if (!prod) {
    // dev 模式不自动跑（避免本地误触发）
    return;
  }
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (lastTickDate === today) return; // 今天已跑过
  if (!isWeeklyReportTick(now)) return;

  lastTickDate = today;
  await weeklyReportQueue.add(
    'generate-all',
    { period: 'current' },
    { jobId: `auto-${today}-weekly-report` },
  );
  logger.info({ today }, 'weekly-report auto job enqueued');
}

/** 每日 8:00（北京时间）触发：为活跃用户生成 dailyReport + MQTT 推（C 方案定时推）*/
function isDailyReportTick(now = new Date()): boolean {
  const cn = new Date(now.getTime() + 8 * 3600 * 1000);
  return cn.getUTCHours() === 8 && cn.getUTCMinutes() < 2;
}

let lastDailyTickDate = '';

export async function runDailyReportScheduler(prod: boolean) {
  if (!prod) return;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (lastDailyTickDate === today) return;
  if (!isDailyReportTick(now)) return;
  lastDailyTickDate = today;
  const { prisma } = await import('../infra/prisma.js');
  const { statsService } = await import('../modules/stats/stats.service.js');
  const since = new Date(now.getTime() - 7 * 86400 * 1000);
  // 活跃用户：最近 7 天有微信运动记录
  const activeUsers = await prisma.user.findMany({
    where: { weRunRecords: { some: { createdAt: { gte: since } } } },
    select: { id: true },
  });
  let ok = 0;
  for (const u of activeUsers) {
    try {
      await statsService.dailyReport(u.id, {});
      ok++;
    } catch (e) {
      logger.error({ err: (e as Error).message, userId: u.id }, 'daily-report gen failed');
    }
  }
  logger.info({ total: activeUsers.length, ok }, 'daily-report auto generated + MQTT pushed');
}
