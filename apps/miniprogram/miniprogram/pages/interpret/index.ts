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

  onShareAppMessage() {
    return { title: '青沐·AI 资料解读', path: '/pages/interpret/index' };
  },
});
