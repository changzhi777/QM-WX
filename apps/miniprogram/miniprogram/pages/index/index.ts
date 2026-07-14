// pages/index/index.ts — 今日 tab（V0.1.144 按原型图重设计）
// 健康分数环 + AI 解读卡 + 3 数据卡（步数/心率/睡眠）+ 本周趋势 + 历史 AI 报告
import { api } from '../../services/api';
import { ensureLogin } from '../../utils/auth';
import { syncWeRunIfFirstToday } from '../../utils/werun';
import { subscribeDailyReport, unsubscribeDailyReport } from '../../utils/mqtt';

interface DailyReport {
  id: string;
  date: string;
  healthScore: number;
  reportText: string;
  alertText: string | null;
  steps: number;
  restingHr: number | null;
  sleepHours: number | null;
}

interface HealthScoreRes {
  date: string;
  score: number;
  steps: number;
  restingHr: number | null;
  sleepHours: number | null;
  trend: { yesterday: number; diff: number };
}

interface HistoryItem {
  id: string;
  date: string;
  healthScore: number;
  reportText: string;
}

Page({
  data: {
    loading: true,
    showPrivacy: false,
    report: null as DailyReport | null,
    score: null as HealthScoreRes | null,
    history: [] as HistoryItem[],
    weekScores: [] as number[],
    greeting: '',
    dateStr: '',
    weekday: '',
    weather: null as { city: string; text: string; temperature: number; feelsLike: number; icon: string } | null,
    altitude: null as number | null,
    locationText: '' as string,
    latitude: null as number | null,
    longitude: null as number | null,
  },

  onLoad() {
    this.setData({ greeting: this.calcGreeting(), ...this.calcDate() });
    if (getApp().globalData.needPrivacyAgree) {
      this.setData({ showPrivacy: true });
    } else {
      this.getLocation();
    }
  },

  /** 获取定位（海拔 + 经纬度，wx.getLocation）*/
  async getLocation() {
    try {
      const res = await new Promise<WechatMiniprogram.GetLocationSuccessCallbackResult>((resolve, reject) => {
        wx.getLocation({ type: 'gcj02', altitude: true, success: resolve, fail: reject } as WechatMiniprogram.GetLocationOption);
      });
      this.setData({
        altitude: res.altitude ? Math.round(res.altitude) : null,
        latitude: res.latitude,
        longitude: res.longitude,
        locationText: `${res.latitude.toFixed(2)}°, ${res.longitude.toFixed(2)}°`,
      });
    } catch {
      // 授权失败静默（不阻塞首页）
    }
  },

  /** 实时日期 + 星期几 */
  calcDate() {
    const now = new Date();
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return { dateStr: `${now.getFullYear()}-${m}-${d}`, weekday: weekdays[now.getDay()] };
  },

  onShow() {
    if (this.data.showPrivacy) return;
    this.loadData();
    syncWeRunIfFirstToday().catch(() => {}); // 每日首次同步微信运动（dailyReport 数据源）
  },

  onPrivacyAgree() {
    getApp().globalData.needPrivacyAgree = false;
    this.setData({ showPrivacy: false });
    this.loadData();
  },

  calcGreeting(): string {
    const h = new Date().getHours();
    if (h < 6) return '凌晨好';
    if (h < 12) return '早上好';
    if (h < 18) return '下午好';
    return '晚上好';
  },

  async loadData() {
    try {
      await ensureLogin();
      // V0.1.144 MQTT 订阅每日简报推送（ensureLogin 后 user 有 id；收到推送自动更新）
      const u = getApp().globalData.user;
      if (u?.id) subscribeDailyReport(u.id, (r) => this.onMqttMessage(r));
      const [reportRes, scoreRes, historyRes, weatherRes] = await Promise.all([
        api.call<DailyReport>('stats', 'dailyReport', {}),
        api.call<HealthScoreRes>('stats', 'healthScore', {}),
        api.call<{ list: HistoryItem[]; total: number }>('stats', 'dailyReportList', { page: 1, pageSize: 7 }),
        api.call<{ city: string; text: string; temperature: number; feelsLike: number; icon: string }>('stats', 'weather', this.data.latitude != null ? { lat: this.data.latitude, lon: this.data.longitude } : {}),
      ]);
      const weekScores = historyRes.list.slice(0, 7).reverse().map((h) => h.healthScore);
      this.setData({
        report: reportRes,
        score: scoreRes,
        history: historyRes.list,
        weekScores,
        weather: weatherRes,
        loading: false,
      });
    } catch (e) {
      this.setData({ loading: false });
      console.error('[index] loadData failed', e);
    }
  },

  goAskAi() {
    wx.switchTab({ url: '/pages/ai-coach/index' });
  },

  onShareAppMessage() {
    const score = this.data.score?.score ?? '--';
    return {
      title: `我的健康分数 ${score} 分，来看看你的今日身体简报`,
      path: '/pages/index/index',
    };
  },

  /** V0.1.144 MQTT 收到推送 → 更新今日简报 */
  onMqttMessage(report: unknown) {
    this.setData({ report: report as DailyReport });
  },

  onUnload() {
    unsubscribeDailyReport();
  },
});
