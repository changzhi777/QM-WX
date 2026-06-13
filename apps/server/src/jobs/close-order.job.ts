/**
 * jobs/close-order.job.ts — BullMQ delayed job
 *
 * 触发：mall/order.service.create 时入队，30 分钟后触发
 * 行为：若 Order.status 仍为 pending_pay → 标 cancelled + closeReason='timeout'
 * 幂等：notify 路径上 status 校验保证（pending_pay 才会被标 paid）
 *
 * 不调任何外部 API（无退款、无回调）— 纯状态机收尾
 */
import { prisma } from '../infra/prisma.js';
import { logger } from '../common/logger.js';

export interface CloseOrderJobData {
  orderId: string;
}

export async function processCloseOrder(data: CloseOrderJobData): Promise<{
  orderId: string;
  closed: boolean;
  reason: string;
}> {
  const { orderId } = data;
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    logger.warn({ orderId }, 'close-order: order not found, skip');
    return { orderId, closed: false, reason: 'not_found' };
  }
  if (order.status !== 'pending_pay') {
    logger.info(
      { orderId, currentStatus: order.status },
      'close-order: order already settled, skip',
    );
    return { orderId, closed: false, reason: `not_pending_pay(${order.status})` };
  }

  // 状态机：pending_pay → cancelled
  // ⑤统一替换时接 assertTransition（子任务 5 改动）
  await prisma.order.update({
    where: { id: orderId },
    data: { status: 'cancelled' },
  });
  logger.info({ orderId }, 'close-order: order cancelled (timeout)');
  return { orderId, closed: true, reason: 'timeout' };
}
