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
      const [listRes, statsRes] = await Promise.all([
        api.call<{ shoes: Shoe[] }>('shoes', 'list', {}),
        api.call<ShoeStats>('shoes', 'myStats', {}),
      ]);
      this.setData({ shoes: listRes.shoes, stats: statsRes, loading: false });
    } catch {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
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
