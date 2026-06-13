/**
 * jobs/queue.ts — BullMQ 队列 + Worker 集中管理
 *
 * 当前队列：
 * - weekly-report：周报自动生成（每周日 20:00 触发）
 * - close-order：超时关单（订单创建后 30 分钟触发）
 *
 * 未来扩展：
 * - email-notify：邮件通知
 * - image-render：战报图生成
 * - ludong-sync：律动 outbox 投递
 */
import { Queue, Worker, type Processor } from 'bullmq';
import { redis } from '../infra/redis.js';
import { env } from '../config/env.js';
import { processWeeklyReport } from './weekly-report.job.js';
import { processCloseOrder, type CloseOrderJobData } from './close-order.job.js';
import { logger } from '../common/logger.js';

const QUEUE_PREFIX = 'qmwx';

/** 超时关单默认 delay（毫秒）— 30 分钟 */
export const CLOSE_ORDER_DELAY_MS = 30 * 60 * 1000;

// ===== 队列定义 =====
export const weeklyReportQueue = new Queue('weekly-report', {
  connection: redis,
  prefix: QUEUE_PREFIX,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 60_000 },
    removeOnComplete: { count: 50, age: 7 * 86400 },
    removeOnFail: { count: 100, age: 7 * 86400 },
  },
});

export const closeOrderQueue = new Queue('close-order', {
  connection: redis,
  prefix: QUEUE_PREFIX,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 30_000 },
    removeOnComplete: { count: 200, age: 86400 },
    removeOnFail: { count: 500, age: 7 * 86400 },
  },
});

// ===== Worker 集合 =====
const workers: Worker[] = [];

function startWorker<T>(name: string, processor: Processor<T>, concurrency = 1) {
  const w = new Worker<T>(name, processor, {
    connection: redis,
    prefix: QUEUE_PREFIX,
    concurrency,
  });
  w.on('completed', (job) => {
    logger.info({ jobId: job.id, name }, 'job completed');
  });
  w.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, name, err: err.message }, 'job failed');
  });
  workers.push(w);
  logger.info({ name, concurrency }, 'worker started');
  return w;
}

/** 启动所有 worker（应用启动时调用） */
export function startWorkers() {
  startWorker('weekly-report', async (job) => {
    const { groupId, period } = job.data as { groupId?: string; period?: string };
    return processWeeklyReport({ groupId, period });
  }, 2);

  startWorker('close-order', async (job) => {
    return processCloseOrder(job.data as CloseOrderJobData);
  }, 4);
}

/** 优雅关闭 */
export async function stopWorkers() {
  await Promise.all(workers.map((w) => w.close()));
  await Promise.all([weeklyReportQueue.close(), closeOrderQueue.close()]);
}

/** 工具：手动 trigger 周报（admin endpoint / 测试用） */
export async function enqueueWeeklyReport(data: { groupId?: string; period?: string } = {}) {
  return weeklyReportQueue.add('generate', data, {
    // 去重：5 分钟内同 groupId+period 不重复入队
    jobId: `${data.groupId ?? 'all'}-${data.period ?? 'current'}-${Math.floor(Date.now() / 300_000)}`,
  });
}

/** 工具：入队超时关单（mall/order.service.create 调用） */
export async function enqueueCloseOrder(orderId: string, delayMs = CLOSE_ORDER_DELAY_MS) {
  return closeOrderQueue.add(
    'close',
    { orderId },
    {
      delay: delayMs,
      // 用 orderId 作 jobId：保证幂等（同订单多次入队只一个真跑）
      jobId: `close-${orderId}`,
    },
  );
}

// ===== 启动 / 关闭集成 =====
let started = false;
let schedulerHandle: NodeJS.Timeout | null = null;

import { runWeeklyReportScheduler } from './scheduler.js';

export async function startJobs() {
  if (started) return;
  started = true;

  startWorkers();
  // cron 调度：每分钟检查一次（cheap），到点入队
  schedulerHandle = setInterval(() => {
    runWeeklyReportScheduler(env.NODE_ENV === 'production').catch((err) => {
      logger.error({ err }, 'weekly-report scheduler tick failed');
    });
  }, 60_000);
  // 启动时也跑一次（防止上次宕机错过）
  runWeeklyReportScheduler(false).catch(() => {});
  logger.info('jobs system started');
}

export async function stopJobs() {
  if (schedulerHandle) clearInterval(schedulerHandle);
  await stopWorkers();
  started = false;
}
