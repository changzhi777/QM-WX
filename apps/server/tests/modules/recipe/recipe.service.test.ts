/**
 * recipe service 单测（V2 stub 深化）
 *
 * 覆盖：
 * - listRecipes：stub 空 list
 * - recipeDetail：stub notImplemented
 * - nutritionSearch：MVP mock 营养（USDA 仿写）
 * - dishRecognize：MVP mock candidates
 * - logMeal：真写 Meal + 算 calorie + 预计积分
 * - myMeals：真查 Meal 按日期范围
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPrismaMock } from '../../helpers/mockPrisma.js';
import { mockErrors } from '../../helpers/mockErrors.js';

const mocks = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const helpers = require('../../helpers/mockPrisma.ts') as typeof import('../../helpers/mockPrisma.js');
  return helpers.createPrismaMock({ models: ['meal'], txModels: [] });
});

vi.mock('src/infra/prisma.js', () => ({ prisma: mocks.prisma }));
vi.mock('src/common/errors.js', () => ({ Errors: mockErrors }));

import { recipeService } from '../../../src/modules/recipe/recipe.service.js';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.meal = mocks.prisma.meal as never;
});

describe('recipeService stub actions (未深化)', () => {
  it('listRecipes：返空分页', async () => {
    const result = await recipeService.listRecipes({ page: 1, pageSize: 20 } as never);
    expect(result).toEqual({ list: [], total: 0, page: 1, pageSize: 20 });
  });

  it('recipeDetail：抛 notImplemented', async () => {
    await expect(recipeService.recipeDetail('r1')).rejects.toThrow(/notImplemented/);
  });
});

describe('recipeService.nutritionSearch (MVP mock)', () => {
  it('命中：返 USDA 仿写营养数据', async () => {
    const result = await recipeService.nutritionSearch('u1', { keyword: '鸡胸肉' });
    expect(result).toMatchObject({
      keyword: '鸡胸肉',
      result: { name: '鸡胸肉', kcal: 165, source: 'USDA' },
      fromCache: false,
    });
  });

  it('未命中：返 { keyword, result: null, fromCache: false }', async () => {
    const result = await recipeService.nutritionSearch('u1', { keyword: '不存在的食物' });
    expect(result).toEqual({ keyword: '不存在的食物', result: null, fromCache: false });
  });
});

describe('recipeService.dishRecognize (MVP mock)', () => {
  it('返 3 个 mock candidates + best', async () => {
    const result = await recipeService.dishRecognize('u1', { imageBase64: 'fake' });
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates[0].name).toBe('宫保鸡丁');
    expect(result.best).toMatchObject({ name: '宫保鸡丁', confidence: 0.95 });
  });
});

describe('recipeService.logMeal (V2 stub 深化)', () => {
  it('写 Meal + 算 totalCalorie + 算预计积分', async () => {
    mocks.prisma.meal.create.mockResolvedValue({ id: 'm1' });
    const result = await recipeService.logMeal('u1', {
      date: '2026-06-13',
      mealType: 'lunch',
      items: [
        { foodId: 'f1', calorie: 100, qty: 2 }, // 200 kcal
        { foodId: 'f2', calorie: 50, qty: 1 }, // 50 kcal
      ],
    } as never);
    expect(result).toEqual({
      ok: true,
      mealId: 'm1',
      totalCalorie: 250,
      pointsEarned: 25, // floor(250/10)
    });
    expect(mocks.prisma.meal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u1',
          date: '2026-06-13',
          mealType: 'lunch',
          totalCalorie: 250,
        }),
      }),
    );
  });

  it('totalCalorie 封顶 50 积分：1000+ kcal → 50', async () => {
    mocks.prisma.meal.create.mockResolvedValue({ id: 'm2' });
    const result = await recipeService.logMeal('u1', {
      date: '2026-06-13',
      mealType: 'dinner',
      items: [{ foodId: 'f1', calorie: 1000, qty: 1 }], // 1000 kcal
    } as never);
    expect(result.pointsEarned).toBe(50); // min(50, 100)
  });
});

describe('recipeService.myMeals (V2 stub 深化)', () => {
  it('按日期范围查 meal：返 list + total', async () => {
    const meals = [
      { id: 'm1', date: '2026-06-12', totalCalorie: 250, mealType: 'lunch' },
      { id: 'm2', date: '2026-06-11', totalCalorie: 400, mealType: 'dinner' },
    ];
    mocks.prisma.meal.findMany.mockResolvedValue(meals);
    const result = await recipeService.myMeals('u1', { since: '2026-06-01', until: '2026-06-12' });
    expect(result).toEqual({ list: meals, total: 2 });
    expect(mocks.prisma.meal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', date: { gte: '2026-06-01', lte: '2026-06-12' } },
        orderBy: { date: 'desc' },
      }),
    );
  });

  it('无 since/until：只按 userId 查', async () => {
    mocks.prisma.meal.findMany.mockResolvedValue([]);
    await recipeService.myMeals('u1', {});
    expect(mocks.prisma.meal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' }, // 不含 date 字段
      }),
    );
  });

  it('只有 since：不带 until', async () => {
    mocks.prisma.meal.findMany.mockResolvedValue([]);
    await recipeService.myMeals('u1', { since: '2026-06-01' });
    const call = mocks.prisma.meal.findMany.mock.calls[0][0];
    expect(call.where.date).toEqual({ gte: '2026-06-01' });
    expect(call.where.date.lte).toBeUndefined();
  });
});
