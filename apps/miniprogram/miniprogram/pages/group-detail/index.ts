// pages/group-detail/index.ts — 跑群详情（V0.1.42 加群卡+公告+汇总+成员列表）
import { api } from '../../services/api';

type Period = 'week' | 'month' | 'year' | 'all';

interface RankMember {
  userId: string; nickname: string; avatarUrl: string | null;
  distance: number; count: number; points: number; rank: number;
}

interface GroupMemberRow {
  userId: string; nickname: string; avatarUrl: string | null;
  role: string; joinedAt: string; monthDistance: number;
}

interface GroupDetail {
  id: string;
  name: string;
  owner: { id: string; nickname: string | null; avatarUrl: string | null };
  memberCount: number;
  announce: string | null;
  myRole: string;
  summary: { totalDistance: number; totalCheckins: number; activeDays: number };
}

Page({
  data: {
    groupId: '' as string,
    period: 'week' as Period,
    periodIndex: 0,
    detail: null as GroupDetail | null, // V0.1.42 群卡+公告+汇总
    memberList: [] as GroupMemberRow[], // V0.1.42 成员列表（含 role + 本月跑量）
    members: [] as RankMember[], // period 榜单（现有）
    totals: { memberCount: 0, totalDistance: 0 },
    loading: true,
    error: false,
    errorMsg: '',
  },

  onLoad(query) {
    const groupId = (query?.id as string) ?? '';
    this.setData({ groupId });
    this.loadDetail();
    this.loadMembers();
    this.loadRanking();
  },

  onPeriodChange(e: WechatMiniprogram.CustomEvent) {
    const idx = Number(e.detail.value);
    const period = (['week', 'month', 'year'] as const)[idx];
    this.setData({ periodIndex: idx, period });
    this.loadRanking();
  },

  /** V0.1.42 群详情（群卡 + 公告 + 汇总） */
  async loadDetail() {
    if (!this.data.groupId) return;
    try {
      const detail = await api.call<GroupDetail>('sport', 'groupDetail', { groupId: this.data.groupId });
      this.setData({ detail });
    } catch {
      // 静默（榜单会报错）
    }
  },

  /** V0.1.42 成员列表（含 role + 本月跑量） */
  async loadMembers() {
    if (!this.data.groupId) return;
    try {
      const res = await api.call<{ members: GroupMemberRow[] }>('sport', 'groupMembers', { groupId: this.data.groupId });
      this.setData({ memberList: res.members.map((m) => ({ ...m, joinedAt: m.joinedAt.slice(0, 10) })) });
    } catch {
      // 静默
    }
  },

  async loadRanking() {
    if (!this.data.groupId) return;
    this.setData({ loading: true, error: false, errorMsg: '' });
    try {
      const result = await api.call<{
        members: RankMember[];
        totals: { memberCount: number; totalDistance: number };
      }>('sport', 'groupRanking', { groupId: this.data.groupId, period: this.data.period });
      const ranked = result.members.map((m, i) => ({ ...m, rank: i + 1 }));
      this.setData({ members: ranked, totals: result.totals, loading: false });
    } catch (e) {
      this.setData({
        loading: false,
        error: true,
        errorMsg: (e as Error).message ?? '加载榜单失败',
      });
    }
  },

  /** V0.1.42 owner 编辑公告 */
  onEditAnnounce() {
    const detail = this.data.detail;
    if (!detail || detail.myRole !== 'owner') return;
    wx.showModal({
      title: '编辑群公告',
      editable: true,
      placeholderText: '输入群公告（最多 500 字）',
      content: detail.announce ?? '',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.call('sport', 'announceGroup', { groupId: this.data.groupId, announce: res.content ?? '' });
          wx.showToast({ title: '已更新', icon: 'success' });
          this.loadDetail();
        } catch (err) {
          wx.showToast({ title: (err as Error).message ?? '更新失败', icon: 'none' });
        }
      },
    });
  },

  onTapQuit() {
    wx.showModal({
      title: '退出群',
      content: '确定要退出该群吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.call('sport', 'quitGroup', { groupId: this.data.groupId });
          wx.showToast({ title: '已退出', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 800);
        } catch (err) {
          wx.showToast({ title: (err as Error).message ?? '退出失败', icon: 'none' });
        }
      },
    });
  },

  goWeeklyReport() {
    wx.navigateTo({ url: '/pages/weekly-report/index' });
  },
});
