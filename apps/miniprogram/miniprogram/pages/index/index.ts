// pages/index/index.ts
import { api } from '../../services/api';
import { ensureLogin } from '../../utils/auth';

Page({
  data: {
    loading: true,
    error: false,
    errorMsg: '',
    userStats: {
      totalDistance: 0,
      totalCheckins: 0,
      totalPoints: 0,
      avgPace: null as number | null,
    },
    user: null as null | { nickname: string; avatarUrl: string | null; points: number },
    isLogin: false,
    // V0.1.43 今日健康（BLE 心率/血氧 + 微信运动步数，device.myTodayHealth）
    todayHealth: {
      hr: null as { value: number; timestamp: string } | null,
      spo2: null as { value: number; timestamp: string } | null,
      steps: null as { value: number; date: string } | null,
    },
    showPrivacy: false,
    // V0.1.35 快捷入口（高频 page，entry-grid 渲染；V0.1.36 +红心广场）
    quickEntries: [
      { icon: '🔔', label: '消息', url: '/pages/notification/index' },
      { icon: '🔥', label: '红心广场', url: '/pages/hot/index' },
      { icon: '📰', label: '动态', url: '/pages/feed/index' },
      { icon: '⭐', label: '收藏', url: '/pages/favorite/index' },
      { icon: '🏠', label: '家庭', url: '/pages/family/index' },
      { icon: '🏅', label: '榜单', url: '/pages/ranking/index' },
      { icon: '👤', label: '资料', url: '/pages/profile/index' },
    ],
  },

  onShow() {
    // 1. 检查隐私协议
    if (getApp().globalData.needPrivacyAgree) {
      this.setData({ showPrivacy: true });
    } else {
      this.loadData();
    }
  },

  onPrivacyAgree() {
    getApp().globalData.needPrivacyAgree = false;
    this.setData({ showPrivacy: false });
    this.loadData();
  },

  onPullDownRefresh() {
    this.loadData().finally(() => wx.stopPullDownRefresh());
  },

  async loadData() {
    this.setData({ loading: true, error: false, errorMsg: '' });
    try {
      // 1. 确保登录（不强制，失败不报错）
      let isLogin = false;
      try {
        await ensureLogin();
        const app = getApp();
        const u = app.globalData.user as null | { nickname: string; avatarUrl: string | null; points: number };
        this.setData({ user: u, isLogin: !!u });
        isLogin = !!u;
      } catch {
        this.setData({ user: null, isLogin: false });
      }

      // 2. 本周统计：未登录时静默返空数据（避免 401 触发"加载失败"）
      //    真后端错误（5xx）才上抛到外层 catch
      let stats: { totalDistance: number; count: number; avgPace: number | null } = {
        totalDistance: 0,
        count: 0,
        avgPace: null,
      };
      if (isLogin) {
        stats = await api.call<typeof stats>('sport', 'myStats', { period: 'week' });
      }

      // V0.1.43 今日健康（BLE 心率/血氧 + 微信运动步数；失败静默，不阻塞首页）
      let todayHealth = { hr: null, spo2: null, steps: null };
      if (isLogin) {
        try {
          todayHealth = await api.call('device', 'myTodayHealth', {});
        } catch {
          // 静默（无设备数据，首页不报错）
        }
      }

      this.setData({
        todayHealth,
        userStats: {
          totalDistance: stats.totalDistance,
          totalCheckins: stats.count,
          totalPoints: ((this.data.user as { points?: number } | null)?.points ?? 0) as number,
          avgPace: stats.avgPace,
        },
        loading: false,
      });
    } catch (e) {
      this.setData({
        loading: false,
        error: true,
        errorMsg: (e as Error).message ?? '加载首页数据失败',
      });
    }
  },

  goSport() {
    wx.switchTab({ url: '/pages/sport/index' });
  },

  goMine() {
    wx.switchTab({ url: '/pages/mine/index' });
  },

  goMall() {
    wx.switchTab({ url: '/pages/mall/index' });
  },

  goProfile() {
    wx.navigateTo({ url: '/pages/profile/index' });
  },
});
