/**
 * boohee module service — V0.3.35 薄荷食物数据 API（7 action + Cache.wrap）
 *
 * Cache TTL 分级（与 stats/shoes V0.2.3 Cache 范式一致）：
 *   search 120s（高频变）/ detail 300s（中频）/ categories 3600s（低频）/ ranking 600s
 *
 * 数据源：薄荷科学.AI（160 万食物库 + GI/GL/NRV/health_light，营养维度远超 FatSecret）
 * FatSearch（food.module）保留为降级备选，互不干扰。
 */
import { Cache } from '../../infra/cache.js';
import {
  booheeGet,
  type BooheeSearchData,
  type BooheeFoodDetail,
} from './boohee.client.js';

// Cache TTL（秒）
const TTL_SEARCH = 120;
const TTL_DETAIL = 300;
const TTL_CATEGORIES = 3600;
const TTL_RANKING = 600;

class BooheeService {
  /** 2.1 食物搜索（with_units=true 返回最热门单位）*/
  async search(
    keyword: string,
    opts: { page?: number; per_page?: number; sort?: string } = {},
  ): Promise<BooheeSearchData> {
    const { page = 1, per_page = 20, sort } = opts;
    const cacheKey = `boohee:search:${keyword}:${page}:${per_page}:${sort || ''}`;
    return Cache.wrap(cacheKey, TTL_SEARCH, () =>
      booheeGet<BooheeSearchData>('/v1/food/search', {
        keyword,
        page,
        per_page,
        sort,
        with_units: true,
      }),
    );
  }

  /** 2.2 食物详情（营养结构含 GI/GL/NRV/health_light）*/
  async detail(code: string): Promise<BooheeFoodDetail> {
    return Cache.wrap(`boohee:detail:${code}`, TTL_DETAIL, () =>
      booheeGet<BooheeFoodDetail>('/v1/food/detail', { code }),
    );
  }

  /** 2.3 食物分类列表 */
  async categories(): Promise<unknown> {
    return Cache.wrap('boohee:categories', TTL_CATEGORIES, () =>
      booheeGet('/v1/food/categories'),
    );
  }

  /** 2.4 分类食物列表 */
  async categoryFoods(
    categoryId: string,
    opts: { page?: number; per_page?: number } = {},
  ): Promise<unknown> {
    const { page = 1, per_page = 20 } = opts;
    return Cache.wrap(
      `boohee:categoryFoods:${categoryId}:${page}:${per_page}`,
      TTL_DETAIL,
      () => booheeGet('/v1/food/category/foods', { category_id: categoryId, page, per_page }),
    );
  }

  /** 2.5 食物单位 */
  async foodUnits(code: string): Promise<unknown> {
    return Cache.wrap(`boohee:units:${code}`, TTL_CATEGORIES, () =>
      booheeGet('/v1/food/units', { code }),
    );
  }

  /** 2.6 批量营养信息（codes 排序后 join 做 cacheKey，防顺序差异致缓存不命中）*/
  async batchNutrition(codes: string[]): Promise<unknown> {
    const key = codes.slice().sort().join(',');
    return Cache.wrap(`boohee:batch:${key}`, TTL_DETAIL, () =>
      booheeGet('/v1/food/batch_nutrition', { codes: key }),
    );
  }

  /** 2.7 食物排行榜 */
  async foodRanking(opts: { type?: string; limit?: number } = {}): Promise<unknown> {
    const { type, limit = 10 } = opts;
    return Cache.wrap(`boohee:ranking:${type || 'all'}:${limit}`, TTL_RANKING, () =>
      booheeGet('/v1/food/ranking', { type, limit }),
    );
  }
}

export const booheeService = new BooheeService();
