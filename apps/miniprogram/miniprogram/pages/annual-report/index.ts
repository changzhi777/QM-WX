// pages/annual-report/index.ts — 年度报告（V0.1.27，参考图 2768/2771 — 可分享战报）
import { api } from '../../services/api';

interface MonthlyItem {
  month: number;
  distance: number;
  count: number;
}

interface AnnualReport {
  year: number;
  yearDistance: number;
  yearCheckins: number;
  yearDurationSec: number;
  avgPace: string | null;
  monthly: MonthlyItem[];
  longestRun: { distance: number; date: string } | null;
  activeDays: number;
}

Page({
  data: {
    report: null as AnnualReport | null,
    year: new Date().getFullYear(),
    loading: false,
    maxMonthly: 1, // 月度柱状图归一化基准
    durationHour: 0,
  },

  onShow() {
    this.loadReport();
  },

  /** 拉取年度报告（stats.myAnnualReport） */
  async loadReport() {
    this.setData({ loading: true });
    try {
      const res = await api.call<AnnualReport>('stats', 'myAnnualReport', {
        year: this.data.year,
      });
      this.setData({
        report: res,
        maxMonthly: Math.max(...res.monthly.map((m) => m.distance), 1),
        durationHour: Math.round((res.yearDurationSec / 3600) * 10) / 10,
        loading: false,
      });
    } catch {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  /** 上一年 */
  prevYear() {
    this.setData({ year: this.data.year - 1 });
    this.loadReport();
  },

  /** 下一年 */
  nextYear() {
    this.setData({ year: this.data.year + 1 });
    this.loadReport();
  },

  /** 分享到群/好友 */
  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent {
    const r = this.data.report;
    if (!r) return { title: '我的年度跑量报告', path: '/pages/annual-report/index' };
    return {
      title: `我 ${r.year} 年跑了 ${r.yearDistance} km，打卡 ${r.yearCheckins} 次！`,
      path: '/pages/annual-report/index',
    };
  },
});
