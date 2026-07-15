/**
 * food module service — V0.2.0 饮食日记（FatSecret 搜索 + 营养详情 + Meal 记录 + FoodCache 缓存）
 *
 * 数据流：
 *   search(keyword) → FoodCache 命中？返缓存 : searchFood(FatSecret) + 落 FoodCache(1h TTL)
 *   nutrition(foodId) → getFoodNutrition(food.get.v2 每 100g 宏量)
 *   recordMeal(items[]) → 算 totalCalorie + 落 Meal（items 含 calorie/protein/fat/carb/qty）
 *   myMeals(date?) → 某日所有 Meal + 宏量汇总（calorie/protein/fat/carb）
 *
 * Meal.items 结构（V0.2.0 宏量升级）：[{ name, calorie, protein?, fat?, carb?, qty?, foodId? }]
 */
import { prisma } from '../../infra/prisma.js';
import { Errors } from '../../common/errors.js';
import { searchFood, getFoodNutrition, type FoodItem } from './client.js';
import { ocrService } from '../ocr/ocr.service.js';

/** 单条饮食项（V0.2.0 宏量字段）*/
export interface MealItem {
  name: string;
  calorie: number; // 该项总卡路里（已按 qty 换算）
  protein?: number; // 克
  fat?: number; // 克
  carb?: number; // 克
  qty?: string; // 份量描述（如 "1 碗" / "200g"）
  foodId?: string; // FatSecret food_id（可选，便于追溯）
}

export interface RecordMealInput {
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  items: MealItem[];
  date?: string; // YYYY-MM-DD，默认今日（CN 时区）
}

/** FoodCache TTL：1 小时（食物库低频变化）*/
const FOOD_CACHE_TTL_MS = 3600 * 1000;

/** CN 时区今日 YYYY-MM-DD */
function todayCN(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export const foodService = {
  /** 搜索食物（FoodCache 命中返缓存，未命中调 FatSecret + 落缓存）*/
  async search(query: string): Promise<FoodItem[]> {
    const cached = await prisma.foodCache.findFirst({
      where: { keyword: query, expiredAt: { gt: new Date() } },
    });
    if (cached) {
      try {
        await prisma.foodCache.update({
          where: { id: cached.id },
          data: { hitCount: { increment: 1 } },
        });
      } catch {
        // hitCount 更新失败不阻塞（缓存仍可用）
      }
      return ((cached.payload as { list?: FoodItem[] }).list) ?? [];
    }
    const list = await searchFood(query);
    try {
      await prisma.foodCache.create({
        data: {
          keyword: query,
          source: 'fatsecret',
          payload: { list } as never,
          expiredAt: new Date(Date.now() + FOOD_CACHE_TTL_MS),
        },
      });
    } catch {
      // 缓存写失败不阻塞
    }
    return list;
  },

  /** 营养详情（food.get.v2，每 100g 宏量）*/
  async nutrition(foodId: string): Promise<FoodItem> {
    return getFoodNutrition(foodId);
  },

  /** 记录一餐（算 totalCalorie + 落 Meal）*/
  async recordMeal(userId: string, input: RecordMealInput) {
    if (!input.items || input.items.length === 0) {
      throw Errors.badRequest('至少添加一项食物');
    }
    const validTypes = ['breakfast', 'lunch', 'dinner', 'snack'];
    if (!validTypes.includes(input.mealType)) {
      throw Errors.badRequest(`mealType 非法：${input.mealType}`);
    }
    const date = input.date ?? todayCN();
    const totalCalorie = input.items.reduce((s, i) => s + (Number(i.calorie) || 0), 0);
    const meal = await prisma.meal.create({
      data: {
        userId,
        mealType: input.mealType,
        items: input.items as never,
        totalCalorie,
        date,
      },
    });
    return { id: meal.id, mealType: meal.mealType, totalCalorie, date };
  },

  /** 某日饮食列表 + 宏量汇总（默认今日）*/
  async myMeals(userId: string, date?: string) {
    const d = date ?? todayCN();
    const meals = await prisma.meal.findMany({
      where: { userId, date: d },
      orderBy: { createdAt: 'asc' },
    });
    let calorie = 0;
    let protein = 0;
    let fat = 0;
    let carb = 0;
    for (const m of meals) {
      calorie += m.totalCalorie;
      for (const item of m.items as unknown as MealItem[]) {
        protein += Number(item.protein) || 0;
        fat += Number(item.fat) || 0;
        carb += Number(item.carb) || 0;
      }
    }
    return {
      date: d,
      meals: meals.map((m) => ({
        id: m.id,
        mealType: m.mealType,
        items: m.items,
        totalCalorie: m.totalCalorie,
        createdAt: m.createdAt.toISOString(),
      })),
      summary: {
        calorie,
        protein: Math.round(protein),
        fat: Math.round(fat),
        carb: Math.round(carb),
      },
    };
  },

  /** 删除一餐（鉴权仅本人）*/
  async removeMeal(userId: string, mealId: string) {
    const meal = await prisma.meal.findUnique({ where: { id: mealId } });
    if (!meal || meal.userId !== userId) throw Errors.notFound('meal');
    await prisma.meal.delete({ where: { id: mealId } });
    return { ok: true };
  },

  /** ⑦拍照识别食物（vision=GLM-4V 识菜品 / ocr=腾讯 OCR 提文字→FatSecret 匹配）*/
  async recognize(input: { imageUrl: string; mode: 'vision' | 'ocr' }): Promise<MealItem> {
    if (!input.imageUrl) throw Errors.badRequest('imageUrl 必填');

    if (input.mode === 'ocr') {
      // 包装食品：下载图 → OCR 提文字 → FatSecret 搜索 → 营养详情
      const imgRes = await fetch(input.imageUrl);
      const buf = Buffer.from(await imgRes.arrayBuffer());
      const lines = await ocrService.generalBasic(buf);
      const text = lines.join(' ').slice(0, 30).trim();
      if (!text) throw Errors.badRequest('未识别到文字');
      const list = await this.search(text);
      if (list.length === 0) throw Errors.badRequest('食物库未匹配，换视觉模式试试');
      const item = await this.nutrition(list[0].id);
      return {
        name: item.name,
        calorie: item.calorie ?? 0,
        protein: item.protein,
        fat: item.fat,
        carb: item.carb,
        foodId: item.id,
      };
    }

    // vision：GLM-4V 多模态识菜品 → 直返 {name, calorie, 3 宏量}
    const base = process.env.LLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';
    const key = process.env.LLM_API_KEY || '';
    const visionModel = process.env.LLM_VISION_MODEL || 'glm-4.6v';
    if (!key) throw Errors.badRequest('AI 视觉未配置（LLM_API_KEY 缺失）');
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: visionModel,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: '识别图中的食物并估算一份的营养。只返回 JSON：{"name":"食物名","calorie":number总卡路里,"protein":number蛋白质克,"fat":number脂肪克,"carb":number碳水克}' },
            { type: 'image_url', image_url: { url: input.imageUrl } },
          ],
        }],
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`GLM-4V 识别失败 ${res.status}: ${detail.slice(0, 120)}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? '{}';
    let parsed: { name?: string; calorie?: number; protein?: number; fat?: number; carb?: number };
    try {
      parsed = JSON.parse(content);
    } catch {
      throw Errors.badRequest('AI 识别结果解析失败，请重试');
    }
    if (!parsed.name) throw Errors.badRequest('AI 未识别到食物，换张图试试');
    return {
      name: String(parsed.name),
      calorie: Math.round(Number(parsed.calorie) || 0),
      protein: parsed.protein != null ? Math.round(Number(parsed.protein)) : undefined,
      fat: parsed.fat != null ? Math.round(Number(parsed.fat)) : undefined,
      carb: parsed.carb != null ? Math.round(Number(parsed.carb)) : undefined,
    };
  },
};
