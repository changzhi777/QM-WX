// pages/feed/index.ts — 运动动态（V0.1.30，社交向 — 发布/点赞/评论）
import { api } from '../../services/api';

interface FeedItem {
  id: string;
  content: string;
  images: string[];
  distanceKm: number | null;
  likeCount: number;
  commentCount: number;
  createdAt: string;
  user: { id: string; nickname: string | null; avatarUrl: string | null };
  liked: boolean;
}

interface FeedListRes {
  list: FeedItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

Page({
  data: {
    feeds: [] as FeedItem[],
    loading: false,
    publishing: false,
    publishVisible: false,
    publishContent: '',
    commentVisible: false,
    commentFeedId: '',
    commentContent: '',
    page: 1,
    hasMore: false,
  },

  onShow() {
    this.setData({ feeds: [], page: 1 });
    this.loadFeeds();
  },

  /** 拉取动态流（feed.list） */
  async loadFeeds() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const res = await api.call<FeedListRes>('feed', 'list', {
        page: this.data.page,
        pageSize: 20,
      });
      this.setData({
        feeds: this.data.page === 1 ? res.list : [...this.data.feeds, ...res.list],
        hasMore: res.hasMore,
        loading: false,
      });
    } catch {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onReachBottom() {
    if (this.data.hasMore) {
      this.setData({ page: this.data.page + 1 });
      this.loadFeeds();
    }
  },

  /** 发布动态 */
  onPublish() {
    this.setData({ publishVisible: true, publishContent: '' });
  },
  onInputPublish(e: WechatMiniprogram.Input) {
    this.setData({ publishContent: e.detail.value });
  },
  async onSubmitPublish() {
    const content = this.data.publishContent.trim();
    if (!content) {
      wx.showToast({ title: '请输入内容', icon: 'none' });
      return;
    }
    this.setData({ publishing: true });
    try {
      await api.call('feed', 'publish', { content, images: [] });
      this.setData({ publishing: false, publishVisible: false, publishContent: '', page: 1, feeds: [] });
      wx.showToast({ title: '已发布', icon: 'success' });
      this.loadFeeds();
    } catch {
      this.setData({ publishing: false });
      wx.showToast({ title: '发布失败', icon: 'none' });
    }
  },
  closePublish() {
    this.setData({ publishVisible: false });
  },

  /** 点赞/取消（乐观更新） */
  async onToggleLike(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    const feed = this.data.feeds.find((f) => f.id === id);
    if (!feed) return;
    const action = feed.liked ? 'unlike' : 'like';
    const original = this.data.feeds;
    // 乐观更新
    this.setData({
      feeds: this.data.feeds.map((f) =>
        f.id === id ? { ...f, liked: !f.liked, likeCount: f.likeCount + (f.liked ? -1 : 1) } : f,
      ),
    });
    try {
      await api.call('feed', action, { feedId: id });
    } catch {
      this.setData({ feeds: original }); // 回滚
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  /** 评论 */
  onOpenComment(e: WechatMiniprogram.TouchEvent) {
    this.setData({ commentVisible: true, commentFeedId: e.currentTarget.dataset.id as string, commentContent: '' });
  },
  onInputComment(e: WechatMiniprogram.Input) {
    this.setData({ commentContent: e.detail.value });
  },
  async onSubmitComment() {
    const content = this.data.commentContent.trim();
    if (!content) return;
    try {
      await api.call('feed', 'comment', { feedId: this.data.commentFeedId, content });
      this.setData({
        feeds: this.data.feeds.map((f) =>
          f.id === this.data.commentFeedId ? { ...f, commentCount: f.commentCount + 1 } : f,
        ),
        commentVisible: false,
        commentContent: '',
      });
      wx.showToast({ title: '已评论', icon: 'success' });
    } catch {
      wx.showToast({ title: '评论失败', icon: 'none' });
    }
  },
  closeComment() {
    this.setData({ commentVisible: false });
  },

  /** 点头像/昵称 → 用户主页（V0.1.32 关注闭环入口） */
  onTapUser(e: WechatMiniprogram.TouchEvent) {
    const uid = e.currentTarget.dataset.uid as string;
    if (uid) wx.navigateTo({ url: `/pages/user/index?userId=${uid}` });
  },
});
