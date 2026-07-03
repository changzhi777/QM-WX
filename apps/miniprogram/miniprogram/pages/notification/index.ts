// pages/notification/index.ts — 消息中心（V0.1.31，社交向 — 点赞/评论通知）
import { api } from '../../services/api';

interface NotifActor {
  id: string;
  nickname: string | null;
  avatarUrl: string | null;
}
interface NotifItem {
  id: string;
  type: string;
  targetType: string | null;
  targetId: string | null;
  content: string | null;
  isRead: boolean;
  createdAt: string;
  actor: NotifActor;
  // 派生字段（map 后注入，供 wxml 直接用）
  text: string;
  timeText: string;
}
interface NotifListRes {
  list: Omit<NotifItem, 'text' | 'timeText'>[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** 通知类型 → 文案（MVP：like/comment；follow/system 预留） */
const TYPE_TEXT: Record<string, string> = {
  like: '赞了你的动态',
  comment: '评论了你的动态',
  follow: '关注了你',
  system: '系统消息',
};

/** 相对时间格式化（wxml 无 Math，js 算好后 setData） */
function formatTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}小时前`;
  if (diff < 7 * 86400_000) return `${Math.floor(diff / 86400_000)}天前`;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 把后端原始项映射成 wxml 友好的派生结构 */
function decorate(n: Omit<NotifItem, 'text' | 'timeText'>): NotifItem {
  return {
    ...n,
    text: TYPE_TEXT[n.type] ?? '收到一条通知',
    timeText: formatTime(n.createdAt),
  };
}

Page({
  data: {
    list: [] as NotifItem[],
    loading: false,
    page: 1,
    hasMore: false,
  },

  onShow() {
    this.setData({ list: [], page: 1 });
    this.loadList();
  },

  /** 拉取通知列表（notification.list） */
  async loadList() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const res = await api.call<NotifListRes>('notification', 'list', {
        page: this.data.page,
        pageSize: 20,
      });
      const decorated = res.list.map(decorate);
      this.setData({
        list: this.data.page === 1 ? decorated : [...this.data.list, ...decorated],
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

  onPullDownRefresh() {
    this.setData({ list: [], page: 1 });
    this.loadList().then(() => wx.stopPullDownRefresh());
  },

  /** 点击通知 → 标记已读（乐观）+ 跳转目标（MVP 仅 feed） */
  async onTapItem(e: WechatMiniprogram.TouchEvent) {
    const item = e.currentTarget.dataset.item as NotifItem;
    if (!item.isRead) {
      // 乐观标记已读
      this.setData({
        list: this.data.list.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)),
      });
      try {
        await api.call('notification', 'markRead', { notificationId: item.id });
      } catch {
        /* 标记失败不阻塞跳转，下次进来会重新拉 */
      }
    }
    if (item.targetType === 'feed' && item.targetId) {
      wx.navigateTo({ url: '/pages/feed/index' });
    }
  },

  /** 全部已读 */
  async onMarkAll() {
    try {
      await api.call('notification', 'markAllRead', {});
      this.setData({ list: this.data.list.map((n) => ({ ...n, isRead: true })) });
      wx.showToast({ title: '已全部标记', icon: 'success' });
    } catch {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },
});
