/**
 * recipe module service — STUB
 *
 * Phase 7 实现：
 * - listRecipes / recipeDetail：读 recipes 表
 * - nutritionSearch：调第三方 API（聚合/天行） + 写 food_cache
 * - dishRecognize：调百度 AI 菜品识别 + 限流
 * - logMeal / myMeals：用户饮食日记
 *
 * 前置：
 * - 聚合数据 / 天行 / 百度 AI 账号 + AppKey
 * - 食品类目资质（V1 提审前就要）
 */
import { Errors } from '../../common/errors.js';
import type {
  DishRecognizeInput,
  LogMealInput,
  NutritionSearchInput,
  ListRecipesInput,
} from './recipe.schema.js';

export const recipeService = {
  async listRecipes(_input: ListRecipesInput) {
    // TODO Phase 7: 查 recipes 表（audit.status='on'）
    return { list: [], total: 0, page: 1, pageSize: 20 };
  },

  async recipeDetail(_id: string) {
    // TODO Phase 7
    throw Errors.notImplemented('recipeDetail');
  },

  /**
   * 营养查询（先查 food_cache → 命中返；未命中调第三方 API + 写缓存）
   */
  async nutritionSearch(_userId: string, _input: NutritionSearchInput) {
    // TODO Phase 7
    return {
      keyword: _input.keyword,
      result: null,
      fromCache: false,
    };
  },

  /**
   * 拍照识菜（百度 AI · 限流 20 次/天/用户）
   */
  async dishRecognize(_userId: string, _input: DishRecognizeInput) {
    // TODO Phase 7
    return {
      candidates: [],
      best: null,
    };
  },

  /** 写饮食日记 */
  async logMeal(_userId: string, _input: LogMealInput) {
    // TODO Phase 7
    return { ok: true, totalCalorie: _input.items.reduce((s, i) => s + i.calorie * i.qty, 0) };
  },

  /** 拉用户的饮食日记（按日期范围） */
  async myMeals(_userId: string, _since: string, _until: string) {
    return { list: [] };
  },
};
