// pages/cart/index.ts — 购物车（参考图 2765）
import { api } from '../../services/api';

interface CartItem {
  productId: string;
  qty: number;
  product: {
    id: string;
    name: string;
    price: string;
    originalPrice: string | null;
    images: string[];
    stock: number;
    status: string;
  };
}

Page({
  data: {
    items: [] as CartItem[],
    totalAmount: '0.00',
    count: 0,
    loading: false,
    selected: {} as Record<string, boolean>,
  },

  onShow() {
    this.loadCart();
  },

  async loadCart() {
    this.setData({ loading: true });
    try {
      const res = await api.call<{ items: CartItem[]; totalAmount: string; count: number }>('cart', 'list', {});
      const selected: Record<string, boolean> = {};
      res.items.forEach((i) => {
        selected[i.productId] = true;
      });
      this.setData({ items: res.items, totalAmount: res.totalAmount, count: res.count, selected, loading: false });
    } catch {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  async changeQty(e: WechatMiniprogram.TouchEvent) {
    const productId = e.currentTarget.dataset.id as string;
    const delta = Number(e.currentTarget.dataset.delta);
    const item = this.data.items.find((i) => i.productId === productId);
    if (!item) return;
    const newQty = item.qty + delta;
    if (newQty <= 0) {
      this.removeItem(productId);
      return;
    }
    try {
      await api.call('cart', 'updateQty', { productId, qty: newQty });
      this.loadCart();
    } catch {
      wx.showToast({ title: '更新失败', icon: 'none' });
    }
  },

  removeItem(productId: string) {
    wx.showModal({
      title: '移除商品',
      content: '确定从购物车移除？',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await api.call('cart', 'remove', { productId });
          this.loadCart();
        } catch {
          wx.showToast({ title: '移除失败', icon: 'none' });
        }
      },
    });
  },

  toggleSelect(e: WechatMiniprogram.TouchEvent) {
    const productId = e.currentTarget.dataset.id as string;
    const selected = { ...this.data.selected };
    selected[productId] = !selected[productId];
    this.setData({ selected });
    this.calcTotal();
  },

  calcTotal() {
    let total = 0;
    this.data.items.forEach((i) => {
      if (this.data.selected[i.productId]) total += Number(i.product.price) * i.qty;
    });
    this.setData({ totalAmount: total.toFixed(2) });
  },

  checkout() {
    const selectedItems = this.data.items.filter((i) => this.data.selected[i.productId]);
    if (selectedItems.length === 0) {
      wx.showToast({ title: '请选择商品', icon: 'none' });
      return;
    }
    // MVP：批量下单暂未实现（mall.createOrder 单商品），后续扩批量
    wx.showToast({ title: '批量结算即将上线', icon: 'none' });
  },
});
