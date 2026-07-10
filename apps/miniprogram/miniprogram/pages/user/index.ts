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
    tab: 'info' as 'info' | 'feeds',
    feeds: [] as Array<{
      id: string;
      content: string;
      likeCount: number;
      commentCount: number;
      createdAt: string;
    }>,
    feedsLoading: false,
  },

  onLoad(query: { userId?: string }) {
    const userId = query.userId || '';
    if (!userId) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      return;
    }
    this.setData({ userId });
    this.loadCounts();
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

  /** 切 tab（首次进动态拉列表） */
  onSwitchTab(e: WechatMiniprogram.TouchEvent) {
    const tab = e.currentTarget.dataset.tab as 'info' | 'feeds';
    this.setData({ tab });
    if (tab === 'feeds' && this.data.feeds.length === 0 && !this.data.feedsLoading) {
      this.loadFeeds();
    }
  },

  /** 拉该用户动态（feed.list + userId 过滤，V0.1.116 后端支持） */
  async loadFeeds() {
    this.setData({ feedsLoading: true });
    try {
      const res = await api.call<{
        list: Array<{
          id: string;
          content: string;
          likeCount: number;
          commentCount: number;
          createdAt: string;
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
});
