/**
 * wallet service 单元测试（使用共享 helpers + fixtures 重构版）
 *
 * 覆盖：
 * - get：自动建空钱包 + 序列化
 * - transactions：分页 + 序列化金额
 * - recharge：V1.0 强制 featureDisabled
 * - consumeInTx：余额不足 / 钱包冻结 / 正常扣减
 *
 * ensureWallet 已迁出到 wallet.repo.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPrismaMock } from '../../helpers/mockPrisma.js';
import { mockErrors } from '../../helpers/mockErrors.js';

// 注意：vi.hoisted 在所有 import 之前执行，但 vitest 自动 hoist 顶部 import 的函数引用，
// 所以 createPrismaMock 在这里可用。
const mocks = vi.hoisted(() => {
  // 重新 require 以确保 hoist 顺序正确
  const helpers = require('../../helpers/mockPrisma.ts') as typeof import('../../helpers/mockPrisma.js');
  return helpers.createPrismaMock({
    models: ['wallet', 'walletTransaction'],
    txModels: ['wallet', 'walletTransaction'],
  });
});

vi.mock('src/infra/prisma.js', () => ({ prisma: mocks.prisma }));
vi.mock('src/common/errors.js', () => ({ Errors: mockErrors }));

import { walletService } from '../../../src/modules/wallet/wallet.service.js';

beforeEach(() => {
  vi.clearAllMocks();
  // $transaction 重新绑定（clearAllMocks 会清掉 mockImplementation）
  mocks.prisma.$transaction.mockImplementation((fn: (t: typeof mocks.tx) => unknown) => fn(mocks.tx));
});

describe('walletService.get', () => {
  it('已存在钱包：直接返回序列化结果', async () => {
    mocks.prisma.wallet.findUnique.mockResolvedValue({
      id: 'w1',
      userId: 'u1',
      balance: { toString: () => '100.50' } as unknown as number,
      status: 'active',
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const result = await walletService.get('u1');
    expect(result).toEqual({
      balance: '100.50',
      status: 'active',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('不存在钱包：自动建空钱包', async () => {
    mocks.prisma.wallet.findUnique.mockResolvedValue(null);
    mocks.prisma.wallet.create.mockResolvedValue({
      id: 'w2',
      userId: 'u1',
      balance: 0,
      status: 'active',
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const result = await walletService.get('u1');
    expect(mocks.prisma.wallet.create).toHaveBeenCalledWith({
      data: { userId: 'u1', balance: 0, status: 'active' },
    });
    expect(result.balance).toBe('0');
  });
});

describe('walletService.transactions', () => {
  it('分页：page=2 pageSize=10 → skip=10 take=10', async () => {
    mocks.prisma.wallet.findUnique.mockResolvedValue({ id: 'w1', userId: 'u1' });
    mocks.prisma.walletTransaction.findMany.mockResolvedValue([
      {
        id: 't1',
        userId: 'u1',
        walletId: 'w1',
        type: 'recharge',
        amount: { toString: () => '50' } as unknown as number,
        createdAt: new Date('2026-01-02T00:00:00Z'),
        orderId: null,
        wxTransactionId: null,
        status: 'success',
      },
    ]);
    mocks.prisma.walletTransaction.count.mockResolvedValue(25);

    const result = await walletService.transactions('u1', { page: 2, pageSize: 10 });
    expect(mocks.prisma.walletTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    expect(result.total).toBe(25);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(10);
    expect(result.list[0].amount).toBe('50');
  });
});

describe('walletService.recharge', () => {
  it('V1.0 强制 featureDisabled(payment)', async () => {
    await expect(
      walletService.recharge('u1', { amount: 100, channel: 'wxpay' } as never),
    ).rejects.toThrow(/payment/);
  });
});

describe('walletService.consumeInTx', () => {
  it('钱包不存在 → notFound', async () => {
    mocks.tx.wallet.findUnique.mockResolvedValue(null);
    await expect(
      walletService.consumeInTx(mocks.tx as never, 'u1', 10, 'consume'),
    ).rejects.toThrow(/wallet not found/);
  });

  it('钱包冻结 → forbidden', async () => {
    mocks.tx.wallet.findUnique.mockResolvedValue({
      id: 'w1',
      userId: 'u1',
      balance: 100,
      status: 'frozen',
    });
    await expect(
      walletService.consumeInTx(mocks.tx as never, 'u1', 10, 'consume'),
    ).rejects.toThrow(/wallet frozen/);
  });

  it('余额不足 → badRequest', async () => {
    mocks.tx.wallet.findUnique.mockResolvedValue({
      id: 'w1',
      userId: 'u1',
      balance: 5,
      status: 'active',
    });
    // 条件扣减：余额不足 → updateMany 命中 0 行
    mocks.tx.wallet.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      walletService.consumeInTx(mocks.tx as never, 'u1', -10, 'consume'),
    ).rejects.toThrow(/余额不足/);
  });

  it('正常扣减：原子 decrement + create transaction', async () => {
    mocks.tx.wallet.findUnique.mockResolvedValue({
      id: 'w1',
      userId: 'u1',
      balance: 100,
      status: 'active',
    });
    mocks.tx.wallet.updateMany.mockResolvedValue({ count: 1 });
    await walletService.consumeInTx(mocks.tx as never, 'u1', -30, 'consume', 'o1', 'wx-1');
    // 扣减走条件 updateMany + 原子 increment（负数），不再读改写覆盖
    expect(mocks.tx.wallet.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', balance: { gte: 30 } },
      data: { balance: { increment: -30 } },
    });
    expect(mocks.tx.walletTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        walletId: 'w1',
        type: 'consume',
        amount: -30,
        orderId: 'o1',
        wxTransactionId: 'wx-1',
        status: 'success',
      }),
    });
  });
});
