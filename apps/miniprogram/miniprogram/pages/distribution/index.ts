// pages/distribution/index.ts — 分销中心（参考图 2762）
import { api } from '../../services/api';

interface Summary {
  inviteCode: string;
  level: string;
  monthCommission: string;
  monthSales: string;
  orderCount: number;
}

Page({
  data: {
    summary: null as Summary | null,
    levelInfo: null as Record<string, unknown> | null,
    activeTab: 'orders' as 'orders' | 'team' | 'logs',
    list: [] as Record<string, unknown>[],
    directCount: 0,
    indirectCount: 0,
    loading: false,
    page: 1,
    pageSize: 20,
  },

  onShow() {
    this.loadSummary();
    this.loadLevel();
    this.loadList();
  },

  async loadSummary() {
    try {
      const summary = await api.call<Summary>('distribution', 'mySummary', {});
      this.setData({ summary });
    } catch {
      /* ignore */
    }
  },

  async loadLevel() {
    try {
      const levelInfo = await api.call<Record<string, unknown>>('distribution', 'myLevel', {});
      this.setData({ levelInfo });
    } catch {
      /* ignore */
    }
  },

  async loadList() {
    this.setData({ loading: true });
    try {
      const action =
        this.data.activeTab === 'orders'
          ? 'myOrders'
          : this.data.activeTab === 'team'
            ? 'myTeam'
            : 'myCommissionLogs';
      const res = await api.call<Record<string, unknown>>('distribution', action, {
        page: this.data.page,
        pageSize: this.data.pageSize,
      });
      this.setData({
        list: (res.list as Record<string, unknown>[]) || [],
        directCount: (res.directCount as number) ?? this.data.directCount,
        indirectCount: (res.indirectCount as number) ?? this.data.indirectCount,
        loading: false,
      });
    } catch {
      this.setData({ loading: false });
    }
  },

  switchTab(e: WechatMiniprogram.TouchEvent) {
    const tab = e.currentTarget.dataset.tab as 'orders' | 'team' | 'logs';
    this.setData({ activeTab: tab, page: 1, list: [] });
    this.loadList();
  },

  copyCode() {
    const code = this.data.summary?.inviteCode;
    if (!code) return;
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: '邀请码已复制', icon: 'none' }),
    });
  },

  goInvite() {
    api
      .call<{ invitePath: string; shareTitle: string }>('distribution', 'inviteInfo', {})
      .then((info) => {
        wx.setClipboardData({ data: info.invitePath });
        wx.showToast({ title: '邀请链接已复制', icon: 'none' });
      });
  },

  goRule() {
    wx.showModal({
      title: '分销说明',
      content:
        '分享商品或邀请链接给好友，好友下单后即可获得佣金。\n直推佣金：V1=10% / V2=15% / V3=20%。\n佣金在订单支付完成后实时入账至钱包余额。',
      showCancel: false,
    });
  },
});
