// pages/index/index.ts — 今日 tab（V0.1.144 原型图 + V0.2.4 健康中心改版 + 批 1 趋势带日期）
// 健康分数环 + AI 摘要卡（查看完整报告/解锁/深聊）+ 3 数据卡 + 本周趋势（数值+日期）+ 历史 AI 报告（7日+更多）
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

interface WeekTrendItem {
  date: string;  // MM-DD
  score: number;
}

// 免费用户 reportText 摘要句数
const SUMMARY_SENTENCES = 2;

Page({
  data: {
    loading: true,
    showPrivacy: false,
    report: null as DailyReport | null,
    score: null as HealthScoreRes | null,
    history: [] as HistoryItem[],          // 默认显示（最近 7 日）
    historyAll: [] as HistoryItem[],       // 全部（点"更多"懒加载）
    showAllHistory: false,
    weekTrend: [] as WeekTrendItem[],      // 本周趋势：分数 + 日期（批 1）
    greeting: '',
    dateStr: '',
    weekday: '',
    isMember: false,
    reportSummary: '',                     // AI 建议：reportText 前 2 句摘要
    weather: null as { city: string; text: string; temperature: number; feelsLike: number; icon: string } | null,
    altitude: null as number | null,
    locationText: '' as string,
    latitude: null as number | null,
    longitude: null as number | null,
    uv: 0,                          // V0.2.9 UV 指数（来自 stats.weatherAir）
    uvShow: true,                   // V0.2.9 UV 提示条显示开关
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

  /** reportText 摘要：取前 N 句作为 AI 建议展示 */
  summarizeReport(text: string): string {
    if (!text) return '';
    const sentences = text.split(/[。！？\n]/).map((s) => s.trim()).filter(Boolean);
    if (sentences.length === 0) return text.slice(0, 60);
    return sentences.slice(0, SUMMARY_SENTENCES).join('。') + '。';
  },

  async loadData() {
    try {
      await ensureLogin();
      // V0.1.144 MQTT 订阅每日简报推送（ensureLogin 后 user 有 id；收到推送自动更新）
      const u = getApp().globalData.user as ({ id?: string; memberLevel?: string } | null);
      if (u?.id) subscribeDailyReport(u.id, (r) => this.onMqttMessage(r));
      const isMember = !!u && !!u.memberLevel && u.memberLevel !== 'free';
      const lat = this.data.latitude;
      const lon = this.data.longitude;
      const coord = lat != null ? { lat, lon } : {};
      const [reportRes, scoreRes, historyRes, weatherRes, airRes] = await Promise.all([
        api.call<DailyReport>('stats', 'dailyReport', {}),
        api.call<HealthScoreRes>('stats', 'healthScore', {}),
        api.call<{ list: HistoryItem[]; total: number }>('stats', 'dailyReportList', { page: 1, pageSize: 7 }),
        api.call<{ city: string; text: string; temperature: number; feelsLike: number; icon: string }>('stats', 'weather', coord),
        api.call<{ uv?: number }>('stats', 'weatherAir', coord).catch(() => null),  // V0.2.9 UV 提示：失败静默（不阻塞首页）
      ]);
      // V0.2.9 短期 banner 持久化：单日关了就关，不存盘
      const uv = (airRes && typeof airRes.uv === 'number') ? airRes.uv : 0;
      // 批 1：本周趋势带日期（history 日期 'YYYY-MM-DD' → 'MM-DD'）
      const weekTrend = historyRes.list.slice(0, 7).reverse().map((h) => ({
        date: (h.date || '').slice(5),
        score: h.healthScore,
      }));
      this.setData({
        report: reportRes,
        score: scoreRes,
        history: historyRes.list,
        weekTrend,
        weather: weatherRes,
        uv,
        isMember,
        reportSummary: this.summarizeReport(reportRes.reportText),
        loading: false,
      });
    } catch (e) {
      this.setData({ loading: false });
      console.error('[index] loadData failed', e);
    }
  },

  /** 历史 AI 报告：点"更多"懒加载全部，再点"收起" */
  async onToggleHistory() {
    if (this.data.showAllHistory) {
      this.setData({ showAllHistory: false });
      return;
    }
    if (this.data.historyAll.length === 0) {
      try {
        const res = await api.call<{ list: HistoryItem[]; total: number }>('stats', 'dailyReportList', { page: 1, pageSize: 100 });
        this.setData({ historyAll: res.list });
      } catch {
        wx.showToast({ title: '加载失败', icon: 'none' });
        return;
      }
    }
    this.setData({ showAllHistory: true });
  },

  /** 查看完整报告 → report-detail 详情页（今日）*/
  goReportDetail() {
    wx.navigateTo({ url: '/pages/report-detail/index' });
  },

  /** ②历史报告项点击 → report-detail 看当日详情（带 date 参数）*/
  onTapHistory(e: WechatMiniprogram.TouchEvent) {
    const date = (e.currentTarget.dataset as { date?: string }).date;
    wx.navigateTo({ url: `/pages/report-detail/index${date ? '?date=' + date : ''}` });
  },

  /** 问 AI 深聊 → 健康助手 tab */
  goDeepChat() {
    wx.switchTab({ url: '/pages/ai-coach/index' });
  },

  /** 解锁完整版 → 会员引导（membership 页未建，fail 兜底提示）*/
  goMembership() {
    wx.navigateTo({ url: '/pages/membership/index' });
  },

  onShareAppMessage() {
    const score = this.data.score?.score ?? '--';
    const code = (getApp().globalData as { inviteCode?: string }).inviteCode;
    return {
      title: `我的健康分数 ${score} 分，来看看你的今日身体简报`,
      path: '/pages/index/index' + (code ? `?inviterCode=${code}` : ''),
      success: () => {
        api.call('points', 'awardShare').catch(() => {});
      },
    };
  },

  /** V0.1.144 MQTT 收到推送 → 更新今日简报 + 摘要 */
  onMqttMessage(report: unknown) {
    const r = report as DailyReport;
    this.setData({ report: r, reportSummary: this.summarizeReport(r.reportText) });
  },

  /** V0.2.9 UV 提示关闭（本次会话内不再显示） */
  onCloseUv() {
    this.setData({ uvShow: false });
  },

  onUnload() {
    unsubscribeDailyReport();
  },
});
