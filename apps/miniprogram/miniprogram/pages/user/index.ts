// pages/user/index.ts — 用户主页（V0.1.32，社交向深化 — 关注/粉丝）
import { api } from '../../services/api';

interface UserInfo {
  id: string;
  nickname: string | null;
  avatarUrl: string | null;
}
interface CountsRes {
  user: UserInfo;
  followingCount: number;
  followerCount: number;
  isFollowing: boolean;
  isSelf: boolean;
}

Page({
  data: {
    userId: '',
    info: null as (CountsRes & { followingBtn: boolean }) | null,
    loading: false,
    toggling: false,
    // V0.1.136 三 tab: feeds (动态) / favorites (收藏) / stats (跑量)
    tab: 'feeds' as 'feeds' | 'favorites' | 'stats',
    feeds: [] as Array<{
      id: string;
      content: string;
      images: string[];
      distanceKm: number | null;
      likeCount: number;
      commentCount: number;
      createdAt: string;
      shoe: { id: string; brand: string; model: string; nickname: string | null; currentKm: number } | null;
    }>,
    feedsLoading: false,
    favorites: [] as Array<{
      id: string;
      targetType: 'content' | 'product';
      targetId: string;
      title: string;
      cover: string | null;
    }>,
    favoritesLoading: false,
    stats: null as {
      totalDistance: number;
      totalCheckins: number;
      yearDistance: number;
      yearCheckins: number;
    } | null,
    statsLoading: false,
  },

  onLoad(query: { userId?: string }) {
    const userId = query.userId || '';
    if (!userId) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      return;
    }
    this.setData({ userId });
    this.loadCounts();
    this.loadFeeds(); // 默认动态 tab
  },

  /** 拉用户信息 + 关注数/粉丝数 + 是否已关注（一次拿全） */
  async loadCounts() {
    this.setData({ loading: true });
    try {
      const res = await api.call<CountsRes>('follow', 'myCounts', { userId: this.data.userId });
      this.setData({
        info: { ...res, followingBtn: res.isFollowing },
        loading: false,
      });
    } catch {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  /** 关注/取关（乐观更新，失败回滚） */
  async onToggleFollow() {
    const info = this.data.info;
    if (!info || info.isSelf || this.data.toggling) return;
    const original = info.followingBtn;
    const action = original ? 'unfollow' : 'follow';
    // 乐观更新
    this.setData({
      info: { ...info, followingBtn: !original },
      toggling: true,
    });
    try {
      await api.call('follow', action, { userId: this.data.userId });
      // 粉丝数本地推算 ±1
      this.setData({
        info: {
          ...this.data.info!,
          followingBtn: !original,
          followerCount: info.followerCount + (original ? -1 : 1),
        },
      });
    } catch {
      // 回滚
      this.setData({ info: { ...this.data.info!, followingBtn: original } });
      wx.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      this.setData({ toggling: false });
    }
  },

  /** 切 tab */
  onSwitchTab(e: WechatMiniprogram.TouchEvent) {
    const tab = e.currentTarget.dataset.tab as 'feeds' | 'favorites' | 'stats';
    this.setData({ tab });
    if (tab === 'feeds' && this.data.feeds.length === 0 && !this.data.feedsLoading) {
      this.loadFeeds();
    }
    if (tab === 'favorites' && this.data.favorites.length === 0 && !this.data.favoritesLoading) {
      this.loadFavorites();
    }
    if (tab === 'stats' && !this.data.stats && !this.data.statsLoading) {
      this.loadStats();
    }
  },

  /** 拉该用户动态（feed.list + userId 过滤） */
  async loadFeeds() {
    this.setData({ feedsLoading: true });
    try {
      const res = await api.call<{
        list: Array<{
          id: string;
          content: string;
          images: string[];
          distanceKm: number | null;
          likeCount: number;
          commentCount: number;
          createdAt: string;
          shoe: { id: string; brand: string; model: string; nickname: string | null; currentKm: number } | null;
        }>;
      }>('feed', 'list', { userId: this.data.userId, page: 1, pageSize: 20 });
      this.setData({
        feeds: res.list.map((f) => ({ ...f, createdAt: f.createdAt.slice(0, 10) })),
        feedsLoading: false,
      });
    } catch {
      this.setData({ feedsLoading: false });
    }
  },

  /** V0.1.136 拉该用户收藏 */
  async loadFavorites() {
    this.setData({ favoritesLoading: true });
    try {
      const r = await api.call<{ list: Array<{ id: string; targetType: string; targetId: string; target?: any }> }>(
        'favorite',
        'list',
        { page: 1, pageSize: 20 },
      );
      // 简化：显示 targetId 和 targetType（生产可 join content/product 拿 title/cover）
      this.setData({
        favorites: r.list.map((f) => ({
          id: f.id,
          targetType: f.targetType as 'content' | 'product',
          targetId: f.targetId,
          title: (f.target?.title as string) ?? `收藏 #${f.targetId.slice(0, 8)}`,
          cover: (f.target?.cover as string | null) ?? null,
        })),
        favoritesLoading: false,
      });
    } catch {
      this.setData({ favoritesLoading: false });
    }
  },

  /** V0.1.136 跑量汇总 */
  async loadStats() {
    this.setData({ statsLoading: true });
    try {
      const r = await api.call<{ totalDistance: number; totalCheckins: number; yearDistance?: number; yearCheckins?: number }>(
        'stats',
        'myRunnerStats',
        {},
      );
      this.setData({
        stats: {
          totalDistance: r.totalDistance,
          totalCheckins: r.totalCheckins,
          yearDistance: r.yearDistance ?? 0,
          yearCheckins: r.yearCheckins ?? 0,
        },
        statsLoading: false,
      });
    } catch {
      this.setData({ statsLoading: false });
    }
  },
});
