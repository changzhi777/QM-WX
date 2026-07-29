/**
 * boohee module routes — V0.3.35 薄荷食物数据 API
 *
 * POST /api/boohee { action, payload }
 *   - search         { keyword, page?, per_page?, sort? }  → 2.1 食物搜索（Cache 120s）
 *   - detail         { code }                              → 2.2 食物详情（GI/GL/NRV，Cache 300s）
 *   - categories     {}                                    → 2.3 食物分类（Cache 3600s）
 *   - categoryFoods  { category_id, page?, per_page? }     → 2.4 分类食物列表
 *   - foodUnits      { code }                              → 2.5 食物单位
 *   - batchNutrition { codes[] }                           → 2.6 批量营养信息
 *   - foodRanking    { type?, limit? }                     → 2.7 食物排行榜
 *
 * 需 JWT 鉴权；feature flag `boohee` 关闭时可通过 admin 远程开启。
 */
import type { FastifyInstance } from 'fastify';
import { Errors } from '../../common/errors.js';
import { parseOrBadRequest } from '../../common/helpers/parse.js';
import { booheeService } from './boohee.service.js';
import {
  SearchSchema,
  DetailSchema,
  CategoryFoodsSchema,
  BatchNutritionSchema,
  RankingSchema,
} from './boohee.schema.js';

export async function booheeRoutes(app: FastifyInstance) {
  app.post('/', async (req) => {
    if (!req.user) throw Errors.unauthorized();
    const { action, payload } = (req.body ?? {}) as { action: string; payload?: Record<string, unknown> };

    switch (action) {
      case 'search': {
        const input = parseOrBadRequest(SearchSchema, payload);
        const data = await booheeService.search(input.keyword, {
          page: input.page,
          per_page: input.per_page,
          sort: input.sort,
        });
        return { code: 0, data };
      }
      case 'detail': {
        const input = parseOrBadRequest(DetailSchema, payload);
        const data = await booheeService.detail(input.code);
        return { code: 0, data };
      }
      case 'categories': {
        const data = await booheeService.categories();
        return { code: 0, data };
      }
      case 'categoryFoods': {
        const input = parseOrBadRequest(CategoryFoodsSchema, payload);
        const data = await booheeService.categoryFoods(input.category_id, {
          page: input.page,
          per_page: input.per_page,
        });
        return { code: 0, data };
      }
      case 'foodUnits': {
        const input = parseOrBadRequest(DetailSchema, payload);
        const data = await booheeService.foodUnits(input.code);
        return { code: 0, data };
      }
      case 'batchNutrition': {
        const input = parseOrBadRequest(BatchNutritionSchema, payload);
        const data = await booheeService.batchNutrition(input.codes);
        return { code: 0, data };
      }
      case 'foodRanking': {
        const input = parseOrBadRequest(RankingSchema, payload);
        const data = await booheeService.foodRanking({ type: input.type, limit: input.limit });
        return { code: 0, data };
      }
      default:
        throw Errors.badRequest(`unknown action: ${action}`);
    }
  });
}
