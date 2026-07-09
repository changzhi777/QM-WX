// pages/health-history/index.ts — 健康历史（心率/血氧/步数曲线，V0.1.43）
import { api } from '../../services/api';

type HealthType = 'hr' | 'spo2' | 'steps' | 'sleep';

interface HistoryPoint {
  label: string;
  value: number;
  barHeight: number; // 0-100 百分比（柱状图高度）
  showLabel: boolean;
}

const TYPE_LABEL: Record<HealthType, string> = { hr: '心率', spo2: '血氧', steps: '步数', sleep: '睡眠' };
const TYPE_UNIT: Record<HealthType, string> = { hr: ' bpm', spo2: '%', steps: ' 步', sleep: ' h' };
const TYPE_ICON: Record<HealthType, string> = { hr: '❤️', spo2: '🩸', steps: '👟', sleep: '💤' };

Page({
  data: {
    activeType: 'hr' as HealthType,
    range: 7,
    loading: false,
    points: [] as HistoryPoint[],
    stats: { avg: 0, max: 0, min: 0, total: 0 },
    recent: [] as { value: number; time: string }[],
    typeLabel: TYPE_LABEL.hr,
    typeUnit: TYPE_UNIT.hr,
    typeIcon: TYPE_ICON.hr,
  },

  onShow() {
    this.loadHistory();
  },

  onTabChange(e: WechatMiniprogram.TouchEvent) {
    const type = e.currentTarget.dataset.type as HealthType;
    if (type === this.data.activeType) return;
    this.setData({
      activeType: type,
      typeLabel: TYPE_LABEL[type],
      typeUnit: TYPE_UNIT[type],
      typeIcon: TYPE_ICON[type],
    });
    this.loadHistory();
  },

  onRangeChange(e: WechatMiniprogram.TouchEvent) {
    const range = Number(e.currentTarget.dataset.range);
    if (range === this.data.range) return;
    this.setData({ range });
    this.loadHistory();
  },

  /** 加载历史数据（心率/血氧走 myHealthHistory，步数走 myWeRun）*/
  async loadHistory() {
    this.setData({ loading: true });
    try {
      const { activeType, range } = this.data;
      const end = new Date();
      const start = new Date(end.getTime() - range * 86400 * 1000);
      const fmtIso = (d: Date) => d.toISOString();
      const fmtDate = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      let raw: { label: string; value: number; time: string }[] = [];

      if (activeType === 'sleep') {
        // V0.1.43 睡眠：myHealthHistory(type=sleep)，返 value=hours
        const res = await api.call<{
          list: { id: string; value: number; timestamp: string; score: number | null }[];
        }>('device', 'myHealthHistory', {
          type: 'sleep',
          start: fmtIso(start),
          end: fmtIso(end),
          pageSize: 500,
        });
        const list = res.list.slice().reverse();
        raw = list.map((r) => ({
          label: r.timestamp.slice(5, 10),
          value: r.value,
          time: r.timestamp,
        }));
        raw = raw.slice(-50);
      } else if (activeType === 'steps') {
        const res = await api.call<{ records: { date: string; step: number }[] }>(
          'device',
          'myWeRun',
          { startDate: fmtDate(start), endDate: fmtDate(end) },
        );
        raw = res.records.map((r) => ({ label: r.date.slice(5), value: r.step, time: r.date }));
      } else {
        const res = await api.call<{ list: { id: string; value: number; timestamp: string }[] }>(
          'device',
          'myHealthHistory',
          { type: activeType, start: fmtIso(start), end: fmtIso(end), pageSize: 500 },
        );
        const list = res.list.slice().reverse(); // API 返 desc → 正序
        raw = list.map((r) => {
          const cn = new Date(new Date(r.timestamp).getTime() + 8 * 3600 * 1000);
          return {
            label: `${String(cn.getUTCHours()).padStart(2, '0')}:${String(cn.getUTCMinutes()).padStart(2, '0')}`,
            value: r.value,
            time: r.timestamp,
          };
        });
        raw = raw.slice(-50); // 心率/血氧最近 50 点（柱状图密度可控）
      }

      if (raw.length === 0) {
        this.setData({ points: [], recent: [], stats: { avg: 0, max: 0, min: 0, total: 0 } });
        return;
      }

      const values = raw.map((r) => r.value);
      const max = Math.max(...values);
      const min = Math.min(...values);
      const total = values.reduce((s, v) => s + v, 0);
      const avg = Math.round(total / values.length);
      const labelEvery = Math.max(1, Math.ceil(raw.length / 6)); // 最多 6 个 x 轴标签

      const points: HistoryPoint[] = raw.map((r, i) => ({
        label: r.label,
        value: r.value,
        barHeight: max > 0 ? Math.round((r.value / max) * 100) : 0,
        showLabel: i % labelEvery === 0,
      }));

      this.setData({
        points,
        stats: { avg, max, min, total },
        recent: raw.slice(-10).reverse().map((r) => ({ value: r.value, time: r.label })),
      });
    } catch {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },
});
