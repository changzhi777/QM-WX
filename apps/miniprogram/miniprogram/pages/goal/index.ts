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
    // V0.3.17 Phase 6 推荐卡片（基于 V0.3.16 后端 goal.recommend）
    recommendations: [] as Array<Record<string, unknown>>,
    loadingRec: false,
  },

  onShow() {
    this.loadGoals();
    this.loadRecommendations();
  },

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

  /** V0.3.17 加载系统推荐（基于 V0.3.16 后端 recommend 规则引擎） */
  async loadRecommendations() {
    this.setData({ loadingRec: true });
    try {
      const res = await api.call<{
        recommendations: Array<Record<string, unknown>>;
        profile: Record<string, unknown>;
      }>('goal', 'recommend', {});
      this.setData({ recommendations: res.recommendations || [], loadingRec: false });
    } catch (e) {
      this.setData({ loadingRec: false, recommendations: [] });
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

  /** V0.3.9 暂停/恢复目标（清单 #30 "可暂停"）*/
  async onTapPause(e: { currentTarget: { dataset: { id: string } } }) {
    try {
      await api.call('goal', 'pauseGoal', { id: e.currentTarget.dataset.id });
      wx.showToast({ title: '已暂停', icon: 'success' });
      this.loadGoals();
    } catch (e2) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  async onTapResume(e: { currentTarget: { dataset: { id: string } } }) {
    try {
      await api.call('goal', 'resumeGoal', { id: e.currentTarget.dataset.id });
      wx.showToast({ title: '已恢复', icon: 'success' });
      this.loadGoals();
    } catch (e2) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  /** V0.3.17 一键添加推荐目标 → 后端 goal.add，加成功后从推荐列表移除 + 刷新目标 */
  async onTapAddRec(e: { currentTarget: { dataset: { rec: string } } }) {
    const rec = JSON.parse(e.currentTarget.dataset.rec) as {
      kind: string;
      type: string;
      title: string;
      targetDistance?: number;
      targetVolume?: number;
      targetValue?: number;
      unit?: string;
      judgeCriteria?: string;
      ruleId: string;
    };
    try {
      // kind 字段映射（后端 schema 要求）
      const payload: Record<string, unknown> = { kind: rec.kind, type: rec.type };
      if (rec.targetDistance != null) payload.targetDistance = rec.targetDistance;
      if (rec.targetVolume != null) payload.targetVolume = rec.targetVolume;
      if (rec.targetValue != null) {
        payload.targetValue = rec.targetValue;
        if (rec.unit) payload.unit = rec.unit;
        if (rec.judgeCriteria) payload.judgeCriteria = rec.judgeCriteria;
      }
      await api.call('goal', 'add', payload);
      wx.showToast({ title: '目标已添加', icon: 'success' });
      // 从推荐列表移除该条（按 ruleId 唯一）
      const remaining = (this.data.recommendations as Array<Record<string, unknown>>).filter(
        (r) => r.ruleId !== rec.ruleId,
      );
      this.setData({ recommendations: remaining });
      this.loadGoals();
    } catch (e2) {
      wx.showToast({ title: '添加失败', icon: 'none' });
    }
  },

  /** V0.3.17 收起推荐卡片 */
  onCloseRec() { this.setData({ recommendations: [] }); },
});

export {};
