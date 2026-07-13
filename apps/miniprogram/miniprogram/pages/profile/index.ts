// pages/profile/index.ts — 个人资料+账号绑定（V0.1.143 合并 bind-apps）
// 2 tab：资料 / 绑定
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

type ProfileTab = 'profile' | 'bind';

let smsTimer: ReturnType<typeof setInterval> | null = null;

Page({
  data: {
    tab: 'profile' as ProfileTab,
    // 资料 tab
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
    // 绑定 tab（合并自 bind-apps）
    phone: '',
    email: '',
    hasPassword: false,
    smsPhone: '',
    smsCode: '',
    smsCountdown: 0,
    emailInput: '',
    emailPassword: '',
    newPassword: '',
    usernameInput: '',
  },

  onLoad(query: { tab?: string }) {
    if (query?.tab === 'bind') this.setData({ tab: 'bind' });
  },

  onShow() {
    this.refreshUser();
    this.loadMe();
  },

  onSwitchTab(e: WechatMiniprogram.TouchEvent) {
    const tab = (e.currentTarget.dataset.tab as ProfileTab) || 'profile';
    if (tab === this.data.tab) return;
    this.setData({ tab });
  },

  // ===== 资料 tab =====
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
    }
  },

  applyUser(user: User) {
    this.setData({
      user,
      form: {
        gender: (user.gender as 'male' | 'female' | 'unknown') ?? 'unknown',
        birthday: user.birthday ?? '',
        region: user.region ?? '',
        height: user.height != null ? String(user.height) : '',
        weight: user.weight != null ? String(user.weight) : '',
      },
    });
  },

  onTapEditName() { this.setData({ showPopup: true }); },
  onPopupClose() { this.setData({ showPopup: false }); },

  onProfileUpdated(e: WechatMiniprogram.CustomEvent<{ user: User }>) {
    this.setData({ user: e.detail.user, showPopup: false });
  },

  onPickerGender(e: WechatMiniprogram.CustomEvent) { this.setData({ 'form.gender': e.detail.value }); },
  onPickerBirthday(e: WechatMiniprogram.CustomEvent) { this.setData({ 'form.birthday': e.detail.value }); },
  onInputRegion(e: WechatMiniprogram.CustomEvent) { this.setData({ 'form.region': e.detail.value }); },
  onInputHeight(e: WechatMiniprogram.CustomEvent) { this.setData({ 'form.height': e.detail.value }); },
  onInputWeight(e: WechatMiniprogram.CustomEvent) { this.setData({ 'form.weight': e.detail.value }); },

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

  // ===== 绑定 tab（合并自 bind-apps）=====
  async loadMe() {
    try {
      const res = await api.call<{ phone?: string | null; email?: string | null; hasPassword?: boolean }>('user', 'me', {});
      this.setData({
        phone: res.phone ?? '',
        email: res.email ?? '',
        hasPassword: res.hasPassword ?? false,
      });
    } catch { /* ignore */ }
  },

  onSmsPhoneInput(e: WechatMiniprogram.Input) { this.setData({ smsPhone: e.detail.value }); },
  onCodeInput(e: WechatMiniprogram.Input) { this.setData({ smsCode: e.detail.value }); },

  async onSendSms() {
    const phone = this.data.smsPhone;
    if (!/^1[3-9]\d{9}$/.test(phone)) { wx.showToast({ title: '手机号格式错误', icon: 'none' }); return; }
    try {
      const res = await api.call<{ devCode?: string }>('auth', 'sendSms', { phone });
      wx.showToast({ title: res.devCode ? `验证码 ${res.devCode}（开发）` : '验证码已发送', icon: 'none', duration: 3000 });
      let n = 60;
      this.setData({ smsCountdown: n });
      if (smsTimer) clearInterval(smsTimer);
      smsTimer = setInterval(() => {
        n -= 1;
        this.setData({ smsCountdown: n });
        if (n <= 0 && smsTimer) { clearInterval(smsTimer); smsTimer = null; }
      }, 1000);
    } catch {
      wx.showToast({ title: '发送失败', icon: 'none' });
    }
  },

  async onBindPhone() {
    const { smsPhone: phone, smsCode: code } = this.data;
    if (!phone || !code) { wx.showToast({ title: '请填手机号和验证码', icon: 'none' }); return; }
    try {
      await api.call('user', 'bindApps', { phone });
      wx.showToast({ title: '手机号已绑定', icon: 'success' });
      this.setData({ smsPhone: '', smsCode: '' });
      this.loadMe();
    } catch {
      wx.showToast({ title: '绑定失败（可能已被占用）', icon: 'none' });
    }
  },

  onEmailInput(e: WechatMiniprogram.Input) { this.setData({ emailInput: e.detail.value }); },
  onEmailPasswordInput(e: WechatMiniprogram.Input) { this.setData({ emailPassword: e.detail.value }); },

  async onBindEmail() {
    const { emailInput: email, emailPassword: password } = this.data;
    if (!email || !password) { wx.showToast({ title: '请填邮箱和密码', icon: 'none' }); return; }
    if (password.length < 6) { wx.showToast({ title: '密码至少 6 位', icon: 'none' }); return; }
    try {
      await api.call('user', 'bindApps', { email, password });
      wx.showToast({ title: '邮箱已绑定', icon: 'success' });
      this.setData({ emailInput: '', emailPassword: '' });
      this.loadMe();
    } catch {
      wx.showToast({ title: '绑定失败（邮箱可能已被占用）', icon: 'none' });
    }
  },

  onNewPasswordInput(e: WechatMiniprogram.Input) { this.setData({ newPassword: e.detail.value }); },

  async onBindPassword() {
    const password = this.data.newPassword;
    if (password.length < 6) { wx.showToast({ title: '密码至少 6 位', icon: 'none' }); return; }
    try {
      await api.call('user', 'bindApps', { password });
      wx.showToast({ title: '密码已保存', icon: 'success' });
      this.setData({ newPassword: '' });
      this.loadMe();
    } catch {
      wx.showToast({ title: '设置失败', icon: 'none' });
    }
  },

  onUsernameInput(e: WechatMiniprogram.Input) { this.setData({ usernameInput: e.detail.value }); },

  async onBindUsername() {
    const username = this.data.usernameInput.trim();
    if (username.length < 3) { wx.showToast({ title: '用户名至少 3 位', icon: 'none' }); return; }
    try {
      await api.call('user', 'bindApps', { username });
      wx.showToast({ title: '用户名已设置', icon: 'success' });
      this.setData({ usernameInput: '' });
      this.loadMe();
    } catch {
      wx.showToast({ title: '设置失败（用户名可能已被占用）', icon: 'none' });
    }
  },

  onUnload() {
    if (smsTimer) { clearInterval(smsTimer); smsTimer = null; }
  },
});
