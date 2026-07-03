// pages/favorite/index.ts — 我的收藏（V0.1.29，社交向 — Content/Product）
import { api } from '../../services/api';

interface FavItem {
  id: string;
  targetType: 'content' | 'product';
  targetId: string;
  createdAt: string;
  detail: {
    id: string;
    title?: string;
    name?: string;
    cover?: string | null;
    images?: string[];
    summary?: string | null;
    price?: string;
    type?: string;
    location?: string | null;
    date?: string | null;
  } | null;
}

Page({
  data: {
    tab: 'content' as 'content' | 'product',
    favorites: [] as FavItem[],
    loading: false,
  },

  onShow() {
    this.loadFavorites();
  },

  /** 拉取收藏（favorite.list，按 tab 过滤） */
  async loadFavorites() {
    this.setData({ loading: true });
    try {
      const res = await api.call<{ favorites: FavItem[] }>('favorite', 'list', {
        targetType: this.data.tab,
      });
      this.setData({ favorites: res.favorites, loading: false });
    } catch {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  switchTab(e: WechatMiniprogram.TouchEvent) {
    const tab = e.currentTarget.dataset.tab as 'content' | 'product';
    if (tab === this.data.tab) return;
    this.setData({ tab, favorites: [] });
    this.loadFavorites();
  },

  /** 取消收藏 */
  onRemove(e: WechatMiniprogram.TouchEvent) {
    const item = e.currentTarget.dataset.item as FavItem;
    wx.showModal({
      title: '取消收藏',
      content: '确定取消收藏吗？',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await api.call('favorite', 'remove', {
            targetType: item.targetType,
            targetId: item.targetId,
          });
          wx.showToast({ title: '已取消', icon: 'success' });
          this.loadFavorites();
        } catch {
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      },
    });
  },

  /** 点卡 → 跳详情 */
  onTap(e: WechatMiniprogram.TouchEvent) {
    const item = e.currentTarget.dataset.item as FavItem;
    if (item.targetType === 'content') {
      wx.navigateTo({ url: `/pages/content-detail/index?id=${item.targetId}` });
    } else {
      wx.navigateTo({ url: `/pages/product-detail/index?id=${item.targetId}` });
    }
  },
});
