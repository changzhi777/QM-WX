// pages/diet/index.ts — V0.2.0 饮食日记（FatSecret 搜索 + 营养详情 + Meal 记录 + 宏量汇总）
import { api } from '../../services/api';
import { ensureLogin } from '../../utils/auth';

interface MealItem {
  name: string;
  calorie: number;
  protein?: number;
  fat?: number;
  carb?: number;
  qty?: string;
}
interface Meal {
  id: string;
  mealType: string;
  mealTypeLabel: string;
  items: MealItem[];
  totalCalorie: number;
  createdAt: string;
}
interface Summary {
  calorie: number;
  protein: number;
  fat: number;
  carb: number;
}

const MEAL_TYPES = [
  { key: 'breakfast', label: '早餐' },
  { key: 'lunch', label: '午餐' },
  { key: 'dinner', label: '晚餐' },
  { key: 'snack', label: '加餐' },
];

Page({
  data: {
    summary: { calorie: 0, protein: 0, fat: 0, carb: 0 } as Summary,
    meals: [] as Meal[],
    mealTypes: MEAL_TYPES,
    mealTypeIndex: 0,
    searchKey: '',
    results: [] as Array<{ id: string; name: string; brand?: string }>,
    searching: false,
    showAdd: false,
    addForm: { name: '', calorie: '', protein: '', fat: '', carb: '', qty: '', foodId: '' },
  },

  onShow() {
    this.loadMeals();
  },

  async loadMeals() {
    try {
      await ensureLogin();
      const res = await api.call<{ date: string; meals: Meal[]; summary: Summary }>('food', 'myMeals');
      const labeled = res.meals.map((m) => ({
        ...m,
        mealTypeLabel: MEAL_TYPES.find((t) => t.key === m.mealType)?.label ?? m.mealType,
      }));
      this.setData({ meals: labeled, summary: res.summary });
    } catch (e) {
      wx.showToast({ title: (e as Error).message ?? '加载失败', icon: 'none' });
    }
  },

  onSearchInput(e: WechatMiniprogram.CustomEvent) {
    this.setData({ searchKey: e.detail.value });
  },

  async onSearch() {
    const q = this.data.searchKey.trim();
    if (!q) return;
    this.setData({ searching: true, results: [] });
    try {
      const { list } = await api.call<{ list: Array<{ id: string; name: string; brand?: string }> }>(
        'food',
        'search',
        { query: q },
      );
      this.setData({ results: list });
    } catch (e) {
      wx.showToast({ title: (e as Error).message ?? '搜索失败（可能未配置 FatSecret）', icon: 'none' });
    } finally {
      this.setData({ searching: false });
    }
  },

  async onPickFood(e: WechatMiniprogram.CustomEvent) {
    const item = e.currentTarget.dataset.item as { id: string; name: string };
    this.setData({
      showAdd: true,
      results: [],
      addForm: { name: item.name, calorie: '', protein: '', fat: '', carb: '', qty: '', foodId: item.id },
    });
    // 拉营养详情（每 100g，用户可按实际份量改）
    try {
      const { item: nut } = await api.call<{
        item: { calorie?: number; protein?: number; fat?: number; carb?: number };
      }>('food', 'nutrition', { foodId: item.id });
      this.setData({
        'addForm.calorie': nut.calorie ? String(nut.calorie) : '',
        'addForm.protein': nut.protein ? String(nut.protein) : '',
        'addForm.fat': nut.fat ? String(nut.fat) : '',
        'addForm.carb': nut.carb ? String(nut.carb) : '',
      });
    } catch {
      // nutrition 失败 → 用户手填卡路里
    }
  },

  onManualAdd() {
    this.setData({
      showAdd: true,
      addForm: { name: '', calorie: '', protein: '', fat: '', carb: '', qty: '', foodId: '' },
    });
  },

  onMealTypeChange(e: WechatMiniprogram.CustomEvent) {
    this.setData({ mealTypeIndex: Number(e.detail.value) });
  },

  onInputName(e: WechatMiniprogram.CustomEvent) {
    this.setData({ 'addForm.name': e.detail.value });
  },
  onInputCalorie(e: WechatMiniprogram.CustomEvent) {
    this.setData({ 'addForm.calorie': e.detail.value });
  },
  onInputProtein(e: WechatMiniprogram.CustomEvent) {
    this.setData({ 'addForm.protein': e.detail.value });
  },
  onInputFat(e: WechatMiniprogram.CustomEvent) {
    this.setData({ 'addForm.fat': e.detail.value });
  },
  onInputCarb(e: WechatMiniprogram.CustomEvent) {
    this.setData({ 'addForm.carb': e.detail.value });
  },
  onInputQty(e: WechatMiniprogram.CustomEvent) {
    this.setData({ 'addForm.qty': e.detail.value });
  },

  onCancelAdd() {
    this.setData({ showAdd: false });
  },

  async onConfirmAdd() {
    const f = this.data.addForm;
    if (!f.name.trim()) {
      wx.showToast({ title: '请填食物名称', icon: 'none' });
      return;
    }
    const calorie = Number(f.calorie);
    if (!calorie || calorie <= 0) {
      wx.showToast({ title: '请填卡路里', icon: 'none' });
      return;
    }
    const item: MealItem = {
      name: f.name.trim(),
      calorie,
      protein: f.protein ? Number(f.protein) : undefined,
      fat: f.fat ? Number(f.fat) : undefined,
      carb: f.carb ? Number(f.carb) : undefined,
      qty: f.qty || undefined,
    };
    try {
      await api.call('food', 'record', {
        mealType: MEAL_TYPES[this.data.mealTypeIndex].key,
        items: [item],
      });
      wx.showToast({ title: '已记录', icon: 'success' });
      this.setData({ showAdd: false, searchKey: '' });
      this.loadMeals();
    } catch (e) {
      wx.showToast({ title: (e as Error).message ?? '记录失败', icon: 'none' });
    }
  },

  async onRemoveMeal(e: WechatMiniprogram.CustomEvent) {
    const id = e.currentTarget.dataset.id as string;
    try {
      await api.call('food', 'removeMeal', { mealId: id });
      this.loadMeals();
    } catch (e) {
      wx.showToast({ title: (e as Error).message ?? '删除失败', icon: 'none' });
    }
  },
});
