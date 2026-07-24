// pages/strength/index.ts — 力量训练主页（V0.2.120 训记式 + V0.2.127 训练日历热图）
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

interface HeatmapDay {
  date: string;
  volume: number;
  level: 0 | 1 | 2 | 3 | 4;
}

interface HeatmapWeek {
  weekStart: string;
  days: HeatmapDay[];
}

interface HeatmapData {
  weeks: HeatmapWeek[];
  totalTrainings: number;
  maxVolume: number;
  maxVolumeText: string;
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

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** V0.2.127 把后端 trend 转 26 周 × 7 天热图（GitHub 风格 5 级颜色） */
function buildHeatmap(trend: Array<{ date: string; volume: number }>, now = new Date()): HeatmapData {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endDayOfWeek = end.getDay(); // 0=Sun
  const start = new Date(end);
  start.setDate(end.getDate() - (26 * 7 - 1 + endDayOfWeek));
  start.setDate(start.getDate() - start.getDay());

  const map = new Map<string, number>();
  for (const t of trend) map.set(t.date, t.volume);
  let maxVolume = 0;
  for (const v of map.values()) if (v > maxVolume) maxVolume = v;
  const maxV = Math.max(1, maxVolume);
  const levelOf = (v: number): 0 | 1 | 2 | 3 | 4 => {
    if (v <= 0) return 0;
    const pct = v / maxV;
    if (pct < 0.25) return 1;
    if (pct < 0.5) return 2;
    if (pct < 0.75) return 3;
    return 4;
  };

  const weeks: HeatmapWeek[] = [];
  let totalTrainings = 0;
  const cursor = new Date(start);
  for (let w = 0; w < 26; w++) {
    const days: HeatmapDay[] = [];
    const weekStart = formatYmd(cursor);
    for (let d = 0; d < 7; d++) {
      const dateStr = formatYmd(cursor);
      const v = map.get(dateStr) ?? 0;
      if (v > 0) totalTrainings += 1;
      days.push({ date: dateStr, volume: v, level: levelOf(v) });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push({ weekStart, days });
  }
  return { weeks, totalTrainings, maxVolume, maxVolumeText: formatVolume(maxVolume) };
}

Page({
  data: {
    totalVolume: '0',  // V0.2.120 格式化后字符串（用于 UI 直接展示）
    totalSessions: 0,
    trend: [] as VolumeTrendItem[],
    sessions: [] as SessionItem[],
    heatmap: { weeks: [], totalTrainings: 0, maxVolume: 0, maxVolumeText: '0' } as HeatmapData,
    loading: false,
    starting: false,
  },

  onShow() {
    this.loadAll();
  },

  async loadAll() {
    this.setData({ loading: true });
    await Promise.all([this.loadVolume(), this.loadSessions(), this.loadFavorites()]);
    this.setData({ loading: false });
  },

  /** V0.2.137 加载我的收藏动作 */
  async loadFavorites() {
    try {
      const res = await api.call<{ list: Array<{ id: string; name: string; category: string }> }>(
        'strength', 'listFavoriteExercises', {},
      );
      this.setData({ favorites: res.list ?? [] });
    } catch {
      // 静默（收藏为空时返空 list）
      this.setData({ favorites: [] });
    }
  },

  /** V0.2.120 容量概览（近 30 天柱状 + V0.2.127 26 周热图） */
  async loadVolume() {
    try {
      // 26 周 ≈ 182 天，一次拿够（热图 + 末尾 7 天柱状都从同一份数据切）
      const res = await api.call<{ totalVolume: number; totalSessions: number; trend: Array<{ date: string; volume: number }> }>(
        'strength', 'myVolume', { days: 180 },
      );
      const last7 = (res.trend ?? []).slice(-7);
      const maxV = Math.max(1, ...last7.map((t) => t.volume));
      const trend: VolumeTrendItem[] = last7.map((t) => ({
        date: t.date,
        dateLabel: t.date.slice(5),
        volume: t.volume,
        heightPct: Math.max(4, Math.round((t.volume / maxV) * 100)),
      }));
      const heatmap = buildHeatmap(res.trend ?? []);
      this.setData({
        totalVolume: formatVolume(res.totalVolume ?? 0),
        totalSessions: res.totalSessions ?? 0,
        trend,
        heatmap,
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

  /** V0.2.136 「查看全部」→ 跳历史页（按动作过滤 + 滚动加载） */
  onOpenHistory() {
    wx.navigateTo({ url: '/pages/strength/history' });
  },

  /** V0.2.127 点热图某天 → 跳当天第一个 session 详情 */
  onTapHeatmapDay(e: WechatMiniprogram.TouchEvent) {
    const date = e.currentTarget.dataset.date as string;
    const volume = Number(e.currentTarget.dataset.volume || 0);
    if (!date) return;
    const found = this.data.sessions.find((s) => s.dateStr === date);
    if (found) {
      wx.navigateTo({ url: `/pages/strength/detail?sessionId=${found.id}` });
    } else {
      wx.showToast({ title: `${date} ${volume} kg·次`, icon: 'none' });
    }
  },

  /** V0.2.137 点收藏动作 → 跳历史页 + 预选该动作过滤 */
  onTapFav(e: WechatMiniprogram.TouchEvent) {
    const name = e.currentTarget.dataset.name as string;
    if (!name) return;
    // 跳历史页（用户可在该页继续按动作过滤）
    wx.navigateTo({ url: `/pages/strength/history?name=${encodeURIComponent(name)}` });
  },
});
