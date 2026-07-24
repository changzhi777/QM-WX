// pages/health/index.ts — 健康中心（V0.1.143 合并 health + health-history + werun）
// 3 tab：今日 / 历史 / 微信运动（懒加载，切 tab 才请求）
import { api } from '../../services/api';
import { getWeRunHistory, syncWeRunToday, cnMonthRange } from '../../utils/werun';

// === 今日 tab ===
interface BodyComposition {
  weight: number;
  bodyFat: number | null;
  bmi: number | null;
  muscle: number | null;
  bone: number | null;
  water: number | null;
  visceralFat: number | null;
  impedance: number | null;
  timestamp: string;
}

interface TodayHealth {
  date: string;
  sleep: {
    durationHours: number | null;
    deepHours: number | null;
    lightHours: number | null;
    remHours: number | null;
    score: number | null;
    calendarDate: string;
  } | null;
  fitnessAge: {
    chronologicalAge: number | null;
    currentBioAge: number | null;
    vo2Max: number | null;
    rhr: number | null;
    bmi: number | null;
    asOfDate: string;
  } | null;
  metrics: {
    trainingReadiness: number | null;
    enduranceScore: number | null;
    hillScore: number | null;
  };
  todayActivity: {
    count: number;
    totalDistanceKm: number;
    totalDurationMin: number;
    totalCalories: number;
  } | null;
  unavailable: string[];
}

const UNAVAILABLE_LABEL: Record<string, string> = {
  steps: '步数',
  spo2: '血氧',
  bloodPressure: '血压',
  weight: '体重',
  bloodGlucose: '血糖',
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// === 历史 tab ===
type HealthType = 'hr' | 'spo2' | 'steps' | 'sleep';

interface HistoryPoint {
  label: string;
  value: number;
  barHeight: number;
  showLabel: boolean;
}

const TYPE_LABEL: Record<HealthType, string> = { hr: '心率', spo2: '血氧', steps: '步数', sleep: '睡眠' };
const TYPE_UNIT: Record<HealthType, string> = { hr: ' bpm', spo2: '%', steps: ' 步', sleep: ' h' };
const TYPE_ICON: Record<HealthType, string> = { hr: '❤️', spo2: '🩸', steps: '👟', sleep: '💤' };

type HealthTab = 'today' | 'history' | 'werun';

Page({
  data: {
    tab: 'today' as HealthTab,
    // 今日
    health: null as TodayHealth | null,
    healthLoading: false,
    placeholderCards: [] as Array<{ key: string; label: string }>,
    bodyComp: null as BodyComposition | null,
    // 历史
    activeType: 'hr' as HealthType,
    range: 7,
    historyLoading: false,
    points: [] as HistoryPoint[],
    stats: { avg: 0, max: 0, min: 0, total: 0 },
    recent: [] as { value: number; time: string }[],
    typeLabel: TYPE_LABEL.hr,
    typeUnit: TYPE_UNIT.hr,
    typeIcon: TYPE_ICON.hr,
    // 微信运动
    year: 0,
    month: 0,
    monthLabel: '',
    werunRecords: [] as Array<{ date: string; step: number; km: number; barHeight: number; dayLabel: string }>,
    totalSteps: 0,
    totalKm: 0,
    days: 0,
    avgSteps: 0,
    werunLoading: false,
    syncing: false,
  },

  onLoad(query: { tab?: string }) {
    const tab = (query?.tab as HealthTab) || 'today';
    const now = new Date(Date.now() + 8 * 3600 * 1000);
    this.setData({ tab, year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 });
  },

  onShow() {
    this.loadByTab(this.data.tab);
  },

  onSwitchTab(e: WechatMiniprogram.TouchEvent) {
    const tab = (e.currentTarget.dataset.tab as HealthTab) || 'today';
    if (tab === this.data.tab) return;
    this.setData({ tab });
    this.loadByTab(tab);
  },

  loadByTab(tab: HealthTab) {
    if (tab === 'today') this.loadHealth();
    else if (tab === 'history') this.loadHealthHistory();
    else if (tab === 'werun') this.loadWeRun();
  },

  // ===== 今日 tab =====
  async loadHealth() {
    this.setData({ healthLoading: true });
    const [healthRes, bodyRes] = await Promise.allSettled([
      api.call<TodayHealth>('device', 'myTodayHealth', {}),
      api.call<{ list: BodyComposition[] }>('device', 'myHealthHistory', {
        type: 'body_composition',
        page: 1,
        pageSize: 1,
      }),
    ]);

    if (healthRes.status === 'fulfilled') {
      const res = healthRes.value;
      const raw = bodyRes.status === 'fulfilled' ? (bodyRes.value.list[0] ?? null) : null;
      const bodyComp = raw ? { ...raw, timestamp: formatTimestamp(raw.timestamp) } : null;
      this.setData({
        health: res,
        placeholderCards: (res.unavailable ?? []).map((k) => ({ key: k, label: UNAVAILABLE_LABEL[k] ?? k })),
        bodyComp,
        healthLoading: false,
      });
    } else {
      this.setData({ healthLoading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onTapGoScale() {
    wx.navigateTo({ url: '/pages/device/index' });
  },

  // ===== 历史 tab =====
  onTabChange(e: WechatMiniprogram.TouchEvent) {
    const type = e.currentTarget.dataset.type as HealthType;
    if (type === this.data.activeType) return;
    this.setData({
      activeType: type,
      typeLabel: TYPE_LABEL[type],
      typeUnit: TYPE_UNIT[type],
      typeIcon: TYPE_ICON[type],
    });
    this.loadHealthHistory();
  },

  onRangeChange(e: WechatMiniprogram.TouchEvent) {
    const range = Number(e.currentTarget.dataset.range);
    if (range === this.data.range) return;
    this.setData({ range });
    this.loadHealthHistory();
  },

  async loadHealthHistory() {
    this.setData({ historyLoading: true });
    try {
      const { activeType, range } = this.data;
      const end = new Date();
      const start = new Date(end.getTime() - range * 86400 * 1000);
      const fmtIso = (d: Date) => d.toISOString();
      const fmtDate = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      let raw: { label: string; value: number; time: string }[] = [];

      if (activeType === 'sleep') {
        const res = await api.call<{
          list: { id: string; value: number; timestamp: string; score: number | null }[];
        }>('device', 'myHealthHistory', { type: 'sleep', start: fmtIso(start), end: fmtIso(end), pageSize: 500 });
        const list = res.list.slice().reverse();
        raw = list.map((r) => ({ label: r.timestamp.slice(5, 10), value: r.value, time: r.timestamp }));
        raw = raw.slice(-50);
      } else if (activeType === 'steps') {
        const res = await api.call<{ records: { date: string; step: number }[] }>('device', 'myWeRun', {
          startDate: fmtDate(start),
          endDate: fmtDate(end),
        });
        raw = res.records.map((r) => ({ label: r.date.slice(5), value: r.step, time: r.date }));
      } else {
        const res = await api.call<{ list: { id: string; value: number; timestamp: string }[] }>(
          'device',
          'myHealthHistory',
          { type: activeType, start: fmtIso(start), end: fmtIso(end), pageSize: 500 },
        );
        const list = res.list.slice().reverse();
        raw = list.map((r) => {
          const cn = new Date(new Date(r.timestamp).getTime() + 8 * 3600 * 1000);
          return {
            label: `${String(cn.getUTCHours()).padStart(2, '0')}:${String(cn.getUTCMinutes()).padStart(2, '0')}`,
            value: r.value,
            time: r.timestamp,
          };
        });
        raw = raw.slice(-50);
      }

      if (raw.length === 0) {
        this.setData({ points: [], recent: [], stats: { avg: 0, max: 0, min: 0, total: 0 }, historyLoading: false });
        return;
      }

      const values = raw.map((r) => r.value);
      const max = Math.max(...values);
      const min = Math.min(...values);
      const total = values.reduce((s, v) => s + v, 0);
      const avg = Math.round(total / values.length);
      const labelEvery = Math.max(1, Math.ceil(raw.length / 6));

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
        historyLoading: false,
      });
    } catch {
      this.setData({ historyLoading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  // ===== 微信运动 tab =====
  async loadWeRun() {
    this.setData({ werunLoading: true });
    try {
      const { startDate, endDate } = cnMonthRange(this.data.year, this.data.month);
      const res = await getWeRunHistory(startDate, endDate);
      const maxStep = res.records.reduce((m, r) => Math.max(m, r.step), 0);
      const werunRecords = res.records.map((r) => ({
        date: r.date,
        step: r.step,
        km: r.km,
        barHeight: maxStep > 0 ? Math.max((r.step / maxStep) * 100, 2) : 2,
        dayLabel: r.date.slice(8, 10),
      }));
      this.setData({
        monthLabel: `${this.data.year}年${this.data.month}月`,
        werunRecords,
        totalSteps: res.totalSteps,
        totalKm: res.totalKm,
        days: res.days,
        avgSteps: res.days > 0 ? Math.round(res.totalSteps / res.days) : 0,
        werunLoading: false,
      });
    } catch {
      this.setData({ werunLoading: false, werunRecords: [] });
    }
  },

  prevMonth() {
    let { year, month } = this.data;
    month -= 1;
    if (month < 1) { month = 12; year -= 1; }
    this.setData({ year, month });
    this.loadWeRun();
  },

  nextMonth() {
    const now = new Date(Date.now() + 8 * 3600 * 1000);
    const curYear = now.getUTCFullYear();
    const curMonth = now.getUTCMonth() + 1;
    if (this.data.year === curYear && this.data.month === curMonth) return;
    let { year, month } = this.data;
    month += 1;
    if (month > 12) { month = 1; year += 1; }
    this.setData({ year, month });
    this.loadWeRun();
  },

  async onSync() {
    if (this.data.syncing) return;
    this.setData({ syncing: true });
    try {
      const result = await syncWeRunToday();
      if (result) {
        wx.showToast({ title: `已同步 ${result.days} 天`, icon: 'success' });
        this.loadWeRun();
      } else {
        wx.showModal({
          title: '需要授权',
          content: '同步运动数据需要授权「微信运动数据」，是否前往设置开启？',
          confirmText: '去设置',
          success: (r) => { if (r.confirm) wx.openSetting({}); },
        });
      }
    } catch {
      wx.showToast({ title: '同步失败', icon: 'none' });
    } finally {
      this.setData({ syncing: false });
    }
  },
});
