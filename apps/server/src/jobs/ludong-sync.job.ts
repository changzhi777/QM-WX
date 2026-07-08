/**
 * jobs/ludong-sync.job.ts — 律动 outbox 投递 worker
 *
 * 触发:BullMQ repeatable(每 5 分钟)+ 启动预热一次
 * 行为:调 ludongService.flushOutbox() 把 pending SyncOutbox 投递到律动 /open/v1/events
 * 幂等:律动端按 eventId 去重;本端 done/dead 状态防重投
 *
 * 详见 modules/ludong/ludong.service.ts 的 flushOutbox。
 */
import { ludongService } from '../modules/ludong/ludong.service.js';
import { logger } from '../common/logger.js';

export interface LudongSyncJobData {}

export async function processLudongSync(): Promise<{
  flushed: number;
  dead: number;
  failed: number;
}> {
  const result = await ludongService.flushOutbox();
  if (result.flushed || result.dead || result.failed) {
    logger.info(result, 'ludong-sync tick done');
  }
  return result;
}
