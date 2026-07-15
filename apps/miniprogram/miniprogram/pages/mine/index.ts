// pages/mine/index.ts（V0.1.35 精简 + V0.1.152 卡片化 + V0.2.4 健康中心改版：数据概览条 + 3 组宫格）
import { api } from '../../services/api';
import { ensureLogin } from '../../utils/auth';
import type { User, FeatureFlagsConfig } from '@qm-wx/shared';

const app = getApp();

// === 消息弹层（V0.1.143 合并 notification）===
interface NotifItem {
  id: string;
  type: string;
  targetType: string | null;
  targetId: string | null;
  content: string | null;
  isRead: boolean;
  createdAt: string;
  actor: { id: string; nickname: string | null; avatarUrl: string | null };
  text: string;
  timeText: string;
}

const NOTIF_TYPE_TEXT: Record<string, string> = {
  like: '赞了你的动态',
  comment: '评论了你的动态',
  follow: '关注了你',
  system: '系统消息',
};

function formatNotifTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}小时前`;
  if (diff < 7 * 86400_000) return `${Math.floor(diff / 86400_000)}天前`;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function decorateNotif(n: Omit<NotifItem, 'text' | 'timeText'>): NotifItem {
  return { ...n, text: NOTIF_TYPE_TEXT[n.type] ?? '收到一条通知', timeText: formatNotifTime(n.createdAt) };
}

const MEMBER_LEVEL_LABEL: Record<string, string> = {
  free: '免费用户',
  monthly: '月度会员',
  quarterly: '季度会员',
  yearly: '年度会员',
};

Page({
  data: {
    user: null as User | null,
    memberLabel: '免费用户',
    isMember: false,
    flags: {
      wallet: false,
      payment: false,
      membershipPurchase: false,
      smartAgent: false,
      bindApp: false,
    } as FeatureFlagsConfig,
    isLogin: false,
    error: false,
    errorMsg: '',
    // V0.2.4 数据概览条（步数/心率/睡眠/健康分，复用 stats.healthScore）
    todayHealth: {
      steps: 0,
      restingHr: null as number | null,
      sleepHours: null as number | null,
      healthScore: 0,
    },
    // 消息未读数（V0.1.31 红点）
    notifUnread: 0,
    // V0.1.143 消息弹层（合并 notification）
    showNotif: false,
    notifList: [] as NotifItem[],
    notifLoading: false,
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    this.setData({ error: false, errorMsg: '' });
    try {
      // 1. 快速：先用缓存 user
      const cached = (app.globalData.user ?? wx.getStorageSync('currentUser')) as User | null;
      if (cached) this.applyUser(cached);

      // 2. 确保登录
      await ensureLogin();
      this.applyUser(app.globalData.user!);

      // 头部数据（今日健康 + 未读）
      this.loadTodayHealth();
      this.loadNotifUnread();

      this.setData({
        flags: (app.globalData.config?.featureFlags ?? this.data.flags) as FeatureFlagsConfig,
        isLogin: !!app.globalData.user,
      });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg) this.setData({ error: true, errorMsg: msg });
    }
  },

  applyUser(user: User) {
    this.setData({
      user,
      memberLabel: MEMBER_LEVEL_LABEL[user.memberLevel] ?? '免费用户',
      isMember: !!user.memberLevel && user.memberLevel !== 'free',
    });
  },

  /** V0.2.4 数据概览条（步数/心率/睡眠/健康分，复用 stats.healthScore）*/
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
      // 今日健康加载失败不阻塞主页
    }
  },

  /** 消息未读数（V0.1.31 红点） */
  async loadNotifUnread() {
    try {
      const res = await api.call<{ count: number }>('notification', 'unreadCount', {});
      this.setData({ notifUnread: res.count ?? 0 });
    } catch {
      // 未读数加载失败不阻塞主页
    }
  },

  // ===== 入口 =====
  goSportTab() { wx.switchTab({ url: '/pages/sport/index' }); },
  goProfile() { wx.navigateTo({ url: '/pages/profile/index' }); },
  goMembership() {
    wx.navigateTo({
      url: '/pages/membership/index',
      fail: () => {
        wx.showModal({
          title: '会员功能',
          content: '会员服务正在开发中，敬请期待！',
          showCancel: false,
          confirmText: '知道了',
        });
      },
    });
  },

  /** V0.1.143 消息弹层（合并 notification，不跳页）*/
  async onShowNotif() {
    this.setData({ showNotif: true, notifList: [], notifLoading: true });
    try {
      const res = await api.call<{ list: Omit<NotifItem, 'text' | 'timeText'>[]; total: number }>(
        'notification', 'list', { page: 1, pageSize: 20 },
      );
      this.setData({ notifList: res.list.map(decorateNotif), notifLoading: false });
    } catch {
      this.setData({ notifLoading: false });
    }
  },

  onCloseNotif() {
    this.setData({ showNotif: false });
  },

  async onMarkAllNotif() {
    try {
      await api.call('notification', 'markAllRead', {});
      this.setData({
        notifList: this.data.notifList.map((n) => ({ ...n, isRead: true })),
        notifUnread: 0,
      });
      wx.showToast({ title: '已全部标记', icon: 'success' });
    } catch {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  async onTapNotif(e: WechatMiniprogram.TouchEvent) {
    const item = e.currentTarget.dataset.item as NotifItem;
    if (!item.isRead) {
      this.setData({ notifList: this.data.notifList.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)) });
      try { await api.call('notification', 'markRead', { notificationId: item.id }); } catch { /* 忽略 */ }
      this.loadNotifUnread();
    }
    if (item.targetType === 'feed' && item.targetId) {
      this.setData({ showNotif: false });
      wx.navigateTo({ url: '/pages/feed/index' });
    }
  },

  goDeviceBind() { wx.navigateTo({ url: '/pages/device/index' }); },
  goRunner() { wx.navigateTo({ url: '/pages/runner/index' }); },
  goInsight() { wx.navigateTo({ url: '/pages/insight/index' }); },
  goDiet() { wx.navigateTo({ url: '/pages/diet/index' }); },
  goShoes() { wx.navigateTo({ url: '/pages/shoes/index' }); },
  goHealth() { wx.navigateTo({ url: '/pages/health/index' }); },
  goTraining() { wx.navigateTo({ url: '/pages/training/index' }); },
  goContent() { wx.navigateTo({ url: '/pages/content-list/index' }); },
  goRanking() { wx.navigateTo({ url: '/pages/ranking/index' }); },
  goFeed() { wx.navigateTo({ url: '/pages/feed/index' }); },

  /** 健康助手（原 AI 私教，V0.2.4 改名）*/
  goAiCoach() { wx.switchTab({ url: '/pages/ai-coach/index' }); },

  goAgreement() { wx.navigateTo({ url: '/pages/agreement/index' }); },

  onTapLogin() {
    ensureLogin().then(() => this.refresh());
  },

  /** V0.1.44 重新激活授权（重置 onboardingDone → 跳向导重新填资料/授权微信运动）*/
  onTapReactivate() {
    wx.showModal({
      title: '重新激活',
      content: '将重新填写个人资料并完成授权（头像/微信运动等），是否继续？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.call('user', 'resetOnboarding', {});
          const u = app.globalData.user as ({ onboardingDone?: boolean } | null);
          if (u) u.onboardingDone = false;
          wx.navigateTo({ url: '/pages/onboarding/index' });
        } catch {
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      },
    });
  },
});
