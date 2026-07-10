// pages/onboarding/index.ts — 新用户激活向导（V0.1.43，4 步；V0.1.44 修资料字段 bug + 头像持久化 + 微信运动同步）
import { api } from '../../services/api';
import { syncWeRunToday } from '../../utils/werun';

Page({
  data: {
    step: 1, // 1 资料 / 2 设备 / 3 导入 / 4 完成
    nickname: '',
    avatarUrl: '', // 即时预览（微信临时链接）
    avatarFileID: '', // 持久 URL（上传自家服务器，保存时用；V0.1.44 头像持久化）
    gender: 'unknown' as 'male' | 'female' | 'unknown',
    birthday: '',
    height: '',
    weight: '',
    // V0.1.44 微信运动同步状态（step 3）
    werunSyncing: false,
    werunSynced: false,
    werunSyncDays: 0,
  },

  // ===== Step 1 资料采集 =====

  /** 选头像：chooseAvatar 返回临时链接 → 立即预览 + 异步上传拿持久 URL */
  async onChooseAvatar(e: WechatMiniprogram.CustomEvent) {
    const tempUrl = e.detail.avatarUrl;
    this.setData({ avatarUrl: tempUrl });
    if (!tempUrl) return;
    try {
      // V0.1.44：上传自家服务器拿持久 URL（api.uploadFile 返完整 URL，含 baseUrl）
      // 不存微信临时链接（几天后失效，头像会消失）
      const fileUrl = await api.uploadFile(tempUrl, 'avatar');
      this.setData({ avatarFileID: fileUrl });
    } catch {
      wx.showToast({ title: '头像上传失败', icon: 'none' });
    }
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

  /** Step 1 下一步：保存资料 → step 2
   *
   * V0.1.44 修 BUG-1：gender/birthday/height/weight 必须包进 profile:{}（schema 嵌套，原顶层传被 Zod strip）
   * V0.1.44 修 BUG-2：头像传 avatarFileID（持久 URL），非 avatarUrl（微信临时链接）
   */
  async nextFromProfile() {
    try {
      await api.call('user', 'updateProfile', {
        ...(this.data.nickname ? { nickname: this.data.nickname } : {}),
        ...(this.data.avatarFileID ? { avatarFileID: this.data.avatarFileID } : {}),
        profile: {
          gender: this.data.gender,
          ...(this.data.birthday ? { birthday: this.data.birthday } : {}),
          ...(this.data.height ? { height: Number(this.data.height) } : {}),
          ...(this.data.weight ? { weight: Number(this.data.weight) } : {}),
        },
      });
      // 同步 globalData.user（避免回到首页 me 缓存 30s 内仍是旧资料）
      const app = getApp();
      const u = app.globalData.user as ({ nickname?: string; avatarUrl?: string; gender?: string } | null);
      if (u) {
        if (this.data.nickname) u.nickname = this.data.nickname;
        if (this.data.avatarFileID) u.avatarUrl = this.data.avatarFileID;
        u.gender = this.data.gender;
      }
      this.setData({ step: 2 });
    } catch {
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  // ===== Step 2 设备引导 =====

  goDeviceBind() {
    wx.navigateTo({ url: '/pages/device-bind/index' });
  },
  nextFromDevice() {
    this.setData({ step: 3 });
  },
  skipDevice() {
    this.setData({ step: 3 });
  },

  // ===== Step 3 数据导入 =====

  goImportGuide() {
    wx.navigateTo({ url: '/pages/data-import-guide/index' });
  },

  /** V0.1.44 同步微信运动（30 天历史步数）
   *
   * 调 utils/werun.syncWeRunToday：wx.getWeRunData（授权）→ AES 解密 → upsert WeRunRecord
   * 首次触发 scope.werun 系统授权弹窗；拒绝则引导 openSetting
   */
  async onSyncWeRun() {
    if (this.data.werunSyncing) return;
    this.setData({ werunSyncing: true });
    try {
      const result = await syncWeRunToday();
      if (result) {
        this.setData({ werunSynced: true, werunSyncDays: result.days });
        wx.showToast({ title: `已同步 ${result.days} 天`, icon: 'success' });
      } else {
        // 用户拒绝授权 — 引导前往设置开启
        wx.showModal({
          title: '需要授权',
          content: '同步微信运动需要授权「微信运动数据」，是否前往设置开启？',
          confirmText: '去设置',
          success: (r) => {
            if (r.confirm) wx.openSetting({});
          },
        });
      }
    } catch {
      wx.showToast({ title: '同步失败', icon: 'none' });
    } finally {
      this.setData({ werunSyncing: false });
    }
  },

  nextFromImport() {
    this.setData({ step: 4 });
  },
  skipImport() {
    this.setData({ step: 4 });
  },

  // ===== Step 4 完成 =====

  /** 调 completeOnboarding → 跳首页 */
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
