// pages/review-list/index.ts — 商品全部评价（V0.1.115 评价展示闭环）
// 入口：product-detail「查看全部 N 条评价」→ navigateTo?productId&productName
import { api } from '../../services/api';

interface ReviewItem {
  id: string;
  rating: number;
  content: string | null;
  images: string[];
  createdAt: string;
  replyContent: string | null;
  repliedAt: string | null;
  user: { id: string; nickname: string | null; avatarUrl: string | null };
}

Page({
  data: {
    productId: '',
    stats: { avg: 0, count: 0 } as { avg: number; count: number },
    list: [] as ReviewItem[],
    page: 1,
    pageSize: 10,
    hasMore: true,
    loading: false,
  },

  onLoad(query) {
    const productId = (query?.productId as string) ?? '';
    const productName = (query?.productName as string) ?? '商品评价';
    (this as unknown as { _productId: string })._productId = productId;
    this.setData({ productId });
    wx.setNavigationBarTitle({ title: decodeURIComponent(productName) });
    this.loadStats(productId);
    this.load();
  },

  async loadStats(productId: string) {
    try {
      const stats = await api.call<{ avg: number; count: number }>('review', 'stats', { productId });
      this.setData({ stats });
    } catch {
      // 汇总失败不阻塞列表
    }
  },

  async load() {
    if (this.data.loading || (this.data.page > 1 && !this.data.hasMore)) return;
    this.setData({ loading: true });
    try {
      const res = await api.call<{ list: ReviewItem[]; total: number }>('review', 'list', {
        productId: this.data.productId,
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

  /** 预览评价图片 */
  onPreviewImage(e: WechatMiniprogram.CustomEvent) {
    const { current, urls } = e.currentTarget.dataset as { current: string; urls: string[] };
    wx.previewImage({ current, urls });
  },
});
