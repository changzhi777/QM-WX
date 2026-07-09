// pages/data-import-guide/index.ts — 数据导入图文引导（V0.1.43，按品牌，国内源）
import { DEVICE_BRANDS, IMPORT_GUIDE, DEVICE_CATEGORY_LABEL } from '@qm-wx/shared';
import { ENV } from '../../config/env';

/** 品牌 emoji 图标（key 映射）*/
const BRAND_ICON: Record<string, string> = {
  garmin: '⌚',
  xiaomi: '⌚',
  coros: '⌚',
  huawei: '⌚',
  suunto: '⌚',
  honor: '⌚',
  ble: '💓',
  werun: '💬',
  zepp: '📱',
};

Page({
  data: {
    brands: DEVICE_BRANDS.map((b) => ({
      key: b.key,
      name: b.name,
      icon: BRAND_ICON[b.key] ?? '📱',
      available: b.available,
      categoryLabel: DEVICE_CATEGORY_LABEL[b.category],
    })),
    selectedKey: '',
    guide: null as null | {
      sourceLabel: string;
      sourceUrl?: string;
      steps: { text: string; shot?: string }[];
      action: { label: string; url?: string; available: boolean };
    },
    // V0.1.43 小米上传结果（文件树，确认格式用，阶段 2 改入库）
    xiaomiFiles: [] as { name: string; size: number; isDirectory: boolean; preview?: string }[],
    xiaomiCount: 0,
  },

  onTapBrand(e: WechatMiniprogram.TouchEvent) {
    const key = e.currentTarget.dataset.key as string;
    const g = IMPORT_GUIDE[key];
    this.setData({
      selectedKey: key,
      guide: g
        ? {
            sourceLabel: g.sourceLabel,
            sourceUrl: g.sourceUrl,
            steps: g.steps,
            action: g.action,
          }
        : null,
    });
  },

  onCopyUrl() {
    const url = this.data.guide?.sourceUrl;
    if (!url) return;
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '链接已复制，去浏览器打开', icon: 'none' }),
    });
  },

  onAction() {
    // V0.1.43 小米：走上传（wx.chooseMessageFile 选 ZIP），其他按 url navigateTo
    if (this.data.selectedKey === 'xiaomi') {
      this.onXiaomiUpload();
      return;
    }
    const url = this.data.guide?.action.url;
    if (url) {
      wx.navigateTo({ url });
    } else {
      wx.showToast({ title: '功能开发中，敬请期待', icon: 'none' });
    }
  },

  /** V0.1.43 上传小米数据包 ZIP（阶段 1：返回文件树确认格式，阶段 2 改入库）*/
  onXiaomiUpload() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['zip'],
      success: (res) => {
        const file = res.tempFiles[0];
        const token = wx.getStorageSync('accessToken');
        wx.showLoading({ title: '上传解析中...' });
        wx.uploadFile({
          url: `${ENV.apiBase}/api/device/uploadXiaomiZip`,
          filePath: file.path,
          name: 'file',
          header: token ? { authorization: `Bearer ${token}` } : {},
          success: (r) => {
            wx.hideLoading();
            try {
              const data = JSON.parse(r.data);
              if (data.code === 0) {
                const d = data.data;
                // 阶段 2：返回入库数 { hr, spo2, sleep, steps }
                this.setData({ xiaomiFiles: [], xiaomiCount: 0 });
                wx.showModal({
                  title: '✅ 导入成功',
                  content: `心率 ${d.hr} 条\n血氧 ${d.spo2} 条\n睡眠 ${d.sleep} 天\n步数 ${d.steps} 天`,
                  confirmText: '看历史',
                  cancelText: '关闭',
                  success: (m) => m.confirm && wx.navigateTo({ url: '/pages/health-history/index' }),
                });
              } else {
                wx.showToast({ title: data.msg || '上传失败', icon: 'none' });
              }
            } catch {
              wx.showToast({ title: '解析失败', icon: 'none' });
            }
          },
          fail: () => {
            wx.hideLoading();
            wx.showToast({ title: '上传失败', icon: 'none' });
          },
        });
      },
    });
  },
});
