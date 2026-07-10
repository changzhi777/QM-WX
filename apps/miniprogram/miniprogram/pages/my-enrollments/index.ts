// pages/my-enrollments/index.ts — 我的报名（V0.1.113 赛事闭环）
// 赛事/酒店/景区/餐饮/乡村 报名记录；点卡跳 content-detail
import { api } from '../../services/api';

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

Page({
  data: {
    list: [] as DisplayItem[],
    page: 1,
    pageSize: 10,
    hasMore: true,
    loading: false,
  },

  onShow() {
    this.setData({ list: [], page: 1, hasMore: true });
    this.load();
  },

  async load() {
    if (this.data.loading || (this.data.page > 1 && !this.data.hasMore)) return;
    this.setData({ loading: true });
    try {
      const res = await api.call<{ list: EnrollmentItem[]; total: number }>(
        'content',
        'myEnrollments',
        { page: this.data.page, pageSize: this.data.pageSize },
      );
      const mapped: DisplayItem[] = res.list.map((e) => ({
        ...e,
        createdAt: e.createdAt.slice(0, 10),
        typeLabel: TYPE_LABEL[e.type] ?? e.type,
        statusLabel: STATUS_LABEL[e.status] ?? e.status,
      }));
      const hasMore = this.data.list.length + mapped.length < res.total;
      this.setData({
        list: this.data.page === 1 ? mapped : [...this.data.list, ...mapped],
        hasMore,
        loading: false,
      });
    } catch {
      this.setData({ loading: false });
    }
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.loading) return;
    this.setData({ page: this.data.page + 1 });
    this.load();
  },

  onTap(e: WechatMiniprogram.CustomEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.navigateTo({ url: `/pages/content-detail/index?id=${id}` });
  },
});
