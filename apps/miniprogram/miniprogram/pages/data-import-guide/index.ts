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
    // V0.1.43 小米：走上传（wx.chooseMessageFile 选 ZIP）
    if (this.data.selectedKey === 'xiaomi') {
      this.onXiaomiUpload();
      return;
    }
    // V0.1.129 COROS：上传 FIT 文件
    if (this.data.selectedKey === 'coros') {
      this.onCorosFitUpload();
      return;
    }
    const url = this.data.guide?.action.url;
    if (url) {
      wx.navigateTo({ url });
    } else {
      wx.showToast({ title: '功能开发中，敬请期待', icon: 'none' });
    }
  },

  /** V0.1.43 上传小米数据包 ZIP（选文件 → 弹密码 → 上传入库）*/
  onXiaomiUpload() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['zip'],
      success: (res) => {
        const file = res.tempFiles[0];
        // 小米 ZIP 加密，弹密码输入（用户导出时设的，输入框可长按粘贴）
        wx.showModal({
          title: '请输入 ZIP 解压密码',
          content: '小米隐私中心导出 ZIP 时设置的解压密码（输入框可长按粘贴）',
          editable: true,
          placeholderText: '解压密码',
          success: (m) => {
            if (!m.confirm) return;
            if (!m.content) {
              wx.showToast({ title: '请输入密码', icon: 'none' });
              return;
            }
            this.doUpload(file, m.content);
          },
        });
      },
    });
  },

  /** V0.1.129 上传 COROS FIT 文件（选文件 → 上传解析 → RawActivity 入库）*/
  onCorosFitUpload() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['fit'],
      success: (res) => {
        const file = res.tempFiles[0];
        const token = wx.getStorageSync('accessToken');
        const base = (wx as unknown as { $apiBase?: string }).$apiBase || ENV.apiBase;
        wx.showLoading({ title: '解析 FIT 中...' });
        wx.uploadFile({
          url: `${base}/api/device/uploadCorosFit`,
          filePath: file.path,
          name: 'file',
          header: token ? { authorization: `Bearer ${token}` } : {},
          success: (r) => {
            wx.hideLoading();
            try {
              const data = JSON.parse(r.data);
              if (data.code === 0) {
                const d = data.data;
                wx.showModal({
                  title: '✅ 导入成功',
                  content: `${d.type} · ${(d.distanceMeters / 1000).toFixed(2)}km · ${Math.round((d.durationSec || 0) / 60)}min\n后续可在「佳明数据处理」页导入打卡榜`,
                  showCancel: false,
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

  /** V0.1.43 实际上传（formData 带密码）*/
  doUpload(file: { path: string }, password: string) {
    const token = wx.getStorageSync('accessToken');
    const base = (wx as unknown as { $apiBase?: string }).$apiBase || ENV.apiBase;
    wx.showLoading({ title: '上传解析中...' });
    wx.uploadFile({
      url: `${base}/api/device/uploadXiaomiZip`,
      filePath: file.path,
      name: 'file',
      header: token ? { authorization: `Bearer ${token}` } : {},
      formData: { password },
      success: (r) => {
        wx.hideLoading();
        try {
          const data = JSON.parse(r.data);
          if (data.code === 0) {
            const d = data.data;
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
