/**
 * mall service 单元测试
 *
 * 覆盖：
 * - listCategories: includeCount=true → groupBy；false → distinct
 * - listProducts: 分页 + 多过滤 + 价格序列化（V0.1.6 增 Cache.wrap 行为）
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

// V0.1.6: Mock Redis — Cache.wrap / delByPattern 需要
// 用 vi.hoisted 让 vi.mock 工厂在 import 之前就拿到引用（避免 const TDZ）
const _redisMockState = vi.hoisted(() => {
  const cacheStore = new Map<string, string>();
  return {
    cacheStore,
    redis: {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      scan: vi.fn(),
    },
  };
});

vi.mock('src/infra/redis.js', () => ({
  redis: _redisMockState.redis,
}));

function setupMockRedis() {
  const { cacheStore, redis } = _redisMockState;
  redis.get.mockImplementation(async (k: string) => cacheStore.get(k) ?? null);
  redis.set.mockImplementation(async (k: string, v: string) => {
    cacheStore.set(k, v);
    return 'OK';
  });
  redis.del.mockImplementation(async (k: string) => {
    const had = cacheStore.has(k);
    cacheStore.delete(k);
    return had ? 1 : 0;
  });
  // SCAN MATCH 模拟：只返匹配 pattern 的 key（cursor='0' 退出循环）
  // Cache.delByPattern 调 scan(cursor, 'MATCH', PREFIX+pattern, 'COUNT', 100)
  redis.scan.mockImplementation(async (_cursor: string, ...args: unknown[]) => {
    const matchIdx = args.indexOf('MATCH');
    const pattern = (args[matchIdx + 1] as string) ?? '*';
    const regex = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    const matched = Array.from(cacheStore.keys()).filter((k) => regex.test(k));
    return ['0', matched] as [string, string[]];
  });
}

import { mallService, invalidateProductsCache } from '../../../src/modules/mall/mall.service.js';

beforeEach(() => {
  vi.clearAllMocks();
  _redisMockState.cacheStore.clear();
  setupMockRedis();
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

// ===== V0.1.6 增：listProducts 缓存行为 =====
describe('mallService.listProducts（带缓存）', () => {
  it('首次调用：miss → 查 DB + 回填缓存', async () => {
    mocks.productMethods.findMany.mockResolvedValue([
      { id: 'p1', name: '跑鞋', category: '鞋服', price: { toString: () => '299.00' }, originalPrice: null, brand: null, memberDiscount: null, images: [], description: null, stock: 10 },
    ] as never);
    mocks.productMethods.count.mockResolvedValue(1);

    const result = await mallService.listProducts({ page: 1, pageSize: 10 });

    expect(result.list).toHaveLength(1);
    expect(result.list[0].price).toBe('299.00');
    expect(result.total).toBe(1);
    expect(mocks.productMethods.findMany).toHaveBeenCalledTimes(1);
    // 缓存回填
    const cached = _redisMockState.cacheStore.get('qmwx:cache:mall:listProducts::::1:10');
    expect(cached).toBeDefined();
  });

  it('二次调用同参：命中缓存 → 不再调 DB', async () => {
    // 预热缓存
    _redisMockState.cacheStore.set(
      'qmwx:cache:mall:listProducts::::1:10',
      JSON.stringify({ list: [{ id: 'p1', name: '缓存商品', price: '1.00' }], total: 1, page: 1, pageSize: 10 }),
    );

    const result = await mallService.listProducts({ page: 1, pageSize: 10 });

    expect(result.list[0].name).toBe('缓存商品');
    // 命中：DB 一次都没调
    expect(mocks.productMethods.findMany).not.toHaveBeenCalled();
    expect(mocks.productMethods.count).not.toHaveBeenCalled();
  });

  it('不同参数 → 不同 cache key（不串扰）', async () => {
    mocks.productMethods.findMany.mockResolvedValue([]);
    mocks.productMethods.count.mockResolvedValue(0);

    await mallService.listProducts({ page: 1, pageSize: 10 });
    await mallService.listProducts({ page: 2, pageSize: 10 });
    await mallService.listProducts({ category: '鞋服', page: 1, pageSize: 10 });

    expect(_redisMockState.cacheStore.has('qmwx:cache:mall:listProducts::::1:10')).toBe(true);
    expect(_redisMockState.cacheStore.has('qmwx:cache:mall:listProducts::::2:10')).toBe(true);
    expect(_redisMockState.cacheStore.has('qmwx:cache:mall:listProducts:鞋服:::1:10')).toBe(true);
  });
});

describe('invalidateProductsCache（admin 写后失效，V0.1.7 扩 mall:*）', () => {
  it('抹掉所有 mall:* 命名空间缓存（listProducts + listCategories）', async () => {
    _redisMockState.cacheStore.set('qmwx:cache:mall:listProducts::::1:10', '{}');
    _redisMockState.cacheStore.set('qmwx:cache:mall:listProducts:鞋服:::1:10', '{}');
    _redisMockState.cacheStore.set('qmwx:cache:mall:listCategories:withCount', '{"categories":[]}');
    // 无关 key 不该被抹
    _redisMockState.cacheStore.set('qmwx:cache:sport:today:u1:2026-06-15', '{}');

    const deleted = await invalidateProductsCache();

    expect(deleted).toBe(3);
    expect(_redisMockState.cacheStore.has('qmwx:cache:mall:listProducts::::1:10')).toBe(false);
    expect(_redisMockState.cacheStore.has('qmwx:cache:mall:listProducts:鞋服:::1:10')).toBe(false);
    expect(_redisMockState.cacheStore.has('qmwx:cache:mall:listCategories:withCount')).toBe(false);
    // 无关 key 保持
    expect(_redisMockState.cacheStore.has('qmwx:cache:sport:today:u1:2026-06-15')).toBe(true);
  });
});

// ===== V0.1.7 增：listCategories 缓存行为 =====
describe('mallService.listCategories（带缓存）', () => {
  it('includeCount=true 首次：miss → 调 groupBy + 回填缓存', async () => {
    mocks.productMethods.groupBy.mockResolvedValue([
      { category: '鞋服', _count: { category: 12 } },
      { category: '器材', _count: { category: 5 } },
    ] as never);

    const result = await mallService.listCategories({ includeCount: true });

    expect(result.categories).toEqual([
      { name: '鞋服', count: 12 },
      { name: '器材', count: 5 },
    ]);
    expect(mocks.productMethods.groupBy).toHaveBeenCalledTimes(1);
    // 缓存已回填
    const cached = _redisMockState.cacheStore.get('qmwx:cache:mall:listCategories:withCount');
    expect(cached).toBeDefined();
    expect(JSON.parse(cached!)).toMatchObject({
      categories: [
        { name: '鞋服', count: 12 },
        { name: '器材', count: 5 },
      ],
    });
  });

  it('includeCount=true 二次：命中缓存 → 不再调 groupBy', async () => {
    // 预热缓存
    _redisMockState.cacheStore.set(
      'qmwx:cache:mall:listCategories:withCount',
      JSON.stringify({ categories: [{ name: '缓存分类', count: 99 }] }),
    );

    const result = await mallService.listCategories({ includeCount: true });

    expect(result.categories).toEqual([{ name: '缓存分类', count: 99 }]);
    // 命中：groupBy 一次都没调
    expect(mocks.productMethods.groupBy).not.toHaveBeenCalled();
  });

  it('includeCount=false：不缓存（distinct 极轻量）', async () => {
    mocks.productMethods.findMany.mockResolvedValue([{ category: '鞋服' }, { category: '器材' }] as never);

    // 首次
    const r1 = await mallService.listCategories({ includeCount: false });
    // 二次
    const r2 = await mallService.listCategories({ includeCount: false });

    expect(r1.categories).toEqual([{ name: '鞋服', count: 0 }, { name: '器材', count: 0 }]);
    expect(r2.categories).toEqual([{ name: '鞋服', count: 0 }, { name: '器材', count: 0 }]);
    // includeCount=false 不应产生任何 mall:listCategories: 缓存
    const catKeys = Array.from(_redisMockState.cacheStore.keys()).filter((k) =>
      k.startsWith('qmwx:cache:mall:listCategories:'),
    );
    expect(catKeys).toHaveLength(0);
    // findEach 调 2 次（不缓存）
    expect(mocks.productMethods.findMany).toHaveBeenCalledTimes(2);
  });

  it('写后失效（invalidateProductsCache）后 → 重新走 groupBy', async () => {
    // 预热：分类已缓存
    _redisMockState.cacheStore.set(
      'qmwx:cache:mall:listCategories:withCount',
      JSON.stringify({ categories: [{ name: '旧分类', count: 1 }] }),
    );

    // 1. 命中（不调 groupBy）
    let result = await mallService.listCategories({ includeCount: true });
    expect(result.categories[0].name).toBe('旧分类');
    expect(mocks.productMethods.groupBy).toHaveBeenCalledTimes(0);

    // 2. 失效
    await invalidateProductsCache();

    // 3. mock 新 groupBy 结果
    mocks.productMethods.groupBy.mockResolvedValue([
      { category: '新分类', _count: { category: 7 } },
    ] as never);

    // 4. 重新走 DB（cache miss）
    result = await mallService.listCategories({ includeCount: true });
    expect(result.categories[0].name).toBe('新分类');
    expect(mocks.productMethods.groupBy).toHaveBeenCalledTimes(1);
  });
});
