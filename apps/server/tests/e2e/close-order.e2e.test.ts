/**
 * 超时关单 e2e（真 PG/Redis）
 *
 * 覆盖：
 * ① processCloseOrder 真正改 order.status=pending_pay → cancelled（真 DB）
 * ② 已 paid 订单 → skip（return closed=false）
 * ③ 订单不存在 → skip（return closed=false, reason=not_found）
 * ④ enqueueCloseOrder 真的把 job 入了 BullMQ（用 closeOrderQueue.getJob() 验证 jobId 存在）
 *
 * 不起 BullMQ worker（与 server.ts 抢队列）；队列接口契约单独验证
 *
 * 跑法：RUN_E2E=1 pnpm test
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { prisma } from '../../src/infra/prisma.js';
import { processCloseOrder } from '../../src/jobs/close-order.job.js';
import { enqueueCloseOrder, closeOrderQueue } from '../../src/jobs/queue.js';

const E2E_OPENID_PREFIX = 'e2e-close-';
const E2E_PRODUCT_ID = 'e2e-close-product-1';

const skip = !process.env.RUN_E2E;
const itE2E = skip ? it.skip : it;

describe.skipIf(skip)('超时关单 e2e（真 PG/Redis）', () => {
  const orderIdsToCleanup: string[] = [];
  const userIdsToCleanup: string[] = [];

  beforeAll(async () => {
    // 准备 product
    await prisma.product.upsert({
      where: { id: E2E_PRODUCT_ID },
      create: {
        id: E2E_PRODUCT_ID,
        name: 'e2e close-order 商品',
        category: 'cat-e2e',
        price: 10 as never,
        images: [],
        stock: 100,
        status: 'on',
        sort: 0,
      },
      update: { status: 'on' },
    });
  });

  afterAll(async () => {
    // 清理
    for (const id of orderIdsToCleanup) {
      await prisma.orderItem.deleteMany({ where: { orderId: id } });
      await prisma.order.delete({ where: { id } }).catch(() => {});
    }
    for (const id of userIdsToCleanup) {
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }
    await prisma.product.delete({ where: { id: E2E_PRODUCT_ID } }).catch(() => {});
  });

  // 每个测试前/后清理对应 BullMQ job（避免测试间 jobId 冲突）
  afterEach(async () => {
    for (const id of orderIdsToCleanup) {
      const job = await closeOrderQueue.getJob(`close-${id}`).catch(() => null);
      if (job) await job.remove().catch(() => {});
    }
  });

  /**
   * Helper: 创建 1 用户 + 1 订单（指定 status）
   * 返回 { userId, orderId }
   */
  async function createOrderWithStatus(
    status: 'pending_pay' | 'paid' | 'cancelled',
    suffix: string,
  ): Promise<{ userId: string; orderId: string }> {
    const openid = `${E2E_OPENID_PREFIX}${suffix}`;
    const user = await prisma.user.create({
      data: { openid, nickname: `e2e-close-${suffix}` },
    });
    userIdsToCleanup.push(user.id);
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        items: {
          create: [
            { productId: E2E_PRODUCT_ID, name: 'e2e close-order 商品', price: 10 as never, qty: 1 },
          ],
        },
        totalAmount: 10 as never,
        payAmount: 10 as never,
        pointsUsed: 0,
        status,
        payChannel: 'wxpay',
      },
    });
    orderIdsToCleanup.push(order.id);
    return { userId: user.id, orderId: order.id };
  }

  itE2E('pending_pay 订单 → processCloseOrder 后 status=cancelled', async () => {
    const { orderId } = await createOrderWithStatus('pending_pay', 'pending-1');
    const result = await processCloseOrder({ orderId });
    expect(result).toEqual({ orderId, closed: true, reason: 'timeout' });

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('cancelled');
  });

  itE2E('paid 订单 → processCloseOrder skip（return closed=false, reason=not_pending_pay(paid)）', async () => {
    const { orderId } = await createOrderWithStatus('paid', 'paid-1');
    const result = await processCloseOrder({ orderId });
    expect(result.closed).toBe(false);
    expect(result.reason).toBe('not_pending_pay(paid)');

    // 状态不变
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('paid');
  });

  itE2E('cancelled 订单 → processCloseOrder skip（幂等）', async () => {
    const { orderId } = await createOrderWithStatus('cancelled', 'cancelled-1');
    const result = await processCloseOrder({ orderId });
    expect(result.closed).toBe(false);
    expect(result.reason).toBe('not_pending_pay(cancelled)');
  });

  itE2E('订单不存在 → skip（不抛错）', async () => {
    const result = await processCloseOrder({ orderId: 'non-existent-order-id' });
    expect(result).toEqual({
      orderId: 'non-existent-order-id',
      closed: false,
      reason: 'not_found',
    });
  });

  itE2E('enqueueCloseOrder 真的把 job 入了 BullMQ（jobId=`close-{orderId}`）', async () => {
    const { orderId } = await createOrderWithStatus('pending_pay', 'enqueue-1');

    // 短 delay 入队（测试完不需要等 30 分钟）
    const job = await enqueueCloseOrder(orderId, 100);
    expect(job.id).toBe(`close-${orderId}`);
    expect(job.data).toEqual({ orderId });

    // 用 queue API 验证 job 真存在
    const fetched = await closeOrderQueue.getJob(`close-${orderId}`);
    expect(fetched).toBeTruthy();
    expect(fetched?.id).toBe(`close-${orderId}`);
    expect(fetched?.data).toEqual({ orderId });

    // 测试结束前清理
    await fetched?.remove().catch(() => {});
  });
});
