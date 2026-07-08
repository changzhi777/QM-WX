/**
 * ludong module service — qmwx → 律动出站投递
 *
 * 出站(A:出站到律动):
 * - enqueueInTx: 业务 service 在事务里调,写 SyncOutbox(pending)
 *   保证"业务写库 + outbox 入队"原子性(事务回滚则 outbox 也回滚)
 * - flushOutbox: 读 pending → HMAC-SHA256 签名 → POST 律动 /open/v1/events
 *                → 2xx 置 done / 非 2xx·网络错 retryCount++ + 指数退避 / 超 24h 转 dead
 * - ludong-sync BullMQ job 每 5 分钟调 flushOutbox(见 jobs/ludong-sync.job.ts)
 *
 * 入站(B:律动 → 我方 /webhook/ludong):后续阶段实现(bindAccount 暂留 stub)
 *
 * 契约对齐:律动 api/routers/open_sync.py(POST /open/v1/events,HMAC 验签 + eventId 幂等)。
 * 签名算法与律动 _verify_signature 对称:createHmac('sha256', secret).update(body)。
 */
import { createHmac } from 'node:crypto';

import { prisma } from '../../infra/prisma.js';
import { logger } from '../../common/logger.js';
import { env } from '../../config/env.js';
import { Errors } from '../../common/errors.js';
import type { Prisma } from '@prisma/client';
import type {
  BindLudongInput,
  ListOutboxInput,
  OutboxEventType,
} from './ludong.schema.js';

const LUDONG_OPEN_PATH = '/open/v1/events';
const MAX_RETRY_HOURS_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 50;

/** HMAC-SHA256 签名,header 格式 sha256=<hex>(与律动 open_sync._verify_signature 对称)。 */
function signPayload(body: string, secret: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(body, 'utf8');
  return `sha256=${hmac.digest('hex')}`;
}

/** 指数退避:60s * 2^retryCount,上限 1h。 */
function nextRetryAt(retryCount: number): Date {
  const delayMs = Math.min(60_000 * 2 ** retryCount, 60 * 60_000);
  return new Date(Date.now() + delayMs);
}

export const ludongService = {
  /** 列出 outbox 队列(管理后台用)。 */
  async listOutbox(input: ListOutboxInput) {
    const { status, page, pageSize } = input;
    const where = status ? { status } : {};
    const [list, total] = await Promise.all([
      prisma.syncOutbox.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.syncOutbox.count({ where }),
    ]);
    return { list, total };
  },

  /**
   * 投递 pending 事件到律动。
   * - 只取 nextRetryAt <= now 的 pending(到点的才投)
   * - 逐条 POST 律动 /open/v1/events(带 HMAC 签名)
   * - 2xx → done;非 2xx/网络错 → retryCount++ + 退避;超 24h → dead
   * - LUDONG_SYNC_ENABLED=false 时直接返 0(不投递)
   */
  async flushOutbox(): Promise<{
    flushed: number;
    dead: number;
    failed: number;
  }> {
    if (!env.LUDONG_SYNC_ENABLED) {
      logger.info('ludong-sync skipped (LUDONG_SYNC_ENABLED=false)');
      return { flushed: 0, dead: 0, failed: 0 };
    }

    const now = new Date();
    const pending = await prisma.syncOutbox.findMany({
      where: { status: 'pending', nextRetryAt: { lte: now } },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
    });

    let flushed = 0;
    let dead = 0;
    let failed = 0;
    const url = `${env.LUDONG_BASE_URL.replace(/\/$/, '')}${LUDONG_OPEN_PATH}`;

    for (const item of pending) {
      const eventId = item.id;
      const isStale = now.getTime() - item.createdAt.getTime() > MAX_RETRY_HOURS_MS;

      // 超 24h 重试窗口 → dead(避免无限重试陈旧事件)
      if (isStale) {
        await prisma.syncOutbox.update({
          where: { id: eventId },
          data: { status: 'dead', lastError: 'exceeded 24h retry window' },
        });
        dead++;
        logger.warn({ eventId, type: item.eventType }, 'ludong-sync dead (stale)');
        continue;
      }

      const body = JSON.stringify({
        eventId,
        type: item.eventType,
        data: item.payload,
      });
      const signature = signPayload(body, env.LUDONG_WEBHOOK_SECRET);

      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Ludong-Signature': signature,
          },
          body,
        });

        if (resp.status >= 200 && resp.status < 300) {
          await prisma.syncOutbox.update({
            where: { id: eventId },
            data: { status: 'done', doneAt: new Date() },
          });
          flushed++;
          logger.info(
            { eventId, type: item.eventType, status: resp.status },
            'ludong-sync delivered',
          );
        } else {
          const text = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status}: ${text}`.slice(0, 200));
        }
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        await prisma.syncOutbox.update({
          where: { id: eventId },
          data: {
            retryCount: item.retryCount + 1,
            nextRetryAt: nextRetryAt(item.retryCount),
            lastError: msg,
          },
        });
        logger.warn(
          { eventId, type: item.eventType, err: msg },
          'ludong-sync failed, will retry',
        );
      }
    }

    return { flushed, dead, failed };
  },

  /**
   * 业务 service 在事务里调:写 SyncOutbox(pending)。
   * 必须在 prisma.$transaction 回调里调用,保证业务写库 + outbox 原子性。
   *
   * eventId = SyncOutbox.id(cuid,全局唯一),律动端按此幂等去重。
   */
  async enqueueInTx(
    tx: Prisma.TransactionClient,
    type: OutboxEventType,
    payload: unknown,
  ): Promise<{ eventId: string }> {
    const created = await tx.syncOutbox.create({
      data: {
        eventType: type,
        path: LUDONG_OPEN_PATH,
        payload: payload as Prisma.InputJsonValue,
        status: 'pending',
      },
    });
    return { eventId: created.id };
  },

  /** 绑定律动账号(Phase 7+,暂留 stub)。 */
  async bindAccount(_userId: string, _input: BindLudongInput) {
    throw Errors.notImplemented('bindAccount');
  },

  /** 查绑定状态(暂 stub)。 */
  async bindingStatus(_userId: string) {
    return { bound: false, ludongUserId: null, boundAt: null };
  },
};
