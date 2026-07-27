// pages/goal/index.ts — 健康目标闭环（V0.3.7 清单 2026-07-26 #30 新增★）
// 7 类目标：减脂/减重/增重/睡眠/情绪/控糖/祛湿
// 后端：goal.module（add/list/updateProgress），kind 字段区分类型
import { api } from '../../services/api';

const KIND_LIST = ['weight_loss', 'weight_gain', 'sleep', 'mood', 'sugar', 'dampness'] as const;
const KIND_CONFIG: Record<string, { label: string; icon: string; unit: string; desc: string }> = {
  weight_loss: { label: '减脂减重', icon: '⚖️', unit: 'kg', desc: '目标体重' },
  weight_gain: { label: '增重', icon: '💪', unit: 'kg', desc: '目标体重' },
  sleep: { label: '睡眠改善', icon: '😴', unit: 'h', desc: '每夜睡眠时长' },
  mood: { label: '情绪管理', icon: '😊', unit: '分', desc: '1-10 分，越低越好' },
  sugar: { label: '控糖', icon: '🍬', unit: 'mmol/L', desc: '空腹血糖' },
  dampness: { label: '祛湿', icon: '🌿', unit: '分', desc: '1-10 分，越低越好' },
};
const KIND_LABELS = KIND_LIST.map((k) => KIND_CONFIG[k].label);

Page({
  data: {
    goals: [] as Array<Record<string, unknown>>,
    loading: true,
    showAdd: false,
    addKindIndex: 0,
    addTarget: '',
    addPeriod: 'monthly',
    showUpdate: false,
    updateGoalId: '',
    updateValue: '',
    kindLabels: KIND_LABELS,
  },

  onShow() { this.loadGoals(); },

  async loadGoals() {
    try {
      const res = await api.call<{ goals: Array<Record<string, unknown>> }>('goal', 'list', {});
      const goals = res.goals.map((g) => {
        const cfg = KIND_CONFIG[(g.kind as string) ?? 'distance'] ?? { label: g.kind, icon: '🎯', unit: '' };
        return { ...g, kindLabel: cfg.label, kindIcon: cfg.icon };
      });
      this.setData({ goals, loading: false });
    } catch (e) {
      this.setData({ loading: false });
    }
  },

  onTapAdd() { this.setData({ showAdd: true }); },
  onCloseAdd() { this.setData({ showAdd: false }); },
  onKindChange(e: { detail: { value: number } }) { this.setData({ addKindIndex: e.detail.value }); },
  onTargetInput(e: { detail: { value: string } }) { this.setData({ addTarget: e.detail.value }); },

  async onSubmitAdd() {
    const kind = KIND_LIST[this.data.addKindIndex];
    const target = parseFloat(this.data.addTarget);
    if (isNaN(target) || target <= 0) {
      wx.showToast({ title: '请输入有效目标值', icon: 'none' });
      return;
    }
    try {
      await api.call('goal', 'add', { kind, targetValue: target, type: this.data.addPeriod });
      wx.showToast({ title: '目标已创建', icon: 'success' });
      this.setData({ showAdd: false, addTarget: '' });
      this.loadGoals();
    } catch (e) {
      wx.showToast({ title: '创建失败', icon: 'none' });
    }
  },

  onTapUpdate(e: { currentTarget: { dataset: { id: string } } }) {
    this.setData({ showUpdate: true, updateGoalId: e.currentTarget.dataset.id, updateValue: '' });
  },
  onCloseUpdate() { this.setData({ showUpdate: false }); },
  onUpdateInput(e: { detail: { value: string } }) { this.setData({ updateValue: e.detail.value }); },

  async onSubmitUpdate() {
    const val = parseFloat(this.data.updateValue);
    if (isNaN(val) || val < 0) {
      wx.showToast({ title: '请输入有效数值', icon: 'none' });
      return;
    }
    try {
      await api.call('goal', 'updateProgress', { goalId: this.data.updateGoalId, currentValue: val });
      wx.showToast({ title: '已更新', icon: 'success' });
      this.setData({ showUpdate: false });
      this.loadGoals();
    } catch (e) {
      wx.showToast({ title: '更新失败', icon: 'none' });
    }
  },
});

export {};
