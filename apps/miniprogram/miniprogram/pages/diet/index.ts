// pages/diet/index.ts — V0.2.0 饮食日记（FatSecret + 薄荷 V0.3.35 boohee 双源）
import { api } from '../../services/api';
import { ensureLogin } from '../../utils/auth';
import {
  searchBoohee,
  getBooheeDetail,
  type BooheeFoodItem,
  type BooheeFoodDetail,
} from '../../services/boohee';

interface MealItem {
  name: string;
  calorie: number;
  protein?: number;
  fat?: number;
  carb?: number;
  qty?: string;
  foodId?: string;
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
    // ===== V0.3.35 boohee 搜索增强 =====
    booheeKeyword: '',
    booheeResults: [] as Array<BooheeFoodItem>,
    booheeSearching: false,
    booheeEnriched: null as null | {
      code: string;
      name: string;
      calories: number;
      protein: number;
      fat: number;
      carbohydrate: number;
      health_light: number;
      gi?: number;
      giLevel?: number;
      gl?: number;
      glLevel?: number;
    },
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
      booheeKeyword: '',
      booheeResults: [],
      booheeEnriched: null,
    });
  },

  // ===== V0.3.35 薄荷搜菜 =====
  onBooheeKeywordInput(e: { detail: { value: string } }) {
    this.setData({ booheeKeyword: e.detail.value });
  },

  async onBooheeSearch() {
    const kw = this.data.booheeKeyword.trim();
    if (!kw) {
      wx.showToast({ title: '请输入菜名', icon: 'none' });
      return;
    }
    this.setData({ booheeSearching: true });
    try {
      const resp = await searchBoohee(kw, { perPage: 20 });
      this.setData({ booheeResults: resp.list });
      if (resp.list.length === 0) wx.showToast({ title: '薄荷无结果', icon: 'none' });
    } catch (e) {
      wx.showToast({ title: (e as Error).message || '薄荷搜索失败', icon: 'none' });
    } finally {
      this.setData({ booheeSearching: false });
    }
  },

  /** 选薄荷食物 → 自动填 5 字段 + 展示 GI/GL/NRV 详情 */
  async onBooheePick(e: { currentTarget: { dataset: { code: string } } }) {
    const code = e.currentTarget.dataset.code;
    const item = this.data.booheeResults.find((r) => r.code === code);
    if (!item) return;

    this.setData({
      booheeResults: [],
      addForm: {
        name: item.name,
        calorie: String(item.calories),
        protein: String(item.protein),
        fat: String(item.fat),
        carb: String(item.carbohydrate),
        qty: '100g',
        foodId: '',
      },
      showAdd: true,
    });

    // 拉详情拿 GI/GL/NRV（服务端走 X-Api-Key + Cache 300s）
    try {
      const detail: BooheeFoodDetail = await getBooheeDetail(code);
      this.setData({
        booheeEnriched: {
          code: detail.code,
          name: detail.name,
          calories: detail.calories.value,
          protein: detail.protein.value,
          fat: detail.fat.value,
          carbohydrate: detail.carbohydrate.value,
          health_light: detail.health_light,
          gi: detail.gi?.value,
          giLevel: detail.gi?.level,
          gl: detail.gl?.value,
          glLevel: detail.gl?.level,
        },
        'addForm.calorie': String(detail.calories.value),
        'addForm.protein': String(detail.protein.value),
        'addForm.fat': String(detail.fat.value),
        'addForm.carb': String(detail.carbohydrate.value),
      });
      wx.showToast({ title: `已填 ${detail.name} · GI ${detail.gi?.value ?? '-'}`, icon: 'none' });
    } catch (e) {
      // 详情失败不影响主流程
      console.warn('[boohee] detail 失败', (e as Error).message);
    }
  },

  /** ⑦拍照识别：选图 → 选模式（菜品/包装）→ uploadFile COS → food.recognize → 填 addForm */
  async onTakePhoto() {
    try {
      const r = await wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album', 'camera'] });
      const temp = r.tempFiles[0]?.tempFilePath;
      if (!temp) return;
      wx.showActionSheet({
        itemList: ['菜品（AI 视觉识别）', '包装食品（OCR 文字匹配）'],
        success: async (s) => {
          const mode = s.tapIndex === 1 ? 'ocr' : 'vision';
          wx.showLoading({ title: '识别中...', mask: true });
          try {
            const imageUrl = await api.uploadFile(temp, 'image');
            const { item } = await api.call<{ item: MealItem }>('food', 'recognize', { imageUrl, mode });
            this.setData({
              showAdd: true,
              addForm: {
                name: item.name,
                calorie: String(item.calorie ?? ''),
                protein: item.protein != null ? String(item.protein) : '',
                fat: item.fat != null ? String(item.fat) : '',
                carb: item.carb != null ? String(item.carb) : '',
                qty: '',
                foodId: item.foodId ?? '',
              },
            });
          } catch (e) {
            wx.showToast({ title: (e as Error).message ?? '识别失败', icon: 'none' });
          } finally {
            wx.hideLoading();
          }
        },
      });
    } catch {
      // 用户取消选图，静默
    }
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
