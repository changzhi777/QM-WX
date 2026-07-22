/**
 * food.service 单测 — V0.2.0 饮食日记
 *
 * 覆盖：search（缓存命中/未命中落缓存）/ nutrition / recordMeal（正常/空items/非法mealType/算totalCalorie）
 *      / myMeals（宏量汇总）/ removeMeal（正常/不存在/非本人）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const helpers = require('../../helpers/mockPrisma.ts') as typeof import('../../helpers/mockPrisma.js');
  const prismaMock = helpers.createPrismaMock({ models: ['foodCache', 'meal'], txModels: [] });
  return {
    prisma: prismaMock.prisma,
    searchFood: vi.fn(),
    getFoodNutrition: vi.fn(),
  };
});

vi.mock('src/infra/prisma.js', () => ({ prisma: mocks.prisma }));
vi.mock('src/modules/food/client.js', () => ({
  searchFood: mocks.searchFood,
  getFoodNutrition: mocks.getFoodNutrition,
  isFatSecretConfigured: vi.fn(() => true),
}));

const ocrMock = vi.hoisted(() => ({ generalBasic: vi.fn() }));
vi.mock('src/modules/ocr/ocr.service.js', () => ({ ocrService: ocrMock }));

const { foodService } = await import('src/modules/food/food.service.js');

const USER = 'u1';
const BAD = 400;
const NOT_FOUND = 404;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('food.service.search', () => {
  it('缓存命中 → 返缓存列表 + hitCount++', async () => {
    const list = [{ id: 'f1', name: '鸡蛋' }];
    mocks.prisma.foodCache.findFirst.mockResolvedValue({
      id: 'c1',
      payload: { list },
    });
    const res = await foodService.search('鸡蛋');
    expect(res).toEqual(list);
    expect(mocks.prisma.foodCache.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { hitCount: { increment: 1 } },
    });
    expect(mocks.searchFood).not.toHaveBeenCalled();
  });

  it('缓存未命中 → 调 FatSecret + 落缓存', async () => {
    mocks.prisma.foodCache.findFirst.mockResolvedValue(null);
    const list = [{ id: 'f2', name: '牛奶' }];
    mocks.searchFood.mockResolvedValue(list);
    const res = await foodService.search('牛奶');
    expect(res).toEqual(list);
    expect(mocks.searchFood).toHaveBeenCalledWith('牛奶');
    expect(mocks.prisma.foodCache.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          keyword: '牛奶',
          source: 'fatsecret',
          payload: { list },
        }),
      }),
    );
  });

  it('缓存写失败不阻塞（create reject 仍返 list）', async () => {
    mocks.prisma.foodCache.findFirst.mockResolvedValue(null);
    mocks.searchFood.mockResolvedValue([{ id: 'f3', name: '苹果' }]);
    mocks.prisma.foodCache.create.mockRejectedValue(new Error('db down'));
    const res = await foodService.search('苹果');
    expect(res).toHaveLength(1);
  });
});

describe('food.service.nutrition', () => {
  it('调 getFoodNutrition', async () => {
    const item = { id: 'f1', name: '鸡蛋', calorie: 147, protein: 13, fat: 9, carb: 1 };
    mocks.getFoodNutrition.mockResolvedValue(item);
    const res = await foodService.nutrition('f1');
    expect(res).toEqual(item);
    expect(mocks.getFoodNutrition).toHaveBeenCalledWith('f1');
  });
});

describe('food.service.recordMeal', () => {
  it('正常记录 → 算 totalCalorie + 落 Meal', async () => {
    const created = { id: 'm1', mealType: 'breakfast', totalCalorie: 350, date: '2026-07-15' };
    mocks.prisma.meal.create.mockResolvedValue(created);
    const res = await foodService.recordMeal(USER, {
      mealType: 'breakfast',
      date: '2026-07-15',
      items: [
        { name: '鸡蛋', calorie: 80, protein: 6 },
        { name: '面包', calorie: 270, carb: 50 },
      ],
    });
    expect(res.totalCalorie).toBe(350);
    expect(mocks.prisma.meal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: USER,
          mealType: 'breakfast',
          totalCalorie: 350,
          date: '2026-07-15',
        }),
      }),
    );
  });

  it('空 items → badRequest', async () => {
    await expect(foodService.recordMeal(USER, { mealType: 'lunch', items: [] })).rejects.toMatchObject({
      code: BAD,
    });
  });

  it('非法 mealType → badRequest', async () => {
    await expect(
      foodService.recordMeal(USER, { mealType: 'supper' as never, items: [{ name: 'x', calorie: 1 }] }),
    ).rejects.toMatchObject({ code: BAD });
  });
});

describe('food.service.myMeals', () => {
  it('汇总某日 calorie/protein/fat/carb', async () => {
    mocks.prisma.meal.findMany.mockResolvedValue([
      {
        id: 'm1',
        mealType: 'breakfast',
        totalCalorie: 350,
        createdAt: new Date('2026-07-15T08:00:00Z'),
        items: [{ name: '鸡蛋', calorie: 80, protein: 6, fat: 5 }, { name: '面包', calorie: 270, carb: 50 }],
      },
      {
        id: 'm2',
        mealType: 'lunch',
        totalCalorie: 500,
        createdAt: new Date('2026-07-15T12:00:00Z'),
        items: [{ name: '鸡胸肉', calorie: 200, protein: 30, fat: 4 }],
      },
    ]);
    const res = await foodService.myMeals(USER, '2026-07-15');
    expect(res.summary).toEqual({ calorie: 850, protein: 36, fat: 9, carb: 50 });
    expect(res.meals).toHaveLength(2);
    expect(mocks.prisma.meal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER, date: '2026-07-15' } }),
    );
  });

  it('无数据 → 汇总全 0', async () => {
    mocks.prisma.meal.findMany.mockResolvedValue([]);
    const res = await foodService.myMeals(USER, '2026-07-15');
    expect(res.summary).toEqual({ calorie: 0, protein: 0, fat: 0, carb: 0 });
  });
});

describe('food.service.removeMeal', () => {
  it('正常删除', async () => {
    mocks.prisma.meal.findUnique.mockResolvedValue({ id: 'm1', userId: USER });
    const res = await foodService.removeMeal(USER, 'm1');
    expect(res).toEqual({ ok: true });
    expect(mocks.prisma.meal.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
  });

  it('不存在 → notFound', async () => {
    mocks.prisma.meal.findUnique.mockResolvedValue(null);
    await expect(foodService.removeMeal(USER, 'mX')).rejects.toMatchObject({
      code: NOT_FOUND,
    });
  });

  it('非本人 → notFound（不泄露存在性）', async () => {
    mocks.prisma.meal.findUnique.mockResolvedValue({ id: 'm1', userId: 'other' });
    await expect(foodService.removeMeal(USER, 'm1')).rejects.toMatchObject({
      code: NOT_FOUND,
    });
  });
});

describe('food.service.recordMeal 默认日期 + 0 卡路里', () => {
  it('date 缺省 → 走 todayCN() 默认今日', async () => {
    mocks.prisma.meal.create.mockResolvedValue({
      id: 'm1',
      mealType: 'lunch',
      totalCalorie: 0,
      date: '2026-07-15',
    } as never);
    const res = await foodService.recordMeal(USER, {
      mealType: 'lunch',
      items: [{ name: '黑咖啡', calorie: 0 }],
    });
    // 不传 date 也能落库(默认 todayCN)
    expect(res.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.totalCalorie).toBe(0);
  });

  it('item calorie NaN/字符串 → 0 卡路里（容错）', async () => {
    mocks.prisma.meal.create.mockResolvedValue({
      id: 'm2',
      mealType: 'snack',
      totalCalorie: 0,
      date: '2026-07-15',
    } as never);
    const res = await foodService.recordMeal(USER, {
      mealType: 'snack',
      items: [{ name: '水', calorie: NaN }, { name: '茶', calorie: 'abc' as never }],
    });
    expect(res.totalCalorie).toBe(0);
  });
});

describe('food.service.myMeals 边界', () => {
  it('无日期参数 → 走 todayCN() 默认', async () => {
    mocks.prisma.meal.findMany.mockResolvedValue([]);
    await foodService.myMeals(USER); // 不传 date
    expect(mocks.prisma.meal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER, date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) } }),
    );
  });

  it('item.protein/fat/carb NaN → 0（不阻塞汇总）', async () => {
    mocks.prisma.meal.findMany.mockResolvedValue([
      {
        id: 'm3',
        mealType: 'breakfast',
        totalCalorie: 100,
        createdAt: new Date(),
        items: [{ name: 'x', calorie: 100, protein: NaN, fat: NaN, carb: NaN }],
      },
    ] as never);
    const res = await foodService.myMeals(USER, '2026-07-15');
    expect(res.summary).toEqual({ calorie: 100, protein: 0, fat: 0, carb: 0 });
  });
});

describe('food.service.search 缓存 hitCount 失败降级', () => {
  it('hitCount update 失败 → 仍返缓存（不阻塞）', async () => {
    const list = [{ id: 'f1', name: '鸡蛋' }];
    mocks.prisma.foodCache.findFirst.mockResolvedValue({
      id: 'c1',
      payload: { list },
    });
    mocks.prisma.foodCache.update.mockRejectedValue(new Error('db down'));
    const res = await foodService.search('鸡蛋');
    expect(res).toEqual(list);
    // update 失败被 catch 吞掉,主流程返 list
  });
});

// ============================================================
// V0.2.79 recognize 补测（拍照识别 — vision 分支，GLM-4.6V 多模态识菜品）
// ============================================================
describe('food.service.recognize vision (V0.2.79 补测)', () => {
  const ORIG_KEY = process.env.LLM_API_KEY;
  beforeEach(() => {
    process.env.LLM_API_KEY = 'test-key';
  });
  afterEach(() => {
    process.env.LLM_API_KEY = ORIG_KEY;
    vi.restoreAllMocks();
  });

  it('imageUrl 必填 → badRequest', async () => {
    await expect(foodService.recognize({ imageUrl: '', mode: 'vision' })).rejects.toMatchObject({ statusCode: BAD });
  });

  it('LLM_API_KEY 缺失 → badRequest', async () => {
    delete process.env.LLM_API_KEY;
    await expect(foodService.recognize({ imageUrl: 'http://x/img.png', mode: 'vision' })).rejects.toMatchObject({ statusCode: BAD });
  });

  it('happy: GLM 返 JSON → MealItem（宏量 Math.round）', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ name: '宫保鸡丁', calorie: 300.6, protein: 20.4, fat: 15, carb: 25 }) } }],
      }), { status: 200 }),
    );
    const r = await foodService.recognize({ imageUrl: 'http://x/img.png', mode: 'vision' });
    expect(r.name).toBe('宫保鸡丁');
    expect(r.calorie).toBe(301); // Math.round(300.6)
    expect(r.protein).toBe(20); // Math.round(20.4)
    expect(r.fat).toBe(15);
  });

  it('GLM 失败（non-ok）→ throw "GLM-4.6V 识别失败"', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('server error', { status: 500 }),
    );
    await expect(foodService.recognize({ imageUrl: 'http://x/img.png', mode: 'vision' })).rejects.toThrow(/GLM-4.6V 识别失败/);
  });

  it('GLM 返非法 JSON → badRequest 解析失败', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        choices: [{ message: { content: 'not-json{{{ ' } }],
      }), { status: 200 }),
    );
    await expect(foodService.recognize({ imageUrl: 'http://x/img.png', mode: 'vision' })).rejects.toMatchObject({ statusCode: BAD });
  });

  it('ocr 未识别文字 → badRequest', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('img', { status: 200 }));
    ocrMock.generalBasic.mockResolvedValueOnce([]); // 空 lines → text 空
    await expect(foodService.recognize({ imageUrl: 'http://x/img.png', mode: 'ocr' })).rejects.toMatchObject({ statusCode: BAD });
  });

  it('ocr happy: 识别 → search → nutrition → MealItem', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('img', { status: 200 }));
    ocrMock.generalBasic.mockResolvedValueOnce(['全麦面包', '100g']);
    vi.spyOn(foodService, 'search').mockResolvedValueOnce([{ id: 'f1', name: '全麦面包' }] as never);
    vi.spyOn(foodService, 'nutrition').mockResolvedValueOnce({ id: 'f1', name: '全麦面包', calorie: 80, protein: 4, fat: 1, carb: 15 } as never);
    const r = await foodService.recognize({ imageUrl: 'http://x/img.png', mode: 'ocr' });
    expect(r.name).toBe('全麦面包');
    expect(r.calorie).toBe(80);
    expect(r.foodId).toBe('f1');
  });
});
