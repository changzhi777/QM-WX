// pages/device-auth/index.ts — V0.3.20 设备授权中心详情页
// 单品牌全屏：状态徽标 + 同步信息 + 最近 5 条活动 + web-view 跳转授权
import { api } from '../../services/api';

interface RecentActivity {
  vendor: string;
  vendorActivityId: string;
  type: string | null;
  startTime: string;
  distanceKm: number | null;
  durationSec: number | null;
  avgHr: number | null;
  status: string | null;
}

interface BrandConfig {
  key: 'garmin' | 'huawei' | 'coros';
  name: string;
  icon: string;
  color: string;
  vendorOAuthKey: string;
  description: string;
}

const BRAND_CONFIG: Record<string, BrandConfig> = {
  garmin: {
    key: 'garmin',
    name: '佳明 Garmin',
    icon: '⌚',
    color: '#007cc0',
    vendorOAuthKey: 'garmin_oauth',
    description: '佳明 Health API 直连（OAuth 1.0a，免费）+ Terra 委托（D 路线）',
  },
  huawei: {
    key: 'huawei',
    name: '华为 Huawei Health',
    icon: '⌚',
    color: '#c7000b',
    vendorOAuthKey: 'huawei_oauth',
    description: '华为运动健康 Cloud API（OAuth 2.0，需企业资质）',
  },
  coros: {
    key: 'coros',
    name: 'COROS 高驰',
    icon: '⌚',
    color: '#7c3aed',
    vendorOAuthKey: 'coros',
    description: 'Terra 第三方聚合（OAuth 2.0 委托，签约后激活）',
  },
};

Page({
  data: {
    brand: null as BrandConfig | null,
    bound: false,
    configured: false,
    lastSyncAt: null as string | null,
    activities: [] as RecentActivity[],
    authUrl: '',
    showWebView: false,
  },

  onLoad(query: { brand?: string }) {
    const brandKey = (query.brand ?? 'garmin') as BrandConfig['key'];
    const brand = BRAND_CONFIG[brandKey] ?? BRAND_CONFIG.garmin;
    this.setData({ brand });
    wx.setNavigationBarTitle({ title: `${brand.name} 授权` });
  },

  onShow() {
    this.loadAuthStatus();
    this.loadActivities();
  },

  async loadAuthStatus() {
    try {
      const r = await api.call<{
        bindings: Array<{ vendor: string; lastSyncAt: string | null }>;
        garminAuthorized: boolean;
        corosAuthorized: boolean;
        xiaomiAuthorized: boolean;
        weRunAuthorized: boolean;
      }>('device', 'authList', {});
      const brand = this.data.brand as BrandConfig;
      if (!brand) return;
      const b = r.bindings.find((x) => x.vendor === brand.vendorOAuthKey);
      this.setData({
        bound: !!b,
        lastSyncAt: b?.lastSyncAt ?? null,
        configured: true, // 简化：默认 true，未配置 backend 返 configured:false 时前端需校验
      });
    } catch (e) {
      this.setData({ configured: false });
    }
  },

  async loadActivities() {
    const brand = this.data.brand as BrandConfig;
    if (!brand) return;
    try {
      const r = await api.call<{ activities: RecentActivity[] }>(
        'device',
        'recentActivityByVendor',
        { vendor: brand.vendorOAuthKey, limit: 5 },
      );
      this.setData({ activities: r.activities });
    } catch (e) {
      this.setData({ activities: [] });
    }
  },

  async onTapAuthorize() {
    const brand = this.data.brand as BrandConfig;
    if (!brand) return;
    try {
      // 调对应 vendor 的 authUrl action
      const actionName = brand.key === 'garmin' ? 'garminHealthAuthUrl'
        : brand.key === 'huawei' ? 'huaweiHealthAuthUrl'
        : 'corosAuthUrl';
      const r = await api.call<{ url: string; configured: boolean }>('device', actionName, {});
      if (!r?.configured) {
        wx.showToast({ title: '该品牌凭据未配置', icon: 'none' });
        return;
      }
      this.setData({ authUrl: r.url, showWebView: true });
    } catch (e) {
      wx.showToast({ title: '获取授权 URL 失败', icon: 'none' });
    }
  },

  onCloseWebView() {
    this.setData({ showWebView: false, authUrl: '' });
    // 关闭后重新加载状态（可能已完成授权）
    this.loadAuthStatus();
  },
});