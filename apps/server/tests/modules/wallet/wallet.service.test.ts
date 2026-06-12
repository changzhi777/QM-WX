/**
 * wallet service 单元测试
 *
 * 覆盖：
 * - get：自动建空钱包 + 序列化
 * - transactions：分页 + 序列化金额
 * - recharge：V1.0 强制 featureDisabled
 * - consumeInTx：余额不足 / 钱包冻结 / 正常扣减
 * - ensureWallet：已存在 vs 新建
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const walletMethods = {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  const walletTxMethods = {
    findUnique: vi.fn(),
    update: vi.fn(),
  };
  const walletTransactionMethods = {
    findMany: vi.fn(),
    count: vi.fn(),
  };
  const txMethods = {
    wallet: walletTxMethods,
    walletTransaction: { create: vi.fn() },
  };
  const txMock = vi.fn((fn: (tx: typeof txMethods) => unknown) => fn(txMethods));
  return {
    walletMethods,
    walletTxMethods,
    walletTransactionMethods,
    txMethods,
    txMock,
  };
});

vi.mock('src/infra/prisma.js', () => ({
  prisma: {
    wallet: mocks.walletMethods,
    walletTransaction: mocks.walletTransactionMethods,
    $transaction: mocks.txMock,
    _tx: mocks.txMethods,
  },
}));

vi.mock('src/common/errors.js', () => ({
  Errors: {
    featureDisabled: (f: string) => {
      const e = new Error(`feature ${f}`) as Error & { code: number; statusCode: number };
      e.code = 403;
      e.statusCode = 403;
      return e;
    },
    notFound: (msg: string) => {
      const e = new Error(msg) as Error & { code: number; statusCode: number };
      e.code = 404;
      e.statusCode = 404;
      return e;
    },
    forbidden: (msg: string) => {
      const e = new Error(msg) as Error & { code: number; statusCode: number };
      e.code = 403;
      e.statusCode = 403;
      return e;
    },
    badRequest: (msg: string) => {
      const e = new Error(msg) as Error & { code: number; statusCode: number };
      e.code = 400;
      e.statusCode = 400;
      return e;
    },
  },
}));

import { walletService } from '../../../src/modules/wallet/wallet.service.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('walletService.get', () => {
  it('已存在钱包：直接返回序列化结果', async () => {
    mocks.walletMethods.findUnique.mockResolvedValue({
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
    mocks.walletMethods.findUnique.mockResolvedValue(null);
    mocks.walletMethods.create.mockResolvedValue({
      id: 'w2',
      userId: 'u1',
      balance: 0,
      status: 'active',
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const result = await walletService.get('u1');
    expect(mocks.walletMethods.create).toHaveBeenCalledWith({
      data: { userId: 'u1', balance: 0, status: 'active' },
    });
    expect(result.balance).toBe('0');
  });
});

describe('walletService.transactions', () => {
  it('分页：page=2 pageSize=10 → skip=10 take=10', async () => {
    mocks.walletMethods.findUnique.mockResolvedValue({ id: 'w1', userId: 'u1' });
    mocks.walletTransactionMethods.findMany.mockResolvedValue([
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
    mocks.walletTransactionMethods.count.mockResolvedValue(25);

    const result = await walletService.transactions('u1', { page: 2, pageSize: 10 });
    expect(mocks.walletTransactionMethods.findMany).toHaveBeenCalledWith(
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
    ).rejects.toThrow(/feature payment/);
  });
});

describe('walletService.consumeInTx', () => {
  it('钱包不存在 → notFound', async () => {
    mocks.walletTxMethods.findUnique.mockResolvedValue(null);
    await expect(
      walletService.consumeInTx(mocks.txMethods as never, 'u1', 10, 'consume'),
    ).rejects.toThrow(/wallet not found/);
  });

  it('钱包冻结 → forbidden', async () => {
    mocks.walletTxMethods.findUnique.mockResolvedValue({
      id: 'w1',
      userId: 'u1',
      balance: 100,
      status: 'frozen',
    });
    await expect(
      walletService.consumeInTx(mocks.txMethods as never, 'u1', 10, 'consume'),
    ).rejects.toThrow(/wallet frozen/);
  });

  it('余额不足 → badRequest', async () => {
    mocks.walletTxMethods.findUnique.mockResolvedValue({
      id: 'w1',
      userId: 'u1',
      balance: 5,
      status: 'active',
    });
    await expect(
      walletService.consumeInTx(mocks.txMethods as never, 'u1', -10, 'consume'),
    ).rejects.toThrow(/余额不足/);
  });

  it('正常扣减：update + create transaction', async () => {
    mocks.walletTxMethods.findUnique.mockResolvedValue({
      id: 'w1',
      userId: 'u1',
      balance: 100,
      status: 'active',
    });
    await walletService.consumeInTx(mocks.txMethods as never, 'u1', -30, 'consume', 'o1', 'wx-1');
    expect(mocks.walletTxMethods.update).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { balance: 70 },
    });
    expect(mocks.txMethods.walletTransaction.create).toHaveBeenCalledWith({
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

describe('walletService.ensureWallet', () => {
  it('已存在 → 不创建', async () => {
    mocks.walletMethods.findUnique.mockResolvedValue({ id: 'w1' });
    const result = await walletService.ensureWallet('u1');
    expect(result).toEqual({ id: 'w1' });
    expect(mocks.walletMethods.create).not.toHaveBeenCalled();
  });

  it('不存在 → 创建', async () => {
    mocks.walletMethods.findUnique.mockResolvedValue(null);
    mocks.walletMethods.create.mockResolvedValue({ id: 'w2' });
    const result = await walletService.ensureWallet('u1');
    expect(mocks.walletMethods.create).toHaveBeenCalledWith({
      data: { userId: 'u1', balance: 0, status: 'active' },
    });
    expect(result).toEqual({ id: 'w2' });
  });
});
