// pages/mine/index.ts（V0.1.35 精简：运动/商城入口分散到对应 tab，mine 仅留个人/设置）
import { api } from '../../services/api';
import { ensureLogin } from '../../utils/auth';
import type { User, FeatureFlagsConfig } from '@qm-wx/shared';
void api;

const app = getApp();

const MEMBER_LEVEL_LABEL: Record<string, string> = {
  free: '免费用户',
  monthly: '月度会员',
  quarterly: '季度会员',
  yearly: '年度会员',
};

Page({
  data: {
    user: null as User | null,
    memberLabel: '免费用户',
    flags: {
      wallet: false,
      payment: false,
      membershipPurchase: false,
      smartAgent: false,
      bindApp: false,
    } as FeatureFlagsConfig,
    isLogin: false,
    error: false,
    errorMsg: '',
    // 佳明运动数据（头部展示）
    garminActivities: [] as Array<{
      id: string;
      name: string | null;
      type: string;
      startTime: string;
      distanceKm: string;
      durationMin: string;
    }>,
    garminLoading: false,
    // 跑者数据汇总（参考图 2768，stats.myRunnerStats）
    runnerStats: {
      yearDistance: 0,
      yearCheckins: 0,
      totalDistance: 0,
      totalCheckins: 0,
      monthDistance: 0,
      avgPace: null as string | null,
    },
    // 消息未读数（V0.1.31 红点）
    notifUnread: 0,
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    this.setData({ error: false, errorMsg: '' });
    try {
      // 1. 快速：先用缓存 user
      const cached = (app.globalData.user ?? wx.getStorageSync('currentUser')) as User | null;
      if (cached) this.applyUser(cached);

      // 2. 确保登录
      await ensureLogin();
      this.applyUser(app.globalData.user!);

      // 头部数据（跑量 + 佳明 + 未读）
      this.loadGarmin();
      this.loadRunnerStats();
      this.loadNotifUnread();

      this.setData({
        flags: (app.globalData.config?.featureFlags ?? this.data.flags) as FeatureFlagsConfig,
        isLogin: !!app.globalData.user,
      });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg) this.setData({ error: true, errorMsg: msg });
    }
  },

  applyUser(user: User) {
    this.setData({
      user,
      memberLabel: MEMBER_LEVEL_LABEL[user.memberLevel] ?? '免费用户',
    });
  },

  /** 佳明运动数据（头部展示） */
  async loadGarmin() {
    this.setData({ garminLoading: true });
    try {
      const res = await api.call<{
        list: Array<{
          id: string;
          name: string | null;
          type: string;
          startTime: string;
          distanceMeters: number | null;
          durationSec: number | null;
        }>;
        total: number;
      }>('device', 'myActivities', { page: 1, pageSize: 3 });
      this.setData({
        garminActivities: res.list.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          startTime: a.startTime,
          distanceKm: a.distanceMeters != null ? (a.distanceMeters / 1000).toFixed(1) : '-',
          durationMin: a.durationSec != null ? Math.round(a.durationSec / 60).toString() : '-',
        })),
        garminLoading: false,
      });
    } catch {
      this.setData({ garminLoading: false });
    }
  },

  /** 跑者数据汇总（stats.myRunnerStats） */
  async loadRunnerStats() {
    try {
      const res = await api.call<{
        yearDistance: number;
        yearCheckins: number;
        totalDistance: number;
        totalCheckins: number;
        monthDistance: number;
        avgPace: string | null;
      }>('stats', 'myRunnerStats', {});
      this.setData({
        runnerStats: {
          yearDistance: Math.round(res.yearDistance ?? 0),
          yearCheckins: res.yearCheckins ?? 0,
          totalDistance: Math.round(res.totalDistance ?? 0),
          totalCheckins: res.totalCheckins ?? 0,
          monthDistance: Math.round(res.monthDistance ?? 0),
          avgPace: res.avgPace,
        },
      });
    } catch {
      // 汇总加载失败不阻塞主页
    }
  },

  /** 消息未读数（V0.1.31 红点） */
  async loadNotifUnread() {
    try {
      const res = await api.call<{ count: number }>('notification', 'unreadCount', {});
      this.setData({ notifUnread: res.count ?? 0 });
    } catch {
      // 未读数加载失败不阻塞主页
    }
  },

  // ===== V0.1.35 入口分散引导（切到运动/商城 tab）=====
  goSportTab() {
    wx.switchTab({ url: '/pages/sport/index' });
  },

  // ===== 精简入口（个人/设置）=====
  goProfile() {
    wx.navigateTo({ url: '/pages/profile/index' });
  },

  goBindApps() {
    wx.navigateTo({ url: '/pages/bind-apps/index' });
  },

  goMembership() {
    wx.navigateTo({ url: '/pages/membership/index' });
  },

  goNotification() {
    wx.navigateTo({ url: '/pages/notification/index' });
  },

  goDeviceBind() {
    wx.navigateTo({ url: '/pages/device-bind/index' });
  },

  /** V0.1.139 AI 私教（smartAgent flag 守卫，wxml feature-gate 包裹）*/
  goAiCoach() {
    wx.switchTab({ url: '/pages/ai-coach/index' });
  },

  goWeRun() {
    wx.navigateTo({ url: '/pages/werun/index' });
  },

  goOnboarding() {
    wx.navigateTo({ url: '/pages/onboarding/index' });
  },

  goFamily() {
    wx.navigateTo({ url: '/pages/family/index' });
  },

  goEnrollments() {
    wx.navigateTo({ url: '/pages/my-enrollments/index' });
  },

  goAgreement() {
    wx.navigateTo({ url: '/pages/agreement/index' });
  },

  onTapLogin() {
    ensureLogin().then(() => this.refresh());
  },

  /** V0.1.44 重新激活授权（重置 onboardingDone → 跳向导重新填资料/授权微信运动）*/
  onTapReactivate() {
    wx.showModal({
      title: '重新激活',
      content: '将重新填写个人资料并完成授权（头像/微信运动等），是否继续？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.call('user', 'resetOnboarding', {});
          const app = getApp();
          const u = app.globalData.user as ({ onboardingDone?: boolean } | null);
          if (u) u.onboardingDone = false;
          wx.navigateTo({ url: '/pages/onboarding/index' });
        } catch {
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      },
    });
  },
});
