// pages/hot/index.ts — 红心广场（V0.1.36，2771 社交深化 — 热门动态 + 热门话题）
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
interface HotTopic {
  topic: string;
  count: number;
}

Page({
  data: {
    feeds: [] as FeedItem[],
    topics: [] as HotTopic[],
    loading: false,
    page: 1,
    hasMore: false,
  },

  onShow() {
    this.setData({ feeds: [], page: 1 });
    this.loadHot();
    this.loadTopics();
  },

  /** 热门动态（feed.list sort=hot）*/
  async loadHot() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const res = await api.call<{ list: FeedItem[]; hasMore: boolean }>('feed', 'list', {
        page: this.data.page,
        pageSize: 20,
        sort: 'hot',
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

  /** 热门话题（feed.hotTopics）*/
  async loadTopics() {
    try {
      const res = await api.call<{ topics: HotTopic[] }>('feed', 'hotTopics', {});
      this.setData({ topics: res.topics });
    } catch {
      /* 话题加载失败不阻塞 */
    }
  },

  onReachBottom() {
    if (this.data.hasMore) {
      this.setData({ page: this.data.page + 1 });
      this.loadHot();
    }
  },

  /** 点话题 → 话题页 */
  onTapTopic(e: WechatMiniprogram.TouchEvent) {
    const topic = e.currentTarget.dataset.topic as string;
    if (topic) wx.navigateTo({ url: `/pages/topic/index?topic=${encodeURIComponent(topic)}` });
  },

  onShareAppMessage() {
    return { title: '青沐红心广场 — 热门运动动态 🔥', path: '/pages/hot/index' };
  },
});
