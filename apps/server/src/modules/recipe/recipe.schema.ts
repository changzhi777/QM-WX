/**
 * recipe module Zod schemas
 *
 * 来源：reviews/running-group-stats/07 营养 / 08 菜谱采集
 * Phase 7 实现
 */
import { z } from 'zod';

export const RECIPE_CATEGORIES = [
  'breakfast',
  'prerun',
  'postrun',
  'lowcal',
  'homedish',
] as const;
export type RecipeCategory = (typeof RECIPE_CATEGORIES)[number];

export const ListRecipesInputSchema = z.object({
  category: z.enum(RECIPE_CATEGORIES).optional(),
  keyword: z.string().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListRecipesInput = z.infer<typeof ListRecipesInputSchema>;

export const RecipeDetailInputSchema = z.object({
  id: z.string().min(1),
});
export type RecipeDetailInput = z.infer<typeof RecipeDetailInputSchema>;

export const NutritionSearchInputSchema = z.object({
  keyword: z.string().min(1).max(32),
});
export type NutritionSearchInput = z.infer<typeof NutritionSearchInputSchema>;

/** 拍照识菜（前端传 base64） */
export const DishRecognizeInputSchema = z.object({
  imageBase64: z.string().min(100),
  topNum: z.number().int().min(1).max(5).default(3),
});
export type DishRecognizeInput = z.infer<typeof DishRecognizeInputSchema>;

/** 饮食日记 */
export const LogMealInputSchema = z.object({
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  items: z.array(
    z.object({
      name: z.string().min(1).max(64),
      calorie: z.number().int().min(0),
      qty: z.number().int().min(1).default(1),
    }),
  ),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type LogMealInput = z.infer<typeof LogMealInputSchema>;

/** myMeals 查询：since/until 必须 YYYY-MM-DD */
export const MyMealsInputSchema = z.object({
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type MyMealsInput = z.infer<typeof MyMealsInputSchema>;

export const RecipeActionBodySchema = z.object({
  action: z.enum([
    'listRecipes',
    'recipeDetail',
    'nutritionSearch',
    'dishRecognize',
    'logMeal',
    'myMeals',
  ]),
  payload: z.unknown().optional(),
});
