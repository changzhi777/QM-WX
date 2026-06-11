// components/profile-popup/index.ts
// 资料补全弹窗：选择头像（chooseAvatar）+ 昵称（input type="nickname"）
// 替代废弃的 wx.getUserProfile / wx.getUserInfo
//
// 用法：
//   <profile-popup
//     visible="{{show}}"
//     initial-nickname="{{user.nickname}}"
//     initial-avatar-url="{{user.avatarUrl}}"
//     bind:success="onProfileUpdated"
//     bind:close="onPopupClose"
//   />

import { api } from '../../services/api';
import type { User } from '@qm-wx/shared';

const app = getApp();

Component({
  options: { multipleSlots: true },
  properties: {
    visible: { type: Boolean, value: false },
    initialNickname: { type: String, value: '' },
    initialAvatarUrl: { type: String, value: '' },
  },
  data: {
    nickname: '',
    avatarUrl: '',
    saving: false,
  },
  observers: {
    visible(v: boolean) {
      if (v) {
        this.setData({
          nickname: this.data.initialNickname || '',
          avatarUrl: this.data.initialAvatarUrl || '',
        });
      }
    },
  },
  methods: {
    /**
     * 微信 chooseAvatar 回调：拿到 tempFilePath
     * 用 wx.uploadFile 上传到后端 → 拿到公开 URL
     */
    async onChooseAvatar(e: WechatMiniprogram.CustomEvent<{ avatarUrl: string }>) {
      const tempFilePath = e.detail.avatarUrl;
      wx.showLoading({ title: '上传中...' });
      try {
        const url = await api.uploadFile(tempFilePath, 'avatar');
        this.setData({ avatarUrl: url });
      } catch (err) {
        wx.showToast({ title: (err as Error).message ?? '上传失败', icon: 'none' });
      } finally {
        wx.hideLoading();
      }
    },

    onNicknameInput(e: WechatMiniprogram.CustomEvent) {
      this.setData({ nickname: e.detail.value });
    },

    async onSave() {
      const { nickname, avatarUrl, saving } = this.data;
      if (saving) return;
      if (!nickname.trim()) {
        wx.showToast({ title: '请填写昵称', icon: 'none' });
        return;
      }
      if (!avatarUrl) {
        wx.showToast({ title: '请选择头像', icon: 'none' });
        return;
      }

      this.setData({ saving: true });
      try {
        const { user } = await api.call<{ user: User }>('user', 'updateProfile', {
          nickname: nickname.trim(),
          avatarFileID: avatarUrl,
        });

        // 同步 globalData + storage
        app.globalData.user = user;
        wx.setStorageSync('currentUser', user);

        wx.showToast({ title: '已保存', icon: 'success' });
        this.triggerEvent('success', { user });
        this.triggerEvent('close');
      } catch (err) {
        wx.showToast({ title: (err as Error).message ?? '保存失败', icon: 'none' });
      } finally {
        this.setData({ saving: false });
      }
    },

    onClose() {
      this.triggerEvent('close');
    },

    /** 阻止冒泡：点遮罩关，点内容不关 */
    onContentTap() {
      /* noop */
    },
  },
});
