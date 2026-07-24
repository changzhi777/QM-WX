// pages/strength/index.ts — 力量训练主页（V0.2.120 训记式：容量概览 + 历史列表 + 开始训练）
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

interface VolumeTrendItem {
  date: string;
  dateLabel: string;
  volume: number;
  heightPct: number;
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
    totalVolume: '0',  // V0.2.120 格式化后字符串（用于 UI 直接展示）
    totalSessions: 0,
    trend: [] as VolumeTrendItem[],
    sessions: [] as SessionItem[],
    loading: false,
    starting: false,
  },

  onShow() {
    this.loadAll();
  },

  async loadAll() {
    this.setData({ loading: true });
    await Promise.all([this.loadVolume(), this.loadSessions()]);
    this.setData({ loading: false });
  },

  /** V0.2.120 容量概览（近 30 天 + 简易柱状） */
  async loadVolume() {
    try {
      const res = await api.call<{ totalVolume: number; totalSessions: number; trend: Array<{ date: string; volume: number }> }>(
        'strength', 'myVolume', { days: 30 },
      );
      // 简易柱状：取 trend 末尾 7 天，最大值映射 100% 高度
      const last7 = (res.trend ?? []).slice(-7);
      const maxV = Math.max(1, ...last7.map((t) => t.volume));
      const trend: VolumeTrendItem[] = last7.map((t) => ({
        date: t.date,
        dateLabel: t.date.slice(5), // MM-DD
        volume: t.volume,
        heightPct: Math.max(4, Math.round((t.volume / maxV) * 100)),
      }));
      this.setData({
        totalVolume: formatVolume(res.totalVolume ?? 0),
        totalSessions: res.totalSessions ?? 0,
        trend,
      });
    } catch {
      // 失败不阻塞主页
    }
  },

  /** 训练历史列表 */
  async loadSessions() {
    try {
      const res = await api.call<{ list: Array<{ id: string; dateStr: string; durationSec: number; totalVolume: number; notes: string | null; _count: { sets: number } }> }>(
        'strength', 'listSessions', { page: 1, pageSize: 20 },
      );
      const sessions: SessionItem[] = (res.list ?? []).map((s) => ({
        id: s.id,
        dateStr: s.dateStr,
        durationSec: s.durationSec,
        totalVolume: s.totalVolume,
        notes: s.notes,
        setCount: s._count?.sets ?? 0,
        durationText: formatDuration(s.durationSec),
        totalVolumeText: formatVolume(s.totalVolume),
      }));
      this.setData({ sessions });
    } catch {
      this.setData({ sessions: [] });
    }
  },

  /** 开始训练：调 startSession → 跳 session 页 */
  async onStart() {
    if (this.data.starting) return;
    this.setData({ starting: true });
    try {
      const res = await api.call<{ session: { id: string } }>('strength', 'startSession', {});
      const sid = res.session?.id;
      if (!sid) throw new Error('session id missing');
      wx.navigateTo({ url: `/pages/strength/session?sessionId=${sid}` });
    } catch (e) {
      wx.showToast({ title: (e as Error).message || '启动失败', icon: 'none' });
    } finally {
      this.setData({ starting: false });
    }
  },

  onTapSession(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    if (id) wx.navigateTo({ url: `/pages/strength/detail?sessionId=${id}` });
  },
});
