// pages/mall/index.ts
import { api } from '../../services/api';

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

const CATEGORIES = ['全部', '运动', '健康', '生活'];

Page({
  data: {
    categories: CATEGORIES,
    catIndex: 0,
    keyword: '',
    list: [] as Product[],
    loading: true,
    error: false,
    errorMsg: '',
    page: 1,
    hasMore: true,

    // V0.1.35 商城入口网格（8 项，从 mine 分散到商城 tab）
    mallEntries: [
      { icon: '🛒', label: '团购', url: '/pages/group-buy/index' },
      { icon: '📦', label: '购物车', url: '/pages/cart/index' },
      { icon: '🎁', label: '优惠券', url: '/pages/coupon/index' },
      { icon: '📋', label: '我的订单', url: '/pages/order-list/index' },
      { icon: '📍', label: '地址管理', url: '/pages/address/index' },
      { icon: '🔍', label: '商品分类', url: '/pages/category/index' },
      { icon: '💰', label: '我的钱包', url: '/pages/wallet/index' },
      { icon: '🎯', label: '积分中心', url: '/pages/points/index' },
      { icon: '🏷️', label: '分销中心', url: '/pages/distribution/index' },
    ],
  },

  onShow() {
    if (this.data.list.length === 0) this.load(true);
  },

  onPullDownRefresh() {
    this.load(true).finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) this.load(false);
  },

  /** error-state 重试入口（仅重置分页，不清空筛选条件） */
  loadRetry() {
    this.setData({ list: [], page: 1, hasMore: true });
    this.load(true);
  },

  onCatChange(e: WechatMiniprogram.CustomEvent) {
    const idx = Number(e.detail.value);
    this.setData({ catIndex: idx, list: [], page: 1, hasMore: true });
    this.load(true);
  },

  onSearchInput(e: WechatMiniprogram.CustomEvent) {
    this.setData({ keyword: e.detail.value });
  },

  onSearch() {
    this.setData({ list: [], page: 1, hasMore: true });
    this.load(true);
  },

  async load(reset: boolean) {
    if (this.data.loading) return;
    this.setData({ loading: true, error: false, errorMsg: '' });

    const page = reset ? 1 : this.data.page;
    const category = this.data.catIndex === 0 ? undefined : CATEGORIES[this.data.catIndex];

    try {
      const result = await api.call<{
        list: Product[];
        total: number;
      }>('mall', 'listProducts', { category, keyword: this.data.keyword || undefined, page, pageSize: 20 });

      const newList = reset ? result.list : [...this.data.list, ...result.list];
      this.setData({
        list: newList,
        page: page + 1,
        hasMore: newList.length < result.total,
        loading: false,
      });
    } catch (e) {
      this.setData({
        loading: false,
        error: true,
        errorMsg: (e as Error).message ?? '加载商品失败',
      });
    }
  },

  goDetail(e: WechatMiniprogram.CustomEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.navigateTo({ url: `/pages/product-detail/index?id=${id}` });
  },
});
