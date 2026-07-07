// pages/group-buy-detail/index.ts — 团购详情（V0.1.37）
import { api } from '../../services/api';

interface Product {
  id: string;
  name: string;
  price: string;
  images: string[];
  description: string | null;
  status: string;
}
interface Detail {
  id: string;
  groupPrice: string;
  targetCount: number;
  currentCount: number;
  status: string;
  endDate: string | null;
  createdAt: string;
  product: Product;
  isJoined: boolean;
}

Page({
  data: {
    id: '',
    detail: null as Detail | null,
    loading: false,
    joining: false,
  },

  onLoad(query: { id?: string }) {
    const id = query.id || '';
    if (!id) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      return;
    }
    this.setData({ id });
    this.loadDetail();
  },

  async loadDetail() {
    this.setData({ loading: true });
    try {
      const res = await api.call<Detail>('groupBuy', 'detail', { id: this.data.id });
      this.setData({ detail: res, loading: false });
    } catch {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  /** 参与团购（乐观更新）*/
  async onJoin() {
    const detail = this.data.detail;
    if (!detail || detail.isJoined || this.data.joining) return;
    this.setData({ joining: true });
    // 乐观：currentCount+1 + isJoined
    this.setData({
      detail: { ...detail, isJoined: true, currentCount: detail.currentCount + 1 },
    });
    try {
      await api.call('groupBuy', 'join', { id: this.data.id });
      wx.showToast({ title: '已参与', icon: 'success' });
      this.loadDetail(); // 重新拉取确认状态（可能成团）
    } catch (e) {
      this.setData({ detail }); // 回滚
      wx.showToast({ title: (e as Error).message || '参与失败', icon: 'none' });
    } finally {
      this.setData({ joining: false });
    }
  },

  /** 原价购买（跳商品详情，复用 mall）*/
  onBuy() {
    const pid = this.data.detail?.product.id;
    if (pid) wx.navigateTo({ url: `/pages/product-detail/index?id=${pid}` });
  },

  /** V0.1.37 团购下单（成团 reached + 已参与 → 团购价订单，复用 mall.createOrder）*/
  async onGroupBuyOrder() {
    const detail = this.data.detail;
    if (!detail || !detail.isJoined || detail.status !== 'reached') return;
    wx.showModal({
      title: '团购下单',
      content: `团购价 ¥${detail.groupPrice}（原价 ¥${detail.product.price}），确认下单？`,
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await api.call('mall', 'createOrder', {
            items: [{ productId: detail.product.id, qty: 1 }],
            groupBuyId: detail.id,
          });
          wx.showToast({ title: '订单已创建', icon: 'success' });
          setTimeout(() => wx.navigateTo({ url: '/pages/order-list/index' }), 1000);
        } catch (e) {
          wx.showToast({ title: (e as Error).message || '下单失败', icon: 'none' });
        }
      },
    });
  },

  onShareAppMessage() {
    const d = this.data.detail;
    return {
      title: d ? `${d.product.name} 团购仅¥${d.groupPrice}！` : '青沐团购优惠 🛒',
      path: `/pages/group-buy-detail/index?id=${this.data.id}`,
    };
  },
});
