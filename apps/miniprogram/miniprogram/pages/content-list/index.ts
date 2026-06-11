// pages/content-list/index.ts
import { api } from '../../services/api';

type ContentType = 'marathon' | 'hotel' | 'scenic' | 'food' | 'rural';

const TABS: { type: ContentType | ''; label: string }[] = [
  { type: '', label: '全部' },
  { type: 'marathon', label: '赛事' },
  { type: 'hotel', label: '酒店' },
  { type: 'scenic', label: '景区' },
  { type: 'food', label: '餐饮' },
  { type: 'rural', label: '乡村' },
];

interface ContentItem {
  id: string;
  type: ContentType;
  title: string;
  cover: string | null;
  summary: string | null;
  price: string | null;
  fee: string | null;
  date: string | null;
  location: string | null;
  tags: string[];
  actionType: string;
}

Page({
  data: {
    tabs: TABS,
    tabIndex: 0,
    list: [] as ContentItem[],
    loading: true,
    page: 1,
    hasMore: true,
  },

  onLoad() {
    this.load(true);
  },

  onPullDownRefresh() {
    this.load(true).finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) this.load(false);
  },

  onTabChange(e: WechatMiniprogram.CustomEvent) {
    const idx = Number(e.detail.value);
    this.setData({ tabIndex: idx, list: [], page: 1, hasMore: true });
    this.load(true);
  },

  async load(reset: boolean) {
    if (this.data.loading) return;
    this.setData({ loading: true });

    const page = reset ? 1 : this.data.page;
    const type = TABS[this.data.tabIndex].type || undefined;

    try {
      const result = await api.call<{
        list: ContentItem[];
        total: number;
        page: number;
        pageSize: number;
      }>('content', 'list', { type, page, pageSize: 20 });

      const newList = reset ? result.list : [...this.data.list, ...result.list];
      this.setData({
        list: newList,
        page: page + 1,
        hasMore: newList.length < result.total,
        loading: false,
      });
    } catch {
      this.setData({ loading: false });
    }
  },

  goDetail(e: WechatMiniprogram.CustomEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.navigateTo({ url: `/pages/content-detail/index?id=${id}` });
  },
});
