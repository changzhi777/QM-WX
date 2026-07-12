// pages/health/index.ts — 今日健康看板（参考图 2774）
import { api } from '../../services/api';

/** 最新一次体成分测量（device.myHealthHistory type=body_composition 取 list[0]） */
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

/** 无数据源卡片的中文文案（unavailable key → 标签） */
const UNAVAILABLE_LABEL: Record<string, string> = {
  steps: '步数',
  spo2: '血氧',
  bloodPressure: '血压',
  weight: '体重',
  bloodGlucose: '血糖',
};

/** ISO → "MM-DD HH:mm"（wxml 不能调 Date 方法，需预格式化） */
function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

Page({
  data: {
    health: null as TodayHealth | null,
    loading: false,
    // 占位卡（佳明数据源不支持，显示"连接设备后查看"）
    placeholderCards: [] as Array<{ key: string; label: string }>,
    // 体成分（最新一次体脂秤测量；null=未测量）
    bodyComp: null as BodyComposition | null,
  },

  onShow() {
    this.loadHealth();
  },

  /** 拉取今日健康聚合（device.myTodayHealth）+ 最新体成分（myHealthHistory type=body_composition） */
  async loadHealth() {
    this.setData({ loading: true });
    // 并行拉两个数据源，allSettled 让体成分失败不阻塞主健康卡
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
      // timestamp 预格式化（wxml 不能调 Date 方法）：ISO → "MM-DD HH:mm"
      const bodyComp = raw
        ? { ...raw, timestamp: formatTimestamp(raw.timestamp) }
        : null;
      this.setData({
        health: res,
        placeholderCards: (res.unavailable ?? []).map((k) => ({
          key: k,
          label: UNAVAILABLE_LABEL[k] ?? k,
        })),
        bodyComp,
        loading: false,
      });
    } else {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  /** 跳转设备绑定（上秤测量引导） */
  onTapGoScale() {
    wx.navigateTo({ url: '/pages/device-bind/index' });
  },
});
