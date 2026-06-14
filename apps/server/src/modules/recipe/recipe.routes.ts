/**
 * recipe module routes — POST /api/recipe
 *
 * Phase 7 实现。当前全 stub。
 */
import type { FastifyInstance } from 'fastify';
import { recipeService } from './recipe.service.js';
import { Errors } from '../../common/errors.js';
import {
  DishRecognizeInputSchema,
  ListRecipesInputSchema,
  LogMealInputSchema,
  MyMealsInputSchema,
  NutritionSearchInputSchema,
  RecipeDetailInputSchema,
} from './recipe.schema.js';

export async function recipeRoutes(app: FastifyInstance) {
  app.post(
    '/',
    async (req, reply) => {
      const { action, payload } = req.body as { action: string; payload?: unknown };

      switch (action) {
        case 'listRecipes': {
          const input = ListRecipesInputSchema.parse(payload ?? {});
          return { code: 0, data: await recipeService.listRecipes(input) };
        }
        case 'recipeDetail': {
          const input = RecipeDetailInputSchema.parse(payload);
          return { code: 0, data: await recipeService.recipeDetail(input.id) };
        }
        case 'nutritionSearch': {
          if (!req.user) throw Errors.unauthorized();
          const input = NutritionSearchInputSchema.parse(payload);
          return { code: 0, data: await recipeService.nutritionSearch(req.user.id, input) };
        }
        case 'dishRecognize': {
          if (!req.user) throw Errors.unauthorized();
          const input = DishRecognizeInputSchema.parse(payload);
          return { code: 0, data: await recipeService.dishRecognize(req.user.id, input) };
        }
        case 'logMeal': {
          if (!req.user) throw Errors.unauthorized();
          const input = LogMealInputSchema.parse(payload);
          return { code: 0, data: await recipeService.logMeal(req.user.id, input) };
        }
        case 'myMeals': {
          if (!req.user) throw Errors.unauthorized();
          const input = MyMealsInputSchema.parse(payload ?? {});
          return {
            code: 0,
            data: await recipeService.myMeals(req.user.id, input),
          };
        }
        default:
          return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
      }
    },
  );
}
