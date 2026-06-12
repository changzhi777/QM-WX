/**
 * mall service 单元测试
 *
 * 覆盖：
 * - listCategories: includeCount=true → groupBy；false → distinct
 * - listProducts: 分页 + 多过滤 + 价格序列化
 * - productDetail: 不存在 / 已下架 → notFound；正常 → 序列化
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  productMethods: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  },
}));

vi.mock('src/infra/prisma.js', () => ({
  prisma: {
    product: mocks.productMethods,
  },
}));

vi.mock('src/common/errors.js', () => ({
  Errors: {
    notFound: (msg: string) => {
      const e = new Error(msg) as Error & { code: number; statusCode: number };
      e.code = 404;
      e.statusCode = 404;
      return e;
    },
  },
}));

import { mallService } from '../../../src/modules/mall/mall.service.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('mallService.listCategories', () => {
  it('includeCount=true：groupBy 拿分类+计数', async () => {
    mocks.productMethods.groupBy.mockResolvedValue([
      { category: '鞋服', _count: { category: 12 } },
      { category: '器材', _count: { category: 5 } },
    ]);
    const result = await mallService.listCategories({ includeCount: true });
    expect(mocks.productMethods.groupBy).toHaveBeenCalledWith({
      by: ['category'],
      where: { status: 'on' },
      _count: { category: true },
      orderBy: { _count: { category: 'desc' } },
    });
    expect(result.categories).toEqual([
      { name: '鞋服', count: 12 },
      { name: '器材', count: 5 },
    ]);
  });

  it('includeCount=false：distinct 拿分类，count=0', async () => {
    mocks.productMethods.findMany.mockResolvedValue([
      { category: '鞋服' },
      { category: '器材' },
    ]);
    const result = await mallService.listCategories({ includeCount: false });
    expect(mocks.productMethods.findMany).toHaveBeenCalledWith({
      where: { status: 'on' },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });
    expect(result.categories).toEqual([
      { name: '鞋服', count: 0 },
      { name: '器材', count: 0 },
    ]);
  });
});

describe('mallService.listProducts', () => {
  it('基础查询：page=1, pageSize=10', async () => {
    mocks.productMethods.findMany.mockResolvedValue([
      {
        id: 'p1',
        name: '跑鞋',
        category: '鞋服',
        brand: 'Nike',
        price: { toString: () => '299.00' } as unknown as number,
        originalPrice: { toString: () => '399.00' } as unknown as number,
        memberDiscount: 0.9,
        images: ['a.jpg'],
        description: '好',
        stock: 100,
      },
    ]);
    mocks.productMethods.count.mockResolvedValue(1);

    const result = await mallService.listProducts({
      page: 1,
      pageSize: 10,
    });
    expect(mocks.productMethods.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'on' }, skip: 0, take: 10 }),
    );
    expect(result.total).toBe(1);
    expect(result.list[0].price).toBe('299.00');
    expect(result.list[0].originalPrice).toBe('399.00');
  });

  it('过滤：category + brand + keyword 拼接 where', async () => {
    mocks.productMethods.findMany.mockResolvedValue([]);
    mocks.productMethods.count.mockResolvedValue(0);

    await mallService.listProducts({
      page: 1,
      pageSize: 10,
      category: '鞋服',
      brand: 'Nike',
      keyword: '跑鞋',
    });
    expect(mocks.productMethods.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'on',
          category: '鞋服',
          brand: 'Nike',
          name: { contains: '跑鞋', mode: 'insensitive' },
        },
      }),
    );
  });

  it('originalPrice=null → 序列化为 null', async () => {
    mocks.productMethods.findMany.mockResolvedValue([
      {
        id: 'p2',
        name: '商品',
        category: 'X',
        brand: 'Y',
        price: { toString: () => '99' } as unknown as number,
        originalPrice: null,
        memberDiscount: 1,
        images: [],
        description: '',
        stock: 0,
      },
    ]);
    mocks.productMethods.count.mockResolvedValue(1);

    const result = await mallService.listProducts({ page: 1, pageSize: 10 });
    expect(result.list[0].originalPrice).toBeNull();
  });
});

describe('mallService.productDetail', () => {
  it('商品不存在 → notFound', async () => {
    mocks.productMethods.findUnique.mockResolvedValue(null);
    await expect(mallService.productDetail('x')).rejects.toThrow(/商品不存在/);
  });

  it('商品已下架（status=off）→ notFound', async () => {
    mocks.productMethods.findUnique.mockResolvedValue({
      id: 'p1',
      name: '已下架',
      status: 'off',
      price: { toString: () => '1' } as unknown as number,
    });
    await expect(mallService.productDetail('p1')).rejects.toThrow(/下架/);
  });

  it('正常：返回序列化商品', async () => {
    mocks.productMethods.findUnique.mockResolvedValue({
      id: 'p1',
      name: '跑鞋',
      status: 'on',
      price: { toString: () => '299.00' } as unknown as number,
      originalPrice: { toString: () => '399.00' } as unknown as number,
    });
    const result = await mallService.productDetail('p1');
    expect(result.product.price).toBe('299.00');
    expect(result.product.originalPrice).toBe('399.00');
  });
});
