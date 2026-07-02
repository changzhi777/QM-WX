// pages/order-list/index.ts
import { api } from '../../services/api';

const STATUS_LABEL: Record<string, string> = {
  pending_pay: '待支付',
  paid: '已支付',
  shipped: '已发货',
  done: '已完成',
  cancelled: '已取消',
};

const STATUS_COLOR: Record<string, string> = {
  pending_pay: '#faad14',
  paid: '#0FAF8E',
  shipped: '#0FAF8E',
  done: '#999',
  cancelled: '#999',
};

interface OrderItem {
  id: string;
  productId: string;
  name: string;
  qty: number;
}

interface Order {
  id: string;
  status: string;
  totalAmount: string;
  payAmount: string;
  pointsUsed: number;
  items: OrderItem[];
  createdAt: string;
}

const TABS = [
  { key: '', label: '全部' },
  { key: 'pending_pay', label: '待付款' },
  { key: 'paid', label: '待发货' },
  { key: 'shipped', label: '待收货' },
  { key: 'done', label: '已完成' },
];

Page({
  data: {
    tabs: TABS,
    activeStatus: '',
    list: [] as Order[],
    loading: true,
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  switchTab(e: WechatMiniprogram.TouchEvent) {
    const status = e.currentTarget.dataset.status as string;
    if (status === this.data.activeStatus) return;
    this.setData({ activeStatus: status });
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const payload = this.data.activeStatus ? { status: this.data.activeStatus } : {};
      const { list } = await api.call<{ list: Order[] }>('mall', 'myOrders', payload);
      // 解析 items（JSON 字符串来自 Prisma）
      const parsed = list.map((o) => ({
        ...o,
        statusLabel: STATUS_LABEL[o.status] ?? o.status,
        statusColor: STATUS_COLOR[o.status] ?? '#999',
      }));
      this.setData({ list: parsed, loading: false });
    } catch {
      this.setData({ loading: false });
    }
  },

  async onCancel(e: WechatMiniprogram.CustomEvent) {
    const id = e.currentTarget.dataset.id as string;
    const res = await new Promise<WechatMiniprogram.ShowModalSuccessCallbackResult>((resolve) => {
      wx.showModal({ title: '取消订单', content: '确定取消？已扣积分将退还', success: resolve });
    });
    if (!res.confirm) return;

    try {
      await api.call('mall', 'cancelOrder', { orderId: id });
      wx.showToast({ title: '已取消', icon: 'success' });
      this.load();
    } catch (err) {
      wx.showToast({ title: (err as Error).message ?? '取消失败', icon: 'none' });
    }
  },
});
