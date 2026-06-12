// pages/profile/index.ts
import { api } from '../../services/api';
import type { User } from '@qm-wx/shared';
import { ensureLogin } from '../../utils/auth';

const app = getApp();

interface ProfileForm {
  gender: 'male' | 'female' | 'unknown';
  birthday: string;
  region: string;
  height: string;
  weight: string;
}

Page({
  data: {
    user: null as User | null,
    form: {
      gender: 'unknown',
      birthday: '',
      region: '',
      height: '',
      weight: '',
    } as ProfileForm,
    showPopup: false,
    saving: false,
    error: false,
    errorMsg: '',
  },

  onShow() {
    this.refreshUser();
  },

  async refreshUser() {
    this.setData({ error: false, errorMsg: '' });
    const cached = (app.globalData.user ?? wx.getStorageSync('currentUser')) as User | null;
    if (cached) this.applyUser(cached);
    try {
      await ensureLogin();
      this.applyUser(app.globalData.user!);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg) this.setData({ error: true, errorMsg: msg });
      // 否则静默用 cached
    }
  },

  applyUser(user: User) {
    const stats = user.stats ?? { totalDistance: 0, totalCheckins: 0, totalPoints: 0 };
    this.setData({
      user,
      form: {
        gender: 'unknown',
        birthday: '',
        region: '',
        height: '',
        weight: '',
      },
    });
    void stats;
  },

  onTapEditName() {
    this.setData({ showPopup: true });
  },

  onPopupClose() {
    this.setData({ showPopup: false });
  },

  onProfileUpdated(e: WechatMiniprogram.CustomEvent<{ user: User }>) {
    this.setData({ user: e.detail.user, showPopup: false });
  },

  onPickerGender(e: WechatMiniprogram.CustomEvent) {
    this.setData({ 'form.gender': e.detail.value });
  },

  onPickerBirthday(e: WechatMiniprogram.CustomEvent) {
    this.setData({ 'form.birthday': e.detail.value });
  },

  onInputRegion(e: WechatMiniprogram.CustomEvent) {
    this.setData({ 'form.region': e.detail.value });
  },

  onInputHeight(e: WechatMiniprogram.CustomEvent) {
    this.setData({ 'form.height': e.detail.value });
  },

  onInputWeight(e: WechatMiniprogram.CustomEvent) {
    this.setData({ 'form.weight': e.detail.value });
  },

  async onSave() {
    if (this.data.saving) return;
    this.setData({ saving: true });

    try {
      const { form } = this.data;
      const { user } = await api.call<{ user: User }>('user', 'updateProfile', {
        profile: {
          ...(form.gender && form.gender !== 'unknown' ? { gender: form.gender } : {}),
          ...(form.birthday ? { birthday: form.birthday } : {}),
          ...(form.region ? { region: form.region } : {}),
          ...(form.height ? { height: Number(form.height) } : {}),
          ...(form.weight ? { weight: Number(form.weight) } : {}),
        },
      });

      app.globalData.user = user;
      wx.setStorageSync('currentUser', user);
      this.setData({ user });
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: (err as Error).message ?? '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },
});
