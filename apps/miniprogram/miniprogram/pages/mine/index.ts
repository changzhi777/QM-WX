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
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    // 1. 快速：先用缓存 user
    const cached = (app.globalData.user ?? wx.getStorageSync('currentUser')) as User | null;
    if (cached) this.applyUser(cached);

    // 2. 确保登录（未登录会自动跳登录 / 触发补资料弹窗）
    try {
      await ensureLogin();
      this.applyUser(app.globalData.user!);
    } catch {
      // 静默
    }

    this.setData({
      flags: (app.globalData.config?.featureFlags ?? this.data.flags) as FeatureFlagsConfig,
      isLogin: !!app.globalData.user,
    });
  },

  applyUser(user: User) {
    this.setData({
      user,
      memberLabel: MEMBER_LEVEL_LABEL[user.memberLevel] ?? '免费用户',
    });
  },

  goProfile() {
    wx.navigateTo({ url: '/pages/profile/index' });
  },

  goWallet() {
    if (!this.data.flags.wallet) {
      wx.showToast({ title: '钱包功能开通中', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/wallet/index' });
  },

  goMembership() {
    if (!this.data.flags.membershipPurchase) {
      wx.showToast({ title: '会员购买即将上线', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/membership/index' });
  },

  goBindApp() {
    if (!this.data.flags.bindApp) {
      wx.showToast({ title: '敬请期待', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/bind-app/index' });
  },

  goOrderList() {
    wx.navigateTo({ url: '/pages/order-list/index' });
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
