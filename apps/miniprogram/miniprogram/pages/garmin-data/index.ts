// pages/garmin-data/index.ts — 佳明数据处理（参考图 2769）
import { api } from '../../services/api';

interface ActivityRow {
  id: string;
  type: string;
  sportType: string;
  startTime: string;
  distanceKm: string;
  durationMin: string;
  avgHr: number | null;
  status?: string;
  importCheckinId?: string | null;
  importedAt?: string | null;
}

Page({
  data: {
    tab: 'pending' as 'pending' | 'processed',
    list: [] as ActivityRow[],
    loading: false,
    // 爬升补偿开关（UI 占位 — 后端补偿系数逻辑后续，当前仅本地状态）
    climbCompensation: false,
  },

  onShow() {
    this.loadList();
  },

  /** 拉取待处理 / 已处理列表（device.myPending / myProcessed） */
  async loadList() {
    this.setData({ loading: true });
    try {
      const action = this.data.tab === 'pending' ? 'myPending' : 'myProcessed';
      const res = await api.call<{ list: Array<ActivityRow & { distanceMeters: number | null; durationSec: number | null }>; total: number }>(
        'device',
        action,
        { page: 1, pageSize: 50 },
      );
      this.setData({
        list: res.list.map((a) => ({
          id: a.id,
          type: a.type,
          sportType: a.sportType,
          startTime: a.startTime.slice(0, 16).replace('T', ' '),
          distanceKm: a.distanceMeters != null ? (a.distanceMeters / 1000).toFixed(2) : '-',
          durationMin: a.durationSec != null ? Math.round(a.durationSec / 60).toString() : '-',
          avgHr: a.avgHr ?? null,
          status: a.status,
          importCheckinId: a.importCheckinId,
          importedAt: a.importedAt,
        })),
        loading: false,
      });
    } catch {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  switchTab(e: WechatMiniprogram.TouchEvent) {
    const tab = e.currentTarget.dataset.tab as 'pending' | 'processed';
    if (tab === this.data.tab) return;
    this.setData({ tab, list: [] });
    this.loadList();
  },

  toggleClimb() {
    this.setData({ climbCompensation: !this.data.climbCompensation });
  },

  /** 导入榜单（device.importToCheckin → BullMQ 异步） */
  async onImport(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.showLoading({ title: '提交中...' });
    try {
      const res = await api.call<{ jobId: string; queued: number }>('device', 'importToCheckin', {
        activityIds: [id],
      });
      wx.hideLoading();
      wx.showToast({ title: `已入队 ${res.queued} 条`, icon: 'success' });
      // worker 异步处理，延迟刷新
      setTimeout(() => this.loadList(), 1500);
    } catch {
      wx.hideLoading();
      wx.showToast({ title: '导入失败', icon: 'none' });
    }
  },

  /** 忽略一条（device.ignoreActivity） */
  onIgnore(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.showModal({
      title: '忽略活动',
      content: '忽略后这条活动不会进入榜单，可后续在已处理查看。',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await api.call('device', 'ignoreActivity', { activityId: id });
          wx.showToast({ title: '已忽略', icon: 'success' });
          this.loadList();
        } catch {
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      },
    });
  },
});
