/**
 * cart.service 单测（V0.1.22 B-核心）
 * - add：同商品 upsert 合并 qty / 商品不存在抛错
 * - updateQty：qty<=0 调 remove / qty>0 update
 * - list：join Product + 算合计 + 过滤下架
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('src/infra/prisma.js', () => ({
  prisma: {
    product: { findUnique: vi.fn() },
    cart: { upsert: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  },
}));

import { prisma } from 'src/infra/prisma.js';
import { cartService } from 'src/modules/cart/cart.service.js';

const mockedPrisma = vi.mocked(prisma);

beforeEach(() => vi.clearAllMocks());

describe('cartService.add', () => {
  it('同商品 qty 累加 upsert', async () => {
    mockedPrisma.product.findUnique.mockResolvedValue({ id: 'p1', status: 'on' } as never);
    mockedPrisma.cart.upsert.mockResolvedValue({ productId: 'p1', qty: 3 } as never);

    const r = await cartService.add('u1', { productId: 'p1', qty: 2 });

    expect(r).toEqual({ productId: 'p1', qty: 3 });
    expect(mockedPrisma.cart.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_productId: { userId: 'u1', productId: 'p1' } },
        create: { userId: 'u1', productId: 'p1', qty: 2 },
        update: { qty: { increment: 2 } },
      }),
    );
  });

  it('商品不存在抛错', async () => {
    mockedPrisma.product.findUnique.mockResolvedValue(null as never);
    await expect(cartService.add('u1', { productId: 'x', qty: 1 })).rejects.toThrow();
  });

  it('商品已下架抛错', async () => {
    mockedPrisma.product.findUnique.mockResolvedValue({ id: 'p1', status: 'off' } as never);
    await expect(cartService.add('u1', { productId: 'p1', qty: 1 })).rejects.toThrow();
  });
});

describe('cartService.updateQty', () => {
  it('qty<=0 调 remove', async () => {
    mockedPrisma.cart.deleteMany.mockResolvedValue({ count: 1 } as never);
    const r = await cartService.updateQty('u1', { productId: 'p1', qty: 0 });
    expect(r.ok).toBe(true);
    expect(mockedPrisma.cart.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', productId: 'p1' } });
  });

  it('qty>0 update', async () => {
    mockedPrisma.cart.update.mockResolvedValue({ productId: 'p1', qty: 5 } as never);
    const r = await cartService.updateQty('u1', { productId: 'p1', qty: 5 });
    expect(r).toEqual({ productId: 'p1', qty: 5 });
  });
});

describe('cartService.list', () => {
  it('join Product + 算合计 + 过滤下架', async () => {
    mockedPrisma.cart.findMany.mockResolvedValue([
      { productId: 'p1', qty: 2, product: { id: 'p1', name: 'A', price: 99, originalPrice: null, memberDiscount: null, images: [], stock: 10, status: 'on' } },
      { productId: 'p2', qty: 1, product: { id: 'p2', name: 'B', price: 50, originalPrice: null, memberDiscount: null, images: [], stock: 5, status: 'off' } },
    ] as never);

    const r = await cartService.list('u1');

    expect(r.items).toHaveLength(2);
    expect(r.count).toBe(3);
    expect(r.totalAmount).toBe('198.00'); // 只 on 商品：99×2
    expect(r.items[0].product.price).toBe('99');
  });
});
