// pages/user/index.ts — 运动档案（V0.1.143 改：去社交关注，专注运动动态）
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

interface FeedItem {
  id: string;
  content: string;
  images: string[];
  distanceKm: number | null;
  likeCount: number;
  commentCount: number;
  createdAt: string;
  shoe: { brand: string; model: string; nickname: string | null } | null;
}

Page({
  data: {
    userId: '',
    info: null as CountsRes | null,
    loading: false,
    feeds: [] as FeedItem[],
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
    this.loadFeeds();
  },

  /** 拉用户基本信息（follow.myCounts 一次拿全）*/
  async loadCounts() {
    this.setData({ loading: true });
    try {
      const res = await api.call<CountsRes>('follow', 'myCounts', { userId: this.data.userId });
      this.setData({ info: res, loading: false });
      wx.setNavigationBarTitle({ title: res.user.nickname || '运动档案' });
    } catch {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  /** 拉该用户运动动态（feed.list userId 过滤）*/
  async loadFeeds() {
    this.setData({ feedsLoading: true });
    try {
      const res = await api.call<{ list: FeedItem[] }>('feed', 'list', {
        userId: this.data.userId,
        page: 1,
        pageSize: 20,
      });
      this.setData({
        feeds: res.list.map((f) => ({ ...f, createdAt: f.createdAt.slice(0, 10) })),
        feedsLoading: false,
      });
    } catch {
      this.setData({ feedsLoading: false });
    }
  },
});
