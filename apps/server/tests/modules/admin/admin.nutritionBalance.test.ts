/**
 * V0.3.35 admin.nutritionBalance 测试
 *
 * 覆盖：
 * - happy path（Checkin + Meal + boohee 补全）
 * - 无 Checkin 兜底（caloriesBurned 只算 device 或 0）
 * - 无 Meal 兜底（meals=[], totalIntake=0）
 * - boohee 失败容错（meals item 标 booheeEnriched: false）
 * - device.myTodayHealth 失败容错（caloriesBurned 只算 Checkin 部分）
 * - 净消耗过多 → recommendation 含「建议补充营养」
 * - 净摄入过多 → recommendation 含「建议增加」
 * - 平衡区间 → recommendation 含「平衡良好」
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===== mocks 全部 hoist 到顶部（vi.mock factory 限制）=====
const { mockPrisma, mockFoodMyMeals, mockBooheeSearch, mockBooheeDetail } = vi.hoisted(() => ({
  mockPrisma: {
    checkin: { count: vi.fn(), aggregate: vi.fn() },
    deviceDailyActivity: { findMany: vi.fn() },
  },
  mockFoodMyMeals: vi.fn(),
  mockBooheeSearch: vi.fn(),
  mockBooheeDetail: vi.fn(),
}));

vi.mock('../../../src/infra/prisma.js', () => ({ prisma: mockPrisma }));
vi.mock('../../../src/modules/food/food.service.js', () => ({
  foodService: { myMeals: (...args: unknown[]) => mockFoodMyMeals(...args) },
}));
vi.mock('../../../src/modules/boohee/boohee.service.js', () => ({
  booheeService: {
    search: (...args: unknown[]) => mockBooheeSearch(...args),
    detail: (...args: unknown[]) => mockBooheeDetail(...args),
  },
}));

import { getNutritionBalance } from '../../../src/modules/admin/admin.service.js';

beforeEach(() => {
  vi.clearAllMocks();
  // 默认 happy path：1 次 Checkin + 1 餐 + boohee 补全成功
  mockPrisma.checkin.count.mockResolvedValue(1);
  mockPrisma.checkin.aggregate.mockResolvedValue({ _sum: { distance: 5.0 } });
  mockPrisma.deviceDailyActivity.findMany.mockResolvedValue([
    { caloriesKcal: 200, step: 8000 },
  ]);
  mockFoodMyMeals.mockResolvedValue({
    date: '2026-07-29',
    meals: [
      {
        id: 'm1',
        mealType: 'lunch',
        items: [{ name: '鸡胸肉', calorie: 200, protein: 30, fat: 5, carb: 0 }],
        totalCalorie: 200,
        createdAt: new Date().toISOString(),
      },
    ],
    summary: { calorie: 200, protein: 30, fat: 5, carb: 0 },
  });
  mockBooheeSearch.mockResolvedValue({
    page: 1,
    per_page: 1,
    has_more: false,
    foods: [{ code: 'chicken_breast', name: '鸡胸肉', calories: 165, protein: 31, fat: 3.6, carbohydrate: 0, health_light: 1, is_liquid: false, image_url: '' }],
  });
  mockBooheeDetail.mockResolvedValue({
    code: 'chicken_breast',
    name: '鸡胸肉',
    health_light: 1,
    image_url: '',
    is_liquid: false,
    food_type: 'meat',
    calories: { name: '热量', value: 165, unit: 'kcal', unit_name: '千卡', nrv: 8 },
    protein: { name: '蛋白质', value: 31, unit: 'g', unit_name: '克', nrv: 52 },
    fat: { name: '脂肪', value: 3.6, unit: 'g', unit_name: '克', nrv: 6 },
    carbohydrate: { name: '碳水', value: 0, unit: 'g', unit_name: '克', nrv: 0 },
    gi: { name: 'GI', value: 0, unit: '', unit_name: '', nrv: 0, level: 1 },
    ingredients: ['鸡胸肉'],
    units: null,
    materials: null,
  });
});

describe('V0.3.35 getNutritionBalance', () => {
  it('happy path：Checkin 距离+Meal+boohee 补全成功', async () => {
    const result = await getNutritionBalance({ userId: 'u1' });
    expect(result.sport.checkinCount).toBe(1);
    expect(result.sport.totalDistanceKm).toBe(5);
    // 5km × 60 + 200 device = 500
    expect(result.sport.caloriesBurned).toBe(500);
    expect(result.sport.source).toBe('both');
    expect(result.meals).toHaveLength(1);
    expect(result.meals[0].items[0].booheeEnriched).toBe(true);
    expect(result.meals[0].items[0].gi).toBe(0);
    expect(result.meals[0].items[0].healthLight).toBe(1);
    // 摄入 200 - 消耗 500 = -300（平衡区间）
    expect(result.netBalance.calorie).toBe(-300);
    expect(result.netBalance.recommendation).toMatch(/能量平衡良好/);
  });

  it('无 Checkin 兜底：caloriesBurned 只算 device', async () => {
    mockPrisma.checkin.count.mockResolvedValue(0);
    mockPrisma.checkin.aggregate.mockResolvedValue({ _sum: { distance: null } });
    const result = await getNutritionBalance({ userId: 'u1' });
    expect(result.sport.checkinCount).toBe(0);
    expect(result.sport.totalDistanceKm).toBe(0);
    expect(result.sport.caloriesBurned).toBe(200); // 只算 device
    expect(result.sport.source).toBe('device');
  });

  it('无 Meal 兜底：meals=[], totalIntake=0', async () => {
    mockFoodMyMeals.mockResolvedValue({
      date: '2026-07-29',
      meals: [],
      summary: { calorie: 0, protein: 0, fat: 0, carb: 0 },
    });
    const result = await getNutritionBalance({ userId: 'u1' });
    expect(result.meals).toEqual([]);
    expect(result.totalIntake.calorie).toBe(0);
    // 净 = 0 - 500 = -500（边界值，「平衡良好」档）
    expect(result.netBalance.calorie).toBe(-500);
  });

  it('boohee 失败容错：meals item 标 booheeEnriched: false', async () => {
    mockBooheeSearch.mockRejectedValue(new Error('薄荷 API 错误: 权限不足'));
    const result = await getNutritionBalance({ userId: 'u1' });
    expect(result.meals[0].items[0].booheeEnriched).toBe(false);
    expect(result.meals[0].items[0].gi).toBeUndefined();
  });

  it('boohee search 空结果 → 不调 detail，标 false', async () => {
    mockBooheeSearch.mockResolvedValue({ page: 1, per_page: 1, has_more: false, foods: [] });
    const result = await getNutritionBalance({ userId: 'u1' });
    expect(mockBooheeDetail).not.toHaveBeenCalled();
    expect(result.meals[0].items[0].booheeEnriched).toBe(false);
  });

  it('device 失败容错：caloriesBurned 只算 Checkin 部分', async () => {
    mockPrisma.deviceDailyActivity.findMany.mockRejectedValue(new Error('device 错误'));
    const result = await getNutritionBalance({ userId: 'u1' });
    // 5km × 60 = 300（不算 device）
    expect(result.sport.caloriesBurned).toBe(300);
    expect(result.sport.source).toBe('checkin');
  });

  it('净消耗过多（-800）→ recommendation 含「建议补充营养」', async () => {
    // Checkin 20km + device 0 → 消耗 1200
    mockPrisma.checkin.aggregate.mockResolvedValue({ _sum: { distance: 20.0 } });
    mockPrisma.deviceDailyActivity.findMany.mockResolvedValue([]);
    mockFoodMyMeals.mockResolvedValue({
      date: '2026-07-29',
      meals: [{ id: 'm', mealType: 'lunch', items: [], totalCalorie: 400, createdAt: '' }],
      summary: { calorie: 400, protein: 0, fat: 0, carb: 0 },
    });
    const result = await getNutritionBalance({ userId: 'u1' });
    // 摄入 400 - 消耗 1200 = -800
    expect(result.netBalance.calorie).toBe(-800);
    expect(result.netBalance.recommendation).toMatch(/建议补充营养/);
  });

  it('净摄入过多（+800）→ recommendation 含「建议增加」', async () => {
    mockPrisma.checkin.count.mockResolvedValue(0);
    mockPrisma.checkin.aggregate.mockResolvedValue({ _sum: { distance: null } });
    mockPrisma.deviceDailyActivity.findMany.mockResolvedValue([]);
    mockFoodMyMeals.mockResolvedValue({
      date: '2026-07-29',
      meals: [
        { id: 'm1', mealType: 'lunch', items: [], totalCalorie: 1500, createdAt: '' },
        { id: 'm2', mealType: 'dinner', items: [], totalCalorie: 500, createdAt: '' },
      ],
      summary: { calorie: 2000, protein: 0, fat: 0, carb: 0 },
    });
    const result = await getNutritionBalance({ userId: 'u1' });
    // 摄入 2000 - 消耗 0 = +2000
    expect(result.netBalance.calorie).toBe(2000);
    expect(result.netBalance.recommendation).toMatch(/建议增加/);
  });

  it('Checkin + Device 都无 → source: "none"', async () => {
    mockPrisma.checkin.count.mockResolvedValue(0);
    mockPrisma.checkin.aggregate.mockResolvedValue({ _sum: { distance: null } });
    mockPrisma.deviceDailyActivity.findMany.mockResolvedValue([]);
    const result = await getNutritionBalance({ userId: 'u1' });
    expect(result.sport.source).toBe('none');
    expect(result.sport.caloriesBurned).toBe(0);
  });
});
