// pages/bind-apps/index.ts — 账号绑定（V0.1.129，手机号/邮箱/密码）
import { api } from '../../services/api';

let smsTimer: ReturnType<typeof setInterval> | null = null;

Page({
  data: {
    // 当前绑定状态（user.me 返回）
    phone: '',
    email: '',
    hasPassword: false,
    // 手机号表单
    smsPhone: '',
    smsCode: '',
    smsCountdown: 0,
    // 邮箱表单
    emailInput: '',
    emailPassword: '',
    // 密码表单
    newPassword: '',
  },

  onLoad() {
    this.loadMe();
  },

  async loadMe() {
    try {
      const res = await api.call<{
        phone?: string | null;
        email?: string | null;
        hasPassword?: boolean;
      }>('user', 'me', {});
      this.setData({
        phone: res.phone ?? '',
        email: res.email ?? '',
        hasPassword: res.hasPassword ?? false,
      });
    } catch {
      /* ignore */
    }
  },

  // ===== 手机号绑定 =====
  onSmsPhoneInput(e: WechatMiniprogram.Input) {
    this.setData({ smsPhone: e.detail.value });
  },
  onCodeInput(e: WechatMiniprogram.Input) {
    this.setData({ smsCode: e.detail.value });
  },
  async onSendSms() {
    const phone = this.data.smsPhone;
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({ title: '手机号格式错误', icon: 'none' });
      return;
    }
    try {
      const res = await api.call<{ devCode?: string }>('auth', 'sendSms', { phone });
      wx.showToast({
        title: res.devCode ? `验证码 ${res.devCode}（开发）` : '验证码已发送',
        icon: 'none',
        duration: 3000,
      });
      let n = 60;
      this.setData({ smsCountdown: n });
      if (smsTimer) clearInterval(smsTimer);
      smsTimer = setInterval(() => {
        n -= 1;
        this.setData({ smsCountdown: n });
        if (n <= 0 && smsTimer) {
          clearInterval(smsTimer);
          smsTimer = null;
        }
      }, 1000);
    } catch {
      wx.showToast({ title: '发送失败', icon: 'none' });
    }
  },
  async onBindPhone() {
    const { smsPhone: phone, smsCode: code } = this.data;
    if (!phone || !code) {
      wx.showToast({ title: '请填手机号和验证码', icon: 'none' });
      return;
    }
    try {
      await api.call('user', 'bindApps', { phone });
      wx.showToast({ title: '手机号已绑定', icon: 'success' });
      this.setData({ smsPhone: '', smsCode: '' });
      this.loadMe();
    } catch {
      wx.showToast({ title: '绑定失败（可能已被占用）', icon: 'none' });
    }
  },

  // ===== 邮箱绑定 =====
  onEmailInput(e: WechatMiniprogram.Input) {
    this.setData({ emailInput: e.detail.value });
  },
  onEmailPasswordInput(e: WechatMiniprogram.Input) {
    this.setData({ emailPassword: e.detail.value });
  },
  async onBindEmail() {
    const { emailInput: email, emailPassword: password } = this.data;
    if (!email || !password) {
      wx.showToast({ title: '请填邮箱和密码', icon: 'none' });
      return;
    }
    if (password.length < 6) {
      wx.showToast({ title: '密码至少 6 位', icon: 'none' });
      return;
    }
    try {
      await api.call('user', 'bindApps', { email, password });
      wx.showToast({ title: '邮箱已绑定', icon: 'success' });
      this.setData({ emailInput: '', emailPassword: '' });
      this.loadMe();
    } catch {
      wx.showToast({ title: '绑定失败（邮箱可能已被占用）', icon: 'none' });
    }
  },

  // ===== 密码设置/修改 =====
  onNewPasswordInput(e: WechatMiniprogram.Input) {
    this.setData({ newPassword: e.detail.value });
  },
  async onBindPassword() {
    const password = this.data.newPassword;
    if (password.length < 6) {
      wx.showToast({ title: '密码至少 6 位', icon: 'none' });
      return;
    }
    try {
      await api.call('user', 'bindApps', { password });
      wx.showToast({ title: '密码已保存', icon: 'success' });
      this.setData({ newPassword: '' });
      this.loadMe();
    } catch {
      wx.showToast({ title: '设置失败', icon: 'none' });
    }
  },

  onUnload() {
    if (smsTimer) {
      clearInterval(smsTimer);
      smsTimer = null;
    }
  },
});
