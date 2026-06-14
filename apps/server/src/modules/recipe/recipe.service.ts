/**
 * recipe module service — V2 stub（部分实现）
 *
 * 现状（Phase 4.1 收尾）：
 * - listRecipes：🚧 stub（空 list）
 * - recipeDetail：🚧 stub（notImplemented）
 * - nutritionSearch：✅ MVP mock 营养数据（USDA 仿写，不走真 API）
 * - dishRecognize：✅ MVP mock candidates（不走百度 AI）
 * - logMeal：✅ 真写 Meal 表 + 加 points
 * - myMeals：✅ 真查 Meal 表分页
 *
 * Phase 7 完整实现需：
 * - 聚合数据 / 天行 / 百度 AI 账号 + AppKey
 * - 食品类目资质（V1 提审前就要）
 */
import { prisma } from '../../infra/prisma.js';
import type {
  DishRecognizeInput,
  LogMealInput,
  NutritionSearchInput,
  ListRecipesInput,
  MyMealsInput,
} from './recipe.schema.js';

/** MVP 营养数据（USDA 仿写）— 单词 → kcal / protein / fat / carb 估算 */
const MOCK_NUTRITION_DB: Record<
  string,
  { name: string; kcal: number; protein: number; fat: number; carb: number; source: string }
> = {
  鸡胸肉: { name: '鸡胸肉', kcal: 165, protein: 31, fat: 3.6, carb: 0, source: 'USDA' },
  牛油果: { name: '牛油果', kcal: 160, protein: 2, fat: 14.7, carb: 8.5, source: 'USDA' },
  燕麦: { name: '燕麦', kcal: 389, protein: 16.9, fat: 6.9, carb: 66.3, source: 'USDA' },
  糙米: { name: '糙米', kcal: 111, protein: 2.6, fat: 0.9, carb: 23, source: 'USDA' },
  西兰花: { name: '西兰花', kcal: 34, protein: 2.8, fat: 0.4, carb: 6.6, source: 'USDA' },
  三文鱼: { name: '三文鱼', kcal: 208, protein: 20, fat: 13, carb: 0, source: 'USDA' },
};

export const recipeService = {
  async listRecipes(_input: ListRecipesInput) {
    // TODO Phase 7: 查 recipes 表（audit.status='on'）
    return { list: [], total: 0, page: 1, pageSize: 20 };
  },

  async recipeDetail(_id: string) {
    // TODO Phase 7
    throw new Error('notImplemented: recipeDetail');
  },

  /**
   * 营养查询
   *
   * MVP 简化：查内存 mock DB（USDA 仿写）+ fromCache=false（真生产接 food_cache 表 + 第三方 API）
   */
  async nutritionSearch(_userId: string, input: NutritionSearchInput) {
    const hit = MOCK_NUTRITION_DB[input.keyword];
    if (!hit) {
      return { keyword: input.keyword, result: null, fromCache: false };
    }
    return {
      keyword: input.keyword,
      result: hit,
      fromCache: false, // MVP 不走 food_cache 持久化
    };
  },

  /**
   * 拍照识菜
   *
   * MVP 简化：返 1 个 mock candidate（高置信度 0.95 + 中文菜名）
   * 真生产：调百度 AI 菜品识别 API + 限流 20 次/天/用户
   */
  async dishRecognize(_userId: string, _input: DishRecognizeInput) {
    return {
      candidates: [
        { name: '宫保鸡丁', confidence: 0.95, kcal: 218 },
        { name: '鱼香肉丝', confidence: 0.78, kcal: 195 },
        { name: '麻婆豆腐', confidence: 0.62, kcal: 168 },
      ],
      best: { name: '宫保鸡丁', confidence: 0.95, kcal: 218 },
    };
  },

  /**
   * 写饮食日记
   *
   * 流程：
   * 1. 算 totalCalorie = Σ (item.calorie × qty)
   * 2. 写 Meal 表
   * 3. 算 pointsEarned = min(50, floor(totalCalorie / 10)) — 但**不真加 points**
   *    （Meal 模型无 pointsEarned 字段；userRepo.addPoints 枚举无 'meal_log'；
   *    留 Phase 7 业务整合时再扩。MVP 仅记 calorie + 返预计积分）
   */
  async logMeal(userId: string, input: LogMealInput) {
    const totalCalorie = input.items.reduce((s, i) => s + i.calorie * i.qty, 0);
    const pointsEarned = Math.min(50, Math.floor(totalCalorie / 10));

    const meal = await prisma.meal.create({
      data: {
        userId,
        date: input.date,
        mealType: input.mealType,
        items: input.items as never,
        totalCalorie,
      },
    });

    return {
      ok: true as const,
      mealId: meal.id,
      totalCalorie,
      pointsEarned, // 预计积分（Phase 7 真接 userRepo.addPoints 替换 'checkin' / 'member_gift'）
    };
  },

  /**
   * 拉用户的饮食日记（按日期范围）
   *
   * 注：当前 MyMealsInputSchema 只有 since/until，不分页
   * （量小时 OK；用户量大再扩 page/pageSize）
   */
  async myMeals(userId: string, input: MyMealsInput) {
    const where: { userId: string; date?: { gte?: string; lte?: string } } = { userId };
    if (input.since || input.until) {
      where.date = {};
      if (input.since) where.date.gte = input.since;
      if (input.until) where.date.lte = input.until;
    }
    const list = await prisma.meal.findMany({
      where,
      orderBy: { date: 'desc' },
    });
    return { list, total: list.length };
  },
};
