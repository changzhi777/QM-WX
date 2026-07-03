// pages/health/index.ts — 今日健康看板（参考图 2774）
import { api } from '../../services/api';

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

/** 无数据源卡片的中文文案（unavailable key → 标签） */
const UNAVAILABLE_LABEL: Record<string, string> = {
  steps: '步数',
  spo2: '血氧',
  bloodPressure: '血压',
  weight: '体重',
  bloodGlucose: '血糖',
};

Page({
  data: {
    health: null as TodayHealth | null,
    loading: false,
    // 占位卡（佳明数据源不支持，显示"连接设备后查看"）
    placeholderCards: [] as Array<{ key: string; label: string }>,
  },

  onShow() {
    this.loadHealth();
  },

  /** 拉取今日健康聚合（device.myTodayHealth） */
  async loadHealth() {
    this.setData({ loading: true });
    try {
      const res = await api.call<TodayHealth>('device', 'myTodayHealth', {});
      this.setData({
        health: res,
        placeholderCards: (res.unavailable ?? []).map((k) => ({
          key: k,
          label: UNAVAILABLE_LABEL[k] ?? k,
        })),
        loading: false,
      });
    } catch {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },
});
