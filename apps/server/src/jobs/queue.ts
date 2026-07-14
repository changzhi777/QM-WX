/**
 * jobs/queue.ts — BullMQ 队列 + Worker 集中管理
 *
 * 当前队列：
 * - weekly-report：周报自动生成（每周日 20:00 触发）
 * - close-order：超时关单（订单创建后 30 分钟触发）
 * - refresh-certs：微信平台证书刷新（12h）
 * - garmin-import：佳明活动导入
 * - ludong-sync：律动 outbox 投递（5min,LUDONG_SYNC_ENABLED=true 时启用）
 *
 * 未来扩展：
 * - email-notify：邮件通知
 * - image-render：战报图生成
 */
import { Queue, Worker, type Processor, type Job } from 'bullmq';
import { redis } from '../infra/redis.js';
import { env } from '../config/env.js';
import { processWeeklyReport } from './weekly-report.job.js';
import { processCloseOrder, type CloseOrderJobData } from './close-order.job.js';
import { processRefreshPlatformCerts } from './refresh-certs.job.js';
import { processGarminImport, type GarminImportJobData } from './garmin-import.job.js';
import { processLudongSync } from './ludong-sync.job.js';
import { processUploadParse, type UploadParseJobData } from './upload-parse.job.js';
import { logger } from '../common/logger.js';

const QUEUE_PREFIX = 'qmwx';

/** 超时关单默认 delay（毫秒）— 30 分钟 */
export const CLOSE_ORDER_DELAY_MS = 30 * 60 * 1000;

/** 平台证书刷新周期（毫秒）— 12 小时 */
export const REFRESH_CERTS_EVERY_MS = 12 * 60 * 60 * 1000;

/** 律动 outbox 投递周期（毫秒）— 5 分钟 */
export const LUDONG_SYNC_EVERY_MS = 5 * 60 * 1000;

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

export const refreshCertsQueue = new Queue('refresh-certs', {
  connection: redis,
  prefix: QUEUE_PREFIX,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 60_000 },
    removeOnComplete: { count: 20, age: 7 * 86400 },
    removeOnFail: { count: 50, age: 7 * 86400 },
  },
});

export const garminImportQueue = new Queue('garmin-import', {
  connection: redis,
  prefix: QUEUE_PREFIX,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 5_000 },
    removeOnComplete: { count: 200, age: 86400 },
    removeOnFail: { count: 500, age: 7 * 86400 },
  },
});

export const ludongSyncQueue = new Queue('ludong-sync', {
  connection: redis,
  prefix: QUEUE_PREFIX,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 60_000 },
    removeOnComplete: { count: 200, age: 86400 },
    removeOnFail: { count: 500, age: 7 * 86400 },
  },
});

export const uploadParseQueue = new Queue('upload-parse', {
  connection: redis,
  prefix: QUEUE_PREFIX,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 5_000 },
    removeOnComplete: { count: 500, age: 86400 },
    removeOnFail: { count: 1000, age: 7 * 86400 },
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
  startWorker('weekly-report', async (job: Job) => {
    const { groupId, period } = job.data as { groupId?: string; period?: string };
    return processWeeklyReport({ groupId, period });
  }, 2);

  startWorker('close-order', async (job: Job) => {
    return processCloseOrder(job.data as CloseOrderJobData);
  }, 4);

  startWorker('refresh-certs', async () => {
    return processRefreshPlatformCerts();
  }, 1);

  startWorker('garmin-import', async (job: Job) => {
    return processGarminImport(job.data as GarminImportJobData);
  }, 2);

  startWorker('ludong-sync', async () => {
    return processLudongSync();
  }, 1);

  startWorker('upload-parse', async (job: Job) => {
    return processUploadParse(job.data as UploadParseJobData);
  }, 2);
}

/** 优雅关闭 */
export async function stopWorkers() {
  await Promise.all(workers.map((w) => w.close()));
  await Promise.all([
    weeklyReportQueue.close(),
    closeOrderQueue.close(),
    refreshCertsQueue.close(),
    garminImportQueue.close(),
    ludongSyncQueue.close(),
  ]);
}

/** 微信支付是否已配置齐全（拉取平台证书所需） */
function wxpayConfigured(): boolean {
  return Boolean(
    env.WX_MCH_ID && env.WX_PAY_KEY && env.WX_MCH_SERIAL_NO && env.WX_MCH_PRIVATE_KEY_PATH,
  );
}

/**
 * 注册平台证书刷新的 12h repeatable job（仅在微信支付配置齐全时）。
 * BullMQ 用 repeat key 去重，重复注册不会叠加。
 */
async function scheduleRefreshCerts() {
  if (env.NODE_ENV === 'test' || !wxpayConfigured()) {
    logger.info('refresh-certs scheduler skipped (test env or wxpay not configured)');
    return;
  }
  await refreshCertsQueue.add(
    'refresh',
    {},
    { repeat: { every: REFRESH_CERTS_EVERY_MS }, jobId: 'cert-refresh' },
  );
  // 启动时立即拉一次，确保证书缓存预热（不阻塞启动）
  await refreshCertsQueue.add('refresh-now', {});
  logger.info('refresh-certs scheduler registered (every 12h)');
}

/**
 * 注册律动 outbox 投递的 5min repeatable job。
 * 仅在 LUDONG_SYNC_ENABLED=true 时注册；否则不投递（worker 仍空跑但 flushOutbox 直接返回 0）。
 */
async function scheduleLudongSync() {
  if (env.NODE_ENV === 'test') {
    logger.info('ludong-sync scheduler skipped (test env)');
    return;
  }
  if (!env.LUDONG_SYNC_ENABLED) {
    logger.info('ludong-sync scheduler skipped (LUDONG_SYNC_ENABLED=false)');
    return;
  }
  await ludongSyncQueue.add(
    'sync',
    {},
    { repeat: { every: LUDONG_SYNC_EVERY_MS }, jobId: 'ludong-sync-repeat' },
  );
  // 启动时立即投一次（防止上次宕机期间积压）
  await ludongSyncQueue.add('sync-now', {});
  logger.info({ everyMs: LUDONG_SYNC_EVERY_MS }, 'ludong-sync scheduler registered');
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

/** 工具：手动触发一次平台证书刷新（admin / 运维 / 测试用） */
export async function enqueueRefreshCerts() {
  return refreshCertsQueue.add('refresh-now', {});
}

/**
 * 工具：入队佳明活动导入（device.importToCheckin 调用）
 *
 * jobId 用 userId + activityIds 排序 hash + 5 分钟桶 去重（同批短时重复入队只跑一次）
 */
export async function enqueueGarminImport(data: GarminImportJobData) {
  const dedupeKey = `${data.userId}-${data.activityIds.slice().sort().join(',')}`;
  return garminImportQueue.add('import', data, {
    jobId: `${dedupeKey}-${Math.floor(Date.now() / 300_000)}`,
  });
}

/** 工具：手动触发一次律动 outbox 投递（admin / 运维用,不等 5min tick） */
export async function enqueueLudongSync() {
  return ludongSyncQueue.add('sync-now', {});
}

/**
 * 工具：入队上传文件解析（upload-record.service.createUploadRecord 调用）
 * jobId 用 recordId：保证幂等（同 record 多次入队只跑一次）
 */
export async function enqueueUploadParse(recordId: string) {
  return uploadParseQueue.add('parse', { recordId }, { jobId: `parse-${recordId}` });
}

// ===== 启动 / 关闭集成 =====
let started = false;
let schedulerHandle: NodeJS.Timeout | null = null;

import { runWeeklyReportScheduler, runDailyReportScheduler } from './scheduler.js';

export async function startJobs() {
  if (started) return;
  started = true;

  startWorkers();
  // cron 调度：每分钟检查一次（cheap），到点入队
  schedulerHandle = setInterval(() => {
    runWeeklyReportScheduler(env.NODE_ENV === 'production').catch((err) => {
      logger.error({ err }, 'weekly-report scheduler tick failed');
    });
    runDailyReportScheduler(env.NODE_ENV === 'production').catch((err) => {
      logger.error({ err }, 'daily-report scheduler tick failed');
    });
  }, 60_000);
  // 启动时也跑一次（防止上次宕机错过）
  runWeeklyReportScheduler(false).catch(() => {});
  runDailyReportScheduler(false).catch(() => {});
  // 平台证书刷新（12h repeatable + 启动预热）
  scheduleRefreshCerts().catch((err) => {
    logger.error({ err }, 'schedule refresh-certs failed');
  });
  // 律动 outbox 投递（5min repeatable + 启动预热）
  scheduleLudongSync().catch((err) => {
    logger.error({ err }, 'schedule ludong-sync failed');
  });
  logger.info('jobs system started');
}

export async function stopJobs() {
  if (schedulerHandle) clearInterval(schedulerHandle);
  await stopWorkers();
  started = false;
}
