/**
 * components/auth-center-section — V0.3.20 设备授权中心 section
 *
 * 3 品牌 OAuth 卡片（佳明 A+D / 华为 / COROS）+ 状态徽标 + 授权按钮 + 解绑按钮 + 详情入口
 * 父组件 pages/device/index 传 brands 数组 + onTapAuth/onTapUnbind/onTapDetail 回调
 */
import { api } from '../../services/api';

interface AuthBrand {
  key: 'garmin' | 'huawei' | 'coros';
  name: string;
  icon: string;
  color: string;
  configured: boolean; // 后端凭据是否配齐
  bound: boolean;      // 是否已绑定（DeviceBinding 存在）
  lastSyncAt: string | null;
  recentCount: number; // 最近 5 条活动
  vendorOAuthKey: 'garmin' | 'garmin_oauth' | 'huawei_oauth' | 'coros';
}

Component({
  properties: {
    brands: {
      type: Array,
      value: [] as AuthBrand[],
    },
  },

  methods: {
    /** 触发授权：调对应 vendor 的 authUrl → 返回 URL → 前端处理（web-view 跳转/复制）*/
    async onTapAuth(e: { currentTarget: { dataset: { brandKey: string } } }) {
      const brandKey = e.currentTarget.dataset.brandKey as AuthBrand['key'];
      try {
        const r = await api.call<{ url: string; configured: boolean }>('device', 'garminHealthAuthUrl', {});
        if (!r?.configured) {
          wx.showToast({ title: '该品牌凭据未配置', icon: 'none' });
          return;
        }
        // 通知父组件「需要 web-view 跳转授权」
        this.triggerEvent('tapauth', { brandKey, url: r.url });
      } catch (err) {
        wx.showToast({ title: '获取授权 URL 失败', icon: 'none' });
      }
    },

    /** 触发解绑：调对应 vendor 的 unbind */
    async onTapUnbind(e: { currentTarget: { dataset: { vendor: string } } }) {
      const vendor = e.currentTarget.dataset.vendor;
      wx.showModal({
        title: '解绑确认',
        content: `解绑后需重新授权才能同步${vendor}数据`,
        success: async (res) => {
          if (!res.confirm) return;
          try {
            await api.call('device', 'unbind', { vendor, deviceName: vendor });
            wx.showToast({ title: '已解绑', icon: 'success' });
            this.triggerEvent('refresh');
          } catch (err) {
            wx.showToast({ title: '解绑失败', icon: 'none' });
          }
        },
      });
    },

    /** 触发详情：跳 pages/device-auth/index 带 vendor 参数 */
    onTapDetail(e: { currentTarget: { dataset: { brandKey: string } } }) {
      const brandKey = e.currentTarget.dataset.brandKey as AuthBrand['key'];
      wx.navigateTo({ url: `/pages/device-auth/index?brand=${brandKey}` });
    },
  },
});