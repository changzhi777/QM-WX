// pages/content-list/index.ts — 赛事+本地服务（V0.1.143 合并 my-enrollments）
// 2 tab：内容列表 / 我的报名
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

// === 我的报名（合并自 my-enrollments）===
interface EnrollmentItem {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  content: {
    id: string;
    title: string;
    cover: string | null;
    type: string;
    date: string | null;
    location: string | null;
  };
}

interface DisplayItem extends EnrollmentItem {
  typeLabel: string;
  statusLabel: string;
}

const TYPE_LABEL: Record<string, string> = {
  marathon: '赛事',
  hotel: '酒店',
  scenic: '景区',
  food: '餐饮',
  rural: '乡村',
};

const STATUS_LABEL: Record<string, string> = {
  submitted: '已提交',
  confirmed: '已确认',
  cancelled: '已取消',
};

type TopTab = 'content' | 'enrollments';

Page({
  data: {
    topTab: 'content' as TopTab,
    // 内容 tab
    tabs: TABS,
    tabIndex: 0,
    list: [] as ContentItem[],
    loading: true,
    error: false,
    errorMsg: '',
    page: 1,
    hasMore: true,
    // 报名 tab
    enrollments: [] as DisplayItem[],
    ePage: 1,
    eHasMore: true,
    eLoading: false,
  },

  onLoad(query: { tab?: string }) {
    if (query?.tab === 'enrollments') {
      this.setData({ topTab: 'enrollments' });
      this.loadEnrollments();
    } else {
      this.load(true);
    }
  },

  onShow() {
    if (this.data.topTab === 'enrollments') this.refreshEnrollments();
  },

  onSwitchTopTab(e: WechatMiniprogram.TouchEvent) {
    const tab = (e.currentTarget.dataset.tab as TopTab) || 'content';
    if (tab === this.data.topTab) return;
    this.setData({ topTab: tab });
    if (tab === 'enrollments' && this.data.enrollments.length === 0) this.loadEnrollments();
  },

  onPullDownRefresh() {
    if (this.data.topTab === 'content') this.load(true).finally(() => wx.stopPullDownRefresh());
    else this.refreshEnrollments().finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.topTab === 'content') {
      if (this.data.hasMore && !this.data.loading) this.load(false);
    } else {
      if (this.data.eHasMore && !this.data.eLoading) this.loadEnrollments();
    }
  },

  // ===== 内容 tab =====
  onTabChange(e: WechatMiniprogram.CustomEvent) {
    const idx = Number(e.detail.value);
    this.setData({ tabIndex: idx, list: [], page: 1, hasMore: true });
    this.load(true);
  },

  loadRetry() {
    this.setData({ list: [], page: 1, hasMore: true });
    this.load(true);
  },

  async load(reset: boolean) {
    if (this.data.loading) return;
    this.setData({ loading: true, error: false, errorMsg: '' });
    const page = reset ? 1 : this.data.page;
    const type = TABS[this.data.tabIndex].type || undefined;
    try {
      const result = await api.call<{ list: ContentItem[]; total: number; page: number; pageSize: number }>(
        'content', 'list', { type, page, pageSize: 20 },
      );
      const newList = reset ? result.list : [...this.data.list, ...result.list];
      this.setData({ list: newList, page: page + 1, hasMore: newList.length < result.total, loading: false });
    } catch (e) {
      this.setData({ loading: false, error: true, errorMsg: (e as Error).message ?? '加载内容失败' });
    }
  },

  goDetail(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.navigateTo({ url: `/pages/content-detail/index?id=${id}` });
  },

  // ===== 报名 tab =====
  async refreshEnrollments() {
    this.setData({ enrollments: [], ePage: 1, eHasMore: true });
    await this.loadEnrollments();
  },

  async loadEnrollments() {
    if (this.data.eLoading || (this.data.ePage > 1 && !this.data.eHasMore)) return;
    this.setData({ eLoading: true });
    try {
      const res = await api.call<{ list: EnrollmentItem[]; total: number }>(
        'content', 'myEnrollments', { page: this.data.ePage, pageSize: 10 },
      );
      const mapped: DisplayItem[] = res.list.map((e) => ({
        ...e,
        createdAt: e.createdAt.slice(0, 10),
        typeLabel: TYPE_LABEL[e.type] ?? e.type,
        statusLabel: STATUS_LABEL[e.status] ?? e.status,
      }));
      const hasMore = this.data.enrollments.length + mapped.length < res.total;
      this.setData({
        enrollments: this.data.ePage === 1 ? mapped : [...this.data.enrollments, ...mapped],
        eHasMore: hasMore,
        eLoading: false,
      });
    } catch {
      this.setData({ eLoading: false });
    }
  },

  goEnrollDetail(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.navigateTo({ url: `/pages/content-detail/index?id=${id}` });
  },
});
