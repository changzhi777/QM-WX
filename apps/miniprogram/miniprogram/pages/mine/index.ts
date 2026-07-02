// pages/mine/index.ts
import { api } from '../../services/api';
import { logout, ensureLogin } from '../../utils/auth';
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
    // 佳明运动数据（B-2，2026-07-01）
    garminActivities: [] as Array<{ id: string; name: string | null; type: string; startTime: string; distanceKm: string; durationMin: string }>,
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

      // 2. 确保登录（未登录会自动跳登录 / 触发补资料弹窗）
      await ensureLogin();
      this.applyUser(app.globalData.user!);

      // 佳明运动数据（登录后拉取最近活动）
      this.loadGarmin();
      // 跑者数据汇总
      this.loadRunnerStats();

      this.setData({
        flags: (app.globalData.config?.featureFlags ?? this.data.flags) as FeatureFlagsConfig,
        isLogin: !!app.globalData.user,
      });
    } catch (e) {
      // ensureLogin 内部走 silent flow，未登录也可能是预期路径
      // 只有带 err.message 的真错误才显示给用户
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

  /** 佳明运动数据：拉取最近活动（B-2，2026-07-01） */
  async loadGarmin() {
    this.setData({ garminLoading: true });
    try {
      const res = await api.call<{
        list: Array<{ id: string; name: string | null; type: string; startTime: string; distanceMeters: number | null; durationSec: number | null }>;
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
      // 佳明数据加载失败不阻塞主页面
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
      // 距离四舍五入取整（避免多位小数撑爆 4 列布局）
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

  goGarminData() {
    wx.navigateTo({ url: '/pages/garmin-data/index' });
  },

  goRanking() {
    wx.navigateTo({ url: '/pages/ranking/index' });
  },

  goProfile() {
    wx.navigateTo({ url: '/pages/profile/index' });
  },

  // 钱包/会员/绑定 APP 的入口在 WXML 已被 <feature-gate> 隐藏，
  // 这里仅作 fallback（用户深链直访时）— 无需再次 flag 判断（WXML 层已守门）
  goWallet() {
    wx.navigateTo({ url: '/pages/wallet/index' });
  },

  goMembership() {
    wx.navigateTo({ url: '/pages/membership/index' });
  },

  goBindApp() {
    wx.navigateTo({ url: '/pages/bind-app/index' });
  },

  goOrderList() {
    wx.navigateTo({ url: '/pages/order-list/index' });
  },

  goCategory() {
    wx.navigateTo({ url: '/pages/category/index' });
  },

  goCart() {
    wx.navigateTo({ url: '/pages/cart/index' });
  },

  goPoints() {
    wx.navigateTo({ url: '/pages/points/index' });
  },

  goContent() {
    wx.navigateTo({ url: '/pages/content-list/index' });
  },

  goAgreement() {
    wx.navigateTo({ url: '/pages/agreement/index' });
  },

  goWeeklyReport() {
    wx.navigateTo({ url: '/pages/weekly-report/index' });
  },

  onTapLogin() {
    ensureLogin().then(() => this.refresh());
  },

  onTapLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      success: (res) => {
        if (res.confirm) logout();
      },
    });
  },

  /** 强制补资料（昵称为空时点我的触发） */
  onTapForceProfile() {
    wx.navigateTo({ url: '/pages/profile/index' });
  },
});
