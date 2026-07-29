/**
 * boohee routes 单测（V0.3.35）
 * mock service，验证 7 action dispatch + 鉴权
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import Fastify from 'fastify';

const _serviceMock = vi.hoisted(() => ({
  booheeService: {
    search: vi.fn(),
    detail: vi.fn(),
    categories: vi.fn(),
    categoryFoods: vi.fn(),
    foodUnits: vi.fn(),
    batchNutrition: vi.fn(),
    foodRanking: vi.fn(),
  },
}));
vi.mock('src/modules/boohee/boohee.service.js', () => _serviceMock);

import { booheeRoutes } from 'src/modules/boohee/boohee.routes.js';

const USER = { id: 'u1', role: 'user' as const };

function buildApp() {
  const app = Fastify();
  // 简易 JWT mock：req.user 注入
  app.addHook('preHandler', async (req) => {
    const auth = req.headers.authorization;
    if (auth === 'Bearer valid') {
      req.user = USER;
    }
  });
  app.register(booheeRoutes, { prefix: '/api/boohee' });
  return app;
}

describe('boohee.routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  it('未登录抛 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/boohee', payload: { action: 'categories' } });
    expect(res.statusCode).toBe(401);
  });

  it('search action dispatch', async () => {
    _serviceMock.booheeService.search.mockResolvedValue({ foods: [{ name: '苹果' }] });
    const res = await app.inject({
      method: 'POST',
      url: '/api/boohee',
      headers: { authorization: 'Bearer valid' },
      payload: { action: 'search', payload: { keyword: '苹果' } },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
    expect(body.data.foods).toHaveLength(1);
    expect(_serviceMock.booheeService.search).toHaveBeenCalledWith('苹果', expect.objectContaining({ page: 1 }));
  });

  it('detail action dispatch', async () => {
    _serviceMock.booheeService.detail.mockResolvedValue({ code: 'a1', name: '苹果' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/boohee',
      headers: { authorization: 'Bearer valid' },
      payload: { action: 'detail', payload: { code: 'a1' } },
    });
    expect(res.statusCode).toBe(200);
    expect(_serviceMock.booheeService.detail).toHaveBeenCalledWith('a1');
  });

  it('categories action dispatch', async () => {
    _serviceMock.booheeService.categories.mockResolvedValue([]);
    const res = await app.inject({
      method: 'POST',
      url: '/api/boohee',
      headers: { authorization: 'Bearer valid' },
      payload: { action: 'categories' },
    });
    expect(res.statusCode).toBe(200);
    expect(_serviceMock.booheeService.categories).toHaveBeenCalled();
  });

  it('categoryFoods action dispatch', async () => {
    _serviceMock.booheeService.categoryFoods.mockResolvedValue({ foods: [] });
    const res = await app.inject({
      method: 'POST',
      url: '/api/boohee',
      headers: { authorization: 'Bearer valid' },
      payload: { action: 'categoryFoods', payload: { category_id: '1' } },
    });
    expect(res.statusCode).toBe(200);
    expect(_serviceMock.booheeService.categoryFoods).toHaveBeenCalledWith('1', expect.any(Object));
  });

  it('foodUnits action dispatch', async () => {
    _serviceMock.booheeService.foodUnits.mockResolvedValue([]);
    const res = await app.inject({
      method: 'POST',
      url: '/api/boohee',
      headers: { authorization: 'Bearer valid' },
      payload: { action: 'foodUnits', payload: { code: 'a1' } },
    });
    expect(res.statusCode).toBe(200);
    expect(_serviceMock.booheeService.foodUnits).toHaveBeenCalledWith('a1');
  });

  it('batchNutrition action dispatch', async () => {
    _serviceMock.booheeService.batchNutrition.mockResolvedValue({});
    const res = await app.inject({
      method: 'POST',
      url: '/api/boohee',
      headers: { authorization: 'Bearer valid' },
      payload: { action: 'batchNutrition', payload: { codes: ['a', 'b'] } },
    });
    expect(res.statusCode).toBe(200);
    expect(_serviceMock.booheeService.batchNutrition).toHaveBeenCalledWith(['a', 'b']);
  });

  it('foodRanking action dispatch', async () => {
    _serviceMock.booheeService.foodRanking.mockResolvedValue([]);
    const res = await app.inject({
      method: 'POST',
      url: '/api/boohee',
      headers: { authorization: 'Bearer valid' },
      payload: { action: 'foodRanking', payload: { limit: 5 } },
    });
    expect(res.statusCode).toBe(200);
    expect(_serviceMock.booheeService.foodRanking).toHaveBeenCalledWith(expect.objectContaining({ limit: 5 }));
  });

  it('unknown action 抛 badRequest', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/boohee',
      headers: { authorization: 'Bearer valid' },
      payload: { action: 'unknownAction' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('search 缺 keyword 抛 badRequest（Zod 校验）', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/boohee',
      headers: { authorization: 'Bearer valid' },
      payload: { action: 'search', payload: {} },
    });
    expect(res.statusCode).toBe(400);
  });
});
