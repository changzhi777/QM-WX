/**
 * close-order.job 单元测试
 *
 * 覆盖：
 * - 订单不存在 → skip（不抛错）
 * - 订单已 paid → skip（不调 update）
 * - 订单 pending_pay → update status=cancelled
 * - 订单 cancelled → skip（不调 update）
 * - 订单 refunded → skip（不调 update）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPrismaMock } from '../helpers/mockPrisma.js';

const mocks = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const helpers = require('../helpers/mockPrisma.ts') as typeof import('../helpers/mockPrisma.js');
  return helpers.createPrismaMock({
    models: ['order'],
    txModels: ['order', 'user', 'pointsRecord'],
  });
});

vi.mock('src/infra/prisma.js', () => ({ prisma: mocks.prisma }));
vi.mock('../src/common/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { processCloseOrder } from '../../src/jobs/close-order.job.js';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.order.update.mockResolvedValue({});
  mocks.tx.order.update.mockResolvedValue({});
});

describe('processCloseOrder', () => {
  it('订单不存在 → skip，return closed=false reason=not_found', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(null);
    const result = await processCloseOrder({ orderId: 'order-1' });
    expect(result).toEqual({ orderId: 'order-1', closed: false, reason: 'not_found' });
    expect(mocks.prisma.order.update).not.toHaveBeenCalled();
  });

  it('订单已 paid → skip（不调 update）', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({ id: 'order-1', status: 'paid' });
    const result = await processCloseOrder({ orderId: 'order-1' });
    expect(result.closed).toBe(false);
    expect(result.reason).toBe('not_pending_pay(paid)');
    expect(mocks.prisma.order.update).not.toHaveBeenCalled();
  });

  it('订单已 cancelled → skip（不调 update）', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({ id: 'order-1', status: 'cancelled' });
    const result = await processCloseOrder({ orderId: 'order-1' });
    expect(result.closed).toBe(false);
    expect(result.reason).toBe('not_pending_pay(cancelled)');
    expect(mocks.prisma.order.update).not.toHaveBeenCalled();
  });

  it('订单已 refunded → skip（不调 update）', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({ id: 'order-1', status: 'refunded' });
    const result = await processCloseOrder({ orderId: 'order-1' });
    expect(result.closed).toBe(false);
    expect(mocks.prisma.order.update).not.toHaveBeenCalled();
  });

  it('订单 pending_pay → update status=cancelled', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({ id: 'order-1', status: 'pending_pay' });
    const result = await processCloseOrder({ orderId: 'order-1' });
    expect(result).toEqual({ orderId: 'order-1', closed: true, reason: 'timeout' });
    expect(mocks.tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { status: 'cancelled' },
    });
  });
});
