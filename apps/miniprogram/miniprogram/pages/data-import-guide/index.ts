// pages/data-import-guide/index.ts — 数据导入图文引导（V0.1.43，按品牌，国内源）
import { DEVICE_BRANDS, IMPORT_GUIDE, DEVICE_CATEGORY_LABEL } from '@qm-wx/shared';

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
    const url = this.data.guide?.action.url;
    if (url) {
      wx.navigateTo({ url });
    } else {
      wx.showToast({ title: '功能开发中，敬请期待', icon: 'none' });
    }
  },
});
