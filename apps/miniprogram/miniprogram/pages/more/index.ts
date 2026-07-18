// pages/more — 更多功能（待定页，V0.2.32 mine 原型重构）
// 收纳原型"我的"页没有的功能：运动/数据/服务宫格 + 健康数据条
// goXxx 跳转方法复用 mine 逻辑
import { api } from '../../services/api';
import { ensureLogin } from '../../utils/auth';

Page({
  data: {
    todayHealth: {
      steps: 0,
      restingHr: null as number | null,
      sleepHours: null as number | null,
      healthScore: 0,
    },
  },

  async onLoad() {
    try {
      await ensureLogin();
      this.loadTodayHealth();
    } catch {
      // 登录失败不阻塞（纯入口页）
    }
  },

  /** 健康数据条（复用 stats.healthScore）*/
  async loadTodayHealth() {
    try {
      const res = await api.call<{ score: number; steps: number; restingHr: number | null; sleepHours: number | null }>('stats', 'healthScore', {});
      this.setData({
        todayHealth: {
          steps: res.steps ?? 0,
          restingHr: res.restingHr ?? null,
          sleepHours: res.sleepHours ?? null,
          healthScore: res.score ?? 0,
        },
      });
    } catch {
      // 失败不阻塞
    }
  },

  // ===== 跳转入口（复用 mine 逻辑）=====
  goSportTab() { wx.switchTab({ url: '/pages/sport/index' }); },
  goShoes() { wx.navigateTo({ url: '/pages/shoes/index' }); },
  goTraining() { wx.navigateTo({ url: '/pages/training/index' }); },
  goRanking() { wx.navigateTo({ url: '/pages/ranking/index' }); },
  goDeviceBind() { wx.navigateTo({ url: '/pages/device/index' }); },
  goHealth() { wx.navigateTo({ url: '/pages/health/index' }); },
  goInsight() { wx.navigateTo({ url: '/pages/insight/index' }); },
  goDiet() { wx.navigateTo({ url: '/pages/diet/index' }); },
  goFeed() { wx.navigateTo({ url: '/pages/feed/index' }); },
  goContent() { wx.navigateTo({ url: '/pages/content-list/index' }); },
});
