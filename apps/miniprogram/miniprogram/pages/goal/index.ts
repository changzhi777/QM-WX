// pages/goal/index.ts — 跑步目标（V0.1.28，跑者向 — 月度/年度/自定义 + 进度跟踪）
import { api } from '../../services/api';

interface Goal {
  id: string;
  type: string;
  typeLabel: string;
  title: string | null;
  targetDistance: number;
  currentDistance: number;
  percent: number;
  status: string;
  periodStart: string;
  periodEnd: string;
  completed: boolean;
}

const TYPE_LABEL: Record<string, string> = {
  monthly: '月度目标',
  yearly: '年度目标',
  custom: '自定义',
};

Page({
  data: {
    goals: [] as Goal[],
    loading: false,
    formVisible: false,
    form: {
      type: 'monthly',
      targetDistance: 50,
      title: '',
    },
    submitting: false,
  },

  onShow() {
    this.loadGoals();
  },

  /** 拉取目标列表（含进度，调 goal.list） */
  async loadGoals() {
    this.setData({ loading: true });
    try {
      const res = await api.call<{ goals: Omit<Goal, 'typeLabel'>[] }>('goal', 'list', {});
      this.setData({
        goals: res.goals.map((g) => ({
          ...g,
          typeLabel: TYPE_LABEL[g.type] || g.type,
        })),
        loading: false,
      });
    } catch {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onAdd() {
    this.setData({ formVisible: true, form: { type: 'monthly', targetDistance: 50, title: '' } });
  },

  /** 选类型（picker index → type） */
  onTypeChange(e: WechatMiniprogram.CustomEvent) {
    const idx = Number(e.detail.value);
    const types = ['monthly', 'yearly', 'custom'];
    const type = types[idx] || 'monthly';
    const defaultTarget = type === 'yearly' ? 600 : 50;
    this.setData({ form: { ...this.data.form, type, targetDistance: defaultTarget } });
  },

  onInputTarget(e: WechatMiniprogram.CustomEvent) {
    this.setData({ form: { ...this.data.form, targetDistance: Number(e.detail.value) || 50 } });
  },

  onInputTitle(e: WechatMiniprogram.CustomEvent) {
    this.setData({ form: { ...this.data.form, title: e.detail.value } });
  },

  /** 提交创建 */
  async onSubmit() {
    const { type, targetDistance, title } = this.data.form;
    if (targetDistance < 1) {
      wx.showToast({ title: '目标至少 1 km', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      await api.call('goal', 'add', {
        type,
        targetDistance,
        title: title.trim() || undefined,
      });
      this.setData({ submitting: false, formVisible: false });
      wx.showToast({ title: '已创建', icon: 'success' });
      this.loadGoals();
    } catch {
      this.setData({ submitting: false });
      wx.showToast({ title: '创建失败', icon: 'none' });
    }
  },

  closeForm() {
    this.setData({ formVisible: false });
  },

  /** 删除目标 */
  onRemove(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.showModal({
      title: '删除目标',
      content: '确定删除这个目标吗？',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await api.call('goal', 'remove', { id });
          wx.showToast({ title: '已删除', icon: 'success' });
          this.loadGoals();
        } catch {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      },
    });
  },
});
