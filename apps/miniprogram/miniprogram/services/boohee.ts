/**
 * 薄荷科学.AI 食物数据 API wrappers — V0.3.35
 *
 * 后端：apps/server/src/modules/boohee/boohee.routes.ts（7 action）
 * 小程序 miniprogram_npm 已含 ENDPOINTS.boohee（scripts/build-mp-shared.mjs 生成）
 *
 * 启用条件：feature flag 'boohee' = true（admin 后台远程开关）；env BOOHEE_API_KEY 已注入
 * 未启用时服务端抛 Errors.featureDisabled('boohee')，wrapper 直接透传错误给 UI
 *
 * 注意：小程序端的 food.module 已能记录卡路里（FatSecret）；
 *       boohee 是营养维度增强（GI/GL/NRV/health_light 4 个维度 FatSecret 没有）。
 */
import { api } from './api';

// ===== 7 action 类型 =====

/** 食物基础营养（详情接口 fields 结构）*/
export interface BooheeNutrient {
  name: string;
  value: number;
  unit: string;
  unit_name: string;
  nrv: number;
}

/** GI/GL 营养（带 level 等级）*/
export interface BooheeGiNutrient extends BooheeNutrient {
  level: number;
}

/** 食物单位（克数换算）*/
export interface BooheeFoodUnit {
  unit_id: number;
  unit_name: string;
  weight: string;
  eat_weight: string;
}

/** 食物搜索结果项 */
export interface BooheeFoodItem {
  code: string;
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbohydrate: number;
  health_light: number; // 0 无 / 1 绿 / 2 黄 / 3 红
  is_liquid: boolean;
  image_url: string;
  units?: BooheeFoodUnit[];
}

/** 食物搜索响应（薄荷 envelope.data）*/
export interface BooheeSearchData {
  page: number;
  per_page: number;
  has_more: boolean;
  foods: BooheeFoodItem[];
}

/** 食物详情（含 GI/GL/NRV）*/
export interface BooheeFoodDetail {
  code: string;
  name: string;
  health_light: number;
  image_url: string;
  is_liquid: boolean;
  food_type: string;
  calories: BooheeNutrient;
  protein: BooheeNutrient;
  fat: BooheeNutrient;
  carbohydrate: BooheeNutrient;
  gi?: BooheeGiNutrient;
  gl?: BooheeGiNutrient;
  ingredients: string[];
  units: BooheeFoodUnit[] | null;
}

/** 批量营养项（按 code 返回）*/
export interface BooheeBatchItem {
  code: string;
  name?: string;
  calories?: number;
  protein?: number;
  fat?: number;
  carbohydrate?: number;
  health_light?: number;
}

// ===== 4 个高频 wrapper =====

/** 2.1 食物搜索（关键词 + 分页）*/
export function searchBoohee(
  keyword: string,
  opts: { page?: number; perPage?: number; sort?: 'calorie_asc' | 'calorie_desc' } = {},
): Promise<{
  list: BooheeFoodItem[];
  hasMore: boolean;
  page: number;
  perPage: number;
}> {
  const { page = 1, perPage = 20, sort } = opts;
  return api
    .call<{ page: number; per_page: number; has_more: boolean; foods: BooheeFoodItem[] }>(
      'boohee',
      'search',
      { keyword, page, per_page: perPage, sort },
    )
    .then((resp) => ({
      list: resp.foods,
      hasMore: resp.has_more,
      page: resp.page,
      perPage: resp.per_page,
    }));
}

/** 2.2 食物详情（GI/GL/NRV 全营养结构）*/
export function getBooheeDetail(code: string): Promise<BooheeFoodDetail> {
  return api.call<BooheeFoodDetail>('boohee', 'detail', { code });
}

/** 2.6 批量营养信息（codes 数组）*/
export function batchBooheeNutrition(codes: string[]): Promise<{ list: BooheeBatchItem[] }> {
  return api.call<{ list: BooheeBatchItem[] }>('boohee', 'batchNutrition', { codes });
}

/** 2.7 食物排行榜 */
export function getBooheeRanking(
  opts: { type?: string; limit?: number } = {},
): Promise<{ list: unknown[] }> {
  const { type, limit = 10 } = opts;
  return api.call<unknown>('boohee', 'foodRanking', { type, limit }).then((resp: unknown) => {
    const r = resp as { list?: unknown[]; foods?: unknown[]; ranks?: unknown[]; data?: unknown };
    return { list: (r.list ?? r.foods ?? r.ranks ?? r.data ?? []) as unknown[] };
  });
}

// ===== 工具函数 =====

/** GI level → 健康建议（薄荷独家）*/
export function giLevelLabel(level: number | undefined): string {
  if (level == null) return '未知';
  if (level <= 1) return '低 GI（推荐）';
  if (level === 2) return '中 GI';
  return '高 GI';
}

/** health_light → 健康建议 */
export function healthLightLabel(light: number | undefined): string {
  switch (light) {
    case 1:
      return '推荐（绿）';
    case 2:
      return '适量（黄）';
    case 3:
      return '少吃（红）';
    default:
      return '无评级';
  }
}