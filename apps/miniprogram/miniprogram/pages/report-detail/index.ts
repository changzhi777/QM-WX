// pages/report-detail — 完整健康报告详情页（V0.2.4 健康中心改版）
// 从今日页「查看完整报告」跳入；免费用户 reportText 模糊锁定 + 升级入口，会员看全文
import { api } from '../../services/api';
import { ensureLogin } from '../../utils/auth';

interface DailyReport {
  id: string; date: string; healthScore: number;
  reportText: string; alertText: string | null;
  steps: number; restingHr: number | null; sleepHours: number | null;
}
interface HealthScoreRes {
  date: string; score: number; steps: number;
  restingHr: number | null; sleepHours: number | null;
  trend: { yesterday: number; diff: number };
}

// 免费用户 reportText 预览字数（超出锁定）
const FREE_PREVIEW_LEN = 60;

Page({
  data: {
    loading: true,
    report: null as DailyReport | null,
    score: null as HealthScoreRes | null,
    isMember: false,
    previewText: '', // 免费用户可见的前 N 字
    locked: true,    // reportText 是否锁定
  },

  async onLoad(query: { date?: string } = {}) {
    try {
      await ensureLogin();
      const u = getApp().globalData.user as ({ memberLevel?: string } | null);
      const isMember = !!u && !!u.memberLevel && u.memberLevel !== 'free';
      // V0.2.6 report 免费周限频：会员不限，免费每周 1 次全文（checkReportQuota 返回 canView）
      const quota = await api.call<{ canView: boolean; weeklyUsed: number; quota: number }>(
        'user',
        'checkReportQuota',
      );
      let report: DailyReport | null;
      let score: HealthScoreRes | null;
      if (query.date) {
        // ②历史日：从 dailyReportList 找匹配 date 的报告
        const res = await api.call<{ list: DailyReport[]; total: number }>('stats', 'dailyReportList', { page: 1, pageSize: 30 });
        report = res.list.find((r) => r.date === query.date) ?? null;
        score = report
          ? { date: report.date, score: report.healthScore, steps: report.steps, restingHr: report.restingHr, sleepHours: report.sleepHours, trend: { yesterday: 0, diff: 0 } }
          : null;
      } else {
        // 今日：dailyReport + healthScore 并行
        [report, score] = await Promise.all([
          api.call<DailyReport>('stats', 'dailyReport', {}),
          api.call<HealthScoreRes>('stats', 'healthScore', {}),
        ]);
      }
      if (!report || !score) {
        this.setData({ loading: false });
        return;
      }
      const text = report.reportText || '';
      this.setData({
        report,
        score,
        isMember,
        locked: !quota.canView,
        previewText: quota.canView ? text : text.slice(0, FREE_PREVIEW_LEN),
        loading: false,
      });
    } catch (e) {
      this.setData({ loading: false });
      console.error('[report-detail] load failed', e);
    }
  },

  goMembership() {
    wx.navigateTo({ url: '/pages/membership/index' });
  },

  onShareAppMessage() {
    const score = this.data.score?.score ?? '--';
    const code = (getApp().globalData as { inviteCode?: string }).inviteCode;
    return {
      title: `我的健康分数 ${score} 分，来看看今日身体简报`,
      path: '/pages/index/index' + (code ? `?inviterCode=${code}` : ''),
      success: () => {
        api.call('points', 'awardShare').catch(() => {});
      },
    };
  },
});
