/**
 * recipe service STUB 冒烟测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('src/common/errors.js', () => ({
  Errors: {
    notImplemented: (msg: string) => {
      const e = new Error(msg) as Error & { code: number; statusCode: number };
      e.code = 501;
      e.statusCode = 501;
      return e;
    },
  },
}));

import { recipeService } from '../../../src/modules/recipe/recipe.service.js';

describe('recipeService (STUB)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('listRecipes：返回空分页', async () => {
    const result = await recipeService.listRecipes({ page: 1, pageSize: 20 } as never);
    expect(result).toEqual({ list: [], total: 0, page: 1, pageSize: 20 });
  });

  it('recipeDetail：抛 notImplemented', async () => {
    await expect(recipeService.recipeDetail('r1')).rejects.toMatchObject({ code: 501 });
  });

  it('nutritionSearch：返回 { keyword, result: null, fromCache: false }', async () => {
    const result = await recipeService.nutritionSearch('u1', { keyword: '苹果' } as never);
    expect(result).toEqual({ keyword: '苹果', result: null, fromCache: false });
  });

  it('dishRecognize：返回空 candidates', async () => {
    const result = await recipeService.dishRecognize('u1', { imageBase64: 'x' } as never);
    expect(result).toEqual({ candidates: [], best: null });
  });

  it('logMeal：累加 totalCalorie = sum(calorie × qty)', async () => {
    const result = await recipeService.logMeal('u1', {
      items: [
        { foodId: 'f1', calorie: 100, qty: 2 },
        { foodId: 'f2', calorie: 50, qty: 1 },
      ],
    } as never);
    expect(result.ok).toBe(true);
    expect(result.totalCalorie).toBe(250);
  });

  it('myMeals：返回空 list', async () => {
    const result = await recipeService.myMeals('u1', '2026-06-01', '2026-06-12');
    expect(result).toEqual({ list: [] });
  });
});
