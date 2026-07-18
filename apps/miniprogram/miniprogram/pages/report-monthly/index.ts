// pages/report-monthly — 月度健康报告页（历史 AI 报告按月聚合）
// 从今日页「更多」跳入；按月分组：每月天数 + 均健康分/步数/心率/睡眠 + 日列表点跳详情
import { api } from '../../services/api';
import { ensureLogin } from '../../utils/auth';

interface DailyReport {
  id: string; date: string; healthScore: number;
  reportText: string; alertText: string | null;
  steps: number; restingHr: number | null; sleepHours: number | null;
}

interface MonthGroup {
  key: string;          // 'YYYY-MM'
  label: string;        // 'YYYY年M月'
  days: number;
  avgScore: number;
  avgSteps: number;
  avgHr: number | null;
  avgSleep: number | null;
  reports: DailyReport[];
}

Page({
  data: {
    loading: true,
    months: [] as MonthGroup[],
  },

  async onLoad() {
    try {
      await ensureLogin();
      // 拉全部历史报告（pageSize 大，月度聚合用）
      const res = await api.call<{ list: DailyReport[]; total: number }>(
        'stats', 'dailyReportList', { page: 1, pageSize: 500 },
      );
      this.setData({ months: this.groupByMonth(res.list), loading: false });
    } catch (e) {
      this.setData({ loading: false });
      console.error('[report-monthly] load failed', e);
    }
  },

  /** 按月分组 + 月度均值（list 已 date desc → map 保序，再 sort 兜底）*/
  groupByMonth(list: DailyReport[]): MonthGroup[] {
    const map = new Map<string, DailyReport[]>();
    for (const r of list) {
      const key = r.date.slice(0, 7); // 'YYYY-MM'
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    const months: MonthGroup[] = [];
    for (const [key, reports] of map) {
      const [y, m] = key.split('-');
      const avg = (sel: (r: DailyReport) => number | null) => {
        const vals = reports.map(sel).filter((v): v is number => v != null);
        return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
      };
      months.push({
        key,
        label: `${y}年${Number(m)}月`,
        days: reports.length,
        avgScore: avg((r) => r.healthScore) ?? 0,
        avgSteps: avg((r) => r.steps) ?? 0,
        avgHr: avg((r) => r.restingHr),
        avgSleep: avg((r) => r.sleepHours),
        reports,
      });
    }
    return months.sort((a, b) => b.key.localeCompare(a.key));
  },

  /** 点某日报告 → report-detail?date= */
  onTapReport(e: WechatMiniprogram.TouchEvent) {
    const date = (e.currentTarget.dataset as { date?: string }).date;
    if (date) wx.navigateTo({ url: `/pages/report-detail/index?date=${date}` });
  },

  onShareAppMessage() {
    return { title: '青沐·月度健康报告', path: '/pages/report-monthly/index' };
  },
});
