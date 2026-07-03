// pages/tiantian/index.ts — 天天跑首页（参考图 2767：电商活动门户）
import { api } from '../../services/api';

interface Product {
  id: string;
  name: string;
  price: string;
  originalPrice?: string | null;
  images: string[];
}

Page({
  data: {
    products: [] as Product[],
    loading: false,
  },

  onShow() {
    this.loadProducts();
  },

  async loadProducts() {
    this.setData({ loading: true });
    try {
      const res = await api.call<{ list: Product[] }>('mall', 'listProducts', {
        page: 1,
        pageSize: 8,
      });
      this.setData({ products: res.list || [], loading: false });
    } catch {
      this.setData({ loading: false });
    }
  },

  goSearch() {
    wx.navigateTo({ url: '/pages/category/index' });
  },
  goSport() {
    wx.switchTab({ url: '/pages/sport/index' });
  },
  goActivity() {
    wx.navigateTo({ url: '/pages/content-list/index' });
  },
  goMall() {
    wx.switchTab({ url: '/pages/mall/index' });
  },
  goProduct(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.navigateTo({ url: `/pages/product-detail/index?id=${id}` });
  },
  comingSoon() {
    wx.showToast({ title: '即将上线', icon: 'none' });
  },
});
