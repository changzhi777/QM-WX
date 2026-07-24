// pages/strength/history.ts — 力量训练历史页（V0.2.136 按动作过滤 + 滚动加载）
import { api } from '../../services/api';

interface SessionItem {
  id: string;
  dateStr: string;
  durationSec: number;
  totalVolume: number;
  notes: string | null;
  setCount: number;
  durationText: string;
  totalVolumeText: string;
}

interface ExerciseItem {
  id: string;
  name: string;
  category: string;
}

function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return '0 分钟';
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  return `${h}小时${m % 60}分`;
}

function formatVolume(v: number): string {
  if (!v || v <= 0) return '0 kg·次';
  if (v >= 10000) return `${(v / 1000).toFixed(1)}k kg·次`;
  return `${Math.round(v)} kg·次`;
}

Page({
  data: {
    sessions: [] as SessionItem[],
    exercises: [] as ExerciseItem[],
    exerciseIndex: -1,
    exerciseName: '',
    page: 1,
    pageSize: 20,
    hasMore: false,
    loading: false,
  },

  onLoad(query: Record<string, string | undefined>) {
    // V0.2.137 从主页 ⭐ 跳来时，query 带 name → 自动锁定该动作
    const presetName = decodeURIComponent(query.name || '');
    if (presetName) {
      this.setData({ exerciseName: presetName });
    }
  },

  onShow() {
    this.loadExercises();
    this.loadSessions(true);
  },

  async loadExercises() {
    try {
      const res = await api.call<{ items: ExerciseItem[] }>('strength', 'listExercises', {});
      // 过滤出用户训练过的动作（避免选择无数据的动作；YAGNI 不预聚合 set 表）
      this.setData({ exercises: res.items ?? [] });
    } catch {
      // 静默
    }
  },

  /** 加载训练列表（reset=true 时覆盖，false 时追加） */
  async loadSessions(reset: boolean) {
    if (this.data.loading) return;
    this.setData({ loading: true });
    const page = reset ? 1 : this.data.page;
    try {
      const filterName = this.data.exerciseName || undefined;
      const res = await api.call<{ list: Array<{ id: string; dateStr: string; durationSec: number; totalVolume: number; notes: string | null; _count: { sets: number } }>; total: number; page: number; pageSize: number }>(
        'strength', 'listSessions', { page, pageSize: this.data.pageSize, ...(filterName ? { exerciseName: filterName } : {}) },
      );
      const newItems: SessionItem[] = (res.list ?? []).map((s) => ({
        id: s.id,
        dateStr: s.dateStr,
        durationSec: s.durationSec,
        totalVolume: s.totalVolume,
        notes: s.notes,
        setCount: s._count?.sets ?? 0,
        durationText: formatDuration(s.durationSec),
        totalVolumeText: formatVolume(s.totalVolume),
      }));
      const allItems = reset ? newItems : [...this.data.sessions, ...newItems];
      this.setData({
        sessions: allItems,
        page: page + 1,
        hasMore: allItems.length < (res.total ?? 0),
        loading: false,
      });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: (e as Error).message || '加载失败', icon: 'none' });
    }
  },

  onPickExercise(e: WechatMiniprogram.PickerChange) {
    const idx = Number(e.detail.value);
    const ex = this.data.exercises[idx];
    if (ex) {
      this.setData({ exerciseIndex: idx, exerciseName: ex.name });
      this.loadSessions(true);
    }
  },

  onClearFilter() {
    this.setData({ exerciseIndex: -1, exerciseName: '' });
    this.loadSessions(true);
  },

  onLoadMore() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadSessions(false);
    }
  },

  onTapSession(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    if (id) wx.navigateTo({ url: `/pages/strength/detail?sessionId=${id}` });
  },
});
