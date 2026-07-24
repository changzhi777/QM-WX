// pages/strength/detail.ts — 力量训练详情（V0.2.120：按动作分组的组明细 + V0.2.126 PB + 容量分布）
import { api } from '../../services/api';

interface SetItem {
  order: number;
  exerciseName: string;
  reps: number;
  weight: number;
  setIndex: number;
}

interface GroupedSet {
  exerciseName: string;
  sets: SetItem[];
}

interface PbItem {
  exerciseName: string;
  maxWeight: number;
  maxReps: number;
  achievedAt: string;
  setCount: number;
}

interface DistItem {
  exerciseName: string;
  totalVolume: number;
  setCount: number;
  percent: number;
  totalVolumeText: string;
}

function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return '0 分钟';
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  return `${h}小时${m % 60}分`;
}

function formatVolume(v: number): string {
  if (!v || v <= 0) return '0';
  if (v >= 10000) return `${(v / 1000).toFixed(1)}k`;
  return `${Math.round(v)}`;
}

Page({
  data: {
    sessionId: '',
    session: null as {
      id: string;
      dateStr: string;
      durationSec: number;
      totalVolume: number;
      notes: string | null;
      durationText: string;
      totalVolumeText: string;
    } | null,
    sets: [] as SetItem[],
    groupedSets: [] as GroupedSet[],
    // V0.2.126 个人最佳 + 容量分布
    pbs: [] as PbItem[],
    distribution: [] as DistItem[],
    loading: false,
  },

  onLoad(query: Record<string, string | undefined>) {
    const sid = query.sessionId || '';
    if (!sid) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      return;
    }
    this.setData({ sessionId: sid });
    this.loadDetail();
  },

  async loadDetail() {
    this.setData({ loading: true });
    try {
      // 并行拉详情 + 动作统计（PB + 容量分布）
      const [detail, stats] = await Promise.all([
        api.call<{
          session: { id: string; dateStr: string; durationSec: number; totalVolume: number; notes: string | null };
          sets: SetItem[];
        }>('strength', 'sessionDetail', { sessionId: this.data.sessionId }),
        api.call<{
          pbs: PbItem[];
          distribution: Array<{ exerciseName: string; totalVolume: number; setCount: number; percent: number }>;
        }>('strength', 'getExerciseStats', {}),
      ]);
      const sets = (detail.sets ?? []).sort((a, b) => a.order - b.order);
      // 按动作名分组
      const map = new Map<string, SetItem[]>();
      for (const s of sets) {
        if (!map.has(s.exerciseName)) map.set(s.exerciseName, []);
        map.get(s.exerciseName)!.push(s);
      }
      const groupedSets: GroupedSet[] = Array.from(map.entries()).map(([name, list]) => ({
        exerciseName: name,
        sets: list,
      }));
      this.setData({
        session: {
          id: detail.session.id,
          dateStr: detail.session.dateStr,
          durationSec: detail.session.durationSec,
          totalVolume: detail.session.totalVolume,
          notes: detail.session.notes,
          durationText: formatDuration(detail.session.durationSec),
          totalVolumeText: formatVolume(detail.session.totalVolume),
        },
        sets,
        groupedSets,
        pbs: stats.pbs ?? [],
        distribution: (stats.distribution ?? []).map((d) => ({
          ...d,
          totalVolumeText: formatVolume(d.totalVolume),
        })),
      });
    } catch (e) {
      wx.showToast({ title: (e as Error).message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },
});
