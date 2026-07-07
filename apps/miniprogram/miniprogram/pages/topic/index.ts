// pages/topic/index.ts — 话题页（V0.1.36，按话题聚合动态）
import { api } from '../../services/api';

interface FeedItem {
  id: string;
  content: string;
  topic: string | null;
  likeCount: number;
  commentCount: number;
  createdAt: string;
  user: { id: string; nickname: string | null; avatarUrl: string | null };
}
interface FeedListRes {
  list: FeedItem[];
  total: number;
  hasMore: boolean;
}

Page({
  data: {
    topic: '',
    feeds: [] as FeedItem[],
    loading: false,
    page: 1,
    hasMore: false,
  },

  onLoad(query: { topic?: string }) {
    const topic = query.topic ? decodeURIComponent(query.topic) : '';
    if (!topic) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      return;
    }
    this.setData({ topic });
    this.loadTopicFeeds();
  },

  /** 拉取该话题的动态（feed.list topic=xxx）*/
  async loadTopicFeeds() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const res = await api.call<FeedListRes>('feed', 'list', {
        page: this.data.page,
        pageSize: 20,
        topic: this.data.topic,
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
      this.loadTopicFeeds();
    }
  },

  onShareAppMessage() {
    return {
      title: `#${this.data.topic} — 青沐运动`,
      path: `/pages/topic/index?topic=${encodeURIComponent(this.data.topic)}`,
    };
  },
});
