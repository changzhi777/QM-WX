/**
 * recipe routes 路由层冒烟测试
 *
 * V2 stub 阶段。recipe 6 action：
 * - listRecipes / recipeDetail — 公开
 * - nutritionSearch / dishRecognize / logMeal / myMeals — 需登录
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { mockErrors } from '../../helpers/mockErrors.js';

const mockRecipeService = vi.hoisted(() => ({
  listRecipes: vi.fn().mockResolvedValue({ list: [], total: 0 }),
  recipeDetail: vi.fn().mockResolvedValue({ recipe: null }),
  nutritionSearch: vi.fn().mockResolvedValue({ items: [] }),
  dishRecognize: vi.fn().mockResolvedValue({ candidates: [] }),
  logMeal: vi.fn().mockResolvedValue({ ok: true }),
  myMeals: vi.fn().mockResolvedValue({ list: [], total: 0 }),
}));

vi.mock('src/modules/recipe/recipe.service.js', () => ({ recipeService: mockRecipeService }));
vi.mock('src/common/errors.js', () => ({ Errors: mockErrors }));

import { recipeRoutes } from '../../../src/modules/recipe/recipe.routes.js';

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
  app.setErrorHandler((err, _req, reply) => {
    const e = err as Error & { code?: number; statusCode?: number };
    return reply.status(e.statusCode ?? 500).send({ code: e.code ?? 500, msg: err.message });
  });
  await app.register(recipeRoutes, { prefix: '/api/recipe' });
  return app;
}

describe('POST /api/recipe — V2 stub 路由层', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
    await app.ready();
  });

  // 公开 action（无需登录）— 已登录也行
  it('listRecipes 公开（已登录）→ 返回空', async () => {
    const authedApp = await buildApp({ authed: true });
    await authedApp.ready();
    const res = await authedApp.inject({
      method: 'POST',
      url: '/api/recipe',
      payload: { action: 'listRecipes', payload: {} },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ list: [], total: 0 });
    await authedApp.close();
  });

  it('recipeDetail 公开（未登录）→ 不抛 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/recipe',
      payload: { action: 'recipeDetail', payload: { id: 'r1' } },
    });
    expect(res.statusCode).toBe(200);
  });

  // 受保护 action — 必须登录
  it.each(['nutritionSearch', 'dishRecognize', 'logMeal', 'myMeals'])(
    'action=%s 未登录 → 401',
    async (action) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/recipe',
        payload: { action, payload: {} },
      });
      expect(res.statusCode).toBe(401);
    },
  );

  it('unknown action → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/recipe',
      payload: { action: 'wat' },
    });
    expect(res.statusCode).toBe(400);
  });
});
