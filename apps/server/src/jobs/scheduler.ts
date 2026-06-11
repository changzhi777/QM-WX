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
