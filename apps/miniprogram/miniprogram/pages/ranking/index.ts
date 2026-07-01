// pages/ranking/index.ts — 我的榜单（参考图 2772）
import { api } from '../../services/api';

interface RankRow {
  rank: number;
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  distance: number;
  checkins: number;
  distanceDisplay: string;
  rankIcon: string;
}

const MEDALS = ['🥇', '🥈', '🥉'];

Page({
  data: {
    groups: [] as Array<{ id: string; name: string }>,
    currentGroupIndex: 0,
    sportType: 'all' as 'run' | 'hike' | 'all',
    period: 'week' as 'week' | 'month' | 'year' | 'all',
    list: [] as RankRow[],
    myRank: null as number | null,
    loading: false,
  },

  onShow() {
    if (this.data.groups.length === 0) this.loadGroups();
    else this.loadRanking();
  },

  /** 拉取我加入的跑群（sport.myGroups） */
  async loadGroups() {
    try {
      const res = await api.call<{ groups: Array<{ id: string; name: string }> }>(
        'sport',
        'myGroups',
        {},
      );
      this.setData({ groups: res.groups || [] });
      if ((res.groups || []).length > 0) this.loadRanking();
    } catch {
      wx.showToast({ title: '加载跑群失败', icon: 'none' });
    }
  },

  /** 拉取多维榜单（ranking.groupRankingMulti） */
  async loadRanking() {
    const groupId = this.data.groups[this.data.currentGroupIndex]?.id;
    if (!groupId) return;
    this.setData({ loading: true });
    try {
      const res = await api.call<{
        list: Array<RankRow & { distance: number }>;
        myRank: number | null;
        total: number;
      }>('ranking', 'groupRankingMulti', {
        groupId,
        sportType: this.data.sportType,
        period: this.data.period,
      });
      this.setData({
        list: res.list.map((r) => ({
          ...r,
          distanceDisplay: r.distance.toFixed(1),
          rankIcon: r.rank <= 3 ? MEDALS[r.rank - 1] : String(r.rank),
        })),
        myRank: res.myRank,
        loading: false,
      });
    } catch {
      this.setData({ loading: false });
      wx.showToast({ title: '加载榜单失败', icon: 'none' });
    }
  },

  switchSport(e: WechatMiniprogram.TouchEvent) {
    const sportType = e.currentTarget.dataset.sport as 'run' | 'hike' | 'all';
    if (sportType === this.data.sportType) return;
    this.setData({ sportType });
    this.loadRanking();
  },

  switchPeriod(e: WechatMiniprogram.TouchEvent) {
    const period = e.currentTarget.dataset.period as 'week' | 'month' | 'year' | 'all';
    if (period === this.data.period) return;
    this.setData({ period });
    this.loadRanking();
  },

  switchGroup(e: WechatMiniprogram.CustomEvent) {
    const idx = Number(e.detail.value);
    if (idx === this.data.currentGroupIndex) return;
    this.setData({ currentGroupIndex: idx });
    this.loadRanking();
  },
});
