// pages/werun/index.ts — 微信运动历史（V0.1.44）
//
// 月度柱状图（每日步数）+ 汇总（总步数/总公里/日均/活跃天数）+ 手动同步 + 月份切换
// 数据源 device.myWeRun（WeRunRecord，由 syncWeRun 同步入库）
import { getWeRunHistory, syncWeRunToday, cnMonthRange } from '../../utils/werun';

Page({
  data: {
    year: 0,
    month: 0,
    monthLabel: '',
    records: [] as Array<{
      date: string;
      step: number;
      km: number;
      barHeight: number; // 百分比（max step 归一化，最低 2%）
      dayLabel: string; // DD
    }>,
    totalSteps: 0,
    totalKm: 0,
    days: 0,
    avgSteps: 0,
    loading: true,
    syncing: false,
  },

  onLoad() {
    const now = new Date(Date.now() + 8 * 3600 * 1000); // CN 时区
    this.setData({ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 });
    this.loadHistory();
  },

  async loadHistory() {
    this.setData({ loading: true });
    try {
      const { startDate, endDate } = cnMonthRange(this.data.year, this.data.month);
      const res = await getWeRunHistory(startDate, endDate);
      // 柱高归一化：当天步数 / 当月最大步数；零步数给 2% 最低可见
      const maxStep = res.records.reduce((m, r) => Math.max(m, r.step), 0);
      const records = res.records.map((r) => ({
        date: r.date,
        step: r.step,
        km: r.km,
        barHeight: maxStep > 0 ? Math.max((r.step / maxStep) * 100, 2) : 2,
        dayLabel: r.date.slice(8, 10),
      }));
      this.setData({
        monthLabel: `${this.data.year}年${this.data.month}月`,
        records,
        totalSteps: res.totalSteps,
        totalKm: res.totalKm,
        days: res.days,
        avgSteps: res.days > 0 ? Math.round(res.totalSteps / res.days) : 0,
        loading: false,
      });
    } catch {
      this.setData({ loading: false, records: [] });
    }
  },

  prevMonth() {
    let { year, month } = this.data;
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    this.setData({ year, month });
    this.loadHistory();
  },

  nextMonth() {
    // 不超过本月
    const now = new Date(Date.now() + 8 * 3600 * 1000);
    const curYear = now.getUTCFullYear();
    const curMonth = now.getUTCMonth() + 1;
    if (this.data.year === curYear && this.data.month === curMonth) return;
    let { year, month } = this.data;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    this.setData({ year, month });
    this.loadHistory();
  },

  /** 手动同步微信运动（授权 → AES 解密 → upsert），成功后刷新图表 */
  async onSync() {
    if (this.data.syncing) return;
    this.setData({ syncing: true });
    try {
      const result = await syncWeRunToday();
      if (result) {
        wx.showToast({ title: `已同步 ${result.days} 天`, icon: 'success' });
        this.loadHistory();
      } else {
        wx.showModal({
          title: '需要授权',
          content: '同步微信运动需要授权「微信运动数据」，是否前往设置开启？',
          confirmText: '去设置',
          success: (r) => {
            if (r.confirm) wx.openSetting({});
          },
        });
      }
    } catch {
      wx.showToast({ title: '同步失败', icon: 'none' });
    } finally {
      this.setData({ syncing: false });
    }
  },
});
