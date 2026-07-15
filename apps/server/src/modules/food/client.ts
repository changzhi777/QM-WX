/**
 * FatSecret API client（V0.2.0 饮食维度）
 *
 * OAuth2 client credentials（无需用户授权）→ food.search.v2（食物搜索）+ food.get.v2（营养详情）。
 * token 缓存（exp 前 60s 刷新）。
 * env: FATSECRET_KEY + FATSECRET_SECRET（生产已注入）。
 */
import { env } from '../../config/env.js';

let tokenCache: { token: string; exp: number } | null = null;

export function isFatSecretConfigured(): boolean {
  return !!env.FATSECRET_KEY && !!env.FATSECRET_SECRET;
}

/** 获取 OAuth2 access_token（缓存）*/
async function getToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.exp) return tokenCache.token;
  if (!isFatSecretConfigured()) throw new Error('FatSecret not configured');
  const res = await fetch('https://oauth.fatsecret.com/connect/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${env.FATSECRET_KEY}&client_secret=${env.FATSECRET_SECRET}`,
  });
  if (!res.ok) throw new Error(`FatSecret token failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: data.access_token, exp: Date.now() + (data.expires_in - 60) * 1000 };
  return data.access_token;
}

const API_BASE = 'https://platform.fatsecret.com/rest/server.api';

export interface FoodItem {
  id: string;
  name: string;
  brand?: string;
  /** 每 100g 营养（food.get.v2 填充；search 仅基础）*/
  calorie?: number;
  protein?: number;
  fat?: number;
  carb?: number;
}

/** 食物搜索（food.search.v2）*/
export async function searchFood(query: string): Promise<FoodItem[]> {
  const token = await getToken();
  const res = await fetch(
    `${API_BASE}?method=food.search.v2&search=${encodeURIComponent(query)}&format=json`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`FatSecret search failed: ${res.status}`);
  const data = (await res.json()) as {
    food_search?: { results?: { food?: Array<{ food_id: string; food_name: string; brand_name?: string }> } };
  };
  const foods = data.food_search?.results?.food ?? [];
  return foods.slice(0, 20).map((f) => ({
    id: f.food_id,
    name: f.food_name,
    brand: f.brand_name,
  }));
}

/** 食物营养详情（food.get.v2，返每 100g 营养）*/
export async function getFoodNutrition(foodId: string): Promise<FoodItem> {
  const token = await getToken();
  const res = await fetch(
    `${API_BASE}?method=food.get.v2&food_id=${foodId}&format=json`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`FatSecret get failed: ${res.status}`);
  const data = (await res.json()) as {
    food?: {
      food_id: string;
      food_name: string;
      servings?: { serving?: { calories?: string; protein?: string; fat?: string; carbohydrate?: string; metric_serving_unit?: string } };
    };
  };
  const f = data.food;
  const s = Array.isArray(f?.servings?.serving) ? f?.servings?.serving[0] : f?.servings?.serving;
  return {
    id: f?.food_id ?? foodId,
    name: f?.food_name ?? '',
    calorie: s?.calories ? Number(s.calories) : undefined,
    protein: s?.protein ? Number(s.protein) : undefined,
    fat: s?.fat ? Number(s.fat) : undefined,
    carb: s?.carbohydrate ? Number(s.carbohydrate) : undefined,
  };
}
