/**
 * 薄荷科学.AI API client（V0.3.35 食物数据对接）
 *
 * X-Api-Key 认证（无需 OAuth2 token，比 FatSecret 简单）。
 * 接口域名 https://api.boohee.com/open-apis
 * envelope: { code: 0 成功 / 非 0 失败, message, data }
 *
 * env: BOOHEE_API_KEY + BOOHEE_BASE_URL
 */
import { env } from '../../config/env.js';
import { Errors } from '../../common/errors.js';

export function isBooheeConfigured(): boolean {
  return !!env.BOOHEE_API_KEY;
}

interface BooheeEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

/**
 * GET 请求封装（X-Api-Key + envelope 解包）
 * code !== 0 抛 Errors.badRequest；10s timeout（AbortSignal）
 */
export async function booheeGet<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<T> {
  if (!isBooheeConfigured()) {
    throw Errors.featureDisabled('boohee');
  }

  const url = new URL(env.BOOHEE_BASE_URL + path);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: '*/*', 'X-Api-Key': env.BOOHEE_API_KEY! },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw Errors.badRequest(`薄荷 API 请求失败: HTTP ${res.status}`);
  }

  const envelope = (await res.json()) as BooheeEnvelope<T>;
  if (envelope.code !== 0) {
    throw Errors.badRequest(`薄荷 API 错误: ${envelope.message || `code ${envelope.code}`}`);
  }

  return envelope.data;
}

// ===== 薄荷 API 返回类型 =====

/** 营养字段（详情接口 calories/protein/fat/carbohydrate 的结构）*/
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

/** 食物搜索结果项（2.1 food/search）*/
export interface BooheeFoodItem {
  code: string;
  name: string;
  calories: number; // kcal/100g
  protein: number; // g/100g
  fat: number;
  carbohydrate: number;
  health_light: number; // 0 无 / 1 绿 / 2 黄 / 3 红
  is_liquid: boolean;
  image_url: string;
  units?: BooheeFoodUnit[];
}

/** 食物搜索响应（2.1）*/
export interface BooheeSearchData {
  page: number;
  per_page: number;
  has_more: boolean;
  foods: BooheeFoodItem[];
}

/** 食物详情（2.2 food/detail — 营养结构更丰富含 GI/GL/NRV）*/
export interface BooheeFoodDetail {
  code: string;
  name: string;
  health_light: number;
  image_url: string;
  food_weight_url?: string;
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
  materials: unknown;
}

/** 食物分类（2.3）*/
export interface BooheeCategory {
  id: number;
  name: string;
  [k: string]: unknown;
}
