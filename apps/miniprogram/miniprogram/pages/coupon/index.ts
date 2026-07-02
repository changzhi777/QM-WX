// pages/coupon/index.ts — 优惠券（领券中心 + 我的券，V0.1.23）
import { api } from '../../services/api';

interface Template {
  templateId: string;
  title: string;
  type: string;
  amount: number;
  minSpend: number;
  validDays: number;
  received: boolean;
}
interface Coupon {
  id: string;
  title: string;
  type: string;
  amount: number;
  minSpend: number;
  expireAt: string;
  status: string;
}

Page({
  data: {
    tab: 'center' as 'center' | 'mine',
    templates: [] as Template[],
    myCoupons: [] as Coupon[],
    couponStatus: 'unused' as 'unused' | 'used' | 'expired',
    loading: false,
  },

  onShow() {
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const [tpl, mine] = await Promise.all([
        api.call<{ templates: Template[] }>('coupon', 'templates', {}),
        api.call<{ list: Coupon[] }>('coupon', 'myCoupons', { status: this.data.couponStatus }),
      ]);
      this.setData({
        templates: tpl.templates.map((t) => ({ ...t, display: t.type === 'fixed' ? `¥${t.amount}` : `${t.amount * 10}折` })),
        myCoupons: mine.list.map((c) => ({ ...c, display: c.type === 'fixed' ? `¥${c.amount}` : `${c.amount * 10}折`, expireShort: c.expireAt.slice(0, 10) })),
        loading: false,
      });
    } catch {
      this.setData({ loading: false });
    }
  },

  switchTab(e: WechatMiniprogram.TouchEvent) {
    this.setData({ tab: e.currentTarget.dataset.tab as 'center' | 'mine' });
  },

  switchCouponStatus(e: WechatMiniprogram.TouchEvent) {
    this.setData({ couponStatus: e.currentTarget.dataset.status as 'unused' | 'used' | 'expired' });
    this.load();
  },

  async receive(e: WechatMiniprogram.TouchEvent) {
    const templateId = e.currentTarget.dataset.id as string;
    try {
      await api.call('coupon', 'receive', { templateId });
      wx.showToast({ title: '领取成功', icon: 'success' });
      this.load();
    } catch {
      wx.showToast({ title: '领取失败或已领', icon: 'none' });
    }
  },
});
