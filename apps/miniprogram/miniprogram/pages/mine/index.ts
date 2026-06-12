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
