/**
 * food module routes — V0.2.0 FatSecret 饮食搜索 + 饮食日记
 *
 * POST /api/food { action, payload }
 *   - search    { query }                   → FatSecret food.search.v2（FoodCache 1h 缓存）
 *   - nutrition { foodId }                  → FatSecret food.get.v2（每 100g 宏量）
 *   - record    { mealType, items, date? }  → 记录一餐（Meal 落库）
 *   - myMeals   { date? }                   → 某日饮食列表 + 宏量汇总（默认今日）
 *   - removeMeal { mealId }                 → 删除一餐（鉴权仅本人）
 *
 * search/nutrition 需 FatSecret 配置；record/myMeals/removeMeal 不依赖 FatSecret（用户可手填卡路里）。
 */
import type { FastifyInstance } from 'fastify';
import { Errors } from '../../common/errors.js';
import { isFatSecretConfigured } from './client.js';
import { foodService, type RecordMealInput } from './food.service.js';

export async function foodRoutes(app: FastifyInstance) {
  app.post('/', async (req) => {
    if (!req.user) throw Errors.unauthorized();
    const { action, payload } = (req.body ?? {}) as { action: string; payload?: Record<string, unknown> };

    switch (action) {
      case 'search': {
        if (!isFatSecretConfigured()) throw Errors.badRequest('饮食搜索未配置（FATSECRET_KEY 缺失）');
        const query = String(payload?.query ?? '').trim();
        if (!query) throw Errors.badRequest('query 必填');
        const list = await foodService.search(query);
        return { code: 0, data: { list } };
      }
      case 'nutrition': {
        if (!isFatSecretConfigured()) throw Errors.badRequest('饮食搜索未配置（FATSECRET_KEY 缺失）');
        const foodId = String(payload?.foodId ?? '').trim();
        if (!foodId) throw Errors.badRequest('foodId 必填');
        const item = await foodService.nutrition(foodId);
        return { code: 0, data: { item } };
      }
      case 'record': {
        const result = await foodService.recordMeal(req.user.id, payload as unknown as RecordMealInput);
        return { code: 0, data: result };
      }
      case 'myMeals': {
        const result = await foodService.myMeals(req.user.id, payload?.date as string | undefined);
        return { code: 0, data: result };
      }
      case 'removeMeal': {
        const result = await foodService.removeMeal(req.user.id, String(payload?.mealId ?? ''));
        return { code: 0, data: result };
      }
      default:
        throw Errors.badRequest(`unknown action: ${action}`);
    }
  });
}
