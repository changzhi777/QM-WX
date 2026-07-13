// pages/shoes/index.ts — 我的跑鞋（V0.1.26，跑者向 — 里程管理 + 更换提醒）
import { api } from '../../services/api';

interface Shoe {
  id: string;
  brand: string;
  model: string;
  nickname: string | null;
  currentKm: number;
  thresholdKm: number;
  status: string;
  purchasedAt: string | null;
  note: string | null;
  healthRatio: number;
  createdAt: string;
}

interface ShoeStats {
  total: number;
  activeCount: number;
  retiredCount: number;
  totalKm: number;
  retiringSoonCount: number;
}

const DEFAULT_THRESHOLD = 800;

Page({
  data: {
    shoes: [] as Shoe[],
    stats: {
      total: 0,
      activeCount: 0,
      retiredCount: 0,
      totalKm: 0,
      retiringSoonCount: 0,
    } as ShoeStats,
    loading: false,
    // V0.1.137 跑鞋成就
    achievements: null as null | {
      shoesMilestones: { currentTotalKm: number; achieved: any[]; next: any };
      shoeDays: { currentTotalDays: number; achieved: any[]; next: any };
      shoeCheckin: { currentTotalCheckins: number; achieved: any[]; next: any };
    },
    // 添加弹层
    formVisible: false,
    form: {
      brand: '',
      model: '',
      nickname: '',
      thresholdKm: DEFAULT_THRESHOLD,
    },
    submitting: false,
  },

  onShow() {
    this.loadShoes();
  },

  /** 拉取跑鞋列表 + 统计 */
  async loadShoes() {
    this.setData({ loading: true });
    try {
      const [listRes, statsRes, certRes] = await Promise.all([
        api.call<{ shoes: Shoe[] }>('shoes', 'list', {}),
        api.call<ShoeStats>('shoes', 'myStats', {}),
        api.call<{
          shoesMilestonesCert: any;
          shoeDaysMilestonesCert: any;
          shoeCheckinMilestonesCert: any;
        }>('stats', 'myCertificates', {}),
      ]);
      this.setData({
        shoes: listRes.shoes,
        stats: statsRes,
        loading: false,
        achievements: {
          shoesMilestones: certRes.shoesMilestonesCert,
          shoeDays: certRes.shoeDaysMilestonesCert,
          shoeCheckin: certRes.shoeCheckinMilestonesCert,
        },
      });
    } catch {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  /** V0.1.137 对比 2 双 active 跑鞋 */
  async onComparePick() {
    const activeShoes = this.data.shoes.filter((s) => s.status === 'active');
    if (activeShoes.length < 2) {
      wx.showToast({ title: '至少需要 2 双 active 跑鞋', icon: 'none' });
      return;
    }
    // 简化：选第一双 + 第二双（生产可弹层多选 picker）
    const [a, b] = activeShoes;
    wx.navigateTo({
      url: `/pages/shoes-compare/index?ids=${a.id},${b.id}`,
    });
  },

  /** 打开添加弹层 */
  onAdd() {
    this.setData({
      formVisible: true,
      form: { brand: '', model: '', nickname: '', thresholdKm: DEFAULT_THRESHOLD },
    });
  },

  /** 表单输入（动态字段） — V0.1.133 阈值改 slider，去除 text input */
  onInput(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field as keyof typeof this.data.form;
    const value = e.detail.value;
    this.setData({ form: { ...this.data.form, [field]: value } });
  },

  /** 阈值 slider 拖动中（V0.1.133） */
  onThresholdChanging(e: WechatMiniprogram.SliderChanging) {
    this.setData({ form: { ...this.data.form, thresholdKm: e.detail.value } });
  },

  /** 点击跑鞋卡 → 跳详情页（V0.1.133） */
  onTapShoe(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.navigateTo({ url: `/pages/shoes-detail/index?id=${id}` });
  },

  /** 提交添加 */
  async onSubmit() {
    const { brand, model, nickname, thresholdKm } = this.data.form;
    if (!brand.trim() || !model.trim()) {
      wx.showToast({ title: '品牌和型号必填', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      await api.call('shoes', 'add', {
        brand: brand.trim(),
        model: model.trim(),
        nickname: nickname.trim() || undefined,
        thresholdKm,
      });
      this.setData({ submitting: false, formVisible: false });
      wx.showToast({ title: '添加成功', icon: 'success' });
      this.loadShoes();
    } catch {
      this.setData({ submitting: false });
      wx.showToast({ title: '添加失败', icon: 'none' });
    }
  },

  /** 关闭弹层 */
  closeForm() {
    this.setData({ formVisible: false });
  },

  /** 退役跑鞋 */
  onRetire(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    const shoe = this.data.shoes.find((s) => s.id === id);
    if (!shoe) return;
    const name = shoe.nickname || `${shoe.brand} ${shoe.model}`;
    wx.showModal({
      title: '退役跑鞋',
      content: `将「${name}」退役？退役后不再计入活跃跑鞋，但保留历史打卡里程。`,
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await api.call('shoes', 'retire', { id });
          wx.showToast({ title: '已退役', icon: 'success' });
          this.loadShoes();
        } catch {
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      },
    });
  },
});
