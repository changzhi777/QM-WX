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
      groupBuy: { findUnique: vi.fn() },
      groupBuyMember: { findUnique: vi.fn() },
      $transaction: vi.fn((fn) => fn(txMock)),
      _tx: txMock,
    },
  };
});

// 队列 mock：单元测试不依赖 Redis/BullMQ（pending_pay 单会入队超时关单）
vi.mock('src/jobs/queue.js', () => ({ enqueueCloseOrder: vi.fn() }));

import { prisma } from 'src/infra/prisma.js';
import { orderService, generatePickupCode } from 'src/modules/mall/order.service.js';

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

  it('pending_pay + 已扣积分 → 取消时退积分（addPoints 正数退回）', async () => {
    mockedPrisma.order.findUnique.mockResolvedValue({
      id: 'o1', userId: 'u1', status: 'pending_pay', pointsUsed: 500,
    } as never);

    await orderService.cancel('u1', 'o1');

    // pointsUsed > 0 → addPoints 正数退回走 tx.user.update（increment 500；扣减才走 updateMany 条件防双花）
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' }, data: { points: { increment: 500 } } }),
    );
    expect(mockedPrisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'cancelled' }) }),
    );
  });
});

// ===== V0.1.107 GAP-6 自提核销码 =====

describe('generatePickupCode（V0.1.107 纯函数）', () => {
  it('订单号末 6 位 + 3 位大写字母数字', () => {
    const code = generatePickupCode('clxxxxxxxxxxxxxxxabcd');
    expect(code).toHaveLength(9);
    expect(code).toMatch(/^[A-Z0-9]{9}$/);
    // 末 6 位 = 订单号末 6 位大写
    expect(code.slice(0, 6)).toBe('XXABCD');
  });

  it('3 位随机字符表避开 I/O/0/1（OCR 友好）', () => {
    const codes = Array.from({ length: 100 }, () => generatePickupCode('orderid12345'));
    for (const c of codes) {
      expect(c.slice(6)).not.toMatch(/[IO01]/); // 仅 3 位随机段不含 I/O/0/1
    }
  });

  it('100 次生成唯一性（碰撞概率 < 0.1%）', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generatePickupCode('orderid12345')));
    expect(codes.size).toBeGreaterThan(95);
  });
});

// ===== myOrders（V0.1.112 补：列表 + status 过滤 + 分页）=====

describe('orderService.myOrders', () => {
  it('返列表 + total + Decimal/Date 序列化', async () => {
    mockedPrisma.order.findMany.mockResolvedValue([
      {
        id: 'o1', userId: 'u1', status: 'paid',
        totalAmount: 100, payAmount: 100, pointsUsed: 0,
        payChannel: 'points', createdAt: new Date('2026-07-10T00:00:00Z'),
        items: [],
      },
    ] as never);
    mockedPrisma.order.count.mockResolvedValue(1 as never);

    const result = await orderService.myOrders('u1', { page: 1, pageSize: 10 });

    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
    expect(result.list[0].totalAmount).toBe('100');
    expect(result.list[0].createdAt).toBe('2026-07-10T00:00:00.000Z');
    expect(mockedPrisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'u1' },
      skip: 0,
      take: 10,
    }));
  });

  it('status 过滤 → where 含 status（count 也用同 where，修 N+1 不一致）', async () => {
    mockedPrisma.order.findMany.mockResolvedValue([] as never);
    mockedPrisma.order.count.mockResolvedValue(0 as never);

    await orderService.myOrders('u1', { page: 1, pageSize: 10, status: 'paid' });

    // list 与 count 必须用相同 where（否则 total 与 list 不一致）
    expect(mockedPrisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'u1', status: 'paid' },
    }));
    expect(mockedPrisma.order.count).toHaveBeenCalledWith({ where: { userId: 'u1', status: 'paid' } });
  });

  it('分页 skip = (page-1)*pageSize', async () => {
    mockedPrisma.order.findMany.mockResolvedValue([] as never);
    mockedPrisma.order.count.mockResolvedValue(0 as never);

    await orderService.myOrders('u1', { page: 3, pageSize: 5 });

    expect(mockedPrisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 10, // (3-1) * 5
      take: 5,
    }));
  });
});

// ===== create 团购校验（V0.1.37，校验阶段抛错不触达支付/分销）=====

describe('orderService.create 团购校验', () => {
  it('团购不存在 → notFound', async () => {
    mockedPrisma.groupBuy.findUnique.mockResolvedValue(null);
    await expect(
      orderService.create('u1', { items: [{ productId: 'p1', qty: 1 }], groupBuyId: 'gb-x' }),
    ).rejects.toThrow('团购不存在');
  });

  it('团购未成团（status=active）→ badRequest', async () => {
    mockedPrisma.groupBuy.findUnique.mockResolvedValue({
      id: 'gb1', status: 'active', productId: 'p1', groupPrice: 50,
    } as never);
    await expect(
      orderService.create('u1', { items: [{ productId: 'p1', qty: 1 }], groupBuyId: 'gb1' }),
    ).rejects.toThrow('团购未成团');
  });

  it('未参与团购（member 不存在）→ forbidden', async () => {
    mockedPrisma.groupBuy.findUnique.mockResolvedValue({
      id: 'gb1', status: 'reached', productId: 'p1', groupPrice: 50,
    } as never);
    mockedPrisma.groupBuyMember.findUnique.mockResolvedValue(null);
    await expect(
      orderService.create('u1', { items: [{ productId: 'p1', qty: 1 }], groupBuyId: 'gb1' }),
    ).rejects.toThrow('未参与该团购');
  });

  it('团购商品不匹配（productId != gb.productId）→ badRequest', async () => {
    mockedPrisma.groupBuy.findUnique.mockResolvedValue({
      id: 'gb1', status: 'reached', productId: 'p1', groupPrice: 50,
    } as never);
    mockedPrisma.groupBuyMember.findUnique.mockResolvedValue({ id: 'm1' } as never);
    await expect(
      orderService.create('u1', { items: [{ productId: 'p2', qty: 1 }], groupBuyId: 'gb1' }),
    ).rejects.toThrow('团购订单仅含团购商品');
  });
});
