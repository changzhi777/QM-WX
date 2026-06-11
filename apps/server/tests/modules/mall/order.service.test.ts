/**
 * order.service 单元测试
 *
 * 重点：积分兑换双态逻辑（02 §5.4）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/infra/prisma.js', () => {
  const txMock = {
    order: { create: vi.fn() },
    pointsRecord: { create: vi.fn() },
    user: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
  };
  return {
    prisma: {
      product: { findMany: vi.fn() },
      order: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), update: vi.fn() },
      appConfig: { findMany: vi.fn(), findUnique: vi.fn() },
      user: { findUnique: vi.fn() },
      pointsRecord: { create: vi.fn() },
      $transaction: vi.fn((fn) => fn(txMock)),
      _tx: txMock,
    },
  };
});

import { prisma } from '../../src/infra/prisma.js';
import { orderService } from '../../src/modules/mall/order.service.js';

const mockedPrisma = vi.mocked(prisma);
const tx = (prisma as unknown as { _tx: unknown })._tx as {
  order: { create: ReturnType<typeof vi.fn> };
  pointsRecord: { create: ReturnType<typeof vi.fn> };
  user: { findUniqueOrThrow: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  // featureFlags 默认 payment=false（configRepo 内存兜底）
});

describe('orderService.create', () => {
  const USER_ID = 'u1';

  it('部分商品已下架 → 抛错', async () => {
    mockedPrisma.product.findMany.mockResolvedValue([{ id: 'p1', name: 'a', price: 10, status: 'on' }] as never);
    // input 里有 2 个，但只查到 1 个
    await expect(
      orderService.create(USER_ID, {
        items: [{ productId: 'p1', qty: 1 }, { productId: 'p2', qty: 1 }],
      }),
    ).rejects.toThrow('部分商品已下架');
  });

  it('payment=OFF + 积分足额 → 直接 paid + 扣积分', async () => {
    // 2 个商品各 50 元 = 100 元 = 需 10000 积分
    mockedPrisma.product.findMany.mockResolvedValue([
      { id: 'p1', name: 'A', price: 50, status: 'on' },
      { id: 'p2', name: 'B', price: 50, status: 'on' },
    ] as never);
    mockedPrisma.user.findUnique.mockResolvedValue({ points: 20000 } as never);
    tx.order.create.mockResolvedValue({ id: 'o1' } as never);
    tx.user.findUniqueOrThrow.mockResolvedValue({ points: 0, stats: {} } as never);

    const result = await orderService.create(USER_ID, {
      items: [{ productId: 'p1', qty: 1 }, { productId: 'p2', qty: 1 }],
      pointsUsed: 20000,
    });

    expect(result.status).toBe('paid');
    expect(result.payAmount).toBe('0.00');
    expect(result.pointsUsed).toBeGreaterThan(0);
    expect(tx.order.create).toHaveBeenCalled();
  });

  it('payment=OFF + 积分不足 → pending_pay 意向单', async () => {
    mockedPrisma.product.findMany.mockResolvedValue([
      { id: 'p1', name: 'A', price: 100, status: 'on' },
    ] as never);
    mockedPrisma.user.findUnique.mockResolvedValue({ points: 100 } as never);
    tx.order.create.mockResolvedValue({ id: 'o2' } as never);

    const result = await orderService.create(USER_ID, {
      items: [{ productId: 'p1', qty: 1 }],
      pointsUsed: 100, // 只能抵 1 元
    });

    expect(result.status).toBe('pending_pay');
    expect(Number(result.payAmount)).toBeGreaterThan(0);
  });

  it('⚠️ 传超额积分（> 用户余额） → 抛错', async () => {
    mockedPrisma.product.findMany.mockResolvedValue([{ id: 'p1', name: 'A', price: 10, status: 'on' }] as never);
    mockedPrisma.user.findUnique.mockResolvedValue({ points: 5 } as never);

    await expect(
      orderService.create(USER_ID, {
        items: [{ productId: 'p1', qty: 1 }],
        pointsUsed: 1000,
      }),
    ).rejects.toThrow('积分不足');
  });
});

describe('orderService.cancel', () => {
  it('已扣积分的 paid 订单 → 取消时退积分', async () => {
    const order = {
      id: 'o1', userId: 'u1', status: 'paid', pointsUsed: 500,
    };
    mockedPrisma.order.findUnique.mockResolvedValue(order as never);

    await orderService.cancel('u1', 'o1');

    // 退积分 + 改状态
    expect(tx.user.update).toHaveBeenCalled(); // userRepo.addPoints
    expect(tx.order.create).toHaveBeenCalled(); // pointsRecord
    // order 状态置 cancelled
    // 注：这里 addPoints 走 user.update + pointsRecord.create
  });

  it('非 pending/paid 状态 → 不可取消', async () => {
    mockedPrisma.order.findUnique.mockResolvedValue({
      id: 'o1', userId: 'u1', status: 'shipped', pointsUsed: 0,
    } as never);

    await expect(orderService.cancel('u1', 'o1')).rejects.toThrow('不可取消');
  });

  it('非本人订单 → 403', async () => {
    mockedPrisma.order.findUnique.mockResolvedValue({
      id: 'o1', userId: 'other', status: 'paid', pointsUsed: 0,
    } as never);

    await expect(orderService.cancel('u1', 'o1')).rejects.toThrow('不是你的订单');
  });
});
