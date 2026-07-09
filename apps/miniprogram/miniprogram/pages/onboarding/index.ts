// pages/onboarding/index.ts — 新用户激活向导（V0.1.43，4 步）
import { api } from '../../services/api';

Page({
  data: {
    step: 1, // 1 资料 / 2 设备 / 3 导入 / 4 完成
    nickname: '',
    avatarUrl: '',
    gender: 'unknown' as 'male' | 'female' | 'unknown',
    birthday: '',
    height: '',
    weight: '',
  },

  onChooseAvatar(e: WechatMiniprogram.CustomEvent) {
    this.setData({ avatarUrl: e.detail.avatarUrl });
  },
  onNicknameInput(e: WechatMiniprogram.Input) {
    this.setData({ nickname: e.detail.value });
  },
  onGenderChange(e: WechatMiniprogram.TouchEvent) {
    this.setData({ gender: e.currentTarget.dataset.value as 'male' | 'female' | 'unknown' });
  },
  onBirthdayChange(e: WechatMiniprogram.CustomEvent) {
    this.setData({ birthday: e.detail.value });
  },
  onHeightInput(e: WechatMiniprogram.Input) {
    this.setData({ height: e.detail.value });
  },
  onWeightInput(e: WechatMiniprogram.Input) {
    this.setData({ weight: e.detail.value });
  },

  /** Step 1 下一步：保存资料 → step 2 */
  async nextFromProfile() {
    try {
      await api.call('user', 'updateProfile', {
        nickname: this.data.nickname || undefined,
        avatarUrl: this.data.avatarUrl || undefined,
        gender: this.data.gender,
        birthday: this.data.birthday || undefined,
        height: this.data.height ? Number(this.data.height) : undefined,
        weight: this.data.weight ? Number(this.data.weight) : undefined,
      });
      this.setData({ step: 2 });
    } catch {
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  /** Step 2 设备引导 */
  goDeviceBind() {
    wx.navigateTo({ url: '/pages/device-bind/index' });
  },
  nextFromDevice() {
    this.setData({ step: 3 });
  },
  skipDevice() {
    this.setData({ step: 3 });
  },

  /** Step 3 导入引导 */
  goImportGuide() {
    wx.navigateTo({ url: '/pages/data-import-guide/index' });
  },
  nextFromImport() {
    this.setData({ step: 4 });
  },
  skipImport() {
    this.setData({ step: 4 });
  },

  /** Step 4 完成：调 completeOnboarding → 跳首页 */
  async finish() {
    try {
      await api.call('user', 'completeOnboarding', {});
      const app = getApp();
      const u = app.globalData.user as ({ onboardingDone?: boolean } | null);
      if (u) u.onboardingDone = true;
      wx.switchTab({ url: '/pages/index/index' });
    } catch {
      wx.showToast({ title: '完成失败', icon: 'none' });
    }
  },
});
