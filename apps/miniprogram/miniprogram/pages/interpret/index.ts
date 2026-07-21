// pages/interpret — 资料解读（V0.2.33 阶段 2 前端）
// 上传佳明 FIT 文件 → base64 → POST /api/interpret action:garmin → minimax M3 解读展示
import { api } from '../../services/api';
import { ensureLogin } from '../../utils/auth';

Page({
  data: {
    loading: false,
    interpretation: '',
    error: '',
    fileName: '',
    // V0.2.57 截图解读
    imageUrl: '',
    shotLoading: false,
    shotResult: '',
    shotError: '',
    checkinCreated: false,
  },

  async onChooseFile() {
    try {
      await ensureLogin();
      const tempFile = await new Promise<{ path: string; name: string }>((resolve, reject) => {
        wx.chooseMessageFile({
          count: 1,
          type: 'file',
          extension: ['fit'],
          success: (res) => resolve(res.tempFiles[0]),
          fail: reject,
        });
      });

      // 读 FIT → base64
      const base64 = await new Promise<string>((resolve, reject) => {
        wx.getFileSystemManager().readFile({
          filePath: tempFile.path,
          encoding: 'base64',
          success: (r) => resolve(r.data as string),
          fail: reject,
        });
      });

      this.setData({ loading: true, fileName: tempFile.name, error: '', interpretation: '' });
      const res = await api.call<{ interpretation: string; recordId: string }>('interpret', 'garmin', {
        fileBase64: base64,
        inputKey: `interpret/${tempFile.name}`,
      });
      this.setData({ loading: false, interpretation: res.interpretation });
    } catch (e) {
      const msg = (e as Error).message || '解读失败';
      this.setData({ loading: false, error: msg });
    }
  },

  // V0.2.57 上传运动/健康截图 → GLM-4.6V 识图 → 入 checkin → 联动画像 → AI 综合分析
  async onChooseImage() {
    try {
      await ensureLogin();
      const choose = await new Promise<WechatMiniprogram.ChooseMediaSuccessCallbackResult>(
        (resolve, reject) => {
          wx.chooseMedia({
            count: 1,
            mediaType: ['image'],
            sizeType: ['compressed'],
            sourceType: ['album', 'camera'],
            success: resolve,
            fail: reject,
          });
        },
      );
      const tempPath = choose.tempFiles[0].tempFilePath;
      this.setData({ shotLoading: true, shotError: '', shotResult: '', imageUrl: tempPath, checkinCreated: false });
      // 先上传 COS 拿公网 URL（GLM-4.6V 需可访问）
      const imageUrl = await api.uploadFile(tempPath, 'image');
      const res = await api.call<{ interpretation: string; recordId: string; checkinCreated: boolean }>(
        'interpret',
        'screenshot',
        { imageUrl, inputKey: `interpret/shot/${Date.now()}.jpg` },
      );
      this.setData({
        shotLoading: false,
        shotResult: res.interpretation,
        checkinCreated: res.checkinCreated,
        imageUrl,
      });
    } catch (e) {
      const msg = (e as Error).message || '解读失败';
      this.setData({ shotLoading: false, shotError: msg });
    }
  },

  // 移除截图，重选
  onRemoveImage() {
    this.setData({ imageUrl: '', shotResult: '', shotError: '', checkinCreated: false });
  },

  onShareAppMessage() {
    return { title: '沐禾健康·AI 资料解读', path: '/pages/interpret/index' };
  },
});
