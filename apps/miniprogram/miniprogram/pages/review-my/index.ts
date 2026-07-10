// pages/review-my/index.ts — 我的评价（V0.1.113）
// 列表：商品图 + 名 + 我的评分 + 内容 + 日期；点卡跳商品详情；onReachBottom 分页
import { api } from '../../services/api';

interface ReviewItem {
  id: string;
  rating: number;
  content: string | null;
  images: string[];
  createdAt: string; // 已 slice(0,10) 为 YYYY-MM-DD
  product: { id: string; name: string; images: string[] };
}

Page({
  data: {
    list: [] as ReviewItem[],
    page: 1,
    pageSize: 10,
    hasMore: true,
    loading: false,
  },

  onShow() {
    // 每次进入重载（发表新评价后能看到）
    this.setData({ list: [], page: 1, hasMore: true });
    this.load();
  },

  async load() {
    if (this.data.loading || (this.data.page > 1 && !this.data.hasMore)) return;
    this.setData({ loading: true });
    try {
      const res = await api.call<{ list: ReviewItem[]; total: number }>('review', 'myReviews', {
        page: this.data.page,
        pageSize: this.data.pageSize,
      });
      const mapped = res.list.map((r) => ({ ...r, createdAt: r.createdAt.slice(0, 10) }));
      const hasMore = this.data.list.length + mapped.length < res.total;
      this.setData({
        list: this.data.page === 1 ? mapped : [...this.data.list, ...mapped],
        hasMore,
        loading: false,
      });
    } catch {
      this.setData({ loading: false });
    }
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.loading) return;
    this.setData({ page: this.data.page + 1 });
    this.load();
  },

  /** 点卡跳商品详情 */
  onTap(e: WechatMiniprogram.CustomEvent) {
    const productId = e.currentTarget.dataset.id as string;
    wx.navigateTo({ url: `/pages/product-detail/index?id=${productId}` });
  },
});
