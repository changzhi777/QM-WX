// pages/group-buy/index.ts — 团购列表（V0.1.37，2764 电商团购）
import { api } from '../../services/api';

interface Product {
  id: string;
  name: string;
  price: string;
  images: string[];
  status: string;
}
interface GroupBuyItem {
  id: string;
  groupPrice: string;
  targetCount: number;
  currentCount: number;
  status: string;
  endDate: string | null;
  product: Product;
  isJoined: boolean;
}

Page({
  data: {
    list: [] as GroupBuyItem[],
    loading: false,
    page: 1,
    hasMore: false,
  },

  onShow() {
    this.setData({ list: [], page: 1 });
    this.loadList();
  },

  async loadList() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const res = await api.call<{ list: GroupBuyItem[]; hasMore: boolean }>('groupBuy', 'list', {
        page: this.data.page,
        pageSize: 20,
      });
      this.setData({
        list: this.data.page === 1 ? res.list : [...this.data.list, ...res.list],
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
      this.loadList();
    }
  },

  /** 点团购卡 → 详情 */
  onTapItem(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    if (id) wx.navigateTo({ url: `/pages/group-buy-detail/index?id=${id}` });
  },

  onShareAppMessage() {
    return { title: '青沐团购优惠 — 拼团享低价 🛒', path: '/pages/group-buy/index' };
  },
});
