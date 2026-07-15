/**
 * food routes 路由层测试（V0.2.0）
 *
 * 覆盖 5 action 分发 + 鉴权 + FatSecret 未配置守卫（search/nutrition）+ query 校验 + 未知 action
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const mocks = vi.hoisted(() => ({
  foodService: {
    search: vi.fn(),
    nutrition: vi.fn(),
    recordMeal: vi.fn(),
    myMeals: vi.fn(),
    removeMeal: vi.fn(),
  },
  isFatSecretConfigured: vi.fn(() => true),
}));

vi.mock('src/modules/food/food.service.js', () => ({ foodService: mocks.foodService }));
vi.mock('src/modules/food/client.js', () => ({ isFatSecretConfigured: mocks.isFatSecretConfigured }));
vi.mock('src/common/errors.js', () => ({
  Errors: {
    unauthorized: () => Object.assign(new Error('unauthorized'), { code: 401, statusCode: 401 }),
    badRequest: (msg: string) => Object.assign(new Error(msg), { code: 400, statusCode: 400 }),
    notFound: (msg: string) => Object.assign(new Error(msg), { code: 404, statusCode: 404 }),
  },
}));

import { foodRoutes } from '../../../src/modules/food/food.routes.js';

interface MockUser {
  id: string;
  openid: string;
  sub: string;
}

async function buildApp(opts: { authed?: boolean } = {}) {
  const app = Fastify();
  app.decorateRequest('user', undefined);
  if (opts.authed) {
    app.addHook('onRequest', async (req) => {
      (req as { user?: MockUser }).user = { id: 'u1', openid: 'oU1', sub: 'u1' };
    });
  }
  await app.register(foodRoutes);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  // 重置默认（clearAllMocks 不清 impl，避免前测 mockReturnValue(false) 污染后续）
  mocks.isFatSecretConfigured.mockReturnValue(true);
});

async function post(app: Awaited<ReturnType<typeof buildApp>>, action: string, payload?: unknown) {
  return app.inject({ method: 'POST', url: '/', payload: { action, payload } });
}

describe('food routes', () => {
  it('未鉴权 → 401', async () => {
    const app = await buildApp();
    const r = await post(app, 'search', { query: 'x' });
    expect(r.statusCode).toBe(401);
    await app.close();
  });

  it('unknown action → 400', async () => {
    const app = await buildApp({ authed: true });
    const r = await post(app, 'unknown');
    expect(r.statusCode).toBe(400);
    await app.close();
  });

  it('search FatSecret 未配置 → 400', async () => {
    mocks.isFatSecretConfigured.mockReturnValue(false);
    const app = await buildApp({ authed: true });
    const r = await post(app, 'search', { query: '鸡蛋' });
    expect(r.statusCode).toBe(400);
    await app.close();
  });

  it('search query 空 → 400', async () => {
    const app = await buildApp({ authed: true });
    const r = await post(app, 'search', { query: '' });
    expect(r.statusCode).toBe(400);
    await app.close();
  });

  it('search 正常 → foodService.search + list', async () => {
    mocks.foodService.search.mockResolvedValue([{ id: 'f1', name: '鸡蛋' }]);
    const app = await buildApp({ authed: true });
    const r = await post(app, 'search', { query: '鸡蛋' });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.list).toHaveLength(1);
    expect(mocks.foodService.search).toHaveBeenCalledWith('鸡蛋');
    await app.close();
  });

  it('nutrition FatSecret 未配置 → 400', async () => {
    mocks.isFatSecretConfigured.mockReturnValue(false);
    const app = await buildApp({ authed: true });
    const r = await post(app, 'nutrition', { foodId: 'f1' });
    expect(r.statusCode).toBe(400);
    await app.close();
  });

  it('nutrition 正常 → foodService.nutrition', async () => {
    mocks.foodService.nutrition.mockResolvedValue({ id: 'f1', name: '鸡蛋', calorie: 147 });
    const app = await buildApp({ authed: true });
    const r = await post(app, 'nutrition', { foodId: 'f1' });
    expect(r.statusCode).toBe(200);
    expect(mocks.foodService.nutrition).toHaveBeenCalledWith('f1');
    await app.close();
  });

  it('record 正常 → foodService.recordMeal（透传 userId）', async () => {
    const input = { mealType: 'breakfast', items: [{ name: '鸡蛋', calorie: 80 }] };
    mocks.foodService.recordMeal.mockResolvedValue({ id: 'm1', ...input, totalCalorie: 80, date: '2026-07-15' });
    const app = await buildApp({ authed: true });
    const r = await post(app, 'record', input);
    expect(r.statusCode).toBe(200);
    expect(mocks.foodService.recordMeal).toHaveBeenCalledWith('u1', input);
    await app.close();
  });

  it('myMeals 正常 → foodService.myMeals（透传 date）', async () => {
    mocks.foodService.myMeals.mockResolvedValue({
      date: '2026-07-15',
      meals: [],
      summary: { calorie: 0, protein: 0, fat: 0, carb: 0 },
    });
    const app = await buildApp({ authed: true });
    const r = await post(app, 'myMeals', { date: '2026-07-15' });
    expect(r.statusCode).toBe(200);
    expect(mocks.foodService.myMeals).toHaveBeenCalledWith('u1', '2026-07-15');
    await app.close();
  });

  it('removeMeal 正常 → foodService.removeMeal（透传 mealId）', async () => {
    mocks.foodService.removeMeal.mockResolvedValue({ ok: true });
    const app = await buildApp({ authed: true });
    const r = await post(app, 'removeMeal', { mealId: 'm1' });
    expect(r.statusCode).toBe(200);
    expect(mocks.foodService.removeMeal).toHaveBeenCalledWith('u1', 'm1');
    await app.close();
  });
});
