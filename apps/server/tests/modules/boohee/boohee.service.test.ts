/**
 * boohee service 单测（V0.3.35）
 * mock client（booheeGet）+ redis（Cache），验证 7 action + Cache 命中/穿透
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Cache mock（redis Map 模拟，与 stats/shoes V0.2.3 范式一致）
const _redisMockState = vi.hoisted(() => ({
  cacheStore: new Map<string, string>(),
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn(), scan: vi.fn() },
}));
vi.mock('src/infra/redis.js', () => ({ redis: _redisMockState.redis }));

// client mock
const _clientMock = vi.hoisted(() => ({
  booheeGet: vi.fn(),
  isBooheeConfigured: vi.fn(() => true),
}));
vi.mock('src/modules/boohee/boohee.client.js', () => _clientMock);

import { booheeService } from 'src/modules/boohee/boohee.service.js';

function setupMockRedis() {
  const { cacheStore, redis } = _redisMockState;
  redis.get.mockImplementation(async (k: string) => cacheStore.get(k) ?? null);
  redis.set.mockImplementation(async (k: string, v: string) => {
    cacheStore.set(k, v);
    return 'OK';
  });
  redis.del.mockImplementation(async (k: string) => {
    cacheStore.delete(k);
    return 1;
  });
  redis.scan.mockImplementation(async () => []);
}

describe('boohee.service', () => {
  beforeEach(() => {
    _redisMockState.cacheStore.clear();
    setupMockRedis();
    _clientMock.booheeGet.mockReset();
  });

  it('search: 调 booheeGet + 落 Cache', async () => {
    const mockData = { page: 1, per_page: 20, has_more: false, foods: [{ code: 'a1', name: '苹果' }] };
    _clientMock.booheeGet.mockResolvedValue(mockData);

    const result = await booheeService.search('苹果');
    expect(result).toEqual(mockData);
    expect(_clientMock.booheeGet).toHaveBeenCalledTimes(1);
    expect(_clientMock.booheeGet).toHaveBeenCalledWith('/v1/food/search', expect.objectContaining({ keyword: '苹果' }));

    // 第二次命中缓存（booheeGet 不再调用）
    await booheeService.search('苹果');
    expect(_clientMock.booheeGet).toHaveBeenCalledTimes(1);
  });

  it('search: 不同 keyword 不同缓存', async () => {
    _clientMock.booheeGet.mockResolvedValue({ foods: [] });
    await booheeService.search('苹果');
    await booheeService.search('香蕉');
    expect(_clientMock.booheeGet).toHaveBeenCalledTimes(2);
  });

  it('detail: 调 booheeGet + Cache', async () => {
    const mockDetail = { code: 'a1', name: '苹果', calories: { value: 53 } };
    _clientMock.booheeGet.mockResolvedValue(mockDetail);

    const result = await booheeService.detail('a1');
    expect(result).toEqual(mockDetail);
    expect(_clientMock.booheeGet).toHaveBeenCalledWith('/v1/food/detail', { code: 'a1' });

    // 命中缓存
    await booheeService.detail('a1');
    expect(_clientMock.booheeGet).toHaveBeenCalledTimes(1);
  });

  it('categories: 调 booheeGet + Cache', async () => {
    _clientMock.booheeGet.mockResolvedValue([{ id: 1, name: '蔬菜' }]);
    await booheeService.categories();
    expect(_clientMock.booheeGet).toHaveBeenCalledWith('/v1/food/categories');

    // 命中缓存
    await booheeService.categories();
    expect(_clientMock.booheeGet).toHaveBeenCalledTimes(1);
  });

  it('categoryFoods: 调 booheeGet + Cache', async () => {
    _clientMock.booheeGet.mockResolvedValue({ foods: [] });
    await booheeService.categoryFoods('1', { page: 1, per_page: 10 });
    expect(_clientMock.booheeGet).toHaveBeenCalledWith('/v1/food/list', expect.objectContaining({ id: '1', kind: 'category' }));
  });

  it('foodUnits: 调 booheeGet + Cache', async () => {
    _clientMock.booheeGet.mockResolvedValue([]);
    await booheeService.foodUnits('a1');
    expect(_clientMock.booheeGet).toHaveBeenCalledWith('/v1/food/units', { code: 'a1' });
  });

  it('batchNutrition: codes 排序后 join 做 cacheKey', async () => {
    _clientMock.booheeGet.mockResolvedValue({});
    await booheeService.batchNutrition(['c', 'a', 'b']);
    expect(_clientMock.booheeGet).toHaveBeenCalledWith('/v1/food/ingredients', { codes: 'a,b,c' });

    // 不同顺序同内容命中缓存
    await booheeService.batchNutrition(['a', 'b', 'c']);
    expect(_clientMock.booheeGet).toHaveBeenCalledTimes(1);
  });

  it('foodRanking: 调 booheeGet + Cache', async () => {
    _clientMock.booheeGet.mockResolvedValue([]);
    await booheeService.foodRanking({ type: 'hot', limit: 10 });
    expect(_clientMock.booheeGet).toHaveBeenCalledWith('/v1/food/ranks', { type: 'hot', limit: 10 });
  });
});
