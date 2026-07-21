// pages/interpret — 资料解读（V0.2.33 阶段 2 前端）
// 上传佳明 FIT 文件 → base64 → POST /api/interpret action:garmin → minimax M3 解读展示
import { api } from '../../services/api';
import { ensureLogin } from '../../utils/auth';

// V0.2.60 截图识别数据（screenshot action 返 extract，供前端展示 + 用户确认）
interface InterpretExtract {
  type: string;
  date: string | null;
  distanceKm: number | null;
  durationSec: number | null;
  heartRate: number | null;
  paceSecPerKm: number | null;
  calorie: number | null;
  metrics: Array<{ name: string; value: string }>;
  summary: string;
}

Page({
  data: {
    loading: false,
    interpretation: '',
    error: '',
    fileName: '',
    // V0.2.57 截图解读 / V0.2.60 用户确认 checkin
    imageUrl: '',
    shotLoading: false,
    shotResult: '',
    shotError: '',
    recordId: '',
    extract: null as InterpretExtract | null,
    canCheckin: false,
    confirming: false,
    checkinMsg: '',
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

  // V0.2.60 上传截图 → 识图+分析（不 auto checkin）→ 展示识别数据 + 确认按钮
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
      this.setData({ shotLoading: true, shotError: '', shotResult: '', imageUrl: tempPath, recordId: '', extract: null, canCheckin: false, checkinMsg: '' });
      // 上传 COS 拿公网 URL（GLM-4.6V 需可访问）
      const imageUrl = await api.uploadFile(tempPath, 'image');
      const res = await api.call<{ interpretation: string; recordId: string; extract: InterpretExtract }>(
        'interpret',
        'screenshot',
        { imageUrl, inputKey: `interpret/shot/${Date.now()}.jpg` },
      );
      const extract = res.extract || null;
      const canCheckin = !!extract && extract.type !== 'other' && Number(extract.distanceKm) > 0;
      this.setData({ shotLoading: false, shotResult: res.interpretation, imageUrl, recordId: res.recordId, extract, canCheckin });
    } catch (e) {
      const msg = (e as Error).message || '解读失败';
      this.setData({ shotLoading: false, shotError: msg });
    }
  },

  // V0.2.60 P1.2 用户确认才打卡（防误识别污染跑量；后端去重 + record.extract 防篡改）
  async onConfirmCheckin() {
    if (!this.data.recordId || this.data.confirming) return;
    this.setData({ confirming: true, checkinMsg: '' });
    try {
      const res = await api.call<{ checkinCreated: boolean; reason?: string }>(
        'interpret',
        'screenshotCheckin',
        { recordId: this.data.recordId },
      );
      const msg = res.checkinCreated ? '✅ 已加入运动记录' : `未打卡：${res.reason || '已存在相同记录'}`;
      this.setData({ confirming: false, checkinMsg: msg, canCheckin: res.checkinCreated ? false : this.data.canCheckin });
    } catch (e) {
      this.setData({ confirming: false, checkinMsg: `打卡失败：${(e as Error).message}` });
    }
  },

  // 移除截图，重选
  onRemoveImage() {
    this.setData({ imageUrl: '', shotResult: '', shotError: '', recordId: '', extract: null, canCheckin: false, confirming: false, checkinMsg: '' });
  },

  onShareAppMessage() {
    return { title: '沐禾健康·AI 资料解读', path: '/pages/interpret/index' };
  },
});
