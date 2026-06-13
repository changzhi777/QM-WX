/**
 * refund service 单测
 *
 * 覆盖：
 * - 订单不存在 → notFound
 * - 订单非 paid 状态 → badRequest
 * - 订单无 wxTransactionId → badRequest（积分单 / 测试单）
 * - amountFen 超 payAmount → badRequest
 * - 微信 refund 失败 → internal，order 状态保持 paid
 * - happy path：调 wxpay + update order=refunded + 写 walletTransaction type=refund
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPrismaMock } from '../../helpers/mockPrisma.js';
import { mockErrors } from '../../helpers/mockErrors.js';

const mocks = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const helpers = require('../../helpers/mockPrisma.ts') as typeof import('../../helpers/mockPrisma.js');
  return helpers.createPrismaMock({
    models: ['order'],
    txModels: ['wallet', 'walletTransaction', 'order'],
  });
});

// mock 整个 wxpay.service（service 内调 wxpayRefund 是 IO，不走真 fetch）
const mockWxpayRefund = vi.hoisted(() => vi.fn());
vi.mock('../../../src/modules/wxpay/wxpay.service.js', () => ({
  refund: mockWxpayRefund,
}));

vi.mock('src/infra/prisma.js', () => ({ prisma: mocks.prisma }));
vi.mock('src/common/errors.js', () => ({ Errors: mockErrors }));

import { refundService } from '../../../src/modules/mall/refund.service.js';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.$transaction.mockImplementation((fn: (t: typeof mocks.tx) => unknown) => fn(mocks.tx));
  mocks.prisma.order.findUnique.mockResolvedValue({
    id: 'order-1',
    userId: 'u1',
    payAmount: 10,
    status: 'paid',
    wxTransactionId: 'wx-txn-001',
  });
  // 默认微信 refund 成功
  mockWxpayRefund.mockResolvedValue({
    refundId: 'wx-refund-001',
    outRefundNo: 'r1',
    outTradeNo: 'order-1',
    transactionId: 'wx-txn-001',
    status: 'SUCCESS',
    amount: { refund: 1000, total: 1000 },
  });
  // tx 行为 stub
  mocks.tx.order.update.mockResolvedValue({});
  mocks.tx.wallet.findUnique.mockResolvedValue({ id: 'w1', balance: 10 });
  mocks.tx.wallet.update.mockResolvedValue({});
  mocks.tx.walletTransaction.create.mockResolvedValue({});
});

describe('refundService.refundOrder', () => {
  it('订单不存在 → notFound', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(null);
    await expect(
      refundService.refundOrder({ orderId: 'xxx', refundedBy: 'admin1' }),
    ).rejects.toThrow(/订单不存在/);
  });

  it('订单非 paid 状态（pending_pay）→ badRequest', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({
      id: 'order-1', userId: 'u1', payAmount: 10, status: 'pending_pay', wxTransactionId: 'wx-1',
    });
    await expect(
      refundService.refundOrder({ orderId: 'order-1', refundedBy: 'admin1' }),
    ).rejects.toThrow(/订单状态 pending_pay 不可退款/);
  });

  it('订单无 wxTransactionId（积分单）→ badRequest', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({
      id: 'order-1', userId: 'u1', payAmount: 10, status: 'paid', wxTransactionId: null,
    });
    await expect(
      refundService.refundOrder({ orderId: 'order-1', refundedBy: 'admin1' }),
    ).rejects.toThrow(/无微信交易号/);
  });

  it('amountFen 超 payAmount → badRequest', async () => {
    await expect(
      refundService.refundOrder({
        orderId: 'order-1',
        amountFen: 2000, // payAmount=10 元 = 1000 分
        refundedBy: 'admin1',
      }),
    ).rejects.toThrow(/必须在.*10/);
  });

  it('微信 refund 失败 → internal，order 状态不变（不进事务）', async () => {
    mockWxpayRefund.mockResolvedValue({
      refundId: 'wx-refund-001',
      status: 'CLOSED', // 失败状态
      amount: { refund: 1000, total: 1000 },
    });
    await expect(
      refundService.refundOrder({ orderId: 'order-1', refundedBy: 'admin1' }),
    ).rejects.toThrow(/微信退款失败/);
    // 关键：$transaction 不该被调
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('happy path：调 wxpay + 事务内 update order=refunded + consumeInTx', async () => {
    // 准备 consumeInTx 路径要查的 wallet
    mocks.tx.wallet.findUnique.mockResolvedValue({ id: 'w1', balance: 10, status: 'active' });
    // 余额变 0
    mocks.tx.wallet.update.mockResolvedValue({ balance: 0, status: 'active' });
    mocks.tx.walletTransaction.create.mockResolvedValue({});

    const result = await refundService.refundOrder({
      orderId: 'order-1',
      refundedBy: 'admin-openid-1',
      reason: '测试退款',
    });

    // wxpay refund 被调（参数正确）
    expect(mockWxpayRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        outTradeNo: 'order-1',
        totalFen: 1000, // payAmount 10 元 → 1000 分
        refundFen: 1000, // 全额
        reason: '测试退款',
      }),
    );

    // 事务内 order.update
    expect(mocks.tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: expect.objectContaining({ status: 'refunded' }),
    });

    // consumeInTx 链路：findUnique + update (绝对值) + create transaction
    expect(mocks.tx.wallet.findUnique).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    // consumeInTx 内 newBalance = 10 + (-10) = 0
    expect(mocks.tx.wallet.update).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { balance: 0 },
    });
    expect(mocks.tx.walletTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        walletId: 'w1',
        type: 'refund',
        amount: -10,
        orderId: 'order-1',
        wxTransactionId: 'wx-refund-001',
        status: 'success',
      }),
    });

    expect(result).toMatchObject({
      orderId: 'order-1',
      refundId: 'wx-refund-001',
      refundYuan: 10,
      status: 'SUCCESS',
      refundedBy: 'admin-openid-1',
    });
  });

  it('部分退款：amountFen=500 → refundFen=500，余额 = 10 + (-5) = 5', async () => {
    mocks.tx.wallet.findUnique.mockResolvedValue({ id: 'w1', balance: 10, status: 'active' });
    await refundService.refundOrder({
      orderId: 'order-1',
      amountFen: 500,
      refundedBy: 'admin1',
    });
    expect(mockWxpayRefund).toHaveBeenCalledWith(
      expect.objectContaining({ refundFen: 500 }),
    );
    // consumeInTx: newBalance = 10 + (-5) = 5
    expect(mocks.tx.wallet.update).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { balance: 5 },
    });
  });
});
