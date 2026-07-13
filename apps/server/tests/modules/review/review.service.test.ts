/**
 * review.service 单测（V0.1.113 电商评价闭环）
 *
 * 覆盖：create 5 校验 + 成功 / listByProduct / productStats（含缺星补 0）/ myReviews / remove 3
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('src/infra/prisma.js', () => {
  const reviewMethods = {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn(),
  };
  return {
    prisma: {
      review: reviewMethods,
      order: { findUnique: vi.fn() },
      orderItem: { findFirst: vi.fn() },
      shoe: { findFirst: vi.fn() }, // V0.1.137 鞋评校验
    },
  };
});

import { prisma } from 'src/infra/prisma.js';
import { reviewService } from 'src/modules/review/review.service.js';

const mockedPrisma = vi.mocked(prisma);

beforeEach(() => vi.clearAllMocks());

describe('reviewService.create', () => {
  const input = { productId: 'p1', orderId: 'o1', rating: 5, content: '好', images: ['/a.jpg'] };

  it('订单不存在 → notFound', async () => {
    mockedPrisma.order.findUnique.mockResolvedValue(null);
    await expect(reviewService.create('u1', input)).rejects.toThrow('订单不存在');
  });

  it('非本人订单 → forbidden', async () => {
    mockedPrisma.order.findUnique.mockResolvedValue({ id: 'o1', userId: 'other', status: 'paid' } as never);
    await expect(reviewService.create('u1', input)).rejects.toThrow('不是你的订单');
  });

  it('订单未支付（pending_pay）→ badRequest', async () => {
    mockedPrisma.order.findUnique.mockResolvedValue({ id: 'o1', userId: 'u1', status: 'pending_pay' } as never);
    await expect(reviewService.create('u1', input)).rejects.toThrow('订单未支付');
  });

  it('商品不在订单 → badRequest', async () => {
    mockedPrisma.order.findUnique.mockResolvedValue({ id: 'o1', userId: 'u1', status: 'paid' } as never);
    mockedPrisma.orderItem.findFirst.mockResolvedValue(null);
    await expect(reviewService.create('u1', input)).rejects.toThrow('该商品不在此订单');
  });

  it('已评价过 → badRequest（@@unique 兜底前友好报错）', async () => {
    mockedPrisma.order.findUnique.mockResolvedValue({ id: 'o1', userId: 'u1', status: 'done' } as never);
    mockedPrisma.orderItem.findFirst.mockResolvedValue({ id: 'oi1' } as never);
    mockedPrisma.review.findUnique.mockResolvedValue({ id: 'r1' } as never);
    await expect(reviewService.create('u1', input)).rejects.toThrow('已评价过该商品');
  });

  it('成功创建（订单 done）→ { id }', async () => {
    mockedPrisma.order.findUnique.mockResolvedValue({ id: 'o1', userId: 'u1', status: 'done' } as never);
    mockedPrisma.orderItem.findFirst.mockResolvedValue({ id: 'oi1' } as never);
    mockedPrisma.review.findUnique.mockResolvedValue(null);
    mockedPrisma.review.create.mockResolvedValue({ id: 'r1' } as never);

    const result = await reviewService.create('u1', input);
    expect(result).toEqual({ id: 'r1' });
    expect(mockedPrisma.review.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u1', productId: 'p1', orderId: 'o1', rating: 5, content: '好' }),
    });
  });

  it('content/images 缺省 → null / []', async () => {
    mockedPrisma.order.findUnique.mockResolvedValue({ id: 'o1', userId: 'u1', status: 'paid' } as never);
    mockedPrisma.orderItem.findFirst.mockResolvedValue({ id: 'oi1' } as never);
    mockedPrisma.review.findUnique.mockResolvedValue(null);
    mockedPrisma.review.create.mockResolvedValue({ id: 'r2' } as never);

    await reviewService.create('u1', { productId: 'p1', orderId: 'o1', rating: 3 });
    expect(mockedPrisma.review.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ content: null, images: [] }),
    });
  });
});

describe('reviewService.listByProduct', () => {
  it('返列表 + Decimal/Date 序列化 + 分页', async () => {
    mockedPrisma.review.findMany.mockResolvedValue([
      {
        id: 'r1', userId: 'u1', rating: 5, content: '好', images: [],
        createdAt: new Date('2026-07-10T00:00:00Z'),
        user: { id: 'u1', nickname: '张三', avatarUrl: null },
      },
    ] as never);
    mockedPrisma.review.count.mockResolvedValue(1 as never);

    const result = await reviewService.listByProduct('p1', { page: 2, pageSize: 5 });

    expect(result.total).toBe(1);
    expect(result.page).toBe(2);
    expect(result.list[0].createdAt).toBe('2026-07-10T00:00:00.000Z');
    expect(mockedPrisma.review.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { productId: 'p1' },
      skip: 5, // (2-1)*5
      take: 5,
    }));
  });
});

describe('reviewService.productStats', () => {
  it('avg + count + 分布（缺星补 0）', async () => {
    mockedPrisma.review.aggregate.mockResolvedValue({ _avg: { rating: 4.5 }, _count: { rating: 2 } } as never);
    mockedPrisma.review.groupBy.mockResolvedValue([
      { rating: 5, _count: { rating: 1 } },
      { rating: 4, _count: { rating: 1 } },
    ] as never);

    const result = await reviewService.productStats('p1');

    expect(result.avg).toBe(4.5);
    expect(result.count).toBe(2);
    expect(result.distribution).toEqual({ 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 });
  });

  it('无评价 → avg 0 + count 0 + 全 0 分布', async () => {
    mockedPrisma.review.aggregate.mockResolvedValue({ _avg: { rating: null }, _count: { rating: 0 } } as never);
    mockedPrisma.review.groupBy.mockResolvedValue([]);

    const result = await reviewService.productStats('p1');
    expect(result.avg).toBe(0);
    expect(result.count).toBe(0);
    expect(result.distribution).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  });
});

describe('reviewService.myReviews', () => {
  it('返我的评价 + 商品信息', async () => {
    mockedPrisma.review.findMany.mockResolvedValue([
      { id: 'r1', userId: 'u1', rating: 5, content: '好', images: [], createdAt: new Date(), product: { id: 'p1', name: 'T恤', images: ['/t.jpg'] } },
    ] as never);
    mockedPrisma.review.count.mockResolvedValue(1 as never);

    const result = await reviewService.myReviews('u1', { page: 1, pageSize: 10 });
    expect(result.total).toBe(1);
    expect(mockedPrisma.review.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'u1' },
    }));
  });
});

describe('reviewService.remove', () => {
  it('评价不存在 → notFound', async () => {
    mockedPrisma.review.findUnique.mockResolvedValue(null);
    await expect(reviewService.remove('u1', 'r1')).rejects.toThrow('评价不存在');
  });

  it('非本人评价 → forbidden', async () => {
    mockedPrisma.review.findUnique.mockResolvedValue({ id: 'r1', userId: 'other' } as never);
    await expect(reviewService.remove('u1', 'r1')).rejects.toThrow('不是你的评价');
  });

  it('成功删除', async () => {
    mockedPrisma.review.findUnique.mockResolvedValue({ id: 'r1', userId: 'u1' } as never);
    mockedPrisma.review.delete.mockResolvedValue({} as never);

    const result = await reviewService.remove('u1', 'r1');
    expect(result).toEqual({ ok: true });
    expect(mockedPrisma.review.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
  });
});

// ============================================================
// V0.1.137 鞋评
// ============================================================

describe('reviewService.create 鞋评 (V0.1.137)', () => {
  it('鞋属 user → 写库（合成 productId/orderId）', async () => {
    mockedPrisma.shoe.findFirst.mockResolvedValue({ id: 's1' } as never);
    mockedPrisma.review.findUnique.mockResolvedValue(null);
    mockedPrisma.review.create.mockResolvedValue({ id: 'r1' } as never);

    const r = await reviewService.create('u1', {
      targetType: 'shoe',
      targetId: 's1',
      rating: 5,
      content: '战靴一级棒',
    });

    expect(r.id).toBe('r1');
    expect(mockedPrisma.review.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productId: 'shoe:s1',
          orderId: 'shoe:s1',
          content: '[shoe-review] 战靴一级棒',
        }),
      }),
    );
  });

  it('鞋不属 user → notFound', async () => {
    mockedPrisma.shoe.findFirst.mockResolvedValue(null);
    await expect(
      reviewService.create('u1', {
        targetType: 'shoe',
        targetId: 's99',
        rating: 5,
      }),
    ).rejects.toThrow();
  });
});

describe('reviewService.targetStats 鞋评 (V0.1.137)', () => {
  it('targetType=shoe 合成 syntheticId 后查询', async () => {
    mockedPrisma.review.aggregate.mockResolvedValue({
      _avg: { rating: 4.5 },
      _count: { rating: 2 },
    } as never);
    mockedPrisma.review.groupBy.mockResolvedValue([
      { rating: 4, _count: { rating: 1 } },
      { rating: 5, _count: { rating: 1 } },
    ] as never);

    const r = await reviewService.targetStats('s1', 'shoe');
    expect(r.avg).toBe(4.5);
    expect(r.count).toBe(2);
    expect(r.distribution[4]).toBe(1);
    expect(r.distribution[5]).toBe(1);
    // 校验查询用了合成 id
    expect(mockedPrisma.review.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ productId: 'shoe:s1' }) }),
    );
  });
});
