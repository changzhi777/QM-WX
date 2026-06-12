// pages/group-detail/index.ts
import { api } from '../../services/api';

type Period = 'week' | 'month' | 'year';

interface Member {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  distance: number;
  count: number;
  points: number;
}

Page({
  data: {
    groupId: '' as string,
    period: 'week' as Period,
    periodIndex: 0,
    members: [] as Member[],
    totals: { memberCount: 0, totalDistance: 0 },
    loading: true,
    error: false,
    errorMsg: '',
  },

  onLoad(query) {
    const groupId = (query?.id as string) ?? '';
    this.setData({ groupId });
    this.loadRanking();
  },

  onPeriodChange(e: WechatMiniprogram.CustomEvent) {
    const idx = Number(e.detail.value);
    const period = (['week', 'month', 'year'] as const)[idx];
    this.setData({ periodIndex: idx, period });
    this.loadRanking();
  },

  async loadRanking() {
    if (!this.data.groupId) return;
    this.setData({ loading: true, error: false, errorMsg: '' });
    try {
      const result = await api.call<{
        members: Member[];
        totals: { memberCount: number; totalDistance: number };
      }>('sport', 'groupRanking', { groupId: this.data.groupId, period: this.data.period });

      // 加排名
      const ranked = result.members.map((m, i) => ({ ...m, rank: i + 1 }));
      this.setData({
        members: ranked,
        totals: result.totals,
        loading: false,
      });
    } catch (e) {
      this.setData({
        loading: false,
        error: true,
        errorMsg: (e as Error).message ?? '加载榜单失败',
      });
    }
  },

  onTapQuit() {
    wx.showModal({
      title: '退出群',
      content: '确定要退出该群吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.call('sport', 'quitGroup', { groupId: this.data.groupId });
          wx.showToast({ title: '已退出', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 800);
        } catch (err) {
          wx.showToast({ title: (err as Error).message ?? '退出失败', icon: 'none' });
        }
      },
    });
  },

  goWeeklyReport() {
    wx.navigateTo({ url: '/pages/weekly-report/index' });
  },
});
