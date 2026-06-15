/**
 * order.service 单元测试
 *
 * 重点：积分兑换双态逻辑（02 §5.4）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('src/infra/prisma.js', () => {
  // 事务内复用顶级 mock
  const userMethods = { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), updateMany: vi.fn() };
  const pointsRecordMethods = { create: vi.fn() };
  const orderMethods = {
    create: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
  };
  const txMock = {
    order: orderMethods,
    user: userMethods,
    pointsRecord: pointsRecordMethods,
  };
  return {
    prisma: {
      product: { findMany: vi.fn() },
      order: orderMethods,
      appConfig: { findMany: vi.fn(), findUnique: vi.fn() },
      user: userMethods,
      pointsRecord: pointsRecordMethods,
      $transaction: vi.fn((fn) => fn(txMock)),
      _tx: txMock,
    },
  };
});

// 队列 mock：单元测试不依赖 Redis/BullMQ（pending_pay 单会入队超时关单）
vi.mock('src/jobs/queue.js', () => ({ enqueueCloseOrder: vi.fn() }));

import { prisma } from 'src/infra/prisma.js';
import { orderService } from 'src/modules/mall/order.service.js';

const mockedPrisma = vi.mocked(prisma);
const tx = (prisma as unknown as { _tx: unknown })._tx as {
  order: { create: ReturnType<typeof vi.fn> };
  pointsRecord: { create: ReturnType<typeof vi.fn> };
  user: {
    findUniqueOrThrow: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedPrisma.appConfig.findMany.mockResolvedValue([]);
  // featureFlags 默认 payment=false（configRepo 内存兜底）
  // addPoints 内部默认值：扣减条件更新成功 + 读最新积分快照（各用例可覆盖）
  tx.user.updateMany.mockResolvedValue({ count: 1 } as never);
  tx.user.findUniqueOrThrow.mockResolvedValue({ points: 0, stats: {} } as never);
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
    tx.user.findUniqueOrThrow.mockResolvedValue({ points: 20000, stats: {} } as never);
    tx.user.updateMany.mockResolvedValue({ count: 1 } as never); // 积分扣减条件更新成功

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
  it('pending_pay 订单 → 取消（无积分退还）', async () => {
    mockedPrisma.order.findUnique.mockResolvedValue({
      id: 'o1', userId: 'u1', status: 'pending_pay', pointsUsed: 0,
    } as never);
    await orderService.cancel('u1', 'o1');
    // 状态机放行，order.update 调到 status='cancelled'
    expect(mockedPrisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'cancelled' }) }),
    );
  });

  it('paid 订单 → 不可取消（V1 收紧：必须走 refund 流程）', async () => {
    mockedPrisma.order.findUnique.mockResolvedValue({
      id: 'o1', userId: 'u1', status: 'paid', pointsUsed: 0,
    } as never);
    await expect(orderService.cancel('u1', 'o1')).rejects.toThrow(/illegal_state: paid → cancelled/);
  });

  it('非 pending_pay 状态（shipped）→ 不可取消（状态机白名单拒绝）', async () => {
    mockedPrisma.order.findUnique.mockResolvedValue({
      id: 'o1', userId: 'u1', status: 'shipped', pointsUsed: 0,
    } as never);

    await expect(orderService.cancel('u1', 'o1')).rejects.toThrow(
      /illegal_state: shipped → cancelled/,
    );
  });

  it('非本人订单 → 403', async () => {
    mockedPrisma.order.findUnique.mockResolvedValue({
      id: 'o1', userId: 'other', status: 'pending_pay', pointsUsed: 0,
    } as never);

    await expect(orderService.cancel('u1', 'o1')).rejects.toThrow('不是你的订单');
  });
});
