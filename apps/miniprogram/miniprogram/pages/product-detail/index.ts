// pages/product-detail/index.ts
import { api } from '../../services/api';
import { ensureLogin } from '../../utils/auth';

interface Product {
  id: string;
  name: string;
  category: string;
  brand: string | null;
  price: string;
  originalPrice: string | null;
  memberDiscount: number | null;
  images: string[];
  description: string | null;
  stock: number;
}

Page({
  data: {
    product: null as Product | null,
    loading: true,
    currentImage: 0,
    canBuy: false, // 来自 feature flag
    showSku: false,
    quantity: 1,
    error: false,
    errorMsg: '',
    reviewStats: null as { avg: number; count: number } | null,
    reviews: [] as Array<{
      id: string;
      rating: number;
      content: string | null;
      user: { nickname: string | null; avatarUrl: string | null };
      createdAt: string;
    }>,
  },

  onLoad(query) {
    const id = (query?.id as string) ?? '';
    (this as unknown as { _prodId: string })._prodId = id;
    this.loadDetail(id);
  },

  /** error-state 重试入口 */
  loadRetry() {
    const id = (this as unknown as { _prodId?: string })._prodId;
    if (id) this.loadDetail(id);
  },

  async loadDetail(id: string) {
    this.setData({ loading: true, error: false, errorMsg: '' });
    try {
      const { product } = await api.call<{ product: Product }>('mall', 'productDetail', { id });
      this.setData({ product, loading: false });
      wx.setNavigationBarTitle({ title: product.name });
      this.loadReviews(product.id);

      // 读 feature flag：payment 关闭时只能"积分兑换"或"敬请期待"
      const flags = (getApp().globalData.config?.featureFlags ?? {}) as { payment?: boolean };
      this.setData({ canBuy: !!flags.payment });
    } catch (e) {
      this.setData({
        loading: false,
        error: true,
        errorMsg: (e as Error).message ?? '加载商品失败',
      });
    }
  },

  /** 查看全部评价（跳商品评价列表页） */
  onViewAllReviews() {
    if (!this.data.product) return;
    wx.navigateTo({
      url: `/pages/review-list/index?productId=${this.data.product.id}&productName=${encodeURIComponent(this.data.product.name)}`,
    });
  },

  /** 加载商品评价（汇总 + 前 3 条预览，失败不影响商品展示） */
  async loadReviews(productId: string) {
    try {
      const [stats, { list }] = await Promise.all([
        api.call<{ avg: number; count: number }>('review', 'stats', { productId }),
        api.call<{
          list: Array<{
            id: string;
            rating: number;
            content: string | null;
            user: { nickname: string | null; avatarUrl: string | null };
            createdAt: string;
          }>;
        }>('review', 'list', { productId, page: 1, pageSize: 3 }),
      ]);
      this.setData({ reviewStats: stats, reviews: list });
    } catch {
      // 评价加载失败不阻塞商品展示
    }
  },

  onSwiperChange(e: WechatMiniprogram.CustomEvent) {
    this.setData({ currentImage: e.detail.current });
  },

  onTapBuy() {
    if (!this.data.product) return;
    ensureLogin().then(() => {
      this.setData({ showSku: true });
    });
  },

  onCloseSku() {
    this.setData({ showSku: false, quantity: 1 });
  },

  onMinus() {
    if (this.data.quantity > 1) this.setData({ quantity: this.data.quantity - 1 });
  },

  onPlus() {
    const max = this.data.product?.stock ?? 1;
    if (this.data.quantity < max) this.setData({ quantity: this.data.quantity + 1 });
  },

  onQuantityInput(e: WechatMiniprogram.CustomEvent) {
    const v = Math.max(1, Math.min(this.data.product?.stock ?? 1, Number(e.detail.value) || 1));
    this.setData({ quantity: v });
  },

  onConfirm() {
    // 跳到 order-confirm，传 productId + quantity
    if (!this.data.product) return;
    wx.navigateTo({
      url: `/pages/order-confirm/index?productId=${this.data.product.id}&quantity=${this.data.quantity}`,
    });
    this.setData({ showSku: false });
  },
});
