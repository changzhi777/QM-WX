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
});
