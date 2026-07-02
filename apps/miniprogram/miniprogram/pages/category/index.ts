// pages/category/index.ts — 全部商品分类（参考图 2766）
import { api } from '../../services/api';

interface Product {
  id: string;
  name: string;
  price: string;
  images: string[];
}
interface Category {
  category: string;
  count: number;
}

Page({
  data: {
    categories: [] as Category[],
    currentCategory: '',
    products: [] as Product[],
    loading: false,
  },

  onShow() {
    if (this.data.categories.length === 0) this.loadCategories();
  },

  async loadCategories() {
    try {
      const res = await api.call<Category[] | { categories: Category[] }>('mall', 'listCategories', {});
      const cats = Array.isArray(res) ? res : (res as { categories: Category[] }).categories || [];
      this.setData({
        categories: cats,
        currentCategory: cats[0]?.category ?? '',
      });
      if (cats.length > 0) this.loadProducts();
    } catch {
      wx.showToast({ title: '加载分类失败', icon: 'none' });
    }
  },

  switchCategory(e: WechatMiniprogram.TouchEvent) {
    const cat = e.currentTarget.dataset.cat as string;
    if (cat === this.data.currentCategory) return;
    this.setData({ currentCategory: cat });
    this.loadProducts();
  },

  async loadProducts() {
    this.setData({ loading: true });
    try {
      const res = await api.call<{ list: Product[] }>('mall', 'listProducts', {
        category: this.data.currentCategory,
        page: 1,
        pageSize: 50,
      });
      this.setData({
        products: (res.list || []).map((p) => ({
          ...p,
          price: Number(p.price).toFixed(2),
        })),
        loading: false,
      });
    } catch {
      this.setData({ loading: false });
    }
  },

  goProduct(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.navigateTo({ url: `/pages/product-detail/index?id=${id}` });
  },
});
