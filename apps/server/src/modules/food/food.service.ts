/**
 * food module service — V0.2.0 饮食日记（FatSecret 搜索 + 营养详情 + Meal 记录 + FoodCache 缓存）
 *
 * 数据流：
 *   search(keyword) → FoodCache 命中？返缓存 : searchFood(FatSecret) + 落 FoodCache(1h TTL)
 *   nutrition(foodId) → getFoodNutrition(food.get.v2 每 100g 宏量)
 *   recordMeal(items[]) → 算 totalCalorie + 落 Meal（items 含 calorie/protein/fat/carb/qty）
 *   myMeals(date?) → 某日所有 Meal + 宏量汇总（calorie/protein/fat/carb）
 *
 * Meal.items 结构（V0.2.0 宏量升级）：[{ name, calorie, protein?, fat?, carb?, qty?, foodId? }]
 */
import { prisma } from '../../infra/prisma.js';
import { Errors } from '../../common/errors.js';
import { searchFood, getFoodNutrition, type FoodItem } from './client.js';

/** 单条饮食项（V0.2.0 宏量字段）*/
export interface MealItem {
  name: string;
  calorie: number; // 该项总卡路里（已按 qty 换算）
  protein?: number; // 克
  fat?: number; // 克
  carb?: number; // 克
  qty?: string; // 份量描述（如 "1 碗" / "200g"）
  foodId?: string; // FatSecret food_id（可选，便于追溯）
}

export interface RecordMealInput {
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  items: MealItem[];
  date?: string; // YYYY-MM-DD，默认今日（CN 时区）
}

/** FoodCache TTL：1 小时（食物库低频变化）*/
const FOOD_CACHE_TTL_MS = 3600 * 1000;

/** CN 时区今日 YYYY-MM-DD */
function todayCN(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export const foodService = {
  /** 搜索食物（FoodCache 命中返缓存，未命中调 FatSecret + 落缓存）*/
  async search(query: string): Promise<FoodItem[]> {
    const cached = await prisma.foodCache.findFirst({
      where: { keyword: query, expiredAt: { gt: new Date() } },
    });
    if (cached) {
      try {
        await prisma.foodCache.update({
          where: { id: cached.id },
          data: { hitCount: { increment: 1 } },
        });
      } catch {
        // hitCount 更新失败不阻塞（缓存仍可用）
      }
      return ((cached.payload as { list?: FoodItem[] }).list) ?? [];
    }
    const list = await searchFood(query);
    try {
      await prisma.foodCache.create({
        data: {
          keyword: query,
          source: 'fatsecret',
          payload: { list } as never,
          expiredAt: new Date(Date.now() + FOOD_CACHE_TTL_MS),
        },
      });
    } catch {
      // 缓存写失败不阻塞
    }
    return list;
  },

  /** 营养详情（food.get.v2，每 100g 宏量）*/
  async nutrition(foodId: string): Promise<FoodItem> {
    return getFoodNutrition(foodId);
  },

  /** 记录一餐（算 totalCalorie + 落 Meal）*/
  async recordMeal(userId: string, input: RecordMealInput) {
    if (!input.items || input.items.length === 0) {
      throw Errors.badRequest('至少添加一项食物');
    }
    const validTypes = ['breakfast', 'lunch', 'dinner', 'snack'];
    if (!validTypes.includes(input.mealType)) {
      throw Errors.badRequest(`mealType 非法：${input.mealType}`);
    }
    const date = input.date ?? todayCN();
    const totalCalorie = input.items.reduce((s, i) => s + (Number(i.calorie) || 0), 0);
    const meal = await prisma.meal.create({
      data: {
        userId,
        mealType: input.mealType,
        items: input.items as never,
        totalCalorie,
        date,
      },
    });
    return { id: meal.id, mealType: meal.mealType, totalCalorie, date };
  },

  /** 某日饮食列表 + 宏量汇总（默认今日）*/
  async myMeals(userId: string, date?: string) {
    const d = date ?? todayCN();
    const meals = await prisma.meal.findMany({
      where: { userId, date: d },
      orderBy: { createdAt: 'asc' },
    });
    let calorie = 0;
    let protein = 0;
    let fat = 0;
    let carb = 0;
    for (const m of meals) {
      calorie += m.totalCalorie;
      for (const item of m.items as unknown as MealItem[]) {
        protein += Number(item.protein) || 0;
        fat += Number(item.fat) || 0;
        carb += Number(item.carb) || 0;
      }
    }
    return {
      date: d,
      meals: meals.map((m) => ({
        id: m.id,
        mealType: m.mealType,
        items: m.items,
        totalCalorie: m.totalCalorie,
        createdAt: m.createdAt.toISOString(),
      })),
      summary: {
        calorie,
        protein: Math.round(protein),
        fat: Math.round(fat),
        carb: Math.round(carb),
      },
    };
  },

  /** 删除一餐（鉴权仅本人）*/
  async removeMeal(userId: string, mealId: string) {
    const meal = await prisma.meal.findUnique({ where: { id: mealId } });
    if (!meal || meal.userId !== userId) throw Errors.notFound('meal');
    await prisma.meal.delete({ where: { id: mealId } });
    return { ok: true };
  },
};
